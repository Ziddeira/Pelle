/*
 * Pelle — Tour cinematográfico em plano-sequência (estilo drone FPV / gimbal).
 *
 * Sem textos e sem cortes: a câmera atravessa portas de vidro automáticas,
 * percorre a recepção, gira e passa por portas reais (batente, parede e
 * profundidade em 3D) até a sala de reuniões, o banheiro e o quarto.
 *
 * Cada foto é projetada como uma câmera real: o giro (yaw) é uma rotação em
 * perspectiva (homografia desenhada em faixas verticais), não um simples
 * deslizar de imagem. Paredes, portas e batentes das passagens são planos 3D
 * projetados com a mesma câmera. Cada quadro é uma função pura do tempo `t`.
 *
 * Roteiro:
 *   0.0s  Portas de vidro automáticas se abrem — a câmera entra
 *   3.2s  Recepção — deslize até o painel de mármore
 *   8.2s  Giro à direita atravessando a divisória de vidro
 *   9.5s  Sala de reuniões — aproximação lenta da parede e da mesa de mármore
 *  16.0s  Giro rápido à esquerda, atravessando a porta do banheiro
 *  17.3s  Banheiro — frontão em ônix
 *  20.9s  Giro rápido à direita, atravessando a porta do quarto
 *  22.1s  Quarto — painel de ônix retroiluminado, recuo lento e fade out
 */
(function (global) {
  'use strict';

  const W = 1920;
  const H = 1080;
  const FPS = 24;
  const DURATION = 31.5;
  const SHUTTER = 1 / 48; // obturador de 180°
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------------
  // Fotos e keyframes de câmera: [t, x, y, zoom]
  // x/y = ponto da foto (0..1) para onde a câmera olha; zoom 1 = enquadramento mínimo
  // hfov = abertura horizontal estimada da foto (graus)
  // ------------------------------------------------------------------
  const SHOTS = {
    recepcao: {
      src: 'assets/recepcao.webp',
      hfov: 66,
      seed: 1.3,
      kf: [
        [0.0, 0.5, 0.56, 1.0],
        [3.2, 0.52, 0.5, 1.22],
        [4.6, 0.56, 0.45, 1.38],
        [6.4, 0.63, 0.36, 1.6],
        [8.2, 0.68, 0.31, 1.85],
        [9.5, 0.7, 0.3, 1.9],
      ],
    },
    sala: {
      src: 'assets/sala-reunioes.webp',
      hfov: 70,
      seed: 4.1,
      kf: [
        [8.2, 0.5, 0.5, 1.08],
        [9.5, 0.48, 0.48, 1.14],
        [11.0, 0.45, 0.42, 1.33],
        [13.2, 0.44, 0.33, 1.68],
        [14.8, 0.55, 0.55, 1.7],
        [16.0, 0.47, 0.58, 1.75],
        [17.3, 0.4, 0.55, 1.75],
      ],
    },
    banheiro: {
      src: 'assets/banheiro.jpg',
      hfov: 84,
      seed: 7.7,
      kf: [
        [16.0, 0.5, 0.5, 1.02],
        [17.3, 0.5, 0.5, 1.08],
        [18.3, 0.38, 0.5, 1.22],
        [19.8, 0.44, 0.53, 1.75],
        [20.9, 0.46, 0.54, 2.05],
        [22.1, 0.52, 0.53, 2.0],
      ],
    },
    quarto: {
      src: 'assets/quarto.jpg',
      hfov: 80,
      seed: 2.9,
      kf: [
        [20.9, 0.5, 0.5, 1.06],
        [22.1, 0.5, 0.48, 1.1],
        [23.6, 0.45, 0.43, 1.18],
        [25.8, 0.37, 0.33, 1.4],
        [27.8, 0.31, 0.27, 1.5],
        [29.4, 0.36, 0.34, 1.32],
        [31.5, 0.46, 0.44, 1.12],
      ],
    },
  };

  // Um único plano-sequência
  const TIMELINE = [
    { type: 'entrance', t0: 0, t1: 3.2, shot: 'recepcao' },
    { type: 'shot', t0: 3.2, t1: 8.2, shot: 'recepcao' },
    { type: 'door', t0: 8.2, t1: 9.5, a: 'recepcao', b: 'sala', dir: 1, style: 'glass' },
    { type: 'shot', t0: 9.5, t1: 16.0, shot: 'sala' },
    { type: 'door', t0: 16.0, t1: 17.3, a: 'sala', b: 'banheiro', dir: -1, style: 'black' },
    { type: 'shot', t0: 17.3, t1: 20.9, shot: 'banheiro' },
    { type: 'door', t0: 20.9, t1: 22.1, a: 'banheiro', b: 'quarto', dir: 1, style: 'wood' },
    { type: 'shot', t0: 22.1, t1: DURATION + 1, shot: 'quarto' },
  ];

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (v) => {
    const x = clamp01(v);
    return x * x * (3 - 2 * x);
  };
  const smoother = (v) => {
    const x = clamp01(v);
    return x * x * x * (x * (x * 6 - 15) + 10);
  };
  const easeInOutCubic = (v) => {
    const x = clamp01(v);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };

  /** Interpolação cúbica monotônica (Fritsch–Carlson): suave e sem "overshoot". */
  function makeTrack(times, values) {
    const n = times.length;
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((values[i + 1] - values[i]) / (times[i + 1] - times[i]));
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i];
        m[i + 1] = tau * b * d[i];
      }
    }
    return function (t) {
      if (t <= times[0]) return values[0];
      if (t >= times[n - 1]) return values[n - 1];
      let i = 0;
      while (t > times[i + 1]) i++;
      const h = times[i + 1] - times[i];
      const s = (t - times[i]) / h;
      const s2 = s * s;
      const s3 = s2 * s;
      return (
        (2 * s3 - 3 * s2 + 1) * values[i] +
        (s3 - 2 * s2 + s) * h * m[i] +
        (-2 * s3 + 3 * s2) * values[i + 1] +
        (s3 - s2) * h * m[i + 1]
      );
    };
  }

  /** Micro-oscilação de gimbal (soma de senos): quase imperceptível, dá vida à câmera. */
  function gimbal(t, seed) {
    const s = (f, p) => Math.sin(t * f + p);
    return {
      x: s(0.71, seed) * 0.6 + s(1.93, seed * 2.1) * 0.3 + s(4.1, seed * 0.7) * 0.1,
      y: s(0.53, seed + 1.7) * 0.6 + s(1.37, seed * 1.3) * 0.3 + s(3.9, seed) * 0.1,
      r: s(0.47, seed + 3.1) * 0.7 + s(1.21, seed * 0.9) * 0.3,
    };
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar ' + src));
      img.src = src;
    });
  }

  // ------------------------------------------------------------------
  // Projeção de uma foto como câmera real (yaw em perspectiva)
  // ------------------------------------------------------------------
  const PAD_X = 0.35;
  const PAD_Y = 0.25;

  /** Estende a foto com bordas espelhadas: evita vazios durante giros rápidos (sempre borrados). */
  function padImage(img) {
    const iw = img.width;
    const ih = img.height;
    const px = Math.round(iw * PAD_X);
    const py = Math.round(ih * PAD_Y);
    const c = canvas(iw + 2 * px, ih + 2 * py);
    const g = c.getContext('2d');
    const row = canvas(iw + 2 * px, ih);
    const r = row.getContext('2d');
    r.drawImage(img, px, 0);
    r.save();
    r.scale(-1, 1);
    r.drawImage(img, 0, 0, px, ih, -px, 0, px, ih);
    r.drawImage(img, iw - px, 0, px, ih, -(iw + 2 * px), 0, px, ih);
    r.restore();
    g.drawImage(row, 0, py);
    g.save();
    g.scale(1, -1);
    g.drawImage(row, 0, 0, row.width, py, 0, -py, row.width, py);
    g.drawImage(row, 0, ih - py, row.width, py, 0, -(ih + 2 * py), row.width, py);
    g.restore();
    return { canvas: c, px, py };
  }

  function prepareShot(shot) {
    const t = shot.kf.map((k) => k[0]);
    shot.tx = makeTrack(t, shot.kf.map((k) => k[1]));
    shot.ty = makeTrack(t, shot.kf.map((k) => k[2]));
    shot.tz = makeTrack(t, shot.kf.map((k) => Math.log(k[3])));
    shot.iw = shot.img.width;
    shot.ih = shot.img.height;
    shot.fs = shot.iw / 2 / Math.tan((shot.hfov / 2) * DEG);
    shot.cover = Math.max(W / shot.iw, H / shot.ih);
    const p = padImage(shot.img);
    shot.pad = p.canvas;
    shot.px = p.px;
    shot.py = p.py;
  }

  function rawCam(shot, t) {
    const g = gimbal(t, shot.seed);
    const z = Math.exp(shot.tz(t));
    const x = shot.tx(t) + (g.x * 0.0012) / z;
    const y = shot.ty(t) + (g.y * 0.0012) / z;
    const fo = shot.fs * shot.cover * z;
    return {
      yaw: Math.atan(((x - 0.5) * shot.iw) / shot.fs),
      sx: 0,
      sy: (-(y - 0.5) * shot.ih * fo) / shot.fs,
      fo,
      roll: g.r * 0.0022,
    };
  }

  /** Verifica se a tela inteira está coberta pela área (hx, hy) da foto. */
  function covered(shot, cam, hx, hy) {
    const c = Math.cos(cam.yaw);
    const s = Math.sin(cam.yaw);
    const cr = Math.cos(-cam.roll);
    const sr = Math.sin(-cam.roll);
    for (const [X, Y] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]) {
      const u = X * cr - Y * sr - cam.sx;
      const v = X * sr + Y * cr - cam.sy;
      const zr = -u * s + cam.fo * c;
      if (zr <= 1) return false;
      const xs = (shot.fs * (u * c + cam.fo * s)) / zr;
      const ys = (shot.fs * v) / zr;
      if (Math.abs(xs) > hx || Math.abs(ys) > hy) return false;
    }
    return true;
  }

  function scaled(cam, k) {
    return { yaw: cam.yaw, sx: cam.sx * k, sy: cam.sy * k, fo: cam.fo * k, roll: cam.roll };
  }

  /** Aumenta o zoom o mínimo necessário para nunca mostrar a borda da foto. */
  function ensureCover(shot, cam) {
    const hx = shot.iw / 2;
    const hy = shot.ih / 2;
    if (covered(shot, cam, hx, hy)) return cam;
    let lo = 1;
    let hi = 1.25;
    while (!covered(shot, scaled(cam, hi), hx, hy) && hi < 8) {
      lo = hi;
      hi *= 1.25;
    }
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (covered(shot, scaled(cam, mid), hx, hy)) hi = mid;
      else lo = mid;
    }
    return scaled(cam, hi);
  }

  /** Câmera de uma cena em t, com inclinação (banking) proporcional à velocidade de giro. */
  function shotCam(shot, t) {
    const cam = rawCam(shot, t);
    const h = 0.05;
    const rate = (rawCam(shot, t + h).yaw - rawCam(shot, t - h).yaw) / (2 * h);
    cam.roll += clamp(-rate * 0.1, -0.05, 0.05);
    return ensureCover(shot, cam);
  }

  const STRIPS = 72;

  /** Desenha a foto projetada em perspectiva (faixas verticais = homografia exata de um giro). */
  function drawProj(ctx, shot, cam) {
    const img = shot.pad;
    const Wp = img.width;
    const Hp = img.height;
    const c = Math.cos(cam.yaw);
    const s = Math.sin(cam.yaw);
    const fs = shot.fs;
    const fo = cam.fo;
    const lim = W * 0.62;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(cam.roll);
    const sw = Wp / STRIPS;
    for (let k = 0; k < STRIPS; k++) {
      const xs0 = -Wp / 2 + k * sw;
      const xs1 = xs0 + sw;
      const z0 = xs0 * s + fs * c;
      const z1 = xs1 * s + fs * c;
      if (z0 <= 1 || z1 <= 1) continue;
      const X0 = cam.sx + (fo * (xs0 * c - fs * s)) / z0;
      const X1 = cam.sx + (fo * (xs1 * c - fs * s)) / z1;
      if (X1 < -lim || X0 > lim) continue;
      const ky = fo / ((xs0 + xs1) * 0.5 * s + fs * c);
      const top = cam.sy - (Hp / 2) * ky;
      ctx.drawImage(img, k * sw, 0, sw, Hp, X0 - 0.75, top, X1 - X0 + 1.5, Hp * ky);
    }
    ctx.restore();
  }

  function camMotion(a, b) {
    return (
      a.fo * Math.abs(b.yaw - a.yaw) +
      Math.abs(Math.log(b.fo / a.fo)) * 1100 +
      Math.hypot(b.sx - a.sx, b.sy - a.sy) +
      Math.abs(b.roll - a.roll) * 1100
    );
  }

  // ------------------------------------------------------------------
  // Texturas procedurais (madeira, gesso, vidro, mármore da fachada)
  // ------------------------------------------------------------------
  let woodCanvas = null;
  let noiseCanvas = null;

  function buildWood(w, h, seed) {
    const { fbm, noise } = global.PelleMarble.createNoise(seed);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const grain = fbm(x * 0.045 + fbm(x * 0.01, y * 0.004, 2) * 3, y * 0.0035, 4);
        const streak = noise(x * 0.35, y * 0.006);
        const k = 0.62 + grain * 0.62 + (streak - 0.5) * 0.12;
        const i = (y * w + x) * 4;
        d[i] = clamp(92 * k, 0, 255);
        d[i + 1] = clamp(62 * k, 0, 255);
        d[i + 2] = clamp(40 * k, 0, 255);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Ruído suave (textura de gesso), cinza médio em torno de 128. */
  function buildNoise(w, h, seed) {
    const { fbm } = global.PelleMarble.createNoise(seed);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = fbm(x * 0.02, y * 0.02, 4) * 0.7 + fbm(x * 0.2, y * 0.2, 2) * 0.3;
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 128 + (v - 0.5) * 90;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const TS = 0.45; // px de textura por mm

  /** Cria um canvas cujas coordenadas de desenho são milímetros (u, v). */
  function mmCanvas(u0, u1, v0, v1) {
    const c = canvas((u1 - u0) * TS, (v1 - v0) * TS);
    const g = c.getContext('2d');
    g.scale(TS, TS);
    g.translate(-u0, -v0);
    return { c, g };
  }

  function glassReflections(g, x0, y0, w, h, strength) {
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    let gr = g.createLinearGradient(0, y0, 0, y0 + h);
    gr.addColorStop(0, `rgba(170,185,190,${0.16 * strength})`);
    gr.addColorStop(0.55, `rgba(120,130,130,${0.08 * strength})`);
    gr.addColorStop(1, `rgba(60,64,64,${0.18 * strength})`);
    g.fillStyle = gr;
    g.fillRect(x0, y0, w, h);
    for (const [off, width, a] of [[0.15, 0.22, 0.13], [0.55, 0.08, 0.1], [0.78, 0.14, 0.07]]) {
      const cx = x0 + w * off;
      gr = g.createLinearGradient(cx - w * width, 0, cx + w * width, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,250,240,${a * strength})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.save();
      g.translate(cx, y0 + h / 2);
      g.transform(1, 0, -0.35, 1, 0, 0);
      g.fillRect(-w * width, -h, w * width * 2, h * 2);
      g.restore();
    }
    g.restore();
  }

  // --- Fachada com portas de vidro automáticas -----------------------
  const FAC = { u0: -3800, u1: 3800, v0: -2300, v1: 1350, doorTop: -1250 };
  let facadeTex = null;
  let sliderTex = null;

  function buildFacade() {
    const { c, g } = mmCanvas(FAC.u0, FAC.u1, FAC.v0, FAC.v1);
    const mw = 1600;
    const mh = FAC.v1 - FAC.v0;
    const marble = global.PelleMarble.createMarble(mw * TS, mh * TS, {
      seed: 23,
      scale: 1 / (430 * TS),
      base: [16, 15, 15],
      base2: [44, 40, 37],
      vein: [176, 170, 162],
    });
    // revestimento em mármore escuro nas laterais e acima da porta
    g.drawImage(marble, 2000, FAC.v0, 1800, mh);
    g.save();
    g.scale(-1, 1);
    g.drawImage(marble, 2000, FAC.v0, 1800, mh);
    g.restore();
    const topH = FAC.doorTop - 150 - FAC.v0;
    g.drawImage(marble, 0, 0, marble.width, marble.height * (topH / mh), -2000, FAC.v0, 2000, topH);
    g.save();
    g.scale(-1, 1);
    g.drawImage(marble, 0, 0, marble.width, marble.height * (topH / mh), -2000, FAC.v0, 2000, topH);
    g.restore();

    // luz de embutido no piso "lavando" o mármore
    for (const u of [-2450, 2450]) {
      const gr = g.createRadialGradient(u, FAC.v1, 0, u, FAC.v1, 2200);
      gr.addColorStop(0, 'rgba(255,196,130,0.45)');
      gr.addColorStop(0.35, 'rgba(255,190,120,0.14)');
      gr.addColorStop(1, 'rgba(255,190,120,0)');
      g.save();
      g.globalCompositeOperation = 'screen';
      g.fillStyle = gr;
      g.fillRect(u - 900, FAC.v0, 1800, mh);
      g.restore();
    }
    // sombra geral de fim de tarde
    let gr = g.createLinearGradient(0, FAC.v0, 0, FAC.v1);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = gr;
    g.fillRect(FAC.u0, FAC.v0, -2000 - FAC.u0, mh);
    g.fillRect(2000, FAC.v0, FAC.u1 - 2000, mh);
    g.fillRect(-2000, FAC.v0, 4000, topH);

    // vidros fixos laterais
    for (const [a, b] of [[-2000, -1000], [1000, 2000]]) {
      g.clearRect(a, FAC.doorTop, b - a, FAC.v1 - FAC.doorTop);
      g.fillStyle = 'rgba(18,22,24,0.22)';
      g.fillRect(a, FAC.doorTop, b - a, FAC.v1 - FAC.doorTop);
      glassReflections(g, a, FAC.doorTop, b - a, FAC.v1 - FAC.doorTop, 1.9);
      g.fillStyle = 'rgba(235,235,230,0.32)';
      g.fillRect(a, 330, b - a, 90);
    }
    g.clearRect(-1000, FAC.doorTop, 2000, FAC.v1 - FAC.doorTop);

    // caixilhos pretos
    g.fillStyle = '#0c0c0c';
    g.fillRect(-2050, FAC.doorTop - 150, 4100, 150); // bandeira
    for (const u of [-2050, -1025, 975, 2000]) g.fillRect(u, FAC.doorTop, 50, FAC.v1 - FAC.doorTop);
    g.fillRect(-2050, FAC.v1 - 30, 1050, 30);
    g.fillRect(1000, FAC.v1 - 30, 1050, 30);
    // filete de LED sob a bandeira
    g.save();
    g.shadowColor = 'rgba(255,200,130,1)';
    g.shadowBlur = 60;
    g.fillStyle = 'rgba(255,236,205,0.95)';
    g.fillRect(-2000, FAC.doorTop - 14, 4000, 10);
    g.restore();
    return c;
  }

  function buildSlider() {
    const { c, g } = mmCanvas(0, 1000, FAC.doorTop, FAC.v1);
    const h = FAC.v1 - FAC.doorTop;
    g.fillStyle = 'rgba(18,22,24,0.2)';
    g.fillRect(0, FAC.doorTop, 1000, h);
    glassReflections(g, 0, FAC.doorTop, 1000, h, 1.9);
    g.fillStyle = 'rgba(235,235,230,0.32)';
    g.fillRect(0, 330, 1000, 90);
    g.fillStyle = '#0d0d0d';
    g.fillRect(0, FAC.doorTop, 1000, 45);
    g.fillRect(0, FAC.v1 - 60, 1000, 60);
    g.fillRect(0, FAC.doorTop, 45, h);
    g.fillRect(955, FAC.doorTop, 45, h);
    // puxador vertical junto à borda interna
    g.fillStyle = '#1a1a1a';
    g.fillRect(870, -350, 30, 1150);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(872, -350, 6, 1150);
    return c;
  }

  // --- Paredes com portas (transições) ------------------------------
  const WALL = { v0: -1450, v1: 1350, near: 700, far: 4200, doorHalf: 460, doorTop: -800, depth: 160 };
  const wallTex = {};

  function plasterBase(g, u0, u1) {
    const v0 = WALL.v0;
    const v1 = WALL.v1;
    let gr = g.createLinearGradient(0, v0, 0, v1);
    gr.addColorStop(0, '#e6d8c1');
    gr.addColorStop(0.3, '#d3c3aa');
    gr.addColorStop(1, '#a8977f');
    g.fillStyle = gr;
    g.fillRect(u0, v0, u1 - u0, v1 - v0);
    // textura de gesso
    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.18;
    g.fillStyle = g.createPattern(noiseCanvas, 'repeat');
    g.fillRect(u0, v0, u1 - u0, v1 - v0);
    g.restore();
    // luz quente perto da porta
    gr = g.createRadialGradient(0, -200, 0, 0, -200, 2600);
    gr.addColorStop(0, 'rgba(255,214,160,0.22)');
    gr.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = gr;
    g.fillRect(u0, v0, u1 - u0, v1 - v0);
    // juntas dos painéis
    g.fillStyle = 'rgba(70,56,42,0.35)';
    for (const u of [1500, 2750, 4000]) g.fillRect(u, v0, 6, v1 - v0);
    // sanca iluminada no teto
    g.save();
    g.shadowColor = 'rgba(255,205,140,1)';
    g.shadowBlur = 50;
    g.fillStyle = '#fff0d8';
    g.fillRect(u0, v0, u1 - u0, 26);
    g.restore();
    gr = g.createLinearGradient(0, v0, 0, v0 + 700);
    gr.addColorStop(0, 'rgba(255,220,170,0.4)');
    gr.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = gr;
    g.fillRect(u0, v0, u1 - u0, 700);
    // rodapé embutido (sombra)
    g.fillStyle = 'rgba(30,22,16,0.7)';
    g.fillRect(u0, v1 - 70, u1 - u0, 70);
    // quina (fim da parede)
    gr = g.createLinearGradient(u0, 0, u0 + 160, 0);
    gr.addColorStop(0, 'rgba(40,30,22,0.45)');
    gr.addColorStop(1, 'rgba(40,30,22,0)');
    g.fillStyle = gr;
    g.fillRect(u0, v0, 160, v1 - v0);
  }

  function aoAroundDoor(g, frame) {
    const d = WALL.doorHalf + frame;
    g.save();
    g.shadowColor = 'rgba(20,12,6,0.55)';
    g.shadowBlur = 90;
    g.fillStyle = 'rgba(0,0,0,1)';
    g.fillRect(-d, WALL.doorTop - frame, d * 2, WALL.v1 - WALL.doorTop + frame);
    g.restore();
  }

  function buildWall(style) {
    const u0 = -WALL.near;
    const u1 = WALL.far;
    const { c, g } = mmCanvas(u0, u1, WALL.v0, WALL.v1);
    const dh = WALL.doorHalf;
    const top = WALL.doorTop;
    const v0 = WALL.v0;
    const v1 = WALL.v1;

    if (style === 'glass') {
      // divisória de vidro com montantes pretos e faixa jateada
      glassReflections(g, u0, v0, u1 - u0, v1 - v0, 0.9);
      g.fillStyle = 'rgba(240,238,232,0.28)';
      g.fillRect(u0, 60, u1 - u0, 110);
      g.clearRect(-dh, top, dh * 2, v1 - top);
      g.fillStyle = '#0d0d0d';
      g.fillRect(u0, v0, u1 - u0, 55);
      g.fillRect(u0, v1 - 55, u1 - u0, 55);
      for (const u of [u0, 1350, 2700, 4050]) g.fillRect(u, v0, 45, v1 - v0);
      g.fillRect(-dh - 50, v0, 50, v1 - v0);
      g.fillRect(dh, v0, 50, v1 - v0);
      g.fillRect(-dh - 50, top - 60, dh * 2 + 100, 60);
      g.clearRect(-dh, top, dh * 2, v1 - top);
    } else {
      plasterBase(g, u0, u1);
      const frame = style === 'wood' ? 85 : 55;
      aoAroundDoor(g, frame);
      g.clearRect(-dh - frame, top - frame, (dh + frame) * 2, v1 - top + frame);
      // gesso de novo sob a sombra (a sombra fica só em volta)
      g.save();
      g.globalCompositeOperation = 'destination-over';
      plasterBase(g, u0, u1);
      g.restore();
      if (style === 'wood') {
        g.save();
        g.beginPath();
        g.rect(-dh - frame, top - frame, (dh + frame) * 2, v1 - top + frame);
        g.rect(-dh, top, dh * 2, v1 - top);
        g.clip('evenodd');
        g.drawImage(woodCanvas, -dh - frame, top - frame, (dh + frame) * 2, v1 - top + frame);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(-dh - frame, top - frame, (dh + frame) * 2, v1 - top + frame);
        g.restore();
        // interruptor
        g.fillStyle = '#2a2521';
        g.fillRect(dh + 260, 120, 90, 90);
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(dh + 270, 130, 70, 3);
      } else {
        g.fillStyle = '#0e0e0e';
        g.fillRect(-dh - frame, top - frame, frame, v1 - top + frame);
        g.fillRect(dh, top - frame, frame, v1 - top + frame);
        g.fillRect(-dh - frame, top - frame, (dh + frame) * 2, frame);
        // puxador preto da porta de vidro aberta (lado da parede)
        g.fillRect(-dh - frame - 260, -250, 22, 700);
      }
      g.clearRect(-dh, top, dh * 2, v1 - top);
    }
    const mirror = canvas(c.width, c.height);
    const mg = mirror.getContext('2d');
    mg.scale(-1, 1);
    mg.drawImage(c, -c.width, 0);
    return { tex: c, mirror };
  }

  // ------------------------------------------------------------------
  // Entrada: portas de vidro automáticas
  // ------------------------------------------------------------------
  const ENT_F = 1400;
  const entZ = makeTrack([0, 1.0, 1.9, 2.5, 2.9, 3.2], [4300, 3550, 2600, 1500, 480, -120]);
  const entSlide = (t) => 1000 * easeInOutCubic((t - 0.7) / 1.45);

  function entranceShake(t) {
    const g = gimbal(t, 9.4);
    return { x: g.x * 3, y: g.y * 2.5 };
  }

  function drawEntrance(ctx, t) {
    const S = SHOTS.recepcao;
    drawProj(ctx, S, shotCam(S, t));

    const Z = entZ(t);
    if (Z <= 60) return;
    const sh = entranceShake(t);
    const cx = W / 2 + sh.x;
    const cy = H / 2 + sh.y;

    // folhas deslizantes (80 mm atrás do plano da fachada)
    const ss = ENT_F / (Z + 80);
    const s = entSlide(t);
    const hh = (FAC.v1 - FAC.doorTop) * ss;
    const y0 = cy + FAC.doorTop * ss;
    ctx.drawImage(sliderTex.tex, cx + (-1000 - s) * ss, y0, 1000 * ss, hh);
    ctx.drawImage(sliderTex.mirror, cx + s * ss, y0, 1000 * ss, hh);

    const sf = ENT_F / Z;
    const left = cx - 2050 * sf;
    const right = cx + 2050 * sf;
    const headBottom = cy + FAC.doorTop * sf;
    if (left < 0 && right > W && headBottom < 0) return; // já atravessou o vão
    ctx.drawImage(facadeTex, cx + FAC.u0 * sf, cy + FAC.v0 * sf, (FAC.u1 - FAC.u0) * sf, (FAC.v1 - FAC.v0) * sf);

    // piso externo em pedra escura, com a luz quente do interior refletida
    const base = cy + FAC.v1 * sf;
    if (base < H) {
      let gr = ctx.createLinearGradient(0, base, 0, H);
      gr.addColorStop(0, '#2c2824');
      gr.addColorStop(1, '#171513');
      ctx.fillStyle = gr;
      ctx.fillRect(0, base, W, H - base);
      const open = s / 1000;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(cx, base);
      ctx.scale(1, 0.22);
      gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 2400 * sf);
      gr.addColorStop(0, `rgba(255,200,140,${0.3 + 0.25 * open})`);
      gr.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(-2400 * sf, 0, 4800 * sf, 2400 * sf);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, base, W, 2);
    }
  }

  function entranceMotion(ta, tb) {
    const S = SHOTS.recepcao;
    let d = camMotion(shotCam(S, ta), shotCam(S, tb));
    const Za = entZ(ta);
    const Zb = entZ(tb);
    if (Za > 60 && Zb > 60) {
      d = Math.max(d, ENT_F * 1200 * Math.abs(1 / Za - 1 / Zb));
      d = Math.max(d, (Math.abs(entSlide(tb) - entSlide(ta)) * ENT_F) / Za);
    } else if (Math.min(Za, Zb) < 400) {
      d = Math.max(d, 60);
    }
    return d;
  }

  // ------------------------------------------------------------------
  // Passagem por porta: giro + voo através do vão (parede, batente e cena seguinte em 3D)
  // ------------------------------------------------------------------
  const DOOR = { beta: 52, Z0: 2500, Z1: 470 };

  function doorQ(seg, t) {
    return clamp01((t - seg.t0) / (seg.t1 - seg.t0));
  }

  /** Estado da passagem: ângulo da porta (alpha), giro acumulado (psi), distância (Z). */
  function doorState(seg, t) {
    const q = doorQ(seg, t);
    const a = DOOR.beta * (1 - smoother(q / 0.88));
    const alpha = seg.dir * a * DEG;
    const psi = seg.dir * (DOOR.beta - a) * DEG;
    const Z = lerp(DOOR.Z0, DOOR.Z1, 0.45 * q + 0.55 * smoother(q));
    return { q, alpha, psi, Z };
  }

  function doorBank(seg, t) {
    const h = 0.03;
    const rate = (doorState(seg, t + h).psi - doorState(seg, t - h).psi) / (2 * h);
    return clamp(-rate * 0.075, -0.09, 0.09);
  }

  function doorCams(seg, t) {
    const st = doorState(seg, t);
    const A = SHOTS[seg.a];
    const B = SHOTS[seg.b];
    const ca = shotCam(A, t);
    const fwd = Math.exp(0.3 * st.q);
    const camA = { yaw: ca.yaw + st.psi, sx: ca.sx * fwd, sy: ca.sy * fwd, fo: ca.fo * fwd, roll: ca.roll };
    const cb = shotCam(B, t);
    const camB = { yaw: cb.yaw - st.alpha, sx: cb.sx, sy: cb.sy, fo: cb.fo, roll: cb.roll };
    return { st, camA, camB, f: cb.fo };
  }

  /** Projeta um ponto da parede (u ao longo da parede, d = profundidade atrás da face). */
  function wallPoint(st, f, u, v, d) {
    const ca = Math.cos(st.alpha);
    const sa = Math.sin(st.alpha);
    const x = (st.Z + d) * sa + u * ca;
    const z = (st.Z + d) * ca - u * sa;
    return { X: W / 2 + (f * x) / z, Y: H / 2 + (f * v) / z, z };
  }

  function drawDoor(ctx, seg, t) {
    const { st, camA, camB, f } = doorCams(seg, t);
    const dir = seg.dir;
    const A = SHOTS[seg.a];
    const B = SHOTS[seg.b];
    const bank = doorBank(seg, t);
    const cover = Math.cos(Math.abs(bank)) + Math.sin(Math.abs(bank)) * (W / H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(bank);
    ctx.scale(cover, cover);
    ctx.translate(-W / 2, -H / 2);

    drawProj(ctx, A, camA);

    // extensão horizontal da parede na tela (a partir da quina mais próxima)
    const uNear = -dir * WALL.near;
    const pn = wallPoint(st, f, uNear, 0, 0);
    let clipX0;
    let clipX1;
    if (pn.z > 20) {
      clipX0 = dir > 0 ? pn.X : -W;
      clipX1 = dir > 0 ? 2 * W : pn.X;
    } else {
      clipX0 = dir > 0 ? 2 * W : -W;
      clipX1 = clipX0;
    }
    if (clipX1 - clipX0 > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipX0, -H, clipX1 - clipX0, 3 * H);
      ctx.clip();

      drawProj(ctx, B, camB);
      drawJambs(ctx, seg, st, f);
      drawWallPlane(ctx, seg, st, f);
      ctx.restore();
    }
    ctx.restore();
  }

  function quad(ctx, pts, fill) {
    for (const p of pts) if (p.z <= 20) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].X, pts[0].Y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].X, pts[i].Y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawJambs(ctx, seg, st, f) {
    const dh = WALL.doorHalf;
    const d = seg.style === 'glass' ? 60 : WALL.depth;
    const top = WALL.doorTop;
    const bot = WALL.v1;
    const colors =
      seg.style === 'wood'
        ? { side: ['#4a3122', '#3a261a'], head: '#2e1f15' }
        : { side: ['#161616', '#101010'], head: '#0b0b0b' };
    const P = (u, v, dd) => wallPoint(st, f, u, v, dd);
    quad(ctx, [P(-dh, top, 0), P(-dh, top, d), P(-dh, bot, d), P(-dh, bot, 0)], colors.side[0]);
    quad(ctx, [P(dh, top, 0), P(dh, top, d), P(dh, bot, d), P(dh, bot, 0)], colors.side[1]);
    quad(ctx, [P(-dh, top, 0), P(dh, top, 0), P(dh, top, d), P(-dh, top, d)], colors.head);
  }

  function drawWallPlane(ctx, seg, st, f) {
    const tex = wallTex[seg.style];
    const img = seg.dir > 0 ? tex.tex : tex.mirror;
    const uMin = seg.dir > 0 ? -WALL.near : -WALL.far;
    const uMax = seg.dir > 0 ? WALL.far : WALL.near;
    const N = 110;
    const du = (uMax - uMin) / N;
    const tw = img.width / N;
    const vh = WALL.v1 - WALL.v0;
    for (let k = 0; k < N; k++) {
      const u0 = uMin + k * du;
      const u1 = u0 + du;
      const a = wallPoint(st, f, u0, 0, 0);
      const b = wallPoint(st, f, u1, 0, 0);
      if (a.z <= 40 || b.z <= 40) continue;
      const x0 = Math.min(a.X, b.X);
      const x1 = Math.max(a.X, b.X);
      if (x1 < -W * 0.2 || x0 > W * 1.2) continue;
      const zm = (a.z + b.z) / 2;
      const ky = f / zm;
      ctx.drawImage(img, k * tw, 0, tw, img.height, x0 - 0.6, H / 2 + WALL.v0 * ky, x1 - x0 + 1.2, vh * ky);
    }
  }

  function doorMotion(seg, ta, tb) {
    const a = doorCams(seg, ta);
    const b = doorCams(seg, tb);
    let d = Math.max(camMotion(a.camA, b.camA), camMotion(a.camB, b.camB));
    const pa = wallPoint(a.st, a.f, WALL.doorHalf, 0, 0);
    const pb = wallPoint(b.st, b.f, WALL.doorHalf, 0, 0);
    if (pa.z > 40 && pb.z > 40) d = Math.max(d, Math.min(Math.abs(pa.X - pb.X), 500));
    d = Math.max(d, Math.abs(doorBank(seg, tb) - doorBank(seg, ta)) * 1100);
    return d;
  }

  // ------------------------------------------------------------------
  // Cena completa em um instante
  // ------------------------------------------------------------------
  function segmentAt(t) {
    for (const seg of TIMELINE) if (t < seg.t1) return seg;
    return TIMELINE[TIMELINE.length - 1];
  }

  function drawScene(ctx, t) {
    const seg = segmentAt(t);
    if (seg.type === 'entrance') drawEntrance(ctx, t);
    else if (seg.type === 'door') drawDoor(ctx, seg, t);
    else drawProj(ctx, SHOTS[seg.shot], shotCam(SHOTS[seg.shot], t));
  }

  function motionBetween(ta, tb) {
    const seg = segmentAt((ta + tb) / 2);
    if (seg.type === 'entrance') return entranceMotion(ta, tb);
    if (seg.type === 'door') return doorMotion(seg, ta, tb);
    const S = SHOTS[seg.shot];
    return camMotion(shotCam(S, ta), shotCam(S, tb));
  }

  // ------------------------------------------------------------------
  // Pós-produção cinematográfica: bloom, cor, vinheta, grão, fades
  // ------------------------------------------------------------------
  let vignetteCanvas = null;
  let grainCanvas = null;
  let bloomSmall = null;
  let bloomBlur = null;
  let filterSupported = false;

  function buildVignette() {
    const c = canvas(W, H);
    const g = c.getContext('2d');
    g.translate(W / 2, H / 2);
    g.scale(1, H / W);
    const gr = g.createRadialGradient(0, 0, W * 0.28, 0, 0, W * 0.78);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.58)');
    g.fillStyle = gr;
    g.fillRect(-W, -W, W * 2, W * 2);
    return c;
  }

  function buildGrain() {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    let s = 12345;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rand() - 0.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function postProcess(ctx, t) {
    ctx.save();
    // bloom: realces (luminárias, LEDs, ônix) ganham brilho difuso
    if (filterSupported) {
      const sg = bloomSmall.getContext('2d');
      sg.filter = 'none';
      sg.drawImage(ctx.canvas, 0, 0, bloomSmall.width, bloomSmall.height);
      const bg = bloomBlur.getContext('2d');
      bg.clearRect(0, 0, bloomBlur.width, bloomBlur.height);
      bg.filter = 'brightness(0.62) contrast(3.2) blur(7px)';
      bg.drawImage(bloomSmall, 0, 0);
      bg.filter = 'none';
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.42;
      ctx.drawImage(bloomBlur, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // tom quente de cinema
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,186,120,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(vignetteCanvas, 0, 0);

    // fade in / fade out
    const black = Math.max(1 - smooth(t / 1.0), smooth((t - (DURATION - 1.8)) / 1.8));
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${black})`;
      ctx.fillRect(0, 0, W, H);
    }

    // grão de filme
    const f = Math.floor(t * FPS);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.085;
    ctx.fillStyle = ctx.createPattern(grainCanvas, 'repeat');
    ctx.translate(-((f * 73) % 256), -((f * 151) % 256));
    ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------
  let buffer = null;
  let bufferCtx = null;
  let ready = false;

  async function init() {
    if (ready) return;
    const names = Object.keys(SHOTS);
    const imgs = await Promise.all(names.map((n) => loadImage(SHOTS[n].src)));
    names.forEach((n, i) => {
      SHOTS[n].img = imgs[i];
      prepareShot(SHOTS[n]);
    });
    woodCanvas = buildWood(420, 1080, 5);
    noiseCanvas = buildNoise(256, 256, 3);
    facadeTex = buildFacade();
    {
      const sl = buildSlider();
      const m = canvas(sl.width, sl.height);
      const mg = m.getContext('2d');
      mg.scale(-1, 1);
      mg.drawImage(sl, -sl.width, 0);
      sliderTex = { tex: sl, mirror: m };
    }
    for (const style of ['glass', 'black', 'wood']) wallTex[style] = buildWall(style);
    vignetteCanvas = buildVignette();
    grainCanvas = buildGrain();
    bloomSmall = canvas(W / 5, H / 5);
    bloomBlur = canvas(W / 5, H / 5);
    const probe = bloomBlur.getContext('2d');
    probe.filter = 'blur(2px)';
    filterSupported = probe.filter === 'blur(2px)';
    probe.filter = 'none';
    buffer = canvas(W, H);
    bufferCtx = buffer.getContext('2d');
    ready = true;
  }

  /**
   * Desenha o quadro do instante t (segundos) no contexto informado (1920x1080).
   * opts.maxSamples controla a qualidade do motion blur (1 = sem blur).
   */
  function render(ctx, t, opts) {
    const maxSamples = (opts && opts.maxSamples) || 16;
    t = clamp(t, 0, DURATION);
    for (const c of [ctx, bufferCtx]) {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
    }
    const disp = motionBetween(t - SHUTTER / 2, t + SHUTTER / 2);
    const n = clamp(Math.ceil(disp / 3), 1, maxSamples);
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (n === 1) {
      drawScene(ctx, t);
    } else {
      for (let k = 0; k < n; k++) {
        const tk = t - SHUTTER / 2 + (SHUTTER * k) / (n - 1);
        bufferCtx.fillStyle = '#000';
        bufferCtx.fillRect(0, 0, W, H);
        drawScene(bufferCtx, clamp(tk, 0, DURATION));
        ctx.globalAlpha = 1 / (k + 1);
        ctx.drawImage(buffer, 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    postProcess(ctx, t);
  }

  global.PelleTour = {
    W,
    H,
    FPS,
    DURATION,
    init,
    render,
    isReady: () => ready,
  };
})(window);
