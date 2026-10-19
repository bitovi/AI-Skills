const assert = require('node:assert');
const fs = require('node:fs');
const html = fs.readFileSync(__dirname + '/../assets/template.html', 'utf8');
const src = html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
const m = { exports: {} };
new Function('module', 'window', src)(m, undefined);
const C = m.exports;
const spec = require('../assets/skill-spec.example.json');

const active = (sel) => [...C.evaluate(spec, sel)].filter(([, v]) => v.active).map(([k]) => k).sort();
const base = { depth: 'quick', has_tests: 'yes', security: 'off' };

// Defaults
assert.deepStrictEqual(C.defaultSelections(spec), base);

// Quick, tests, no security: style + tests run, join still runs
assert.deepStrictEqual(active(base), ['classify', 'fetch', 'merge', 'report', 'style', 'tests']);

// Full + security adds logic and sec
assert.deepStrictEqual(active({ depth: 'full', has_tests: 'yes', security: 'on' }),
  ['classify', 'fetch', 'logic', 'merge', 'report', 'sec', 'style', 'tests']);

// Skip reason names the input
assert.match(C.evaluate(spec, base).get('sec').reason, /security is on/);

// Cascade: if every branch of a join is skipped, the join and downstream skip
const only = { inputs: [], steps: [
  { id: 'a' }, { id: 'b', dependsOn: ['a'], runWhen: { input: 'x', is: 'on' } },
  { id: 'c', dependsOn: ['b'] }, { id: 'd', dependsOn: ['c'] } ] };
const r = C.evaluate(only, { x: 'off' });
assert.deepStrictEqual(['a', 'b', 'c', 'd'].map((k) => r.get(k).active), [true, false, false, false]);

// all/any/in conditions
assert.ok(C.checkCond({ all: [{ input: 'x', in: ['a', 'b'] }, { input: 'y', isNot: 'z' }] }, { x: 'a', y: 'q' }));
assert.ok(!C.checkCond({ any: [{ input: 'x', is: 'n' }, { input: 'y', is: 'n' }] }, { x: 'a', y: 'q' }));

// Dynamic output items follow toggles
const items = C.visibleItems(spec.outputs[0], base).map((i) => i.active);
assert.deepStrictEqual(items, [true, false, true, false]);

// Layout: review branches share a column and a parallel lane; cycles are rejected
const L = C.layout(spec);
assert.strictEqual(L.nodes.get('style').x, L.nodes.get('sec').x);
assert.strictEqual(L.groups.length, 1);
// Manual x/y overrides auto-layout for that step only, and the canvas grows to fit
const man = { steps: [{ id: 'a' }, { id: 'b', dependsOn: ['a'], x: 900, y: 40 }] };
const ML = C.layout(man);
assert.strictEqual(ML.nodes.get('b').x, 900);
assert.strictEqual(ML.nodes.get('b').y, 40);
assert.ok(ML.nodes.get('b').manual && !ML.nodes.get('a').manual);
assert.ok(ML.width >= 900 + 210);
assert.strictEqual(C.layout({ steps: [{ id: 'a', x: 5 }] }).nodes.get('a').x, 24); // half-set position is ignored
assert.deepStrictEqual(C.layout({ steps: [] }).nodes.size, 0);
assert.throws(() => C.layers({ steps: [{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }] }), /Cycle/);
assert.throws(() => C.layers({ steps: [{ id: 'a', dependsOn: ['nope'] }] }), /Unknown/);


// ---- editor helpers ----
const U = { inputs: [{ id: 'x', kind: 'dynamic', options: [{ id: 'on' }, { id: 'off' }] }],
  steps: [{ id: 'a' }, { id: 'b', runWhen: { input: 'x', is: 'on' } }, { id: 'c', runWhen: { all: [{ input: 'x', isNot: 'off' }, { input: 'y', is: '1' }] } }],
  outputs: [{ id: 'o', items: ['plain', { text: 't', when: { input: 'x', is: 'on' } }] }] };
assert.deepStrictEqual(C.inputUsage(U, 'x'), { steps: ['b', 'c'], items: [{ output: 'o', index: 1 }] });
assert.deepStrictEqual(C.inputUsage(U, 'zzz'), { steps: [], items: [] });
assert.strictEqual(C.stripInput({ input: 'x', is: 'on' }, 'x'), null);
assert.deepStrictEqual(C.stripInput(U.steps[2].runWhen, 'x'), { input: 'y', is: '1' });          // one clause left collapses to a leaf
assert.deepStrictEqual(C.stripInput({ any: [{ input: 'x', is: 'a' }, { input: 'x', is: 'b' }] }, 'x'), null);
assert.ok(C.usesOption({ any: [{ input: 'x', in: ['on', 'z'] }] }, 'x', 'z'));
assert.ok(!C.usesOption({ input: 'x', is: 'on' }, 'x', 'off'));
assert.deepStrictEqual(C.toClauses(null), { mode: 'all', clauses: [] });
assert.deepStrictEqual(C.toClauses({ input: 'x', is: 'on' }), { mode: 'all', clauses: [{ input: 'x', is: 'on' }] });
assert.strictEqual(C.toClauses({ all: [{ any: [{ input: 'x', is: 'a' }] }] }), null);              // nested: not editable as a flat list
assert.deepStrictEqual(C.fromClauses('any', [{ input: 'x', is: 'a' }]), { input: 'x', is: 'a' });
assert.deepStrictEqual(C.fromClauses('any', [{ input: 'x', is: 'a' }, { input: 'y', is: 'b' }]), { any: [{ input: 'x', is: 'a' }, { input: 'y', is: 'b' }] });
assert.strictEqual(C.fromClauses('all', []), null);

const kinds = (s) => C.parallelIssues(s).map((i) => i.kind).sort();
const par = (members, extra = []) => ({ steps: [{ id: 'p' }, ...members, ...extra] });
assert.deepStrictEqual(kinds(par([{ id: 'a', dependsOn: ['p'], parallelGroup: 'g' }, { id: 'b', dependsOn: ['p'], parallelGroup: 'g' }], [{ id: 'j', dependsOn: ['a', 'b'] }])), []);   // healthy
assert.deepStrictEqual(kinds(par([{ id: 'a', dependsOn: ['p'], parallelGroup: 'g' }, { id: 'b', dependsOn: ['p'], parallelGroup: 'g' }])), ['nojoin']);
assert.deepStrictEqual(kinds(par([{ id: 'a', dependsOn: ['p'], parallelGroup: 'g' }, { id: 'b', parallelGroup: 'g' }], [{ id: 'j', dependsOn: ['a', 'b'] }])), ['parents']);
assert.deepStrictEqual(kinds(par([{ id: 'a', dependsOn: ['p'], parallelGroup: 'g' }, { id: 'b', dependsOn: ['a'], parallelGroup: 'g' }], [{ id: 'j', dependsOn: ['a', 'b'] }])), ['chained', 'parents']);
assert.deepStrictEqual(kinds(par([{ id: 'a', dependsOn: ['p'], parallelGroup: 'review' }, { id: 'b', dependsOn: ['p'], parallelGroup: 'reveiw' }])), ['single', 'single']);          // typo: two lonely groups
assert.deepStrictEqual(kinds({ steps: [{ id: 'a' }] }), []);


// ---- review: diff / accept / reject ----
const base0 = { name: 'N', inputs: [{ id: 'x', kind: 'dynamic', options: [{ id: 'a' }, { id: 'b' }] }],
  steps: [{ id: 's1', title: 'One', dependsOn: [] }, { id: 's2', title: 'Two', dependsOn: ['s1'], x: 10, y: 20 }, { id: 's3', title: 'Three', dependsOn: ['s2'] }],
  outputs: [{ id: 'o', label: 'Out', items: ['a'] }] };
const cur0 = JSON.parse(JSON.stringify(base0));
cur0.status = 'enhanced';                       // status is not a design change
cur0.steps[1].x = 999;                           // nor is a dragged card
assert.deepStrictEqual(C.diffSpecs(base0, cur0), []);
cur0.steps[1].detail = 'More detail';            // modified
cur0.steps.splice(2, 1);                         // s3 removed
cur0.steps.push({ id: 's4', title: 'Four', dependsOn: ['s2'] });   // added
cur0.outputs[0].items.push({ text: 'b', when: { input: 'x', is: 'a' } });
cur0.name = 'Renamed';
const ch = C.diffSpecs(base0, cur0), idsOf = (cs) => cs.map((c) => c.id).sort();
assert.deepStrictEqual(idsOf(ch), ['meta:modified:name', 'output:modified:o', 'step:added:s4', 'step:modified:s2', 'step:removed:s3']);
assert.deepStrictEqual(ch.find((c) => c.id === 'step:modified:s2').fields, ['detail']);

// reject: put the baseline version back into the current plan
const rej = JSON.parse(JSON.stringify(cur0));
for (const c of ch) if (['step:removed:s3', 'step:added:s4', 'step:modified:s2'].includes(c.id)) C.applyChange(rej, base0, c);
C.sanitize(rej);
assert.deepStrictEqual(rej.steps.map((s) => s.id), ['s1', 's2', 's3']);       // s3 restored in its original place, s4 gone
assert.strictEqual(rej.steps[1].detail, undefined);
assert.strictEqual(rej.steps[1].x, 999);                                        // the user's card position is untouched
assert.strictEqual(rej.name, 'Renamed');                                        // unrelated change still pending
assert.deepStrictEqual(idsOf(C.diffSpecs(base0, rej)), ['meta:modified:name', 'output:modified:o']);

// accept: fold the current version into the baseline; the change stops being a difference
const acc = JSON.parse(JSON.stringify(base0));
for (const c of ch) C.applyChange(acc, cur0, c);
C.sanitize(acc);
assert.deepStrictEqual(C.diffSpecs(acc, cur0), []);

// rejecting an added step also drops links that other (accepted) changes made to it
const lnk = { steps: [{ id: 'a' }, { id: 'n', dependsOn: ['a'] }, { id: 'z', dependsOn: ['n'] }] }, lb = { steps: [{ id: 'a' }, { id: 'z', dependsOn: ['a'] }] };
const lc = C.diffSpecs(lb, lnk).find((c) => c.id === 'step:added:n');
C.applyChange(lnk, lb, lc); C.sanitize(lnk);
assert.deepStrictEqual(lnk.steps.find((s) => s.id === 'z').dependsOn, []);
// removing an input drops conditions that used it
const si = { inputs: [], steps: [{ id: 'a', runWhen: { all: [{ input: 'gone', is: '1' }, { input: 'k', is: '2' }] } }], outputs: [] };
si.inputs.push({ id: 'k' }); C.sanitize(si);
assert.deepStrictEqual(si.steps[0].runWhen, { input: 'k', is: '2' });


// ---- chat reply import ----
const reply = (obj, pre = 'Here is the improved design:\n') => pre + '```json\n' + JSON.stringify(obj, null, 2) + '\n```\nHope that helps!';
const curI = { name: 'N', outputDir: '/out', steps: [{ id: 'a', title: 'A', x: 5, y: 6, userNote: 'keep me' }, { id: 'b', title: 'B', dependsOn: ['a'] }], inputs: [], outputs: [] };
const good = { name: 'N', steps: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', dependsOn: ['a'], detail: 'more' }, { id: 'c', title: 'C', dependsOn: ['b'] }] };
assert.strictEqual(C.extractJson(reply(good)).steps.length, 3);
assert.strictEqual(C.extractJson('{"steps":[{"id":"a"}]}').steps[0].id, 'a');                              // bare JSON, no fence
assert.strictEqual(C.extractJson('Sure.\n```\n{"steps":[{"id":"a"}]}\n```\nand also ```js\nlet x = 1\n```').steps.length, 1);   // picks the JSON block, ignores other fences
assert.throws(() => C.extractJson('no json here'), /No JSON object/);
assert.throws(() => C.extractJson('```json\n{"steps": [oops]}\n```'), /not valid/);
assert.throws(() => C.extractJson('```json\n{"name":"x"}\n```'), /no "steps"/);
assert.throws(() => C.extractJson(reply({ steps: [{ id: 'a' }, { id: 'a' }] })), /share the id/);
assert.throws(() => C.extractJson(reply({ steps: [{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }] })), /Cycle/);
assert.throws(() => C.extractJson(reply({ steps: [{ id: 'a', dependsOn: ['zzz'] }] })), /Unknown/);
const mg = C.mergeImported(good, curI);
assert.strictEqual(mg.status, 'enhanced');
assert.strictEqual(mg.outputDir, '/out');                                    // the output folder survives a reply that forgot it
assert.deepStrictEqual([mg.steps[0].x, mg.steps[0].y, mg.steps[0].userNote], [5, 6, 'keep me']);   // so do positions and the user's note
assert.strictEqual(C.mergeImported({ ...good, steps: [{ id: 'a', title: 'A', userNote: 'edited' }] }, curI).steps[0].userNote, 'edited');   // but an explicit change is kept (it shows up in review)
assert.deepStrictEqual(C.diffSpecs(curI, mg).map((x) => x.id).sort(), ['step:added:c', 'step:modified:b']);

// Inputs and outputs: the example is fully defined
assert.deepStrictEqual(C.ioIssues(spec), []);
const ioKinds = (sp) => C.ioIssues(sp).map((i) => i.kind).sort();
const art = (id) => ({ id, path: id + '.md', format: 'markdown' });
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a' }] }), ['noproduces', 'noreads']);                                     // nothing defined
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a', reads: [], produces: ['x'] }], artifacts: [art('x')], outputs: [{ id: 'o', artifact: 'x' }] }), []);   // [] reads is an explicit "nothing"
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a', reads: [], produces: ['x'] }], outputs: [{ id: 'o', artifact: 'x' }] }), ['badoutput', 'undefinedartifact']);   // produced but never given a path
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a', reads: [], produces: ['x'] }], artifacts: [{ id: 'x', path: 'x.md' }], outputs: [{ id: 'o', artifact: 'x' }] }), ['artifactfields']);
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a', reads: ['zz'], produces: ['x'] }], artifacts: [art('x')], outputs: [{ id: 'o', artifact: 'x' }] }), ['unknownread']);
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a', reads: [], produces: ['x'] }], artifacts: [art('x')] }), ['unused']);   // nobody reads it, no output delivers it
assert.deepStrictEqual(ioKinds({ steps: [                                                                                    // reading a sibling's file is not allowed
  { id: 'a', reads: [], produces: ['x'] }, { id: 'b', reads: ['x'], produces: ['y'], dependsOn: ['a'] }, { id: 'c', reads: ['y'], produces: ['z'], dependsOn: ['a'] }],
  artifacts: [art('x'), art('y'), art('z')], outputs: [{ id: 'o', artifact: 'z' }] }), ['notupstream']);
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a', reads: [], produces: ['x'] }, { id: 'b', reads: [], produces: ['x'] }],   // two writers collide
  artifacts: [art('x')], outputs: [{ id: 'o', artifact: 'x' }] }), ['collide']);
assert.deepStrictEqual(ioKinds({ steps: [{ id: 'a', reads: [], produces: ['x'] }], artifacts: [art('x'), art('y')], outputs: [{ id: 'o', artifact: 'x' }] }), ['orphan']);
assert.ok(C.diffSpecs({ artifacts: [art('x')] }, { artifacts: [{ ...art('x'), path: 'y.md' }] }).some((c) => c.id === 'artifact:modified:x'));   // artifact edits show up in review

// Connectors go around cards they do not connect to
const crosses = (pts, boxes) => pts.some((p, i) => i > 0 && boxes.some((r) => C.segHits(pts[i - 1], p, r)));
const A = { x: 0, y: 0, w: 100, h: 60 }, B = { x: 500, y: 0, w: 100, h: 60 }, mid = { x: 250, y: -10, w: 100, h: 80 };
const straight = C.routeEdge(A, B, []);
assert.deepStrictEqual([straight[0], straight[straight.length - 1]], [[100, 30], [500, 30]]);   // touches both cards at their middles
const around = C.routeEdge(A, B, [mid]);
assert.ok(!crosses(around, [mid]));                                                              // detours around the card in the way
assert.deepStrictEqual([around[0], around[around.length - 1]], [[100, 30], [500, 30]]);
const wall = [{ x: 250, y: -200, w: 40, h: 150 }, { x: 250, y: 90, w: 40, h: 150 }];             // a gap between two cards
assert.ok(!crosses(C.routeEdge(A, { x: 500, y: 300, w: 100, h: 60 }, wall), wall));
const back = C.routeEdge(B, A, [mid]);                                                           // a card dragged to the left of its parent
assert.ok(!crosses(back, [mid]));
assert.deepStrictEqual([back[0], back[back.length - 1]], [[600, 30], [0, 30]]);
for (let i = 1; i < around.length; i++) assert.ok(around[i][0] === around[i - 1][0] || around[i][1] === around[i - 1][1]);   // only straight horizontal and vertical segments

console.log('core tests passed');
