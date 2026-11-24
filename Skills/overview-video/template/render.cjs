#!/usr/bin/env node
/* Render the overview animation to PNG frames with headless Chromium.
 *
 *   node render.cjs                 # all frames into build/frames/
 *   node render.cjs --stills 12,24  # only these times (seconds) into build/stills/
 *
 * Env: WORKERS (default 4), FPS (default 30), OUT (frames dir).
 * Each worker owns a contiguous range of frames and calls seek(t) for each,
 * so the output is identical no matter how many workers run.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const VIDEO = JSON.parse(fs.readFileSync(path.join(__dirname, 'video.json'), 'utf8'));
const FPS = +(process.env.FPS || VIDEO.fps || 30);
let DUR = VIDEO.duration;   // replaced by the page's whole-bar DUR once it loads
const WORKERS = +(process.env.WORKERS || 4);
const TYPES = { '.json': 'application/json', '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.wav': 'audio/wav' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${port}/index.html?render=1`);
  await page.waitForFunction(() => window.READY === true);
  return page;
}

async function grab(page, t) {
  const b64 = await page.evaluate((tt) => { window.seek(tt); return document.getElementById('c').toDataURL('image/png').slice(22); }, t);
  return Buffer.from(b64, 'base64');
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch();
  const stillsArg = process.argv.indexOf('--stills');
  try {
    if (stillsArg > 0) {
      const out = process.env.OUT || path.join(ROOT, 'build', 'stills');
      fs.mkdirSync(out, { recursive: true });
      const page = await openPage(browser, port);
      for (const s of process.argv[stillsArg + 1].split(',')) {
        const t = +s;
        fs.writeFileSync(path.join(out, `t${t.toFixed(2).padStart(6, '0')}.png`), await grab(page, t));
      }
      console.log('stills written to', out);
    } else {
      const out = process.env.OUT || path.join(ROOT, 'build', 'frames');
      fs.mkdirSync(out, { recursive: true });
      const probe = await openPage(browser, port);
      DUR = await probe.evaluate(() => window.DUR); await probe.close();
      const total = Math.round(DUR * FPS);
      const per = Math.ceil(total / WORKERS);
      let done = 0;
      const started = Date.now();
      await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
        const page = await openPage(browser, port);
        for (let f = w * per; f < Math.min(total, (w + 1) * per); f++) {
          fs.writeFileSync(path.join(out, `f${String(f).padStart(5, '0')}.png`), await grab(page, f / FPS));
          if (++done % 300 === 0) console.log(`${done}/${total} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
        }
      }));
      console.log(`rendered ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
})();
