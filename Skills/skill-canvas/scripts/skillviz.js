#!/usr/bin/env node
// skillviz: local server + CLI for the skill canvas. No dependencies.
//
//   skillviz serve  [dir] [--port N]              serve the board for a workspace
//   skillviz wait   [dir] [--name N] [--timeout S] block until the user signals; print the event(s)
//   skillviz signal <event> [note] [--dir D]       append an event (for agents to acknowledge)
//
// Workspace layout (default ./skill-viz):
//   template.html, skill-spec.json    the board and its state
//   .skillviz/events.log              one JSON event per line (the signal channel)
//   .skillviz/cursor-<name>           how far each waiting agent has read
//   .skillviz/server.json             port/pid of the running server
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const STATUSES = ['draft', 'needs-review', 'enhanced', 'approved'];
const ASSETS = path.join(__dirname, '..', 'assets');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function paths(ws) {
  const dir = path.join(ws, '.skillviz');
  return { ws, dir, spec: path.join(ws, 'skill-spec.json'), tpl: path.join(ws, 'template.html'),
    baseline: path.join(dir, 'baseline.json'), log: path.join(dir, 'events.log'), info: path.join(dir, 'server.json') };
}

// Make sure the workspace has the current template and a spec. Never overwrites an existing spec.
function initWorkspace(ws) {
  const P = paths(ws);
  fs.mkdirSync(P.dir, { recursive: true });
  fs.copyFileSync(path.join(ASSETS, 'template.html'), P.tpl);
  if (!fs.existsSync(P.spec)) fs.copyFileSync(path.join(ASSETS, 'skill-spec.starter.json'), P.spec);
  return P;
}

// The board's pure logic lives inline in template.html; reuse it here so server and page agree.
function loadCore(tplPath) {
  const html = fs.readFileSync(tplPath, 'utf8');
  const src = html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
  const m = { exports: {} };
  new Function('module', 'window', src)(m, undefined);
  return m.exports;
}

function validate(core, spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('spec must be a JSON object');
  for (const k of ['inputs', 'steps', 'outputs']) {
    if (spec[k] !== undefined && !Array.isArray(spec[k])) throw new Error(`"${k}" must be an array`);
  }
  if (spec.outputDir !== undefined && (typeof spec.outputDir !== 'string' || spec.outputDir.length > 500)) throw new Error('outputDir must be a short string');
  if (spec.status !== undefined && !STATUSES.includes(spec.status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const ids = new Set();
  for (const s of spec.steps || []) {
    if (!s || typeof s.id !== 'string') throw new Error('every step needs a string id');
    if (ids.has(s.id)) throw new Error(`duplicate step id "${s.id}"`);
    ids.add(s.id);
    for (const k of ['x', 'y']) if (s[k] !== undefined && !Number.isFinite(s[k])) throw new Error(`step "${s.id}": ${k} must be a number`);
    if (s.userNote !== undefined && typeof s.userNote !== 'string') throw new Error(`step "${s.id}": userNote must be a string`);
  }
  core.layers(spec); // throws on unknown dependsOn or cycles
}

function appendEvent(P, ev) {
  fs.mkdirSync(P.dir, { recursive: true });
  let specHash = null;
  try { specHash = hash(fs.readFileSync(P.spec, 'utf8')); } catch (e) { /* no spec yet */ }
  // The baseline is the plan as the user last handed it over ("ready") or signed off ("approve"):
  // the board diffs the agent's work against it. Snapshot before logging so readers see it.
  if ((ev.event === 'ready' || ev.event === 'approve') && specHash) fs.copyFileSync(P.spec, P.baseline);
  const line = JSON.stringify({ ts: new Date().toISOString(), ...ev, specHash });
  fs.appendFileSync(P.log, line + '\n');
  return line;
}

const readBody = (req, limit = 1e6) => new Promise((ok, bad) => {
  let n = 0; const b = [];
  req.on('data', (c) => { n += c.length; if (n > limit) { bad(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else b.push(c); });
  req.on('end', () => ok(Buffer.concat(b).toString()));
  req.on('error', bad);
});

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object';
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

// The folder the user chose for the finished skill. Read-only access, nothing outside it.
function resolveOutDir(ws, spec) {
  const d = spec && typeof spec.outputDir === 'string' ? spec.outputDir.trim() : '';
  if (!d) return null;
  const expanded = d === '~' || d.startsWith('~/') ? path.join(os.homedir(), d.slice(1)) : d;
  const full = path.resolve(ws, expanded);
  if (full === path.parse(full).root || full === os.homedir()) throw Object.assign(new Error('Choose a specific folder, not your home directory or the drive root.'), { status: 403 });
  return full;
}
const SKIP = new Set(['.git', 'node_modules', '.DS_Store']);
function listTree(root, { maxEntries = 500, maxDepth = 6 } = {}) {
  const entries = []; let truncated = false;
  (function walk(dir, rel, depth) {
    let items; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    items.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (const it of items) {
      if (SKIP.has(it.name)) continue;
      if (entries.length >= maxEntries) { truncated = true; return; }
      const full = path.join(dir, it.name);
      if (it.isDirectory()) { entries.push({ path: rel + it.name + '/', dir: true }); if (depth < maxDepth) walk(full, rel + it.name + '/', depth + 1); }
      else if (it.isFile()) { const st = fs.statSync(full); entries.push({ path: rel + it.name, size: st.size, mtimeMs: Math.round(st.mtimeMs) }); }
    }
  })(root, '', 1);
  return { entries, truncated };
}
function readInside(root, rel, maxBytes = 200000) {
  let realRoot, real;
  try { realRoot = fs.realpathSync(root); real = fs.realpathSync(path.resolve(root, rel)); } catch (e) { throw Object.assign(new Error('not found'), { status: 404 }); }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw Object.assign(new Error('outside the output folder'), { status: 403 });
  const st = fs.statSync(real);
  if (!st.isFile()) throw Object.assign(new Error('not a file'), { status: 404 });
  if (st.size > maxBytes) return { path: rel, size: st.size, tooLarge: true, mtimeMs: Math.round(st.mtimeMs) };
  const buf = fs.readFileSync(real);
  if (buf.includes(0)) return { path: rel, size: st.size, binary: true, mtimeMs: Math.round(st.mtimeMs) };
  return { path: rel, size: st.size, content: buf.toString('utf8'), mtimeMs: Math.round(st.mtimeMs) };
}

async function startServer(ws, { port = 8765, quiet = false } = {}) {
  const P = initWorkspace(ws);
  const core = loadCore(P.tpl);
  const clients = new Set();
  let offset = fs.existsSync(P.log) ? fs.statSync(P.log).size : 0;

  // Broadcast events appended to the log (by this server, the CLI, or an agent) to open pages.
  fs.watchFile(P.log, { interval: 200 }, (cur) => {
    if (cur.size <= offset) { offset = Math.min(offset, cur.size); return; }
    const fd = fs.openSync(P.log, 'r'); const buf = Buffer.alloc(cur.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset); fs.closeSync(fd);
    const text = buf.toString(); const end = text.lastIndexOf('\n') + 1;
    offset += Buffer.byteLength(text.slice(0, end));
    for (const line of text.slice(0, end).split('\n').filter(Boolean)) for (const c of clients) c.write(`data: ${line}\n\n`);
  });

  const baselineHash = () => { try { return hash(fs.readFileSync(P.baseline, 'utf8')); } catch (e) { return 'none'; } };
  const server = http.createServer(async (req, res) => {
    try {
      const host = (req.headers.host || '').replace(/:\d+$/, '');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return send(res, 403, 'forbidden host');
      const { pathname } = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && (pathname === '/' || pathname === '/template.html')) {
        return send(res, 200, fs.readFileSync(P.tpl, 'utf8'), { 'Content-Type': 'text/html; charset=utf-8' });
      }
      if (req.method === 'GET' && (pathname === '/skill-spec.json' || pathname === '/spec')) {
        const text = fs.readFileSync(P.spec, 'utf8');
        return send(res, 200, text, { 'Content-Type': 'application/json', 'X-Spec-Hash': hash(text), 'X-Baseline-Hash': baselineHash() });
      }
      if (req.method === 'GET' && (pathname === '/files' || pathname === '/file')) {
        let current = {}; try { current = JSON.parse(fs.readFileSync(P.spec, 'utf8')); } catch (e) { /* invalid spec: treat as unset */ }
        const root = resolveOutDir(ws, current);
        if (!root) return send(res, 200, { unset: true });
        if (pathname === '/file') {
          const rel = new URL(req.url, 'http://localhost').searchParams.get('path') || '';
          if (!rel) return send(res, 400, { error: 'path is required' });
          return send(res, 200, readInside(root, rel));
        }
        if (!fs.existsSync(root)) return send(res, 200, { root, exists: false, entries: [] });
        return send(res, 200, { root, exists: true, ...listTree(root) });
      }
      if (req.method === 'GET' && pathname === '/baseline') {
        if (!fs.existsSync(P.baseline)) return send(res, 404, { error: 'no baseline yet' });
        const text = fs.readFileSync(P.baseline, 'utf8');
        return send(res, 200, text, { 'Content-Type': 'application/json', 'X-Baseline-Hash': hash(text) });
      }
      if (req.method === 'GET' && pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': connected\n\n'); clients.add(res);
        const ka = setInterval(() => res.write(': keep-alive\n\n'), 25000);
        req.on('close', () => { clearInterval(ka); clients.delete(res); });
        return;
      }
      if (req.method === 'POST' && (pathname === '/spec' || pathname === '/signal' || pathname === '/baseline')) {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: 'cross-origin request refused' });
        if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'send application/json' });
        let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.status || 400, { error: 'invalid JSON body' }); }

        if (pathname === '/spec') {
          let current = ''; try { current = fs.readFileSync(P.spec, 'utf8'); } catch (e) { /* new file */ }
          if (body.baseHash !== hash(current)) return send(res, 409, { error: 'spec changed since you loaded it', currentHash: hash(current) });
          try { validate(core, body.spec); } catch (e) { return send(res, 422, { error: e.message }); }
          const text = JSON.stringify(body.spec, null, 2) + '\n';
          const tmp = P.spec + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, P.spec);
          return send(res, 200, { hash: hash(text) });
        }
        if (pathname === '/baseline') {
          try { validate(core, body.spec); } catch (e) { return send(res, 422, { error: e.message }); }
          const text = JSON.stringify(body.spec, null, 2) + '\n';
          const tmp = P.baseline + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, P.baseline);
          return send(res, 200, { hash: hash(text) });
        }
        const ev = String(body.event || '');
        if (!/^[a-z][a-z0-9-]{0,31}$/.test(ev)) return send(res, 422, { error: 'event must be a short lowercase word' });
        const note = body.note == null ? undefined : String(body.note).slice(0, 500);
        appendEvent(P, { event: ev, ...(note ? { note } : {}) });
        return send(res, 200, { ok: true });
      }
      send(res, 404, 'not found');
    } catch (e) { send(res, e.status || 500, { error: e.message }); }
  });

  const tryPort = (p, left) => new Promise((ok, bad) => {
    server.once('error', (err) => { if (err.code === 'EADDRINUSE' && left > 0) ok(tryPort(p + 1, left - 1)); else bad(err); });
    server.listen(p, '127.0.0.1', () => ok(p));
  });
  const actual = await tryPort(port, 20);
  fs.writeFileSync(P.info, JSON.stringify({ port: actual, pid: process.pid, ws: path.resolve(ws) }));
  if (!quiet) console.log(`Skill board: http://localhost:${actual}/template.html  (workspace: ${path.resolve(ws)})`);
  return { server, port: actual, paths: P, close: () => new Promise((ok) => { fs.unwatchFile(P.log); for (const c of clients) c.end(); server.close(ok); }) };
}

// Resolves with new event lines (as objects) once any exist past this reader's cursor, or null on timeout.
async function waitForEvent(ws, { name = 'agent', timeoutMs = 0, pollMs = 300 } = {}) {
  const P = paths(ws), cursorFile = path.join(P.dir, `cursor-${name}`), start = Date.now();
  fs.mkdirSync(P.dir, { recursive: true });
  for (;;) {
    let cursor = 0; try { cursor = parseInt(fs.readFileSync(cursorFile, 'utf8'), 10) || 0; } catch (e) { /* first wait */ }
    const size = fs.existsSync(P.log) ? fs.statSync(P.log).size : 0;
    if (size < cursor) cursor = 0; // log was reset
    if (size > cursor) {
      const fd = fs.openSync(P.log, 'r'); const buf = Buffer.alloc(size - cursor);
      fs.readSync(fd, buf, 0, buf.length, cursor); fs.closeSync(fd);
      const text = buf.toString(), end = text.lastIndexOf('\n') + 1; // only whole lines
      if (end > 0) {
        fs.writeFileSync(cursorFile, String(cursor + Buffer.byteLength(text.slice(0, end))));
        return text.slice(0, end).split('\n').filter(Boolean).map((l) => ({ ...JSON.parse(l), specPath: path.resolve(P.spec) }));
      }
    }
    if (timeoutMs && Date.now() - start >= timeoutMs) return null;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]);
  }
  return { pos, opt };
}

async function main(argv) {
  const [cmd, ...rest] = argv, { pos, opt } = parseArgs(rest);
  if (cmd === 'serve') {
    const ws = pos[0] || './skill-viz', P = paths(ws);
    try { // already running for this workspace?
      const info = JSON.parse(fs.readFileSync(P.info, 'utf8')); process.kill(info.pid, 0);
      initWorkspace(ws); console.log(`Already serving: http://localhost:${info.port}/template.html  (workspace: ${path.resolve(ws)})`); return 0;
    } catch (e) { /* not running */ }
    await startServer(ws, { port: Number(opt.port) || 8765 }); return null; // keep running
  }
  if (cmd === 'wait') {
    const ws = pos[0] || './skill-viz', t = Number(opt.timeout) || 0;
    const evs = await waitForEvent(ws, { name: opt.name || 'agent', timeoutMs: t * 1000 });
    if (!evs) { console.error('timeout: no signal yet'); return 2; }
    for (const e of evs) console.log(JSON.stringify(e));
    return 0;
  }
  if (cmd === 'signal') {
    if (!pos[0]) { console.error('usage: skillviz signal <event> [note] [--dir D]'); return 1; }
    appendEvent(paths(opt.dir || './skill-viz'), { event: pos[0], ...(pos[1] ? { note: pos[1] } : {}) }); return 0;
  }
  console.error('usage: skillviz serve [dir] [--port N] | wait [dir] [--name N] [--timeout S] | signal <event> [note] [--dir D]');
  return 1;
}

module.exports = { startServer, waitForEvent, appendEvent, initWorkspace, validate, loadCore, paths, hash };
if (require.main === module) main(process.argv.slice(2)).then((c) => { if (c !== null) process.exit(c); }, (e) => { console.error(e.message); process.exit(1); });
