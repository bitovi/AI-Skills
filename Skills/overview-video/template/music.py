#!/usr/bin/env python3
"""Original background music for an overview video, synthesized with numpy only.

Reads video.json for duration, bpm, style, key, and optional "hits" (times in
seconds that get a band hit, usually your scene cuts and key picture moments).
Writes build/music.wav (44.1 kHz, 16-bit stereo).

Styles: swing, lofi, synthpop, funk, acoustic, cinematic. Each style sets the
chord loop, the feel (straight or swung), the drum pattern, the bass line, the
comping instrument, and the lead instrument. Add your own to STYLES.

Every sound is built from tones. There are no noise-based drums (no brushes,
hi-hats, or whooshes), because listeners heard them as static that made the
video hard to follow.

The video length is rounded to a whole number of bars, the same rule anim.js
uses, so scene cuts on bar lines line up with the music.

For a richer arrangement (horn sections, solis, shout chorus), see
reference/music-bigband-example.py in this skill.
"""
import json
import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, 'video.json')))
SR = 44100
BPM = float(CFG.get('bpm', 150))
BEAT = 60 / BPM
BAR = 4 * BEAT
NBARS = int(round(CFG.get('duration', 120) / BAR))
DUR = NBARS * BAR
N = int((DUR + 0.05) * SR)
rng = np.random.default_rng(int(CFG.get('seed', 7)))

KEYS = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
ROOT = 48 + KEYS.get(CFG.get('key', 'C'), 0)   # MIDI note of the tonic, in the bass octave

# chord = (scale degree in semitones above the tonic, chord tones in semitones above the chord root)
MAJ7, DOM7, MIN7, MAJ6, MIN, MAJ, SUS = (0, 4, 7, 11), (0, 4, 7, 10), (0, 3, 7, 10), (0, 4, 7, 9), (0, 3, 7), (0, 4, 7), (0, 5, 7, 10)

STYLES = {
    # bars of (root offset, chord); the loop repeats through the body
    'swing':     dict(loop=[(0, MAJ6), (9, MIN7), (2, MIN7), (7, DOM7)] * 2, swing=0.64, drums='swing', bass='walk', comp='piano', lead='sax'),
    'lofi':      dict(loop=[(5, MAJ7), (4, MIN7), (2, MIN7), (0, MAJ7)], swing=0.6, drums='lofi', bass='root', comp='rhodes', lead='vibes'),
    'synthpop':  dict(loop=[(0, MAJ), (7, MAJ), (9, MIN), (5, MAJ)], swing=0.5, drums='four', bass='octave', comp='pad', lead='square'),
    'funk':      dict(loop=[(0, DOM7), (0, DOM7), (5, DOM7), (0, DOM7)], swing=0.54, drums='funk', bass='funk', comp='clav', lead='brass'),
    'acoustic':  dict(loop=[(0, MAJ), (7, MAJ), (9, MIN), (5, MAJ)], swing=0.5, drums='light', bass='root', comp='guitar', lead='flute'),
    'cinematic': dict(loop=[(0, MAJ), (8, MAJ), (3, MAJ), (10, MAJ)], swing=0.5, drums='taiko', bass='long', comp='strings', lead='horn'),
}
ST = STYLES[CFG.get('style', 'swing')]

out = np.zeros((2, N))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    j = min(N, i + len(sig))
    out[0, i:j] += sig[:j - i] * gain * np.cos((pan + 1) * np.pi / 4)
    out[1, i:j] += sig[:j - i] * gain * np.sin((pan + 1) * np.pi / 4)


def env(n, a=0.005, d=8.0):
    t = np.arange(n) / SR
    return (1 - np.exp(-t / max(a, 1e-4))) * np.exp(-t * d)


def tail(n, rel=0.04):
    e = np.ones(n)
    k = min(n, int(rel * SR))
    e[-k:] *= np.linspace(1, 0, k)
    return e


def osc(f, n, shape='sine', vib=0.0):
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(f * (1 + vib * np.sin(2 * np.pi * 5.2 * t))) / SR
    if shape == 'sine':
        return np.sin(ph)
    if shape == 'soft':      # a few harmonics, rounded
        return np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    if shape == 'saw':       # band-limited saw from 10 harmonics
        return sum(np.sin(k * ph) / k for k in range(1, 11)) * 0.6
    if shape == 'square':
        return sum(np.sin(k * ph) / k for k in range(1, 12, 2)) * 0.8
    raise ValueError(shape)


# ── instruments (tones only) ─────────────────────────────────────────
def kick(v=0.6):
    n = int(0.3 * SR); t = np.arange(n) / SR
    f = 50 + 80 * np.exp(-t * 34)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) * v * 0.5


def snare(v=0.2):            # woody: two tones, quick decay
    n = int(0.2 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 200 * t) * np.exp(-t * 30) * 0.5 + np.sin(2 * np.pi * 330 * t) * np.exp(-t * 45) * 0.3) * v * 1.2


def ride(v=0.15):            # soft bell, low partials
    n = int(0.6 * SR); t = np.arange(n) / SR
    m = sum(a * np.sin(2 * np.pi * f * t) for f, a in [(1180, 1.0), (1730, 0.6), (2350, 0.35)]) / 2
    return m * np.exp(-t * 9) * (1 - np.exp(-t * 600)) * v * 0.27


def tick(v=0.08, f=2200):    # a tiny tonal click in place of a hi-hat
    n = int(0.03 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 220) * v


def tom(f0=110, v=0.5):
    n = int(0.6 * SR); t = np.arange(n) / SR
    f = f0 * (1 + 0.45 * np.exp(-t * 22))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5) * v * 0.6


def bassnote(m, dur, v=0.7, shape='soft'):
    n = int(dur * SR)
    return osc(mtof(m), n, shape) * env(n, 0.004, 2.5) * tail(n) * v * 0.45


def keys(m, dur, kind, v=0.3):
    n = int(dur * SR)
    if kind == 'piano':
        s = osc(mtof(m), n, 'soft') * env(n, 0.002, 3.0)
    elif kind == 'rhodes':
        s = (np.sin(2 * np.pi * mtof(m) * np.arange(n) / SR) + 0.25 * osc(mtof(m) * 2, n)) * env(n, 0.003, 1.6)
    elif kind == 'pad':
        s = osc(mtof(m), n, 'saw') * env(n, 0.12, 0.4) * 0.5
    elif kind == 'clav':
        s = osc(mtof(m), n, 'square') * env(n, 0.001, 14) * 0.6
    elif kind == 'guitar':   # plucked string: higher harmonics die faster
        t = np.arange(n) / SR
        s = sum(np.sin(2 * np.pi * mtof(m) * k * t) * np.exp(-t * (3 + 4 * k)) / k for k in range(1, 7)) * (1 - np.exp(-t * 900))
    elif kind == 'strings':
        s = osc(mtof(m), n, 'saw', vib=0.004) * env(n, 0.35, 0.2) * 0.45
    else:
        raise ValueError(kind)
    return s * tail(n, 0.08) * v


def leadnote(m, dur, kind, v=0.35):
    n = int(dur * SR)
    shapes = {'sax': ('soft', 0.006, 0.02), 'vibes': ('sine', 0.002, 0.0), 'square': ('square', 0.004, 0.003),
              'brass': ('saw', 0.015, 0.0), 'flute': ('sine', 0.03, 0.006), 'horn': ('soft', 0.06, 0.004)}
    shape, att, vib = shapes[kind]
    d = 4.0 if kind == 'vibes' else 0.8
    return osc(mtof(m), n, shape, vib) * env(n, att, d) * tail(n, 0.06) * v * (0.5 if shape in ('saw', 'square') else 1)


# ── timing helpers ───────────────────────────────────────────────────
def pos(b, beat, off=False):
    """Time of beat (0-3) in bar b; off=True is the swung 'and' after it."""
    return b * BAR + (beat + (ST['swing'] if off else 0)) * BEAT


def chord_at(b):
    deg, tones = ST['loop'][b % len(ST['loop'])]
    return ROOT + deg, tones


INTRO, OUTRO = 2, 4                     # bars
END_BAR = NBARS - OUTRO                 # the end card starts here; final chord one bar later
FINAL = (END_BAR + 1) * BAR

# ── drums ────────────────────────────────────────────────────────────
for b in range(INTRO, END_BAR + 1):
    last = b == END_BAR
    kind = ST['drums']
    for bt in range(4):
        t = pos(b, bt)
        if last and bt > 0:
            break
        if kind == 'swing':
            place(ride(0.2 if bt % 2 == 0 else 0.15), t, 0.35)
            if bt == 3:
                place(ride(0.12), pos(b, 3, True), 0.35)
            if bt in (1, 3):
                place(tick(0.06), t, 0.3)
            if bt == 0:
                place(kick(0.45), t)
        elif kind == 'lofi':
            if bt in (0, 2):
                place(kick(0.55 if bt == 0 else 0.4), t + (0.02 if bt == 2 else 0))
            if bt in (1, 3):
                place(snare(0.22), t + 0.015, -0.1)
            place(tick(0.05, 1900), pos(b, bt, True), 0.3)
        elif kind == 'four':
            place(kick(0.6), t)
            if bt in (1, 3):
                place(snare(0.25), t, -0.1)
            place(tick(0.06, 2600), pos(b, bt, True), 0.3)
        elif kind == 'funk':
            if bt == 0 or (bt == 2 and b % 2):
                place(kick(0.6), t)
            place(kick(0.4), pos(b, 1, True) + 0.25 * BEAT)
            if bt in (1, 3):
                place(snare(0.3), t, -0.1)
            for k in range(4):
                place(tick(0.04, 2400), t + k * BEAT / 4, 0.3)
        elif kind == 'light':
            if bt == 0:
                place(kick(0.4), t)
            if bt == 2:
                place(snare(0.14), t, -0.1)
            place(tick(0.04, 2000), pos(b, bt, True), 0.25)
        elif kind == 'taiko':
            if bt in (0, 2) or (bt == 3 and b % 4 == 3):
                place(tom(70 if bt == 0 else 90, 0.7), t, 0.0)
            if b % 4 == 3 and bt == 3:
                for k in range(4):
                    place(tom(120 - 10 * k, 0.5), t + k * BEAT / 4, -0.3 + 0.2 * k)

# ── bass ─────────────────────────────────────────────────────────────
for b in range(INTRO, END_BAR):
    r, tones = chord_at(b)
    nr, _ = chord_at(b + 1)
    kind = ST['bass']
    if kind == 'walk':
        line = [r, r + tones[1], r + tones[2], nr + (1 if rng.random() < 0.5 else -1)]
        for bt, m in enumerate(line):
            place(bassnote(m, BEAT * 0.95), pos(b, bt))
    elif kind == 'root':
        place(bassnote(r, BEAT * 1.9), pos(b, 0)); place(bassnote(r + 7, BEAT * 1.9), pos(b, 2))
    elif kind == 'octave':
        for k in range(8):
            place(bassnote(r + (12 if k % 2 else 0), BEAT * 0.45, 0.6, 'saw'), b * BAR + k * BEAT / 2)
    elif kind == 'funk':
        for t_, m in [(0, r), (0.75, r + 12), (1.5, r + 10), (2.0, r), (2.75, r + 7), (3.5, r + 12)]:
            place(bassnote(m, BEAT * 0.3, 0.75), b * BAR + t_ * BEAT)
    elif kind == 'long':
        place(bassnote(r - 12, BAR, 0.8, 'sine'), pos(b, 0))
place(bassnote(ROOT, BAR * 2), FINAL)

# ── comping ──────────────────────────────────────────────────────────
for b in range(INTRO - 1 if INTRO else 0, END_BAR):
    r, tones = chord_at(b)
    voicing = [r + 12 + x for x in tones]
    kind = ST['comp']
    hits = {'piano': [(1, 0.6), (2, 0.9), (3.6, 0.4)], 'rhodes': [(0, 1.8), (2, 1.8)], 'pad': [(0, 4.0)],
            'clav': [(0.5, 0.2), (1.5, 0.2), (2.25, 0.2), (3.5, 0.2)], 'guitar': [(0, 1.0), (1, 0.5), (1.5, 0.5), (2, 1.0), (3, 1.0)],
            'strings': [(0, 4.0)]}[kind]
    for beat, length in hits:
        for i, m in enumerate(voicing):
            off = i * 0.012 if kind == 'guitar' else 0
            t = b * BAR + (int(beat) + (ST['swing'] if beat % 1 and ST['swing'] != 0.5 else beat % 1)) * BEAT + off
            place(keys(m, length * BEAT, kind, 0.12), t, -0.25 + 0.15 * i)

# ── lead: a short motif from chord tones, repeated with small changes ─
MOTIF = [(0, 2, 1.0), (1.5, 1, 0.5), (2, 2, 1.5)]   # (beat, chord-tone index, length in beats)
for b in range(INTRO + 2, END_BAR):
    if (b // 4) % 2 == 0 and b % 4 in (0, 1, 2):   # play two phrases in four, leave space
        r, tones = chord_at(b)
        for beat, idx, length in MOTIF:
            m = r + 24 + tones[(idx + (b % 3)) % len(tones)]
            t = b * BAR + (int(beat) + (ST['swing'] if beat % 1 else 0)) * BEAT
            place(leadnote(m, length * BEAT, ST['lead']), t, 0.15)

# ── hits from video.json, the end-card button, and the final chord ───
for t in CFG.get('hits', []):
    if 0.5 < t < FINAL - 0.5:
        r, tones = chord_at(int(t // BAR))
        for i, x in enumerate(tones):
            place(leadnote(r + 24 + x, 0.25, 'vibes', 0.25), t, -0.3 + 0.2 * i)
        place(kick(0.5), t)
r, tones = ROOT, ST['loop'][0][1]
for i, x in enumerate(tones):
    place(keys(r + 12 + x, BAR * 2.5, 'strings' if ST['comp'] in ('pad', 'strings') else 'piano', 0.16), FINAL, -0.3 + 0.2 * i)
    place(leadnote(r + 24 + x, BAR * 1.5, ST['lead'], 0.2), FINAL, 0.2 - 0.15 * i)
place(kick(0.7), FINAL)

# ── simple tonal reverb (feedback delays, no noise) ──────────────────
for ch in range(2):
    wet = np.zeros(N)
    for d, g in [(0.029, 0.5), (0.037, 0.45), (0.043, 0.4), (0.053, 0.35)]:
        k = int((d + 0.003 * ch) * SR)
        y = out[ch].copy()
        for _ in range(6):
            y = np.concatenate([np.zeros(k), y[:-k]]) * g
            wet += y * 0.25
    out[ch] += wet * 0.5

# ── master: fade, level to about -19.5 dBFS RMS, soft limit at -4 dBFS ─
t = np.arange(N) / SR
out *= np.interp(t, [0, 0.05, DUR - 2.5, DUR], [0, 1, 1, 0])
out -= out.mean(axis=1, keepdims=True)
CEIL, TARGET = 10 ** (-4 / 20), 10 ** (-19.5 / 20)
body = slice(int(0.5 * SR), int(FINAL * SR))
g = TARGET / np.sqrt(np.mean(out[:, body] ** 2))
for _ in range(4):
    g *= TARGET / np.sqrt(np.mean((CEIL * np.tanh(g * out[:, body] / CEIL)) ** 2))
out = CEIL * np.tanh(g * out / CEIL)

os.makedirs(os.path.join(HERE, 'build'), exist_ok=True)
path = os.path.join(HERE, 'build', 'music.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(out.T, -1, 1) * 32767).astype('<i2').tobytes())
X = np.abs(np.fft.rfft(out.mean(0))) ** 2; f = np.fft.rfftfreq(N, 1 / SR)
print(f'wrote {path}: {CFG.get("style", "swing")}, {BPM:g} BPM, {NBARS} bars = {DUR:.2f} s, '
      f'peak {20 * np.log10(np.abs(out).max()):.1f} dBFS, above 6 kHz {100 * X[f > 6000].sum() / X.sum():.3f}%')
