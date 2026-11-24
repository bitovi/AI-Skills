/* Overview video starter: deterministic motion graphics on one canvas.
 * seek(t) draws the exact frame for time t (seconds). Pure function of t:
 * no wall clock, no CSS transitions, seeded randomness only.
 * Timeline is locked to the music: DUR is a whole number of bars at the BPM in
 * video.json (150 BPM: one bar = 1.6 s, 75 bars = 120 s). Every scene starts on a bar line.
 * Place scenes with bar(k), or as a fraction of the video with barAt(0.5), so a
 * change of duration or tempo keeps the cuts on bar lines.
 *
 * Replace the demo scenes (sHook, sIdea, sEnd), CAPS, HDR, and T with your story.
 * Keep the helpers, the background, the caption pill, the header, the tracker, and seek().
 */
'use strict';
// Duration, tempo, and fps come from video.json (index.html loads it into window.VIDEO).
var VIDEO = window.VIDEO || { duration: 120, bpm: 150, fps: 30 };
var W = 1280, H = 720, FPS = VIDEO.fps || 30, BPM = VIDEO.bpm, BEAT = 60 / BPM, BAR = 4 * BEAT;
var NBARS = Math.round(VIDEO.duration / BAR), DUR = NBARS * BAR;   // the video is a whole number of bars
var C = {
  bg0: '#0d1117', surf: '#161b22', raised: '#21262d', border: '#30363d',
  txt: '#e6edf3', mut: '#9aa4b2', faint: '#484f58',
  blue: '#58a6ff', blueL: '#79c0ff', green: '#56d364', vio: '#d2a8ff', org: '#ffa657', coral: '#ff7b72',
  red: '#d0343a', redL: '#ff7a80', gold: '#f2cc60', goldD: '#c8901a', ink: '#ffffff'
};
var cv = document.getElementById('c');
var ctx = cv.getContext('2d');
function bar(k) { return k * BAR; }
function barAt(f) { return Math.round(f * NBARS) * BAR; }   // nearest bar line at fraction f of the video

/* ── math and easing ─────────────────────────────────────────────── */
function clamp(x, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, x)); }
function lerp(a, b, p) { return a + (b - a) * p; }
function P(t, a, b) { return clamp((t - a) / (b - a)); }
var E = {
  inOut: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
  out: function (p) { return 1 - Math.pow(1 - p, 3); },
  in: function (p) { return p * p * p; },
  back: function (p) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
};
function pop(t, t0, d) { return E.back(P(t, t0, t0 + (d || 0.4))); }
function fin(t, t0, d) { return E.out(P(t, t0, t0 + (d || 0.3))); }
function bump(t, t0, d) { return t >= t0 && t < t0 + d ? 1 - (t - t0) / d : 0; }
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var r = Math.imul(seed ^ seed >>> 15, 1 | seed);
    r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
function beatPulse(t) { var b = ((t % BEAT) + BEAT) % BEAT; return Math.exp(-b * 9); }
function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
/* keyframes: [[time, x, y, scale, arc]] eased per segment */
function kf(t, keys) {
  if (t <= keys[0][0]) return { x: keys[0][1], y: keys[0][2], s: keys[0][3] };
  for (var i = 0; i < keys.length - 1; i++) {
    var a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      var p = E.inOut((t - a[0]) / (b[0] - a[0]));
      return { x: lerp(a[1], b[1], p), y: lerp(a[2], b[2], p) - Math.sin(Math.PI * p) * (b[4] || 0), s: lerp(a[3], b[3], p) };
    }
  }
  var l = keys[keys.length - 1];
  return { x: l[1], y: l[2], s: l[3] };
}

/* ── drawing helpers ─────────────────────────────────────────────── */
function setFont(size, w, fam) { ctx.font = (w || 700) + ' ' + size + 'px "' + (fam || 'Inter') + '"'; }
function text(s, x, y, o) {
  o = o || {};
  ctx.save();
  setFont(o.size || 26, o.w || 700, o.f || 'Inter');
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
  ctx.globalAlpha *= (o.a === undefined ? 1 : o.a);
  if (o.ls) ctx.letterSpacing = o.ls + 'px';
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.blur || 14; }
  ctx.fillStyle = o.color || C.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function tw(s, size, w, fam) { ctx.save(); setFont(size, w, fam); var m = ctx.measureText(s).width; ctx.restore(); return m; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function chip(s, x, y, o) {
  o = o || {};
  var size = o.size || 24;
  ctx.save();
  ctx.globalAlpha *= (o.a === undefined ? 1 : o.a);
  setFont(size, o.w || 700, o.f || 'Inter');
  var w = ctx.measureText(s).width + size * 1.3 + (o.icon ? size * 1.3 : 0), h = size * 1.8;
  ctx.translate(x, y); if (o.s !== undefined) ctx.scale(o.s, o.s); if (o.rot) ctx.rotate(o.rot);
  rr(-w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = o.bg || hexA(o.color || C.blue, 0.16); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = o.color || C.blue; ctx.stroke();
  if (o.icon) o.icon(-w / 2 + size * 1.05, 0, size * 0.95);
  ctx.fillStyle = o.tc || C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s, o.icon ? size * 0.62 : 0, 1);
  ctx.restore();
  return w;
}
function glow(x, y, r, color, a) {
  if (a <= 0 || r <= 0) return;
  var g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function line(x1, y1, x2, y2, color, w, dash, off) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w || 2; ctx.lineCap = 'round';
  if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = off || 0; }
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function qPoint(x1, y1, cx, cy, x2, y2, p) {
  var a = (1 - p) * (1 - p), b = 2 * (1 - p) * p, c = p * p;
  return { x: a * x1 + b * cx + c * x2, y: a * y1 + b * cy + c * y2 };
}
function qCurve(x1, y1, cx, cy, x2, y2, p, color, w, dash, off) {
  if (p <= 0) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w || 2; ctx.lineCap = 'round';
  if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = off || 0; }
  ctx.beginPath(); ctx.moveTo(x1, y1);
  for (var i = 1; i <= 24; i++) { var q = qPoint(x1, y1, cx, cy, x2, y2, p * i / 24); ctx.lineTo(q.x, q.y); }
  ctx.stroke(); ctx.restore();
}
function burst(x, y, t, t0, o) {
  o = o || {};
  var dt = t - t0, life = o.life || 0.9;
  if (dt < 0 || dt > life) return;
  var r = rng(o.seed || 7), n = o.n || 18, sp = o.speed || 520;
  ctx.save();
  for (var i = 0; i < n; i++) {
    var a = r() * Math.PI * 2, v = sp * (0.35 + r() * 0.86), sz = (o.size || 4) * (0.5 + r());
    var k = (1 - Math.exp(-dt * 5)) / 5;
    var px = x + Math.cos(a) * v * k, py = y + Math.sin(a) * v * k + (o.grav || 0) * dt * dt;
    ctx.globalAlpha = 1 - dt / life;
    ctx.fillStyle = i % 3 === 0 ? (o.c2 || C.gold) : (o.color || C.blueL);
    if (i % 4 === 0) { ctx.save(); ctx.translate(px, py); ctx.rotate(a + dt * 6); ctx.fillRect(-sz, -sz * 0.35, sz * 2, sz * 0.7); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(px, py, sz * 0.6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = (1 - dt / life) * 0.8; ctx.strokeStyle = o.color || C.blueL; ctx.lineWidth = 3 * (1 - dt / life) + 0.5;
  ctx.beginPath(); ctx.arc(x, y, 12 + (o.ring || 90) * E.out(dt / life), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

function checkIcon(x, y, s, color, p) {
  p = p === undefined ? 1 : p; if (p <= 0) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = s * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.45, y);
  var p1 = Math.min(1, p * 2);
  ctx.lineTo(x - s * 0.45 + s * 0.3 * p1, y + s * 0.3 * p1);
  if (p > 0.5) { var p2 = (p - 0.5) * 2; ctx.lineTo(x - s * 0.15 + s * 0.6 * p2, y + s * 0.3 - s * 0.65 * p2); }
  ctx.stroke(); ctx.restore();
}
function crossIcon(x, y, s, color, p) {
  p = p === undefined ? 1 : p; if (p <= 0) return;
  var a = clamp(p * 2), b = clamp(p * 2 - 1);
  line(x - s / 2, y - s / 2, x - s / 2 + s * a, y - s / 2 + s * a, color, s * 0.22);
  if (b > 0) line(x + s / 2, y - s / 2, x + s / 2 - s * b, y - s / 2 + s * b, color, s * 0.22);
}
function starIcon(x, y, r, color, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.fillStyle = color; ctx.beginPath();
  for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function gear(x, y, r, rot, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (var i = 0; i < 16; i++) { var a0 = i * Math.PI / 8, a1 = (i + 1) * Math.PI / 8; ctx.arc(0, 0, i % 2 === 0 ? r : r * 0.78, a0 + 0.08, a1 - 0.08); }
  ctx.closePath();
  ctx.fillStyle = hexA(color, 0.25); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function bot(x, y, s, color, o) {
  o = o || {};
  var a = o.a === undefined ? 1 : o.a; if (a <= 0 || s <= 1) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.globalAlpha *= a;
  if (o.glow) glow(0, 0, s * 1.6, color, o.glow);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, -s * 0.72); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -s * 0.78, s * 0.1, 0, Math.PI * 2); ctx.fill();
  rr(-s * 0.55, -s * 0.5, s * 1.1, s, s * 0.28);
  ctx.fillStyle = '#161b22'; ctx.fill(); ctx.fillStyle = hexA(color, 0.22); ctx.fill(); ctx.stroke();
  var lx = (o.lookX || 0) * s * 0.06, ly = (o.lookY || 0) * s * 0.06;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.02, s * 0.15, 0, Math.PI * 2); ctx.arc(s * 0.2, -s * 0.02, s * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.bg0;
  ctx.beginPath(); ctx.arc(-s * 0.2 + lx, -s * 0.02 + ly, s * 0.07, 0, Math.PI * 2); ctx.arc(s * 0.2 + lx, -s * 0.02 + ly, s * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ── timeline: every scene starts on a bar line ──────────────────── */
var T = { idea: bar(5), end: bar(NBARS - 4) };   // end card: the last four bars
var PANS = [T.idea, T.end];          // push transitions (0.8 s overlap, centered on each cut)
function camX(t) { var x = 0; PANS.forEach(function (p) { x += E.inOut(P(t, p - 0.4, p + 0.4)); }); return x * 1280; }

/* ── background, vignette, grain, speed lines ────────────────────── */
var BOKEH = (function () { var r = rng(41), a = []; for (var i = 0; i < 26; i++) a.push({ x: r() * 1600, y: r() * 620, r: 8 + r() * 30, d: 0.05 + r() * 0.25, c: [C.blue, C.redL, C.gold, C.vio][i % 4], a: 0.04 + r() * 0.06, ph: r() * 6 }); return a; })();
var GRAIN = (function () {
  var g = document.createElement('canvas'); g.width = 256; g.height = 256;
  var gc = g.getContext('2d'), id = gc.createImageData(256, 256), r = rng(9);
  for (var i = 0; i < id.data.length; i += 4) { var v = 110 + r() * 145; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  gc.putImageData(id, 0, 0); return g;
})();
var grainPattern = null;
function drawBG(t) {
  var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#121a26'); g.addColorStop(0.65, '#0d1117'); g.addColorStop(1, '#0a0e14');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  glow(1040 + Math.sin(t * 0.21) * 80, 80, 620, '#1f3a5f', 0.55);
  glow(980 + Math.sin(t * 0.19) * 70, 120, 520, C.red, 0.07);
  glow(220 + Math.cos(t * 0.17) * 60, 690, 600, '#1f6feb', 0.09);
  var cx = camX(t);
  // a faint dot grid that slides with the camera
  ctx.save(); ctx.fillStyle = 'rgba(139,148,158,.10)';
  var off = (cx * 0.35) % 40;
  for (var gx = -off; gx < W; gx += 40) for (var gy = 20; gy < H; gy += 40) ctx.fillRect(gx, gy, 2, 2);
  ctx.restore();
  BOKEH.forEach(function (bk) {
    var x = ((bk.x - cx * bk.d + t * 8 * bk.d * 10) % 1600 + 1600) % 1600 - 160;
    glow(x, bk.y + Math.sin(t * 0.5 + bk.ph) * 14, bk.r * 2.2, bk.c, bk.a);
  });
}
function drawVignette() {
  var g = ctx.createRadialGradient(W / 2, H / 2, 320, W / 2, H / 2, 840);
  g.addColorStop(0, 'rgba(4,6,10,0)'); g.addColorStop(1, 'rgba(4,6,10,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!grainPattern) grainPattern = ctx.createPattern(GRAIN, 'repeat');
  ctx.save(); ctx.globalAlpha = 0.035; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = grainPattern; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function drawSpeedLines(t) {
  PANS.forEach(function (p0) {
    var p = P(t, p0 - 0.4, p0 + 0.4); if (p <= 0 || p >= 1) return;
    var k = Math.sin(Math.PI * p), r = rng(Math.round(p0 * 13));
    ctx.save(); ctx.globalAlpha = 0.5 * k; ctx.lineCap = 'round';
    for (var i = 0; i < 16; i++) {
      var y = 140 + r() * 460, len = 120 + r() * 380, x = W - ((p * 2600 + r() * 1400) % (W + len + 200));
      ctx.strokeStyle = [C.blueL, C.gold, C.redL][i % 3]; ctx.lineWidth = 1 + r() * 2.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }
    ctx.restore();
  });
}


/* ── captions: [start, end, text]. *words* are highlighted. Keep each on screen 2.5 s or more ── */
var CAPS = [
  [0.35, 3.8, 'Start with *the problem* your audience has.'],
  [4.0, 7.8, 'Then say *what you want them to do*.'],
  [8.25, 12.5, 'Each scene makes *one point* with a picture.'],
  [12.7, 17.0, 'The caption *says it*, the animation *shows it*.']
];
function drawCaption(t) {
  for (var i = 0; i < CAPS.length; i++) {
    var c = CAPS[i]; if (t < c[0] || t > c[1]) continue;
    var pin = E.back(P(t, c[0], c[0] + 0.3)), pout = E.in(P(t, c[1] - 0.2, c[1]));
    var a = P(t, c[0], c[0] + 0.16) * (1 - pout);
    var parts = c[2].replace(/"/g, function () { return '“'; }).split('*');
    // straight quotes become curly quotes (open, then close)
    var q = 0; parts = parts.map(function (p) { return p.replace(/“/g, function () { return q++ % 2 ? '”' : '“'; }); });
    var size = 36;
    setFont(size, 700, 'Inter');
    var wsum = 0; parts.forEach(function (p) { wsum += ctx.measureText(p).width; });
    if (wsum > 1130) { size = Math.floor(size * 1130 / wsum); setFont(size, 700, 'Inter'); wsum = 0; parts.forEach(function (p) { wsum += ctx.measureText(p).width; }); }
    var y = 655 + (1 - pin) * 18 + pout * 10;
    ctx.save(); ctx.globalAlpha = a;
    var bw = wsum + 56, bh = 66;
    rr(W / 2 - bw / 2, y - bh / 2, bw, bh, 18);
    ctx.fillStyle = 'rgba(13,17,23,.9)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(242,204,96,.42)'; ctx.stroke();
    var x = W / 2 - wsum / 2;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (var j = 0; j < parts.length; j++) {
      ctx.fillStyle = j % 2 ? C.gold : '#ffffff';
      ctx.fillText(parts[j], x, y + 2); x += ctx.measureText(parts[j]).width;
    }
    ctx.restore();
  }
}


/* ── header (kicker + title) and the chapter tracker (top right) ─── */
var HDR = [
  [T.idea, T.end, 'CHAPTER ONE', 'One idea per scene']
];
function drawHeader(t) {
  HDR.forEach(function (h) {
    var pin = E.out(P(t, h[0], h[0] + 0.4)), pout = E.in(P(t, h[1] - 0.4, h[1] - 0.05));
    var a = pin * (1 - pout); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    var dy = (1 - pin) * 26 - pout * 20;
    rr(56, 36 + dy, 7, 72, 3); ctx.fillStyle = C.red; ctx.fill();
    text(h[2], 80, 52 + dy, { size: 24, w: 800, color: C.redL, align: 'left', ls: 2.5 });
    var hs = Math.min(40, Math.floor(40 * 830 / tw(h[3], 40, 800)));   // long titles shrink to clear the tracker
    text(h[3], 79, 89 + dy, { size: hs, w: 800, align: 'left' });
    ctx.restore();
  });
  var p = clamp(t / DUR);
  var g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, C.red); g.addColorStop(1, C.gold);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 0, W, 6);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W * p, 6);
  glow(W * p, 3, 18, C.gold, 0.8);
  drawTracker(t);
}
function drawTracker(t) {
  var a = fin(t, T.idea - 0.2, 0.5) * (1 - fin(t, T.end - 0.3, 0.4)); if (a <= 0) return;
  var n = HDR.length, idx = 0; HDR.forEach(function (h, i) { if (t >= h[0]) idx = i; });
  var cp = clamp((t - HDR[idx][0]) / (HDR[idx][1] - HDR[idx][0]));
  var w = 82 + n * 34 + 16, x0 = W - 40 - w, y0 = 30, h = 76;
  ctx.save(); ctx.globalAlpha = a;
  rr(x0, y0, w, h, 38); ctx.fillStyle = 'rgba(13,17,23,.88)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.stroke();
  var cx = x0 + 40, cy = y0 + h / 2;
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(cx, cy, 25, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = C.gold; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cp); ctx.stroke();
  var np = pop(t, HDR[idx][0], 0.4);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(np, np); text(String(idx + 1), 0, 1, { size: 28, w: 800 }); ctx.restore();
  for (var i = 0; i < n; i++) {
    var sx = x0 + 82 + i * 34, sy = cy - 7, sw = 26;
    rr(sx, sy, sw, 14, 7); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();
    var f = i < idx ? 1 : i === idx ? cp : 0;
    if (f > 0) { rr(sx, sy, Math.max(14, sw * f), 14, 7); ctx.fillStyle = i === idx ? C.gold : C.redL; ctx.fill(); }
    if (i === idx) glow(sx + sw / 2, cy, 24, C.gold, 0.35 + 0.3 * beatPulse(t));
  }
  ctx.restore();
}


/* ── demo scenes. Replace these with your story ──────────────────── */
function sHook(t) {
  var words = [['Problem', 360, 300, C.coral], ['Idea', 640, 260, C.blueL], ['Action', 920, 300, C.green]];
  words.forEach(function (w, k) {
    var p = pop(t, 0.8 + k * BEAT * 2, 0.45); if (p <= 0) return;
    ctx.save(); ctx.translate(w[1], w[2] + Math.sin(t * 2 + k) * 6); ctx.scale(p, p);
    chip(w[0], 0, 0, { size: 34, color: w[3] }); ctx.restore();
    burst(w[1], w[2], t, 0.8 + k * BEAT * 2, { seed: 10 + k, color: w[3] });
  });
  bot(640, 460, 110 * pop(t, 4.0, 0.5), C.gold, { glow: 0.3 * beatPulse(t), lookX: Math.sin(t) });
}
function sIdea(t) {
  var cx = 640, cy = 380;
  for (var i = 0; i < 6; i++) {
    var a = -Math.PI / 2 + i * Math.PI / 3, p = fin(t, T.idea + 0.6 + i * BEAT, 0.4);
    var x = cx + Math.cos(a) * 190, y = cy + Math.sin(a) * 150;
    qCurve(cx, cy, (cx + x) / 2, (cy + y) / 2 - 30, x, y, p, hexA(C.blueL, 0.6), 3, [8, 8], -t * 40);
    if (p >= 1) { gear(x, y, 26, t * 1.5 * (i % 2 ? -1 : 1), DC[i % DC.length]); }
  }
  bot(cx, cy, 120, C.gold, { glow: 0.25 + 0.3 * beatPulse(t) });
  for (var j = 0; j < 4; j++) checkIcon(1060, 260 + j * 70, 22, C.green, fin(t, T.idea + 4 + j * BAR, 0.3));
}
function sEnd(t) {
  var a1 = fin(t, T.end + 0.3, 0.5), a2 = fin(t, T.end + 0.8, 0.5);
  glow(640, 220, 260, C.gold, 0.12 + 0.2 * beatPulse(t));
  text('Grab the skill', 640, 320 + (1 - a1) * 24, { size: 60, w: 800, a: a1 });
  ctx.save(); ctx.globalAlpha = a2;
  var url = 'github.com/bitovi/ai-skills', w = tw(url, 28, 700, 'JetBrains Mono') + 60;
  rr(640 - w / 2, 380, w, 60, 30); ctx.fillStyle = hexA(C.red, 0.25); ctx.fill(); ctx.strokeStyle = C.redL; ctx.lineWidth = 2.5; ctx.stroke();
  text(url, 640, 411, { size: 28, w: 700, f: 'JetBrains Mono' });
  ctx.restore();
  burst(640, 220, t, T.end + 0.4, { seed: 125, color: C.redL, c2: C.gold, n: 30, ring: 140 });
}
var DC = [C.blueL, C.green, C.vio, C.org, C.coral];

/* ── scene table: pin = pushes in from the right, pout = pushes out to the left ── */
var SCENES = [
  { a: 0, b: T.idea, draw: sHook, pout: 1 },
  { a: T.idea, b: T.end, draw: sIdea, pin: 1, pout: 1 },
  { a: T.end, b: DUR, draw: sEnd, pin: 1 }
];
function drawTravel(t) { /* one character or object that travels through every scene goes here */ }
function seek(t) {
  t = clamp(t, 0, DUR);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  drawBG(t);
  SCENES.forEach(function (s) {
    var lo = s.a - (s.pin ? 0.4 : 0), hi = s.b + (s.pout ? 0.4 : 0);
    if (t < lo || t > hi) return;
    var x = 0;
    if (s.pin) x += W * (1 - E.inOut(P(t, s.a - 0.4, s.a + 0.4)));
    if (s.pout) x -= W * E.inOut(P(t, s.b - 0.4, s.b + 0.4));
    ctx.save(); ctx.translate(x, 0); s.draw(t); ctx.restore();
  });
  drawSpeedLines(t);
  drawTravel(t);
  drawVignette();
  drawHeader(t);
  drawCaption(t);
  if (t < 0.3) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - t / 0.3) + ')'; ctx.fillRect(0, 0, W, H); }
  if (t > DUR - 1) { ctx.fillStyle = 'rgba(0,0,0,' + P(t, DUR - 1, DUR) + ')'; ctx.fillRect(0, 0, W, H); }
}
window.seek = seek;
