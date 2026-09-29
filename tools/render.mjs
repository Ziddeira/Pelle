/*
 * Renderiza o tour em MP4 (1920x1080, 30 fps, H.264) quadro a quadro.
 *
 *   npm install
 *   npm run render                      -> video/pelle-tour.mp4
 *   node tools/render.mjs --stills 2,6,12 [--dir pasta] -> PNGs em video/stills/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const out = path.resolve(root, opt('out', 'video/pelle-tour.mp4'));
const samples = parseInt(opt('samples', '20'), 10);
const stills = opt('stills', null);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('page error:', e));
await page.goto(`http://127.0.0.1:${port}/index.html?render`);
const info = await page.evaluate(async () => {
  await window.PelleTour.init();
  const c = document.createElement('canvas');
  c.width = window.PelleTour.W;
  c.height = window.PelleTour.H;
  window.__out = c;
  window.__ctx = c.getContext('2d');
  return { fps: window.PelleTour.FPS, duration: window.PelleTour.DURATION };
});

const frameAt = (t, type) =>
  page.evaluate(
    ([tt, s, ty]) => {
      window.PelleTour.render(window.__ctx, tt, { maxSamples: s });
      return window.__out.toDataURL(ty, 0.96).split(',')[1];
    },
    [t, samples, type]
  );

if (stills) {
  const dir = path.resolve(root, opt('dir', 'video/stills'));
  fs.mkdirSync(dir, { recursive: true });
  for (const s of stills.split(',')) {
    const t = parseFloat(s);
    const b64 = await frameAt(t, 'image/png');
    const file = path.join(dir, `t${t.toFixed(2)}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('still', file);
  }
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn(
    ffmpegPath,
    [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(info.fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', out,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );
  const total = Math.round(info.duration * info.fps);
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    const b64 = await frameAt(i / info.fps, 'image/jpeg');
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 30 === 0) {
      const el = (Date.now() - started) / 1000;
      console.log(`quadro ${i}/${total}  (${el.toFixed(0)}s)`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('vídeo salvo em', out);
}

await browser.close();
server.close();
