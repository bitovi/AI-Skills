const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startServer, waitForEvent, appendEvent, hash } = require('../scripts/skillviz.js');

function req(port, method, p, { body, headers = {} } = {}) {
  return new Promise((ok, bad) => {
    const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, text: t, json: () => JSON.parse(t) }));
    });
    r.on('error', bad); if (data) r.write(data); r.end();
  });
}

(async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'skillviz-'));
  const s = await startServer(ws, { port: 18765, quiet: true });
  const port = s.port, P = s.paths;
  try {
    // Static + spec read
    assert.strictEqual((await req(port, 'GET', '/template.html')).status, 200);
    const g = await req(port, 'GET', '/skill-spec.json');
    assert.strictEqual(g.status, 200);
    assert.strictEqual(g.headers['x-spec-hash'], hash(g.text));

    // Write with the right hash succeeds and returns the new hash
    const spec = { ...g.json(), name: 'Edited', status: 'needs-review' };
    const w = await req(port, 'POST', '/spec', { body: { baseHash: hash(g.text), spec } });
    assert.strictEqual(w.status, 200);
    assert.strictEqual(JSON.parse(fs.readFileSync(P.spec, 'utf8')).name, 'Edited');
    assert.strictEqual(w.json().hash, hash(fs.readFileSync(P.spec, 'utf8')));

    // Stale hash is refused (someone else edited the file) and nothing is overwritten
    const stale = await req(port, 'POST', '/spec', { body: { baseHash: hash(g.text), spec: { ...spec, name: 'Clobber' } } });
    assert.strictEqual(stale.status, 409);
    assert.strictEqual(JSON.parse(fs.readFileSync(P.spec, 'utf8')).name, 'Edited');

    // An agent editing the file directly changes the hash the page must use
    const cur = fs.readFileSync(P.spec, 'utf8');
    fs.writeFileSync(P.spec, cur.replace('Edited', 'By agent'));
    assert.strictEqual((await req(port, 'POST', '/spec', { body: { baseHash: hash(cur), spec } })).status, 409);

    // Validation: cycles, unknown deps, duplicate ids, bad status
    const base = hash(fs.readFileSync(P.spec, 'utf8'));
    const bad = (steps, extra) => req(port, 'POST', '/spec', { body: { baseHash: base, spec: { name: 'x', steps, ...extra } } });
    assert.strictEqual((await bad([{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }])).status, 422);
    assert.strictEqual((await bad([{ id: 'a', dependsOn: ['nope'] }])).status, 422);
    assert.strictEqual((await bad([{ id: 'a' }, { id: 'a' }])).status, 422);
    assert.strictEqual((await bad([{ id: 'a' }], { status: 'weird' })).status, 422);
    assert.strictEqual((await bad([{ id: 'a', x: 'left', y: 1 }])).status, 422);
    assert.strictEqual((await bad([{ id: 'a', userNote: 42 }])).status, 422);
    assert.strictEqual((await bad([{ id: 'a', x: 10, y: 20, userNote: 'hi' }])).status, 200);

    // Request hygiene: host check, content type, cross-origin
    assert.strictEqual((await req(port, 'GET', '/spec', { headers: { Host: 'evil.example' } })).status, 403);
    assert.strictEqual((await req(port, 'POST', '/signal', { body: '{"event":"ready"}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.strictEqual((await req(port, 'POST', '/signal', { body: { event: 'ready' }, headers: { Origin: 'http://evil.example' } })).status, 403);
    assert.strictEqual((await req(port, 'POST', '/signal', { body: { event: 'Bad Event!' } })).status, 422);
    assert.strictEqual((await req(port, 'GET', '/../../etc/passwd')).status, 404);

    // Signal -> event log -> wait, with a cursor so nothing is missed or repeated
    assert.strictEqual((await req(port, 'POST', '/signal', { body: { event: 'ready', note: 'go' } })).status, 200);
    const first = await waitForEvent(ws, { name: 'a', timeoutMs: 2000 });
    assert.strictEqual(first.length, 1);
    assert.strictEqual(first[0].event, 'ready');
    assert.strictEqual(first[0].note, 'go');
    assert.strictEqual(first[0].specPath, path.resolve(P.spec));
    assert.strictEqual(await waitForEvent(ws, { name: 'a', timeoutMs: 600, pollMs: 100 }), null); // nothing new
    assert.strictEqual((await waitForEvent(ws, { name: 'b', timeoutMs: 500 })).length, 1);        // another reader has its own cursor

    // Events that arrive while waiting wake the waiter; two quick events come back together
    const pending = waitForEvent(ws, { name: 'a', timeoutMs: 3000, pollMs: 100 });
    setTimeout(() => { appendEvent(P, { event: 'approve' }); }, 300);
    const woke = await pending;
    assert.deepStrictEqual(woke.map((e) => e.event), ['approve']);

    // The page's event stream gets log lines (including ones written by the CLI, not the server)
    const got = await new Promise((ok, no) => {
      const r = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
        res.on('data', (c) => { if (String(c).includes('"event":"ack"')) { r.destroy(); ok(true); } });
        setTimeout(() => appendEvent(P, { event: 'ack' }), 300);
      });
      setTimeout(() => no(new Error('no SSE event')), 4000);
    });
    assert.ok(got);


    // Baseline: "ready" and "approve" snapshot the spec; the page can read and replace it
    assert.ok(fs.existsSync(P.baseline));                                // the earlier POST /signal ready already snapshotted
    fs.unlinkSync(P.baseline);
    assert.strictEqual((await req(port, 'GET', '/baseline')).status, 404);
    assert.strictEqual((await req(port, 'GET', '/spec')).headers['x-baseline-hash'], 'none');
    const cur2 = fs.readFileSync(P.spec, 'utf8');
    appendEvent(P, { event: 'ready' });
    assert.strictEqual(fs.readFileSync(P.baseline, 'utf8'), cur2);
    const bl = await req(port, 'GET', '/baseline');
    assert.strictEqual(bl.status, 200);
    assert.strictEqual((await req(port, 'GET', '/spec')).headers['x-baseline-hash'], bl.headers['x-baseline-hash']);
    appendEvent(P, { event: 'ack' });                                   // other events do not touch it
    fs.writeFileSync(P.spec, cur2.replace('"By agent"', '"Agent v2"'));
    assert.strictEqual(fs.readFileSync(P.baseline, 'utf8'), cur2);
    const nb = JSON.parse(cur2); nb.name = 'Accepted';
    assert.strictEqual((await req(port, 'POST', '/baseline', { body: { spec: nb } })).status, 200);
    assert.strictEqual(JSON.parse(fs.readFileSync(P.baseline, 'utf8')).name, 'Accepted');
    assert.strictEqual((await req(port, 'POST', '/baseline', { body: { spec: { steps: [{ id: 'a', dependsOn: ['a'] }] } } })).status, 422);
    appendEvent(P, { event: 'approve' });
    assert.strictEqual(fs.readFileSync(P.baseline, 'utf8'), fs.readFileSync(P.spec, 'utf8'));


    // Output folder: read-only listing and preview, confined to the folder the user chose
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skillviz-out-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'skillviz-secret-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope');
    fs.mkdirSync(path.join(out, 'references')); fs.mkdirSync(path.join(out, 'node_modules'));
    fs.writeFileSync(path.join(out, 'SKILL.md'), '# My skill\n'); fs.writeFileSync(path.join(out, 'references', 'spec.md'), 'spec');
    fs.writeFileSync(path.join(out, 'node_modules', 'junk.js'), 'x'); fs.writeFileSync(path.join(out, 'logo.bin'), Buffer.from([1, 0, 2]));
    fs.writeFileSync(path.join(out, 'big.txt'), 'a'.repeat(250000)); fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(out, 'link.txt'));
    assert.deepStrictEqual((await req(port, 'GET', '/files')).json(), { unset: true });                       // nothing chosen yet
    const withDir = (dir) => { const cur3 = fs.readFileSync(P.spec, 'utf8'); return req(port, 'POST', '/spec', { body: { baseHash: hash(cur3), spec: { ...JSON.parse(cur3), outputDir: dir } } }); };
    assert.strictEqual((await req(port, 'POST', '/spec', { body: { baseHash: hash(fs.readFileSync(P.spec, 'utf8')), spec: { name: 'x', steps: [], outputDir: 42 } } })).status, 422);
    assert.strictEqual((await withDir(out)).status, 200);
    const fl = (await req(port, 'GET', '/files')).json();
    assert.strictEqual(fl.exists, true);
    const names = fl.entries.map((e) => e.path);
    assert.ok(names.includes('SKILL.md') && names.includes('references/') && names.includes('references/spec.md'));
    assert.ok(!names.some((n) => n.includes('node_modules')));                                                   // noise is skipped
    assert.strictEqual((await req(port, 'GET', '/file?path=SKILL.md')).json().content, '# My skill\n');
    assert.strictEqual((await req(port, 'GET', '/file?path=references/spec.md')).json().content, 'spec');
    assert.strictEqual((await req(port, 'GET', '/file?path=logo.bin')).json().binary, true);
    assert.strictEqual((await req(port, 'GET', '/file?path=big.txt')).json().tooLarge, true);
    assert.strictEqual((await req(port, 'GET', '/file?path=' + encodeURIComponent('../' + path.basename(outside) + '/secret.txt'))).status, 403);   // ../ escape
    assert.strictEqual((await req(port, 'GET', '/file?path=link.txt')).status, 403);                              // symlink escape
    assert.strictEqual((await req(port, 'GET', '/file?path=nope.md')).status, 404);
    assert.strictEqual((await req(port, 'GET', '/file')).status, 400);
    assert.strictEqual((await withDir(path.join(out, 'later'))).status, 200);
    assert.strictEqual((await req(port, 'GET', '/files')).json().exists, false);                                  // not written yet
    assert.strictEqual((await withDir('/')).status, 200);                                                         // the spec may say anything...
    assert.strictEqual((await req(port, 'GET', '/files')).status, 403);                                           // ...but the server refuses to read the root
    assert.strictEqual((await withDir('~')).status, 200);
    assert.strictEqual((await req(port, 'GET', '/files')).status, 403);                                           // or the home directory
    fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });

    // Partial line (writer mid-append) is not consumed
    fs.appendFileSync(P.log, '{"event":"half"');
    assert.strictEqual(await waitForEvent(ws, { name: 'c0', timeoutMs: 0 }).then((e) => e.length), 6); // ready, approve, ack, ready, ack, approve: the half-written line is not returned
    console.log('server tests passed');
  } finally { await s.close(); fs.rmSync(ws, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
