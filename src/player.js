/*
 * Player do tour: reprodução em tempo real, navegação e exportação de vídeo.
 * A exportação renderiza quadro a quadro (30 fps, 1920x1080) com WebCodecs,
 * gerando MP4 (H.264) ou WebM (VP9) conforme o suporte do navegador.
 */
(function () {
  'use strict';

  const tour = window.PelleTour;
  const canvas = document.getElementById('video');
  const ctx = canvas.getContext('2d');
  const btnPlay = document.getElementById('play');
  const btnRestart = document.getElementById('restart');
  const btnExport = document.getElementById('export');
  const seek = document.getElementById('seek');
  const timeLabel = document.getElementById('time');
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const loading = document.getElementById('loading');

  const params = new URLSearchParams(location.search);
  if (params.has('render')) return; // modo usado pelo script de renderização (tools/render.mjs)
  let t = parseFloat(params.get('t') || '0') || 0;
  let playing = !params.has('t');
  let last = null;
  let exporting = false;

  function draw() {
    tour.render(ctx, t, { maxSamples: 8 });
    seek.value = String(t);
    timeLabel.textContent = `${t.toFixed(1)} / ${tour.DURATION.toFixed(1)} s`;
  }

  function loop(now) {
    if (exporting) return;
    if (playing) {
      if (last !== null) t += (now - last) / 1000;
      if (t >= tour.DURATION) {
        t = tour.DURATION;
        playing = false;
        btnPlay.textContent = 'Reproduzir';
      }
    }
    last = now;
    draw();
    requestAnimationFrame(loop);
  }

  btnPlay.addEventListener('click', () => {
    if (!playing && t >= tour.DURATION) t = 0;
    playing = !playing;
    btnPlay.textContent = playing ? 'Pausar' : 'Reproduzir';
  });
  btnRestart.addEventListener('click', () => {
    t = 0;
    playing = true;
    btnPlay.textContent = 'Pausar';
  });
  seek.addEventListener('input', () => {
    t = parseFloat(seek.value);
  });

  // ---------------- Exportação ----------------
  async function exportWithWebCodecs() {
    const W = tour.W;
    const H = tour.H;
    const FPS = tour.FPS;
    const candidates = [
      { codec: 'avc1.640028', container: 'mp4', muxCodec: 'avc' },
      { codec: 'avc1.4d0028', container: 'mp4', muxCodec: 'avc' },
      { codec: 'vp09.00.40.08', container: 'webm', muxCodec: 'V_VP9' },
    ];
    let chosen = null;
    for (const c of candidates) {
      const cfg = { codec: c.codec, width: W, height: H, bitrate: 16_000_000, framerate: FPS };
      try {
        const sup = await VideoEncoder.isConfigSupported(cfg);
        if (sup.supported) {
          chosen = { ...c, cfg };
          break;
        }
      } catch (e) {
        /* tenta o próximo */
      }
    }
    if (!chosen) throw new Error('Nenhum codec de vídeo suportado pelo navegador.');

    let muxer;
    let Target;
    if (chosen.container === 'mp4') {
      const lib = window.Mp4Muxer; // src/vendor/mp4-muxer.js
      Target = new lib.ArrayBufferTarget();
      muxer = new lib.Muxer({
        target: Target,
        video: { codec: 'avc', width: W, height: H, frameRate: FPS },
        fastStart: 'in-memory',
      });
    } else {
      const lib = window.WebMMuxer; // src/vendor/webm-muxer.js
      Target = new lib.ArrayBufferTarget();
      muxer = new lib.Muxer({
        target: Target,
        video: { codec: 'V_VP9', width: W, height: H, frameRate: FPS },
      });
    }

    let encError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encError = e;
      },
    });
    encoder.configure(chosen.cfg);

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d');
    const total = Math.round(tour.DURATION * FPS);
    for (let i = 0; i < total; i++) {
      if (encError) throw encError;
      tour.render(octx, i / FPS, { maxSamples: 20 });
      const frame = new VideoFrame(off, {
        timestamp: Math.round((i * 1e6) / FPS),
        duration: Math.round(1e6 / FPS),
      });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      if (i % 3 === 0) {
        ctx.drawImage(off, 0, 0);
        progress.value = i / total;
        status.textContent = `Renderizando quadro ${i + 1} de ${total}…`;
        await new Promise((r) => setTimeout(r, 0));
      }
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
    }
    await encoder.flush();
    muxer.finalize();
    return {
      blob: new Blob([Target.buffer], { type: chosen.container === 'mp4' ? 'video/mp4' : 'video/webm' }),
      ext: chosen.container,
    };
  }

  async function exportWithMediaRecorder() {
    const stream = canvas.captureStream(tour.FPS);
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m)
    );
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    const start = performance.now();
    await new Promise((resolve) => {
      function step(now) {
        const tt = (now - start) / 1000;
        tour.render(ctx, Math.min(tt, tour.DURATION), { maxSamples: 6 });
        progress.value = tt / tour.DURATION;
        status.textContent = 'Gravando em tempo real…';
        if (tt < tour.DURATION) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
    rec.stop();
    await done;
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
  }

  btnExport.addEventListener('click', async () => {
    if (exporting) return;
    exporting = true;
    playing = false;
    btnPlay.textContent = 'Reproduzir';
    [btnPlay, btnRestart, btnExport, seek].forEach((b) => (b.disabled = true));
    progress.hidden = false;
    progress.value = 0;
    try {
      const result =
        'VideoEncoder' in window ? await exportWithWebCodecs() : await exportWithMediaRecorder();
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pelle-tour.${result.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = `Vídeo exportado (${(result.blob.size / 1e6).toFixed(1)} MB, ${result.ext.toUpperCase()}).`;
    } catch (e) {
      console.error(e);
      const tainted = e && e.name === 'SecurityError';
      status.textContent = tainted
        ? 'Para exportar, abra a página por um servidor local (ex.: npx serve .) em vez de file://.'
        : 'Falha na exportação: ' + (e && e.message ? e.message : e);
    } finally {
      exporting = false;
      progress.hidden = true;
      [btnPlay, btnRestart, btnExport, seek].forEach((b) => (b.disabled = false));
      last = null;
      requestAnimationFrame(loop);
    }
  });

  seek.max = String(tour.DURATION);

  tour
    .init()
    .then(() => {
      loading.hidden = true;
      [btnPlay, btnRestart, btnExport, seek].forEach((b) => (b.disabled = false));
      btnPlay.textContent = playing ? 'Pausar' : 'Reproduzir';
      requestAnimationFrame(loop);
    })
    .catch((e) => {
      console.error(e);
      loading.textContent = 'Erro ao carregar: ' + e.message;
    });
})();
