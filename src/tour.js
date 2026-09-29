/*
 * Pelle — Tour virtual em plano-sequência (estilo drone FPV).
 *
 * Tudo é desenhado em um <canvas> 1920x1080 (16:9) e cada quadro é uma
 * função pura do tempo `t`, o que permite tocar em tempo real ou exportar
 * quadro a quadro para MP4 sem perder sincronia.
 *
 * Roteiro:
 *   0.0s  Fachada com portal de mármore — câmera avança rápido, a porta abre
 *   3.1s  Recepção — desacelera e destaca o painel de mármore
 *   8.4s  Chicote lateral (passa por trás de uma parede) — sem corte
 *   9.2s  Sala de reuniões — close lento na parede e na mesa de mármore
 *  15.9s  Passagem por um portal (voo rápido para frente) — sem corte
 *  16.8s  Banheiro — destaque rápido do frontão em ônix
 *  20.9s  Chicote rápido para o quarto
 *  21.6s  Quarto — painel de ônix retroiluminado, encerramento com a marca
 */
(function (global) {
  'use strict';

  const W = 1920;
  const H = 1080;
  const FPS = 30;
  const DURATION = 33.1;
  const SHUTTER = 1 / 45; // janela do motion blur (em segundos)

  // ------------------------------------------------------------------
  // Textos editáveis dos destaques de revestimento
  // ------------------------------------------------------------------
  const MATERIALS = {
    nero: {
      kicker: 'REVESTIMENTO PELLE',
      title: 'Mármore Nero',
      lines: ['Placa de revestimento que reproduz', 'os veios do mármore natural.'],
    },
    neroParede: {
      kicker: 'PAINEL PELLE',
      title: 'Mármore Nero',
      lines: ['Parede inteira revestida com', 'placas de efeito mármore.'],
    },
    grafite: {
      kicker: 'SUPERFÍCIE PELLE',
      title: 'Mármore Grafite',
      lines: ['Tampo com acabamento que', 'simula a pedra natural.'],
    },
    onixMel: {
      kicker: 'REVESTIMENTO PELLE',
      title: 'Ônix Mel',
      lines: ['Placa efeito ônix no', 'frontão da bancada.'],
    },
    onixPerola: {
      kicker: 'PAINEL RETROILUMINADO',
      title: 'Ônix Pérola',
      lines: ['Placas efeito ônix com', 'iluminação de fundo.'],
    },
  };

  const FONT_SANS = '"Jost", "Helvetica Neue", Arial, sans-serif';
  const FONT_SERIF = '"Cormorant Garamond", Georgia, serif';
  const GOLD = '#d9c29a';
  const CREAM = '#f6efe4';

  // ------------------------------------------------------------------
  // Cenas (fotos) — keyframes da câmera: [t, x, y, zoom]
  // x/y = ponto da foto (0..1) no centro da tela; zoom 1 = enquadramento mínimo
  // ------------------------------------------------------------------
  const SHOTS = {
    recepcao: {
      src: 'assets/recepcao.webp',
      seed: 1.3,
      kf: [
        [3.1, 0.5, 0.5, 1.45],
        [3.7, 0.53, 0.47, 1.6],
        [5.0, 0.6, 0.38, 1.72],
        [7.6, 0.665, 0.3, 1.9],
        [8.4, 0.7, 0.3, 1.95],
        [9.2, 0.76, 0.32, 1.95],
      ],
      hotspots: [
        {
          t0: 4.7,
          t1: 8.2,
          mat: 'nero',
          poly: [[918, 0], [1335, 0], [1335, 505], [918, 505]],
          anchor: [1126, 330],
          label: { x: 110, y: 520 },
        },
      ],
    },
    sala: {
      src: 'assets/sala-reunioes.webp',
      seed: 4.1,
      kf: [
        [8.4, 0.36, 0.5, 1.15],
        [9.2, 0.4, 0.48, 1.2],
        [10.3, 0.44, 0.42, 1.35],
        [12.9, 0.47, 0.32, 1.78],
        [14.5, 0.56, 0.55, 1.75],
        [15.4, 0.55, 0.6, 1.9],
        [16.75, 0.5, 0.6, 2.1],
      ],
      hotspots: [
        {
          t0: 10.0,
          t1: 13.4,
          mat: 'neroParede',
          poly: [[405, 40], [998, 70], [998, 485], [405, 485]],
          anchor: [470, 150],
          label: { x: 1440, y: 520 },
        },
        {
          t0: 13.6,
          t1: 16.0,
          mat: 'grafite',
          poly: [[583, 520], [1095, 528], [1462, 650], [1462, 684], [832, 690]],
          anchor: [760, 600],
          label: { x: 110, y: 250 },
        },
      ],
    },
    banheiro: {
      src: 'assets/banheiro.jpg',
      seed: 7.7,
      kf: [
        [15.9, 0.42, 0.5, 1.0],
        [16.75, 0.4, 0.5, 1.15],
        [17.5, 0.35, 0.5, 1.3],
        [18.6, 0.44, 0.53, 1.9],
        [20.2, 0.448, 0.54, 2.5],
        [20.9, 0.43, 0.53, 2.4],
        [21.6, 0.36, 0.52, 2.2],
      ],
      hotspots: [
        {
          t0: 18.2,
          t1: 20.8,
          mat: 'onixMel',
          poly: [[628, 331], [790, 331], [790, 392], [628, 392]],
          anchor: [760, 350],
          label: { x: 1380, y: 440 },
        },
      ],
    },
    quarto: {
      src: 'assets/quarto.jpg',
      seed: 2.9,
      kf: [
        [20.9, 0.66, 0.5, 1.35],
        [21.6, 0.6, 0.48, 1.25],
        [22.9, 0.5, 0.44, 1.15],
        [24.8, 0.4, 0.34, 1.35],
        [27.8, 0.3, 0.25, 1.5],
        [30.4, 0.34, 0.3, 1.45],
        [33.1, 0.38, 0.34, 1.4],
      ],
      hotspots: [
        {
          t0: 24.8,
          t1: 29.0,
          mat: 'onixPerola',
          poly: [[102, 0], [232, 0], [715, 140], [715, 365], [102, 347]],
          anchor: [560, 250],
          label: { x: 110, y: 860 },
        },
      ],
    },
  };

  // Linha do tempo: um único plano-sequência, sem cortes
  const TIMELINE = [
    { type: 'entrance', t0: 0, t1: 3.1, shot: 'recepcao' },
    { type: 'shot', t0: 3.1, t1: 8.4, shot: 'recepcao' },
    { type: 'whip', t0: 8.4, t1: 9.2, a: 'recepcao', b: 'sala', dir: 1 },
    { type: 'shot', t0: 9.2, t1: 15.9, shot: 'sala' },
    { type: 'portal', t0: 15.9, t1: 16.75, a: 'sala', b: 'banheiro' },
    { type: 'shot', t0: 16.75, t1: 20.9, shot: 'banheiro' },
    { type: 'whip', t0: 20.9, t1: 21.6, a: 'banheiro', b: 'quarto', dir: -1 },
    { type: 'shot', t0: 21.6, t1: DURATION + 1, shot: 'quarto' },
  ];

  const CHAPTERS = [
    { t0: 3.4, t1: 7.4, num: '01', name: 'RECEPÇÃO' },
    { t0: 9.4, t1: 13.4, num: '02', name: 'SALA DE REUNIÕES' },
    { t0: 17.0, t1: 20.4, num: '03', name: 'BANHEIRO' },
    { t0: 21.9, t1: 26.0, num: '04', name: 'QUARTO' },
  ];

  const END_T0 = 29.2;

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
  const easeOutCubic = (v) => 1 - Math.pow(1 - clamp01(v), 3);

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

  /** Tremor suave de drone (soma de senos). */
  function droneShake(t, seed) {
    const s = (f, p) => Math.sin(t * f + p);
    return {
      x: s(1.31, seed) * 0.6 + s(2.93, seed * 2.1) * 0.3 + s(5.71, seed * 0.7) * 0.1,
      y: s(1.07, seed + 1.7) * 0.6 + s(2.37, seed * 1.3) * 0.3 + s(6.13, seed) * 0.1,
      r: s(0.87, seed + 3.1) * 0.7 + s(2.71, seed * 0.9) * 0.3,
    };
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
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
  // Câmera sobre as fotos
  // ------------------------------------------------------------------
  function prepareShot(shot) {
    const t = shot.kf.map((k) => k[0]);
    shot.tx = makeTrack(t, shot.kf.map((k) => k[1]));
    shot.ty = makeTrack(t, shot.kf.map((k) => k[2]));
    shot.tz = makeTrack(t, shot.kf.map((k) => Math.log(k[3])));
  }

  function shotCam(shot, t) {
    const z = Math.exp(shot.tz(t));
    const sh = droneShake(t, shot.seed);
    return {
      x: shot.tx(t) + (sh.x * 0.0018) / z,
      y: shot.ty(t) + (sh.y * 0.0018) / z,
      z,
      r: sh.r * 0.0035,
    };
  }

  /** Converte a câmera em transformação (escala, centro na foto, rotação), sem mostrar bordas. */
  function camTransform(shot, cam) {
    const iw = shot.img.width;
    const ih = shot.img.height;
    const c = Math.cos(Math.abs(cam.r));
    const s0 = Math.sin(Math.abs(cam.r));
    const sMin = Math.max((W * c + H * s0) / iw, (W * s0 + H * c) / ih);
    const s = sMin * Math.max(1, cam.z);
    const hx = (W * c + H * s0) / (2 * s);
    const hy = (W * s0 + H * c) / (2 * s);
    return {
      s,
      r: cam.r,
      cx: clamp(cam.x * iw, hx, iw - hx),
      cy: clamp(cam.y * ih, hy, ih - hy),
    };
  }

  function drawShot(ctx, shot, cam, dx) {
    const T = camTransform(shot, cam);
    ctx.save();
    ctx.translate(W / 2 + (dx || 0), H / 2);
    ctx.rotate(T.r);
    ctx.scale(T.s, T.s);
    ctx.drawImage(shot.img, -T.cx, -T.cy);
    ctx.restore();
    return T;
  }

  function mapPoint(T, px, py) {
    const x = (px - T.cx) * T.s;
    const y = (py - T.cy) * T.s;
    const c = Math.cos(T.r);
    const s = Math.sin(T.r);
    return [W / 2 + x * c - y * s, H / 2 + x * s + y * c];
  }

  function unmapPoint(T, sx, sy) {
    const x = sx - W / 2;
    const y = sy - H / 2;
    const c = Math.cos(-T.r);
    const s = Math.sin(-T.r);
    return [T.cx + (x * c - y * s) / T.s, T.cy + (x * s + y * c) / T.s];
  }

  const PROBES = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]];
  function transformDisp(A, B) {
    let d = 0;
    for (const p of PROBES) {
      const ip = unmapPoint(A, p[0], p[1]);
      const q = mapPoint(B, ip[0], ip[1]);
      d = Math.max(d, Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    return d;
  }

  // ------------------------------------------------------------------
  // Fachada / entrada (procedural) com porta de duas folhas
  // ------------------------------------------------------------------
  const ENT = {
    D0: 700, // distância focal (unidades da fachada)
    near: 25,
    doorHalf: 220,
    doorTop: -320,
    doorBot: 380,
    vp: { x: 0, y: 20 },
    interiorDepth: 2600,
  };
  ENT.trackD = makeTrack(
    [0, 1.1, 1.7, 2.2, 2.6, 2.85, 3.1],
    [700 / 0.86, 700 / 1.18, 700 / 1.34, 700 / 1.55, 250, 60, -260]
  );
  const FAC = { x0: -1250, y0: -720, w: 2500, h: 1440, R: 1.25 };

  function doorAngle(t) {
    return easeInOutCubic((t - 0.8) / 1.35) * 1.45;
  }

  function entranceInteriorCam(t) {
    const S = SHOTS.recepcao;
    const cam = shotCam(S, t);
    const D = ENT.trackD(t);
    const Dend = ENT.trackD(3.1);
    cam.z *= (ENT.interiorDepth + Dend) / (ENT.interiorDepth + D);
    return cam;
  }

  function entranceShake(t) {
    const sh = droneShake(t, 9.4);
    return { x: sh.x * 5, y: sh.y * 4 };
  }

  let facadeCanvas = null;
  let woodCanvas = null;

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

  function buildFacade() {
    const R = FAC.R;
    const c = canvas(Math.round(FAC.w * R), Math.round(FAC.h * R));
    const g = c.getContext('2d');
    g.scale(R, R);
    g.translate(-FAC.x0, -FAC.y0);

    const top = FAC.y0;
    const bottom = FAC.y0 + FAC.h;
    const left = FAC.x0;
    const right = FAC.x0 + FAC.w;
    const ceil = -560;
    const floor = ENT.doorBot;

    // Parede bege iluminada de cima
    let gr = g.createLinearGradient(0, ceil, 0, floor);
    gr.addColorStop(0, '#e2d6c2');
    gr.addColorStop(0.35, '#d2c4ae');
    gr.addColorStop(1, '#b7a78f');
    g.fillStyle = gr;
    g.fillRect(left, ceil, FAC.w, floor - ceil);

    // Juntas verticais da parede
    g.strokeStyle = 'rgba(90,75,60,0.28)';
    g.lineWidth = 2;
    for (const x of [-620, 620]) {
      g.beginPath();
      g.moveTo(x, ceil);
      g.lineTo(x, floor);
      g.stroke();
    }

    // Painéis ripados de madeira nas laterais
    const slat = 26;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? left : 780;
      const x1 = side < 0 ? -780 : right;
      for (let x = x0, i = 0; x < x1; x += slat, i++) {
        const tone = 0.85 + 0.15 * Math.sin(i * 12.9898) * Math.sin(i * 4.1414);
        g.drawImage(woodCanvas, (i * 37) % (woodCanvas.width - 30), 0, 24, woodCanvas.height, x, ceil, slat - 4, floor - ceil);
        g.fillStyle = `rgba(0,0,0,${0.25 - tone * 0.18})`;
        g.fillRect(x, ceil, slat - 4, floor - ceil);
        g.fillStyle = 'rgba(15,9,5,0.85)';
        g.fillRect(x + slat - 4, ceil, 4, floor - ceil);
      }
      gr = g.createLinearGradient(0, ceil, 0, floor);
      gr.addColorStop(0, 'rgba(255,220,170,0.18)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = gr;
      g.fillRect(x0, ceil, x1 - x0, floor - ceil);
    }

    // Portal de mármore Nero (book-match: metade espelhada)
    const mw = 440;
    const mh = floor - ceil;
    const marble = global.PelleMarble.createMarble(Math.round(mw * R), Math.round(mh * R), { seed: 11, scale: 1 / (430 * R) });
    g.drawImage(marble, -mw, ceil, mw, mh);
    g.save();
    g.scale(-1, 1);
    g.drawImage(marble, -mw, ceil, mw, mh);
    g.restore();
    // brilho polido do mármore
    gr = g.createLinearGradient(-mw, ceil, mw, floor);
    gr.addColorStop(0, 'rgba(255,240,220,0.10)');
    gr.addColorStop(0.45, 'rgba(255,240,220,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr;
    g.fillRect(-mw, ceil, mw * 2, mh);
    // junta central e juntas horizontais
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(-1, ceil, 2, ENT.doorTop - ceil);
    g.fillRect(-mw, -80, mw - ENT.doorHalf - 18, 2);
    g.fillRect(ENT.doorHalf + 18, -80, mw - ENT.doorHalf - 18, 2);

    // Fitas de LED verticais entre o mármore e a parede
    for (const x of [-mw - 8, mw + 8]) {
      g.save();
      g.shadowColor = 'rgba(255,196,120,0.95)';
      g.shadowBlur = 40;
      g.fillStyle = '#fff1d6';
      g.fillRect(x - 3, ceil, 6, floor - ceil);
      g.restore();
      gr = g.createLinearGradient(x - 120, 0, x + 120, 0);
      gr.addColorStop(0, 'rgba(255,200,130,0)');
      gr.addColorStop(0.5, 'rgba(255,200,130,0.28)');
      gr.addColorStop(1, 'rgba(255,200,130,0)');
      g.fillStyle = gr;
      g.fillRect(x - 120, ceil, 240, floor - ceil);
    }

    // Teto com sanca iluminada
    gr = g.createLinearGradient(0, top, 0, ceil);
    gr.addColorStop(0, '#1b1715');
    gr.addColorStop(1, '#3a332d');
    g.fillStyle = gr;
    g.fillRect(left, top, FAC.w, ceil - top);
    g.save();
    g.shadowColor = 'rgba(255,200,130,1)';
    g.shadowBlur = 30;
    g.fillStyle = '#ffeccc';
    g.fillRect(left, ceil - 4, FAC.w, 4);
    g.restore();
    gr = g.createLinearGradient(0, ceil, 0, ceil + 260);
    gr.addColorStop(0, 'rgba(255,214,160,0.35)');
    gr.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = gr;
    g.fillRect(left, ceil, FAC.w, 260);

    // Logo Pelle em latão sobre o mármore
    g.save();
    g.font = `400 118px ${FONT_SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    gr = g.createLinearGradient(0, -500, 0, -390);
    gr.addColorStop(0, '#f1e0bb');
    gr.addColorStop(0.5, '#cfb27c');
    gr.addColorStop(1, '#9f8254');
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 4;
    g.fillStyle = gr;
    g.fillText('Pelle', 0, -392);
    g.restore();

    // Batente preto da porta
    g.fillStyle = '#0d0c0b';
    g.fillRect(-ENT.doorHalf - 18, ENT.doorTop - 18, (ENT.doorHalf + 18) * 2, floor - ENT.doorTop + 18);

    // Piso de pedra polida com reflexo
    gr = g.createLinearGradient(0, floor, 0, bottom);
    gr.addColorStop(0, '#9b9187');
    gr.addColorStop(1, '#5a534c');
    g.fillStyle = gr;
    g.fillRect(left, floor, FAC.w, bottom - floor);
    g.save();
    g.globalAlpha = 0.22;
    g.translate(0, floor * 2);
    g.scale(1, -1);
    g.drawImage(marble, -mw, ceil, mw, mh);
    g.scale(-1, 1);
    g.drawImage(marble, -mw, ceil, mw, mh);
    g.restore();
    gr = g.createLinearGradient(0, floor, 0, bottom);
    gr.addColorStop(0, 'rgba(120,110,100,0.1)');
    gr.addColorStop(1, 'rgba(40,36,32,0.85)');
    g.fillStyle = gr;
    g.fillRect(left, floor, FAC.w, bottom - floor);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(left, floor, FAC.w, 3);

    // Vão da porta (transparente: o interior aparece por trás)
    g.clearRect(-ENT.doorHalf, ENT.doorTop, ENT.doorHalf * 2, floor - ENT.doorTop);

    return c;
  }

  function facadeToScreen(p, S0, cx, cy) {
    return [cx + (p[0] - ENT.vp.x) * S0, cy + (p[1] - ENT.vp.y) * S0];
  }

  function drawDoorLeaf(ctx, side, theta, D, cx, cy) {
    const hingeX = side * ENT.doorHalf;
    const dir = -side;
    const w = ENT.doorHalf;
    const N = 16;
    const light = 0.5 + 0.5 * Math.cos(theta);
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x3 = hingeX + dir * w * u * Math.cos(theta);
      const z3 = w * u * Math.sin(theta);
      pts.push({ x3, den: D + z3 });
    }
    const proj = (p, y) => {
      const s = ENT.D0 / p.den;
      return [cx + (p.x3 - ENT.vp.x) * s, cy + (y - ENT.vp.y) * s];
    };
    for (let i = 0; i < N; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.den < ENT.near || b.den < ENT.near) continue;
      const tone = (0.78 + 0.22 * ((i * 7) % 5) / 4) * light;
      const p1 = proj(a, ENT.doorTop);
      const p2 = proj(b, ENT.doorTop);
      const p3 = proj(b, ENT.doorBot);
      const p4 = proj(a, ENT.doorBot);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.lineTo(p4[0], p4[1]);
      ctx.closePath();
      const gr = ctx.createLinearGradient(0, p1[1], 0, p4[1]);
      gr.addColorStop(0, `rgb(${118 * tone | 0},${82 * tone | 0},${56 * tone | 0})`);
      gr.addColorStop(1, `rgb(${70 * tone | 0},${47 * tone | 0},${31 * tone | 0})`);
      ctx.fillStyle = gr;
      ctx.fill();
      // sulco entre ripas
      ctx.strokeStyle = `rgba(20,12,6,${0.8})`;
      ctx.lineWidth = Math.max(1, (ENT.D0 / a.den) * 2.2);
      ctx.beginPath();
      ctx.moveTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.stroke();
    }
    // puxador de latão
    const u0 = 0.86;
    const u1 = 0.9;
    const pa = { x3: hingeX + dir * w * u0 * Math.cos(theta), den: D + w * u0 * Math.sin(theta) };
    const pb = { x3: hingeX + dir * w * u1 * Math.cos(theta), den: D + w * u1 * Math.sin(theta) };
    if (pa.den > ENT.near && pb.den > ENT.near) {
      const q1 = proj(pa, -60);
      const q2 = proj(pb, -60);
      const q3 = proj(pb, 170);
      const q4 = proj(pa, 170);
      ctx.beginPath();
      ctx.moveTo(q1[0], q1[1]);
      ctx.lineTo(q2[0], q2[1]);
      ctx.lineTo(q3[0], q3[1]);
      ctx.lineTo(q4[0], q4[1]);
      ctx.closePath();
      const gr = ctx.createLinearGradient(q1[0], 0, q2[0], 0);
      gr.addColorStop(0, `rgba(241,224,187,${0.5 + 0.5 * light})`);
      gr.addColorStop(1, `rgba(150,120,75,${0.5 + 0.5 * light})`);
      ctx.fillStyle = gr;
      ctx.fill();
    }
  }

  function drawEntrance(ctx, t) {
    const S = SHOTS.recepcao;
    drawShot(ctx, S, entranceInteriorCam(t));

    const D = ENT.trackD(t);
    const theta = doorAngle(t);
    const sh = entranceShake(t);
    const cx = W / 2 + sh.x;
    const cy = H / 2 + sh.y;

    // luz quente vazando do interior enquanto a porta abre
    const open = Math.sin(theta);
    // folhas da porta (abrem para dentro)
    drawDoorLeaf(ctx, -1, theta, D, cx, cy);
    drawDoorLeaf(ctx, 1, theta, D, cx, cy);

    if (D <= ENT.near) return;
    const S0 = ENT.D0 / D;
    const tl = facadeToScreen([-ENT.doorHalf, ENT.doorTop], S0, cx, cy);
    const br = facadeToScreen([ENT.doorHalf, ENT.doorBot], S0, cx, cy);
    if (tl[0] <= 0 && tl[1] <= 0 && br[0] >= W && br[1] >= H) return; // vão já cobre a tela

    ctx.save();
    ctx.shadowColor = 'transparent';
    const p0 = facadeToScreen([FAC.x0, FAC.y0], S0, cx, cy);
    ctx.drawImage(facadeCanvas, p0[0], p0[1], FAC.w * S0, FAC.h * S0);

    // sombra interna do batente
    const inset = 14 * S0;
    let gr = ctx.createLinearGradient(tl[0], 0, tl[0] + inset, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(tl[0], tl[1], inset, br[1] - tl[1]);
    gr = ctx.createLinearGradient(br[0], 0, br[0] - inset, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(br[0] - inset, tl[1], inset, br[1] - tl[1]);

    // luz no piso
    if (open > 0.01) {
      const fl = facadeToScreen([0, ENT.doorBot + 120], S0, cx, cy);
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(fl[0], fl[1]);
      ctx.scale(1, 0.32);
      gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 520 * S0);
      gr.addColorStop(0, `rgba(255,205,140,${0.4 * open})`);
      gr.addColorStop(1, 'rgba(255,205,140,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(-600 * S0, -600 * S0, 1200 * S0, 1200 * S0);
    }
    ctx.restore();
  }

  function entranceDisp(ta, tb) {
    const Da = ENT.trackD(ta);
    const Db = ENT.trackD(tb);
    const SI = SHOTS.recepcao;
    let d = transformDisp(camTransform(SI, entranceInteriorCam(ta)), camTransform(SI, entranceInteriorCam(tb)));
    if (Da > ENT.near && Db > ENT.near) {
      const Sa = ENT.D0 / Da;
      const Sb = ENT.D0 / Db;
      const pts = [[-ENT.doorHalf, ENT.doorTop], [ENT.doorHalf, ENT.doorBot], [0, ENT.doorTop]];
      for (const p of pts) {
        const a = facadeToScreen(p, Sa, W / 2, H / 2);
        const b = facadeToScreen(p, Sb, W / 2, H / 2);
        const onScreen = (q) => q[0] > -200 && q[0] < W + 200 && q[1] > -200 && q[1] < H + 200;
        if (onScreen(a) || onScreen(b)) d = Math.max(d, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
      d = Math.max(d, Math.abs(doorAngle(tb) - doorAngle(ta)) * ENT.doorHalf * Sa);
    } else if ((Da > ENT.near) !== (Db > ENT.near) || Math.min(Da, Db) < 240) {
      d = Math.max(d, 60);
    }
    return d;
  }

  // ------------------------------------------------------------------
  // Transição "chicote": câmera gira e passa por trás de uma parede
  // ------------------------------------------------------------------
  const OCC_W = 0.52 * W;

  function whipQ(seg, t) {
    return smoother((t - seg.t0) / (seg.t1 - seg.t0));
  }

  function drawOccluder(ctx, x, w) {
    ctx.drawImage(woodCanvas, x, 0, w, H);
    let gr = ctx.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.18, 'rgba(0,0,0,0.05)');
    gr.addColorStop(0.5, 'rgba(255,220,180,0.06)');
    gr.addColorStop(0.82, 'rgba(0,0,0,0.05)');
    gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = gr;
    ctx.fillRect(x, 0, w, H);
    for (const lx of [x + 26, x + w - 26]) {
      gr = ctx.createLinearGradient(lx - 60, 0, lx + 60, 0);
      gr.addColorStop(0, 'rgba(255,200,130,0)');
      gr.addColorStop(0.5, 'rgba(255,214,160,0.55)');
      gr.addColorStop(1, 'rgba(255,200,130,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(lx - 60, 0, 120, H);
      ctx.fillStyle = '#fff3dc';
      ctx.fillRect(lx - 3, 0, 6, H);
    }
  }

  function drawWhip(ctx, seg, t) {
    const q = whipQ(seg, t);
    const A = SHOTS[seg.a];
    const B = SHOTS[seg.b];
    const sA = 0.55 * W;
    const sB = 0.55 * W;
    const dir = seg.dir;
    const bank = Math.sin(q * Math.PI) * 0.03 * dir;
    const cover = Math.cos(Math.abs(bank)) + Math.sin(Math.abs(bank)) * (W / H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(bank);
    ctx.scale(cover, cover);
    ctx.translate(-W / 2, -H / 2);

    let occL;
    if (dir > 0) occL = W - q * (W + OCC_W);
    else occL = -OCC_W + q * (W + OCC_W);
    const occR = occL + OCC_W;

    // cena A
    ctx.save();
    ctx.beginPath();
    if (dir > 0) ctx.rect(-10, -10, occL + 10, H + 20);
    else ctx.rect(occR, -10, W - occR + 10, H + 20);
    ctx.clip();
    drawShot(ctx, A, shotCam(A, t), -dir * q * sA);
    ctx.restore();

    // cena B
    ctx.save();
    ctx.beginPath();
    if (dir > 0) ctx.rect(occR, -10, W - occR + 10, H + 20);
    else ctx.rect(-10, -10, occL + 10, H + 20);
    ctx.clip();
    drawShot(ctx, B, shotCam(B, t), dir * (1 - q) * sB);
    ctx.restore();

    drawOccluder(ctx, occL, OCC_W);
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // Transição "portal": voo para frente atravessando um batente
  // ------------------------------------------------------------------
  function portalQ(seg, t) {
    return clamp01((t - seg.t0) / (seg.t1 - seg.t0));
  }

  function portalCamA(seg, t) {
    const q = portalQ(seg, t);
    const cam = shotCam(SHOTS[seg.a], t);
    cam.z *= Math.exp(Math.pow(q, 1.7) * Math.log(2.6));
    return cam;
  }

  function portalScale(q) {
    return 0.5 / (1 - q * 0.92);
  }

  function drawPortal(ctx, seg, t) {
    const q = portalQ(seg, t);
    const A = SHOTS[seg.a];
    const B = SHOTS[seg.b];
    drawShot(ctx, A, portalCamA(seg, t));

    const alpha = smooth(q / 0.22);
    const sc = portalScale(q);
    const back = 0.5 / (1 - q * 0.92 + 0.07);
    const ow = 470;
    const oh = 540;
    const cx = W / 2;
    const cy = H / 2 + 20;
    const face = [cx - ow * sc, cy - oh * sc, cx + ow * sc, cy + oh * sc];
    const rear = [cx - ow * back, cy - oh * back, cx + ow * back, cy + oh * back];

    ctx.save();
    ctx.globalAlpha = alpha;
    // interior da próxima cena
    ctx.save();
    ctx.beginPath();
    ctx.rect(face[0], face[1], face[2] - face[0], face[3] - face[1]);
    ctx.clip();
    drawShot(ctx, B, shotCam(B, t));
    ctx.restore();

    // profundidade do batente (reveal)
    const quad = (a, b, c, d, fill) => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    quad([face[0], face[1]], [rear[0], rear[1]], [rear[0], rear[3]], [face[0], face[3]], '#3a2819');
    quad([face[2], face[1]], [rear[2], rear[1]], [rear[2], rear[3]], [face[2], face[3]], '#2a1c12');
    quad([face[0], face[1]], [face[2], face[1]], [rear[2], rear[1]], [rear[0], rear[1]], '#20160f');
    // moldura frontal
    const fw = 34 * sc;
    ctx.fillStyle = '#16110d';
    ctx.fillRect(face[0] - fw, face[1] - fw, face[2] - face[0] + fw * 2, fw);
    ctx.fillRect(face[0] - fw, face[1], fw, face[3] - face[1]);
    ctx.fillRect(face[2], face[1], fw, face[3] - face[1]);
    // filete de LED
    ctx.shadowColor = 'rgba(255,196,120,0.9)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffeccc';
    const lw = Math.max(2, 4 * sc);
    ctx.fillRect(face[0] - lw, face[1] - lw, lw, face[3] - face[1] + lw);
    ctx.fillRect(face[2], face[1] - lw, lw, face[3] - face[1] + lw);
    ctx.restore();

    // clarão quente ao atravessar
    const flash = Math.sin(clamp01((q - 0.55) / 0.45) * Math.PI) * 0.22;
    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,222,180,${flash})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------
  // Cena completa em um instante (sem pós-processamento)
  // ------------------------------------------------------------------
  function segmentAt(t) {
    for (const seg of TIMELINE) if (t < seg.t1) return seg;
    return TIMELINE[TIMELINE.length - 1];
  }

  function drawScene(ctx, t) {
    const seg = segmentAt(t);
    switch (seg.type) {
      case 'entrance':
        drawEntrance(ctx, t);
        break;
      case 'shot':
        drawShot(ctx, SHOTS[seg.shot], shotCam(SHOTS[seg.shot], t));
        break;
      case 'whip':
        drawWhip(ctx, seg, t);
        break;
      case 'portal':
        drawPortal(ctx, seg, t);
        break;
    }
  }

  function shotDisp(name, ta, tb) {
    const S = SHOTS[name];
    return transformDisp(camTransform(S, shotCam(S, ta)), camTransform(S, shotCam(S, tb)));
  }

  /** Deslocamento máximo em px entre dois instantes: define quantas amostras de motion blur usar. */
  function motionBetween(ta, tb) {
    const seg = segmentAt((ta + tb) / 2);
    switch (seg.type) {
      case 'entrance':
        return entranceDisp(ta, tb);
      case 'shot':
        return shotDisp(seg.shot, ta, tb);
      case 'whip': {
        const dq = Math.abs(whipQ(seg, tb) - whipQ(seg, ta));
        return Math.max(shotDisp(seg.a, ta, tb), shotDisp(seg.b, ta, tb), dq * (W + OCC_W));
      }
      case 'portal': {
        const S = SHOTS[seg.a];
        const dA = transformDisp(camTransform(S, portalCamA(seg, ta)), camTransform(S, portalCamA(seg, tb)));
        const dF = Math.abs(portalScale(portalQ(seg, tb)) - portalScale(portalQ(seg, ta))) * 540;
        return Math.max(dA, Math.min(dF, 400), shotDisp(seg.b, ta, tb));
      }
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // Sobreposições: destaque do mármore, capítulos, marca, encerramento
  // ------------------------------------------------------------------
  function spacedText(ctx, text, x, y, spacing, align) {
    const chars = Array.from(text);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach((ch, i) => {
      ctx.fillText(ch, cx, y);
      cx += widths[i] + spacing;
    });
    ctx.textAlign = prev;
    return total;
  }

  function polyPath(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawHotspot(ctx, shot, hs, t) {
    const local = t - hs.t0;
    const dur = hs.t1 - hs.t0;
    if (local < 0 || local > dur) return;
    const a = smooth(local / 0.5) * (1 - smooth((local - (dur - 0.6)) / 0.6));
    if (a <= 0.001) return;

    const T = camTransform(shot, shotCam(shot, t));
    const pts = hs.poly.map((p) => mapPoint(T, p[0], p[1]));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }

    ctx.save();
    // 1) foco: escurece o entorno
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    polyPath(ctx, pts);
    ctx.fillStyle = `rgba(8,6,5,${0.4 * a})`;
    ctx.fill('evenodd');

    // 2) brilho de pedra polida varrendo a placa
    ctx.save();
    ctx.beginPath();
    polyPath(ctx, pts);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,236,210,${0.07 * a})`;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const bw = x1 - x0;
    const bh = y1 - y0;
    for (const [start, len, strength] of [[0.45, 1.5, 0.42], [1.9, 1.6, 0.22]]) {
      const k = (local - start) / len;
      if (k <= 0 || k >= 1) continue;
      const span = bw + bh;
      const pos = -0.3 * span + easeInOutCubic(k) * 1.6 * span;
      const gx = x0 + pos;
      const gr = ctx.createLinearGradient(gx - 260, y0 - 150, gx + 260, y0 + 150);
      gr.addColorStop(0, 'rgba(255,244,226,0)');
      gr.addColorStop(0.45, `rgba(255,244,226,${0.05 * a})`);
      gr.addColorStop(0.5, `rgba(255,244,226,${strength * a})`);
      gr.addColorStop(0.55, `rgba(255,244,226,${0.05 * a})`);
      gr.addColorStop(1, 'rgba(255,244,226,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x0, y0, bw, bh);
    }
    ctx.restore();

    // 3) contorno dourado desenhado progressivamente
    let perim = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      perim += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    const draw = easeInOutCubic((local - 0.15) / 1.1);
    ctx.save();
    ctx.shadowColor = 'rgba(217,194,154,0.9)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = `rgba(226,204,160,${0.95 * a})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([perim * draw, perim]);
    ctx.beginPath();
    polyPath(ctx, pts);
    ctx.stroke();
    ctx.restore();

    // cantoneiras
    ctx.strokeStyle = `rgba(240,222,186,${a * smooth((local - 0.9) / 0.4)})`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'square';
    const L = 34;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const seg = (q) => {
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const len = Math.hypot(dx, dy) || 1;
        const l = Math.min(L, len / 3);
        return [p[0] + (dx / len) * l, p[1] + (dy / len) * l];
      };
      const e1 = seg(prev);
      const e2 = seg(next);
      ctx.beginPath();
      ctx.moveTo(e1[0], e1[1]);
      ctx.lineTo(p[0], p[1]);
      ctx.lineTo(e2[0], e2[1]);
      ctx.stroke();
    }

    // 4) marcador + linha guia + etiqueta
    const m = mapPoint(T, hs.anchor[0], hs.anchor[1]);
    const lab = hs.label;
    const right = lab.x > W / 2;
    const mat = MATERIALS[hs.mat];
    const la = a * smooth((local - 0.5) / 0.5);

    // fundo suave para legibilidade
    ctx.save();
    ctx.translate(lab.x + (right ? 200 : 200), lab.y + 40);
    ctx.scale(1, 0.55);
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, 520);
    bg.addColorStop(0, `rgba(10,8,6,${0.62 * la})`);
    bg.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(-520, -520, 1040, 1040);
    ctx.restore();

    const pulse = (local * 1.4) % 1;
    ctx.fillStyle = `rgba(246,239,228,${la})`;
    ctx.beginPath();
    ctx.arc(m[0], m[1], 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(246,239,228,${la * (1 - pulse)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m[0], m[1], 7 + pulse * 26, 0, Math.PI * 2);
    ctx.stroke();

    const end = [right ? lab.x - 22 : lab.x + 430, lab.y - 46];
    const lk = easeOutCubic((local - 0.45) / 0.6);
    ctx.strokeStyle = `rgba(226,204,160,${la})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m[0], m[1]);
    ctx.lineTo(lerp(m[0], end[0], lk), lerp(m[1], end[1], lk));
    ctx.stroke();

    // textos com entrada escalonada
    const txt = (delay) => {
      const k = smooth((local - delay) / 0.45) * a;
      return { k, dy: (1 - k) * 14 };
    };
    ctx.textBaseline = 'alphabetic';
    let r = txt(0.6);
    ctx.fillStyle = `rgba(217,194,154,${r.k})`;
    ctx.font = `500 19px ${FONT_SANS}`;
    spacedText(ctx, mat.kicker, lab.x, lab.y + r.dy, 6, 'left');

    r = txt(0.75);
    ctx.fillStyle = `rgba(246,239,228,${r.k})`;
    ctx.font = `500 70px ${FONT_SERIF}`;
    ctx.fillText(mat.title, lab.x - 3, lab.y + 72 + r.dy);

    r = txt(0.9);
    ctx.fillStyle = `rgba(217,194,154,${r.k})`;
    ctx.fillRect(lab.x, lab.y + 98, 64 * r.k, 2);

    r = txt(1.0);
    ctx.fillStyle = `rgba(246,239,228,${0.86 * r.k})`;
    ctx.font = `300 25px ${FONT_SANS}`;
    mat.lines.forEach((line, i) => ctx.fillText(line, lab.x, lab.y + 142 + i * 34 + r.dy));

    ctx.restore();
  }

  function drawChapters(ctx, t) {
    for (const c of CHAPTERS) {
      if (t < c.t0 || t > c.t1) continue;
      const local = t - c.t0;
      const a = smooth(local / 0.6) * (1 - smooth((t - (c.t1 - 0.6)) / 0.6));
      const slide = (1 - easeOutCubic(local / 0.8)) * 30;
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = `rgba(217,194,154,${a})`;
      ctx.font = `300 26px ${FONT_SANS}`;
      ctx.fillText(c.num, 110 - slide, 124);
      ctx.fillRect(160 - slide, 115, 56 * easeOutCubic((local - 0.2) / 0.8), 1.5);
      ctx.fillStyle = `rgba(246,239,228,${a})`;
      ctx.font = `400 24px ${FONT_SANS}`;
      spacedText(ctx, c.name, 236 - slide, 124, 7, 'left');
      ctx.restore();
    }
  }

  function drawBrand(ctx, t) {
    const a = smooth((t - 3.4) / 0.8) * (1 - smooth((t - (END_T0 - 0.2)) / 0.6));
    if (a <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(246,239,228,${0.85 * a})`;
    ctx.font = `400 40px ${FONT_SANS}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Pelle', W - 110, 130);
    ctx.restore();
  }

  function drawEndCard(ctx, t) {
    const local = t - END_T0;
    if (local < 0) return;
    const a = smooth(local / 1.2);
    ctx.save();
    ctx.fillStyle = `rgba(12,10,8,${0.7 * a})`;
    ctx.fillRect(0, 0, W, H);
    const gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 900);
    gr.addColorStop(0, `rgba(60,44,30,${0.35 * a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = 'alphabetic';
    const k1 = smooth((local - 0.4) / 0.9);
    ctx.fillStyle = `rgba(246,239,228,${k1})`;
    ctx.font = `400 190px ${FONT_SANS}`;
    spacedText(ctx, 'Pelle', W / 2, H / 2 + 20, lerp(26, 4, easeOutCubic((local - 0.4) / 1.6)), 'center');

    const k2 = smooth((local - 1.1) / 0.8);
    ctx.fillStyle = `rgba(217,194,154,${k2})`;
    ctx.fillRect(W / 2 - 50 * k2, H / 2 + 70, 100 * k2, 2);
    ctx.font = `400 24px ${FONT_SANS}`;
    spacedText(ctx, 'PLACAS DE REVESTIMENTO EFEITO MÁRMORE', W / 2, H / 2 + 130, 8, 'center');

    const k3 = smooth((local - 1.6) / 0.8);
    ctx.fillStyle = `rgba(246,239,228,${0.9 * k3})`;
    ctx.font = `italic 500 44px ${FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('A nobreza da pedra em cada ambiente.', W / 2, H / 2 + 200);
    ctx.restore();
  }

  let vignetteCanvas = null;
  let grainCanvas = null;

  function buildVignette() {
    const c = canvas(W, H);
    const g = c.getContext('2d');
    g.translate(W / 2, H / 2);
    g.scale(1, H / W);
    const gr = g.createRadialGradient(0, 0, W * 0.3, 0, 0, W * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr;
    g.fillRect(-W, -W, W * 2, W * 2);
    return c;
  }

  function buildGrain() {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    const rand = (function (s) {
      return function () {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    })(12345);
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
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,190,130,0.12)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(vignetteCanvas, 0, 0);
    ctx.restore();

    for (const name of Object.keys(SHOTS)) {
      for (const hs of SHOTS[name].hotspots) drawHotspot(ctx, SHOTS[name], hs, t);
    }
    drawChapters(ctx, t);
    drawBrand(ctx, t);
    drawEndCard(ctx, t);

    // entrada e saída em preto
    const black = Math.max(1 - smooth(t / 0.7), smooth((t - (DURATION - 0.6)) / 0.6));
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${black})`;
      ctx.fillRect(0, 0, W, H);
    }

    // granulação de filme
    const f = Math.floor(t * FPS);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
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
    const fontLoads = [
      `400 40px ${FONT_SANS}`,
      `300 25px ${FONT_SANS}`,
      `500 19px ${FONT_SANS}`,
      `500 70px ${FONT_SERIF}`,
      `italic 500 44px ${FONT_SERIF}`,
    ].map((f) => document.fonts.load(f).catch(() => null));
    const names = Object.keys(SHOTS);
    const imgs = await Promise.all(names.map((n) => loadImage(SHOTS[n].src)));
    names.forEach((n, i) => {
      SHOTS[n].img = imgs[i];
      prepareShot(SHOTS[n]);
    });
    await Promise.all(fontLoads);
    woodCanvas = buildWood(420, 1080, 5);
    facadeCanvas = buildFacade();
    vignetteCanvas = buildVignette();
    grainCanvas = buildGrain();
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    bufferCtx.imageSmoothingEnabled = true;
    bufferCtx.imageSmoothingQuality = 'high';

    const disp = motionBetween(t - SHUTTER / 2, t + SHUTTER / 2);
    const n = clamp(Math.ceil(disp / 3), 1, maxSamples);
    ctx.save();
    if (n === 1) {
      drawScene(ctx, t);
    } else {
      for (let k = 0; k < n; k++) {
        const tk = t - SHUTTER / 2 + (SHUTTER * k) / (n - 1);
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
    MATERIALS,
    init,
    render,
    isReady: () => ready,
  };
})(window);
