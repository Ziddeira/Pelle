/*
 * Gerador procedural de mármore (Nero) usado na fachada de entrada.
 * Gera uma textura em canvas com veios claros sobre fundo escuro,
 * no mesmo estilo das placas de revestimento da Pelle.
 */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createNoise(seed) {
    const rand = mulberry32(seed);
    const perm = new Uint8Array(512);
    const vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
      vals[i] = rand();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

    function hash(x, y) {
      return vals[perm[(perm[x & 255] + (y & 255)) & 511]];
    }

    function noise(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      const a = hash(xi, yi);
      const b = hash(xi + 1, yi);
      const c = hash(xi, yi + 1);
      const d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    function fbm(x, y, octaves) {
      let sum = 0;
      let amp = 0.5;
      let freq = 1;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amp * noise(x * freq, y * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
      }
      return sum / norm;
    }

    return { noise, fbm };
  }

  /**
   * Cria uma textura de mármore escuro com veios brancos.
   * @param {number} w largura em px
   * @param {number} h altura em px
   * @param {object} opts { seed, scale, base, base2, vein }
   */
  function createMarble(w, h, opts) {
    const o = Object.assign(
      {
        seed: 7,
        scale: 1 / 420,
        base: [20, 19, 18],
        base2: [52, 48, 45],
        vein: [226, 219, 208],
      },
      opts || {}
    );
    const { fbm } = createNoise(o.seed);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    // Veio = linha onde o ruído cruza 0.5. A distância até a linha é estimada
    // pelo gradiente (|f-0.5| / |grad f|) para manter a espessura constante.
    const e = o.scale; // 1 px em coordenadas de ruído
    const line = (f, x, y, k, ox, oy, oct, width) => {
      const v = f(x * k + ox, y * k + oy, oct);
      const vx = f((x + e) * k + ox, y * k + oy, oct);
      const vy = f(x * k + ox, (y + e) * k + oy, oct);
      const grad = Math.hypot(vx - v, vy - v) + 1e-6; // variação por pixel
      const dist = Math.abs(v - 0.5) / grad; // em pixels
      return { core: Math.exp(-(dist / width) * (dist / width)), halo: Math.exp(-dist / (width * 9)) };
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x * o.scale;
        const ny = y * o.scale;

        // distorção de domínio para veios orgânicos e fraturados
        const wx = fbm(nx * 0.9 + 3.1, ny * 0.9 + 7.7, 4) - 0.5;
        const wy = fbm(nx * 0.9 + 8.3, ny * 0.9 + 1.9, 4) - 0.5;
        const ux = nx + wx * 0.55;
        const uy = ny + wy * 0.55;

        const l1 = line(fbm, ux, uy, 0.8, 11.0, 4.0, 6, 1.7);
        const l2 = line(fbm, ux, uy, 1.1, 21.0, 13.0, 6, 1.2);
        const l3 = line(fbm, ux, uy, 2.4, 5.0, 17.0, 5, 0.8);
        const major = l1.core;
        const major2 = l2.core;
        const minor = l3.core;
        const halo = l1.halo;

        // máscara para os veios finos aparecerem só em algumas regiões
        const mask = Math.min(1, Math.max(0, (fbm(nx * 1.4 + 2.0, ny * 1.4 + 8.0, 3) - 0.45) * 4));

        let vein = major * 0.9 + major2 * 0.65 + minor * 0.5 * mask;
        vein = Math.min(1, vein);

        // fundo: nuvens suaves + granulado fino da pedra
        const cloud = fbm(nx * 2.2 + 9.1, ny * 2.2 + 3.7, 5);
        const speck = fbm(nx * 18 + 1.3, ny * 18 + 6.1, 2);
        const c = Math.min(1, Math.max(0, Math.pow(cloud, 1.7) * 1.1 + (speck - 0.5) * 0.35 + halo * 0.18));

        let r = o.base[0] + (o.base2[0] - o.base[0]) * c;
        let g = o.base[1] + (o.base2[1] - o.base[1]) * c;
        let b = o.base[2] + (o.base2[2] - o.base[2]) * c;
        r += (o.vein[0] - r) * vein;
        g += (o.vein[1] - g) * vein;
        b += (o.vein[2] - b) * vein;

        const i = (y * w + x) * 4;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  global.PelleMarble = { createMarble, createNoise };
})(window);
