#!/usr/bin/env python3
"""Original big band cue for the CCA-F overview video. numpy only.

150 BPM (one bar = 1.6 s, 75 bars = 120 s, so scene cuts land on bar
lines), swung eighths, key of B-flat major. A brassy intro, a muted trumpet
for the goal, a sax soli for the three reasons, trombone riffs under the
exam, trumpets on the path with a half-time tom break at the Agent SDK gap,
stop-time hits for the study app, a short build while the seats fill, and a
full shout chorus when the tenth seat fills.
Writes build/music.wav (44.1 kHz, 16-bit stereo, 120 s).

Band: clean swing drums with no hiss or noise (a soft tonal ride, woody snare,
kick, and toms; no brushes, hats, or whooshes), upright bass, piano, a sax section (four voices plus a baritone),
trumpets and trombones, and vibraphone for the picture hits. Light reverb
from an FFT convolution. Each scene is leveled to the same loudness, then the
mix is set to about -19.5 dBFS RMS under a soft limiter at -4 dBFS.

The drum, bass, vibes, and brass models come from the sibling videos in the
Bitovi vibes repo (video/ai-captains-overview/music.py).
"""
import os
import wave
import numpy as np

SR = 44100
BPM = 150
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = 120.0
N = int(SR * DUR)
NBARS = 75
rng = np.random.default_rng(2026)

dry = np.zeros((2, N))
wet = np.zeros((2, N))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t, pan=0.0, gain=1.0, send=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * gain
    r = np.sin((pan + 1) * np.pi / 4) * gain
    dry[0, i:i + len(sig)] += sig * l
    dry[1, i:i + len(sig)] += sig * r
    if send:
        wet[0, i:i + len(sig)] += sig * l * send
        wet[1, i:i + len(sig)] += sig * r * send


def band(x, lo=None, hi=None):
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, n)


def env_tail(n, rel=0.03):
    e = np.ones(n)
    r = min(n, int(rel * SR))
    e[n - r:] = np.linspace(1, 0, r)
    a = min(n, int(0.003 * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e


# ── instruments ─────────────────────────────────────────────────────
def vibes(m, dur=1.4, vel=0.6):
    f = mtof(m)
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t * 7) \
        + 0.08 * np.sin(2 * np.pi * f * 10.0 * t) * np.exp(-t * 18)
    amp = np.exp(-t * 1.8) * (1 + 0.22 * np.sin(2 * np.pi * 5.6 * t))
    return s * amp * env_tail(n, 0.2) * vel * 1.5


def bass(m, dur, vel=0.8):
    f = mtof(m)
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    bend = 1 + 0.012 * np.exp(-t * 40)
    ph = 2 * np.pi * f * np.cumsum(bend) / SR
    s = np.sin(ph) + 0.55 * np.sin(2 * ph) * np.exp(-t * 4) + 0.25 * np.sin(3 * ph) * np.exp(-t * 9)
    amp = np.exp(-t * 2.4)
    thump = band(rng.standard_normal(n), 80, 600) * np.exp(-t * 60) * 0.25
    return (s * amp + thump) * env_tail(n, 0.04) * vel * 0.42


def kick(vel=0.6):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 52 + 80 * np.exp(-t * 34)
    click = np.sin(2 * np.pi * 900 * t) * np.exp(-t * 400) * 0.06
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) + click) * vel * 0.5


CYM = 10 ** (-7 / 20)   # every cymbal sits 7 dB under the first mix


def ride(vel=0.3):
    """A darker ride: lower bell partials, noise low-passed near 10 kHz."""
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    metal = sum(a * np.sin(2 * np.pi * fr * t + p) for fr, p, a in [(1180, 0, 1.0), (1730, 1, 0.6), (2350, 2, 0.35)]) / 2
    return metal * np.exp(-t * 9) * (1 - np.exp(-t * 600)) * vel * CYM * 0.6


def hat(vel=0.25, open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return np.zeros(n)   # no hats: the hiss made it hard to focus


def snare(vel=0.2):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 200 * t) * np.exp(-t * 30) * 0.5
    wood = np.sin(2 * np.pi * 330 * t) * np.exp(-t * 45) * 0.3
    return (body + wood) * vel * 1.2


def brush(vel=0.2):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 190 * t) * np.exp(-t * 40) * 0.25 * vel   # body only, no brush hiss


def rim(vel=0.25):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 90) + 0.6 * np.sin(2 * np.pi * 820 * t) * np.exp(-t * 70)
    return tone * vel


def clap(vel=0.2):
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    e = np.exp(-t * 30) + 0.6 * np.exp(-np.maximum(t - 0.011, 0) * 30) * (t > 0.011) + 0.4 * np.exp(-np.maximum(t - 0.022, 0) * 25) * (t > 0.022)
    return (np.sin(2 * np.pi * 240 * t) + 0.5 * np.sin(2 * np.pi * 410 * t)) * e * vel * 0.6


def crash(vel=0.4):
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    metal = sum(np.sin(2 * np.pi * fr * t + p) for fr, p in [(880, 0), (1320, 1), (1760, 2), (2200, .3)]) / 4
    return metal * 0.4 * np.exp(-t * 3) * (1 - np.exp(-t * 300)) * vel * CYM * 0.6


def tom(f0=110, vel=0.5):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.45 * np.exp(-t * 22))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    skin = 0
    return (body + skin) * vel * 0.6


def whoosh(dur=0.42, vel=0.13):
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = (t / dur) ** 2.2
    e[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return np.zeros(n)   # no noise whooshes


def riser(dur=1.4, vel=0.1, f0=300, f1=2400):
    """Noise sweeping up through a moving band, plus a rising sine."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    k = 8
    for j in range(k):   # piecewise band filter that climbs
        a, b = j * n // k, (j + 1) * n // k
        fc = f0 * (f1 / f0) ** ((j + 0.5) / k)
        seg = band(noise[max(0, a - 2000):b], fc * 0.6, fc * 1.8)[-(b - a):]
        out[a:b] = seg
    sweep = np.sin(2 * np.pi * np.cumsum(f0 * 0.5 * (f1 / f0) ** u) / SR) * 0.25
    return sweep * 1.6 * (u ** 1.8) * vel   # sine only, no noise band


def swish(dur=0.4, vel=0.08):
    """A brush sweep across the snare head: soft, rounded noise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = np.sin(np.pi * t / dur) ** 1.5
    return np.zeros(n)   # no brush sweeps


def tick(vel=0.1, f=2600):
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 200) * vel


def brass(m, dur=0.28, vel=0.5, dark=1.0):
    """Trumpet (dark=1) or trombone-ish (dark<1): partials under a closing filter, a lip scoop."""
    f = mtof(m)
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * f * np.cumsum(1 - 0.025 * np.exp(-t * 35)) / SR
    fc = (900 + 3200 * np.exp(-t * 7)) * dark
    s = np.zeros(n)
    for h in range(1, 13):
        if f * h > 12000:
            break
        s += np.sin(h * ph) / h / (1 + (f * h / fc) ** 4)
    env = np.minimum(1, t / 0.015) * (0.65 + 0.35 * np.exp(-t * 9))
    k = int(dur * SR)
    env[k:] *= np.exp(-(t[k:] - dur) * 30)
    return s * env * vel * 0.5


def horn(m, dur, vel=0.5, dark=1.0, muted=False):
    """A sustained brass note with a swell, for melody lines."""
    f = mtof(m)
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.18) / 0.2, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib * (1 - 0.02 * np.exp(-t * 30))) / SR
    fc = (1400 + 1800 * np.exp(-t * 5)) * dark
    s = np.zeros(n)
    for h in range(1, 14):
        fh = f * h
        if fh > 11000:
            break
        g = 1 / h / (1 + (fh / fc) ** 3)
        if muted:   # harmon-ish: thin the lows, lift a nasal band
            g *= (1 / (1 + (900 / fh) ** 2)) * (1 + 1.4 * np.exp(-((fh - 1800) / 600) ** 2))
        s += np.sin(h * ph) * g
    env = np.minimum(1, t / 0.03)
    k = int(dur * SR)
    env[k:] *= np.exp(-(t[k:] - dur) * 28)
    return s * env * vel * 0.42


def sax(m, dur, vel=0.5):
    """Saxophone: bright partials with two formant bumps, delayed vibrato, a little breath."""
    f = mtof(m)
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.005 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.15) / 0.2, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    cut = 2000 + 2500 * np.exp(-t * 9)
    s = np.zeros(n)
    for h in range(1, 16):
        fh = f * h
        if fh > 9000:
            break
        form = 1 + 1.5 * np.exp(-((fh - 1300) / 650) ** 2) + 0.7 * np.exp(-((fh - 2800) / 800) ** 2)
        s += np.sin(h * ph) * form / h ** 0.85 / (1 + (fh / cut) ** 2)
    breath = 0
    env = np.minimum(1, t / 0.035) * (0.88 + 0.12 * np.exp(-t * 10))
    k = int(dur * SR)
    env[k:] *= np.exp(-(t[k:] - dur) * 30)
    return (s + breath) * env * vel * 0.13


def piano(m, dur=0.4, vel=0.4):
    f = mtof(m)
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h in range(1, 9):
        fh = f * h * np.sqrt(1 + 0.0004 * h * h)
        if fh > 10000:
            break
        s += np.sin(2 * np.pi * fh * t) * np.exp(-t * (1.4 + h * 0.9)) / h ** 1.2
    hammer = 0
    k = int(dur * SR)
    e = np.ones(n)
    e[k:] = np.exp(-(t[k:] - dur) * 14)
    return (s + hammer) * e * env_tail(n, 0.05) * vel * 0.32


# ── harmony (B-flat major) ──────────────────────────────────────────
CH = {  # root pitch class, chord tones (semitones), comping voicing (midi)
    'Bb6': (10, [0, 4, 7, 9], [62, 65, 67, 70]),
    'Bb69': (10, [0, 4, 7, 9, 14], [62, 67, 70, 72]),
    'Bb7': (10, [0, 4, 7, 10], [62, 65, 68, 70]),
    'Gm7': (7, [0, 3, 7, 10], [62, 65, 67, 70]),
    'Gm9': (7, [0, 3, 7, 10, 14], [62, 65, 69, 70]),
    'G7': (7, [0, 4, 7, 10], [62, 65, 67, 71]),
    'Cm7': (0, [0, 3, 7, 10], [63, 67, 70, 72]),
    'Cm9': (0, [0, 3, 7, 10, 14], [63, 67, 70, 74]),
    'C7': (0, [0, 4, 7, 10], [64, 67, 70, 72]),
    'C9': (0, [0, 4, 7, 10, 14], [64, 67, 70, 74]),
    'F7': (5, [0, 4, 7, 10], [63, 65, 69, 72]),
    'F13': (5, [0, 4, 10, 14], [63, 67, 69, 74]),
    'F7sus': (5, [0, 5, 7, 10], [63, 65, 70, 72]),
    'Eb9': (3, [0, 4, 7, 10, 14], [61, 65, 67, 70]),
    'Ebmaj7': (3, [0, 4, 7, 11], [62, 63, 67, 70]),
    'Ebm6': (3, [0, 3, 7, 9], [60, 63, 66, 70]),
    'D7': (2, [0, 4, 7, 10], [60, 62, 66, 69]),
    'Dm7': (2, [0, 3, 7, 10], [60, 62, 65, 69]),
}
BARS = (['Gm9', 'C9', 'Gm9', 'Ebmaj7', 'F7sus']                            # 0-8 s       hook
        + ['Bb6', 'Gm9', 'Cm9', 'F13', 'Ebmaj7', 'F7sus']                 # 8-17.6      the goal (muted trumpet)
        + ['Bb6', 'G7', 'Cm7', 'F7', 'Bb6', 'Eb9', 'D7', 'Gm7']           # 17.6-30.4   reasons, sax soli A
        + ['Cm9', 'F7', 'Bb6', 'C7', 'Cm7', 'F7', 'F7sus', 'F7sus']       # 30.4-43.2   reasons, soli B
        + ['Bb6', 'Gm7', 'Cm7', 'F7', 'Dm7', 'G7', 'Cm9', 'F7']           # 43.2-56     the exam
        + ['Bb6', 'Bb7', 'Ebmaj7', 'Ebm6', 'Dm7', 'G7', 'Cm7', 'F7sus']   # 56-68.8     question format and score
        + ['Bb6', 'G7', 'Cm7', 'F7']                                      # 68.8-75.2   path, trumpets
        + ['Gm9', 'Ebmaj7', 'Cm9', 'F7sus']                               # 75.2-81.6   the Agent SDK gap
        + ['Bb6', 'G7', 'Cm7', 'F7', 'Bb6', 'Eb9', 'F7sus']               # 81.6-92.8   path, saxes
        + ['Bb6', 'Gm7', 'Cm7', 'F7', 'Dm7', 'G7']                        # 92.8-102.4  the app, stop time
        + ['Dm7', 'Ebmaj7', 'F7sus']                                      # 102.4-107.2 the seats fill
        + ['Bb6', 'Eb9', 'F13', 'Bb6', 'F7sus']                           # 107.2-115.2 shout chorus
        + ['Bb69', 'Bb69', 'Bb69'])                                       # 115.2-120   the button
assert len(BARS) == NBARS


def sec(b):
    if b < 5:
        return 'hook'
    if b < 11:
        return 'goal'
    if 47 <= b <= 50:
        return 'gap'
    if 58 <= b <= 63:
        return 'stop'
    if 64 <= b <= 66:
        return 'build'
    if 67 <= b <= 71:
        return 'shout'
    if b >= 72:
        return 'end'
    return 'swing'


FINAL = 72 * BAR   # 115.2 s, the button
SW = 0.62


def bar_t(b):
    return b * BAR


def pos(b, beat, off=False):
    return bar_t(b) + beat * BEAT + (SW * BEAT if off else 0) + rng.normal(0, 0.003)


def slot(b, s):
    return bar_t(b) + (s // 2) * BEAT + (SW * BEAT if s % 2 else 0)


def low(pc, lo=34):
    m = 34 + ((pc - 10) % 12)        # B-flat 1 = 34 up to A2
    return m if m >= lo else m + 12


def below(m, name, n=3):
    pc, tones, _ = CH[name]
    pcs = set((pc + x) % 12 for x in tones)
    out, k = [], m - 1
    while len(out) < n and k > m - 13:
        if k % 12 in pcs:
            out.append(k)
        k -= 1
    return out


def stab(name, t, vel=0.45, top=None, octave=0, dark=1.0):
    v = [x + octave for x in CH[name][2]] + ([top] if top else [])
    for k, m in enumerate(v):
        place(brass(m, 0.26, vel / len(v) * 2.2, dark), t + k * 0.004, -0.3 + 0.2 * k, 0.4, send=0.25)


# ── drums: brushes lead, the ride stays low and dark ────────────────
SCENE_BARS = (5, 11, 16, 22, 27, 31, 35, 37, 43, 58, 64, 71)
for b in range(NBARS):
    t0 = bar_t(b)
    s = sec(b)
    if b >= 72:
        continue
    if s == 'hook' and b < 2:
        for bt in range(4):
            place(hat(0.14), pos(b, bt), 0.3)
            place(swish(0.36, 0.06), pos(b, bt), -0.2)
        place(kick(0.3), pos(b, 0))
        place(rim(0.14), pos(b, 3, True), 0.2)
        continue
    if s == 'gap':
        place(kick(0.5), pos(b, 0))
        place(snare(0.22), pos(b, 2), -0.1, send=0.2)
        for bt in range(4):
            place(swish(0.38, 0.07), pos(b, bt), -0.2, send=0.1)
            place(ride(0.16), pos(b, bt), 0.35, send=0.05)
        continue
    if s == 'stop':
        for bt in range(4):
            place(swish(0.36, 0.06), pos(b, bt), -0.2)
        place(hat(0.16), pos(b, 1), 0.3); place(hat(0.16), pos(b, 3), 0.3)
        continue
    if s == 'build':
        for bt in range(4):
            place(kick(0.36 + 0.05 * (b - 64)), pos(b, bt))
            place(swish(0.36, 0.07), pos(b, bt), -0.2)
        if b < 66:
            place(brush(0.28), pos(b, 1), -0.1, send=0.12); place(brush(0.28), pos(b, 3), -0.1, send=0.12)
        continue
    shout = s == 'shout'
    # brushes: a sweep on every beat, slaps on 2 and 4
    for bt in range(4):
        place(swish(0.38, 0.08 if shout else 0.07), pos(b, bt), -0.2, send=0.08)
    for bt in (1, 3):
        place(brush(0.34 if shout else 0.28), pos(b, bt), -0.15, send=0.12)
        place(hat(0.16), pos(b, bt), 0.3)
    # a light ride: quarter notes plus the skip on 4
    for bt, off, v in [(0, False, .24), (1, False, .18), (2, False, .22), (3, False, .18), (3, True, .14)]:
        place(ride(v * (1.15 if shout else 1)), pos(b, bt, off), 0.35, send=0.06)
    place(kick(0.46), pos(b, 0))
    place(kick(0.3 if s == 'goal' else 0.34), pos(b, 2))
    if s == 'swing':
        for bt in range(4):
            if rng.random() < 0.3:
                place(snare(0.05), pos(b, bt, True), -0.1)
    if shout:
        place(snare(0.2), pos(b, 3, True), -0.1, send=0.15)
    if b + 1 in SCENE_BARS:
        place(snare(0.22), pos(b, 3, True), -0.1, send=0.2)

# snare roll into the tenth seat (106.0 to 107.2)
for k in range(24):
    place(snare(0.04 + 0.2 * k / 23), 106.0 + k * 1.2 / 24, 0.1, send=0.15)
# toms for the planks, and the fill before the engineer drops in
for k, tt in enumerate([77.2, 77.6, 78.0, 78.4]):
    place(tom([150, 130, 112, 96][k], 0.6), tt, -0.2 + 0.13 * k, send=0.2)
for k, tt in enumerate([5.4, 5.6, 5.8]):
    place(tom([160, 128, 100][k], 0.45), tt, 0.2 - 0.2 * k, send=0.15)

# scene pushes: a soft whoosh and a kick each; a quiet crash only on the biggest changes
for b in SCENE_BARS:
    t = bar_t(b)
    place(kick(0.5), t)
    place(whoosh(), t - 0.44, 0.0, send=0.2)
for t in (8.0, 68.8, 102.4, 113.6):
    place(crash(0.3), t, -0.3, send=0.25)

# ── bass ────────────────────────────────────────────────────────────
for b, name in enumerate(BARS):
    pc, tones, _ = CH[name]
    root = low(pc)
    s = sec(b)
    fifth = root + 7 if root + 7 <= 46 else root - 5
    if b >= 72:
        if b == 72:
            place(bass(34, 3.8, 0.95), FINAL)
        continue
    if s == 'hook' and b < 2:
        place(bass(root, 0.7, 0.75), pos(b, 0)); place(bass(fifth, 0.6, 0.6), pos(b, 2))
        continue
    if s == 'goal':
        place(bass(root, 0.75, 0.8), pos(b, 0)); place(bass(fifth, 0.6, 0.65), pos(b, 2))
        if b % 2:
            place(bass(fifth + 2 if fifth + 2 <= 46 else fifth - 1, 0.2, 0.45), pos(b, 3, True))
        continue
    if s == 'gap':
        place(bass(43, 1.4, 0.85), pos(b, 0))   # G pedal under the gap
        place(bass(43, 0.3, 0.55), pos(b, 2, True))
        continue
    if s == 'stop':
        place(bass(root, 0.9, 0.85), pos(b, 0))
        place(bass(fifth, 0.2, 0.5), pos(b, 3, True))
        continue
    if s == 'build':
        for bt in range(4):
            place(bass(root, 0.3, 0.75), pos(b, bt))
        continue
    nxt = low(CH[BARS[b + 1]][0])
    third, fif = root + tones[1], root + tones[2]
    seven = root + tones[3] - 12 if root + tones[3] > 48 else root + tones[3]
    line_ = [root, rng.choice([third, fif]), rng.choice([fif, seven, third]), nxt + rng.choice([-1, 1])]
    for bt, m in enumerate(line_):
        place(bass(int(m), 0.36, 0.82 if bt == 0 else 0.66), pos(b, bt))
    if rng.random() < 0.25:
        place(bass(int(line_[2]), 0.12, 0.38), pos(b, 2, True))

# ── piano comping ───────────────────────────────────────────────────
for b, name in enumerate(BARS):
    _, _, v = CH[name]
    s = sec(b)
    if b >= 72 or s in ('stop', 'build'):
        continue
    if s == 'gap':
        for k, m in enumerate(v):
            place(piano(m, BAR * 0.9, 0.3), bar_t(b) + k * 0.01, -0.2 + 0.1 * k, 0.5, send=0.3)
        continue
    pat = [(0, False, 0.3), (1, True, 0.22)] if b % 2 == 0 else [(1, False, 0.22), (2, True, 0.25)]
    vel = 0.3 if s in ('goal', 'swing') else 0.24
    for bt, off, d in pat:
        for k, m in enumerate(v):
            place(piano(m, d, vel), pos(b, bt, off) + k * 0.006, -0.2 + 0.1 * k, 0.5, send=0.2)
place(piano(58, 3.5, 0.4), FINAL, -0.2, 0.5, send=0.3)
for k, m in enumerate([62, 67, 70, 72, 77]):
    place(piano(m, 3.5, 0.3), FINAL + k * 0.02, -0.2 + 0.1 * k, 0.5, send=0.35)


# ── melodies ────────────────────────────────────────────────────────
def notes_of(b0, phrase):
    out = []
    for j, bar_notes in enumerate(phrase):
        for s_, m in bar_notes:
            out.append((b0 + j, slot(b0 + j, s_), m))
    return out


def durs(notes, last):
    return [((notes[j + 1][1] - t) * 0.9 if j + 1 < len(notes) else last) for j, (_, t, _) in enumerate(notes)]


def soli(b0, phrase, vel=0.5, last=1.2):
    """Sax section: lead plus three voices below in close position, baritone doubles the lead down an octave."""
    notes = notes_of(b0, phrase)
    for (b, t, m), d in zip(notes, durs(notes, last)):
        name = BARS[b]
        place(sax(m, d, vel), t, 0.0, 0.6, send=0.25)
        for k, mm in enumerate(below(m, name)):
            place(sax(mm, d, vel * 0.62), t + 0.004 * (k + 1), [-0.35, 0.3, -0.15][k], 0.6, send=0.25)
        place(sax(m - 12, d, vel * 0.5), t, 0.2, 0.6, send=0.2)


def trumpets(b0, phrase, vel=0.5, last=1.0, harmonize=True, muted=False):
    notes = notes_of(b0, phrase)
    for (b, t, m), d in zip(notes, durs(notes, last)):
        place(horn(m, d, vel, muted=muted), t, 0.15, 0.6, send=0.3)
        if harmonize:
            for k, mm in enumerate(below(m, BARS[b], 2)):
                place(horn(mm, d, vel * 0.55), t + 0.005 * (k + 1), [0.35, -0.05][k], 0.6, send=0.3)


def shout(b0, phrase, vel=0.55, last=1.2):
    """Full ensemble: trumpets on top, trombones and saxes below."""
    notes = notes_of(b0, phrase)
    for (b, t, m), d in zip(notes, durs(notes, last)):
        v = below(m, BARS[b], 3)
        place(horn(m, d, vel), t, 0.1, 0.6, send=0.3)
        place(horn(v[0], d, vel * 0.6), t + 0.004, 0.3, 0.6, send=0.3)
        place(horn(v[1], d, vel * 0.5), t + 0.008, -0.1, 0.6, send=0.3)
        place(horn(v[2] - 12, d, vel * 0.6, dark=0.55), t, -0.35, 0.6, send=0.3)
        place(horn(m - 12, d, vel * 0.55, dark=0.6), t, -0.2, 0.6, send=0.3)
        place(sax(m - 12, d, vel * 0.6), t, 0.25, 0.6, send=0.25)


THEME_A = [
    [(0, 70), (1, 74), (2, 77), (4, 79), (5, 77), (6, 74)],      # Bb6
    [(0, 71), (2, 74), (3, 77), (4, 74), (6, 71)],               # G7
    [(0, 72), (1, 75), (2, 79), (4, 82), (5, 79), (6, 75)],      # Cm7
    [(0, 77), (2, 75), (3, 72), (4, 69), (6, 72)],               # F7
    [(0, 74), (1, 77), (2, 79), (3, 82), (4, 84), (6, 82)],      # Bb6
    [(0, 82), (2, 79), (3, 77), (4, 75), (6, 73)],               # Eb9
    [(0, 74), (2, 78), (4, 81), (6, 84)],                        # D7
    [(0, 82)],                                                   # Gm7
]
THEME_B = [
    [(0, 79), (1, 82), (2, 84), (4, 86), (6, 84)],               # Cm9
    [(0, 82), (2, 81), (3, 79), (4, 77), (6, 75)],               # F7
    [(0, 74), (2, 77), (4, 82), (5, 81), (6, 82)],               # Bb6
    [(0, 84), (2, 82), (3, 79), (4, 76), (6, 79)],               # C7
    [(0, 79), (1, 82), (2, 84), (4, 87), (6, 84)],               # Cm7
    [(0, 81), (2, 84), (3, 82), (4, 81), (6, 77)],               # F7
    [(0, 79), (4, 77)],                                          # F7sus
    [(0, 77), (2, 79), (4, 82), (6, 84)],                        # F7sus, pickup into the exam
]
GOAL = [
    [(0, 77), (2, 79), (3, 82), (4, 79), (6, 77)],               # Bb6
    [(0, 74), (4, 69)],                                          # Gm9
    [(0, 75), (2, 79), (3, 82), (4, 79), (6, 75)],               # Cm9
    [(0, 74), (4, 72)],                                          # F13
    [(0, 70), (2, 74), (4, 79), (6, 82)],                        # Ebmaj7
    [(0, 84), (4, 82)],                                          # F7sus
]
SHOUT = [
    [(0, 77), (1, 82), (2, 86), (4, 86), (5, 84), (6, 82)],      # Bb6
    [(0, 85), (2, 82), (3, 79), (4, 77), (6, 79)],               # Eb9
    [(0, 81), (1, 84), (2, 86), (4, 87), (6, 86)],               # F13
    [(0, 86), (2, 82), (4, 89), (6, 86)],                        # Bb6
    [(0, 87), (2, 86), (3, 84), (4, 82), (6, 84)],               # F7sus
]
INTRO = [   # the hook: saxes ask, brass answers, then the hit on "Bitovi"
    [(1, 74), (2, 77), (3, 79), (5, 81), (6, 82)],               # Gm9
    [],                                                          # C9 (brass answer)
    [],                                                          # Gm9 (the hit)
    [(0, 82), (2, 79), (4, 77), (6, 74)],                        # Ebmaj7
    [(0, 77), (4, 75)],                                          # F7sus
]

soli(0, INTRO, 0.42, 1.0)
stab('C9', slot(1, 1), 0.42, top=88); stab('C9', slot(1, 3), 0.42, top=88)
trumpets(5, GOAL, 0.42, 1.4, harmonize=False, muted=True)
soli(11, THEME_A, 0.5, 1.4)
soli(19, THEME_B, 0.5, 1.4)
# exam: trombone riffs on beat one and the "and" of two, trumpets answer on the "and" of four
for b in range(27, 43):
    name = BARS[b]
    v = CH[name][2]
    for s_ in (0, 3):
        for k, m in enumerate(v[:3]):
            place(brass(m - 12, 0.22, 0.3, dark=0.6), slot(b, s_) + 0.004 * k, -0.3 + 0.15 * k, 0.5, send=0.25)
    if b % 2 == 1:
        stab(name, slot(b, 7), 0.28)
trumpets(43, THEME_A[:4], 0.5, 1.0)
for b in range(47, 51):   # the gap: low trombones hold, a lonely muted trumpet asks
    for k, m in enumerate(CH[BARS[b]][2][:3]):
        place(horn(m - 12, BAR * 0.92, 0.26, dark=0.55), bar_t(b) + 0.004 * k, -0.3 + 0.15 * k, 0.5, send=0.35)
trumpets(47, [[(0, 74), (4, 77)], [(0, 79), (4, 74)], [(0, 75), (4, 79)], [(0, 82), (4, 84)]], 0.34, 1.2, harmonize=False, muted=True)
soli(51, THEME_A[:6] + [[(0, 77), (2, 79), (4, 82), (6, 84)]], 0.5, 1.0)
# stop time: the band hits on each study mode, piano answers
for k, tt in enumerate([93.12, 93.76, 94.4, 95.04]):
    stab(BARS[58], tt, 0.5, top=[82, 84, 86, 89][k]); place(kick(0.5), tt)
for b in range(60, 64):
    for s_, m in [(1, 82), (2, 84), (3, 86), (5, 89), (6, 86)] if b % 2 else [(1, 77), (3, 79), (4, 82), (6, 79)]:
        place(piano(m, 0.2, 0.35), slot(b, s_), 0.25, 0.5, send=0.2)
    stab(BARS[b], slot(b, 0), 0.4)
# the seats fill: a sustained swell that climbs
for j, b in enumerate(range(64, 67)):
    for k, m in enumerate(CH[BARS[b]][2]):
        sig = horn(m, BAR * 0.95, 0.26 + 0.05 * j)
        sig *= np.linspace(0.5, 1.0, len(sig))
        place(sig, bar_t(b) + 0.004 * k, -0.3 + 0.2 * k, 0.6, send=0.35)
    lead = horn([81, 82, 84][j] + 12, BAR * 0.95, 0.32 + 0.06 * j)
    place(lead * np.linspace(0.5, 1.0, len(lead)), bar_t(b), 0.15, 0.6, send=0.35)
shout(67, SHOUT, 0.55, 1.0)
# the button: B-flat 6/9, trumpets on top
for k, m in enumerate([58, 62, 67, 70, 72, 74, 79, 86]):
    place(horn(m, 3.0, 0.32 if m > 70 else 0.26, dark=0.6 if m < 64 else 1.0), FINAL + k * 0.004, -0.4 + 0.11 * k, 0.6, send=0.4)
for k, m in enumerate([74, 79, 82, 86, 91]):
    place(vibes(m, 3.0, 0.24), FINAL + k * 0.05, 0.3, 0.3, send=0.4)
place(crash(0.3), FINAL, -0.3, send=0.3); place(kick(0.7), FINAL)

# ── hits that line up with the picture (times match anim.js) ────────
for k, m in enumerate([74, 77, 79, 81, 76, 79, 82, 84]):          # client work chips pop in
    place(vibes(m, 0.5, 0.28), 0.4 + k * 0.35, 0.3, 0.3, send=0.4)
stab('Gm9', 3.2, 0.65, top=86); place(kick(0.7), 3.2)             # Bitovi
stab('Ebmaj7', 6.0, 0.5, top=86); place(kick(0.6), 6.0)           # the engineer lands
for k, m in enumerate([74, 77, 82, 86]):                          # what recognition looks like
    place(vibes(m, 1.4, 0.24), 9.4 + k * 0.04, 0.3, 0.3, send=0.45)
for k in range(10):                                               # ten empty seats
    place(vibes([70, 72, 74, 75, 77, 79, 81, 82, 84, 86][k], 0.3, 0.14), 13.1 + k * 0.12, 0.3, 0.3, send=0.35)
place(vibes(89, 0.8, 0.2), 15.0, 0.3, 0.3, send=0.4)
stab('Bb6', 18.8, 0.42, top=86); place(clap(0.2), 18.8)           # the credential
place(kick(0.5), 20.8); place(clap(0.24), 20.8)                   # your name
for k in range(9):
    place(vibes([86, 89, 91, 94, 89, 91, 94, 98, 94][k], 0.4, 0.14), 21.6 + k * 0.4, 0.4, 0.3, send=0.45)
for k in range(4):
    place(vibes([77, 81, 84, 86][k], 0.5, 0.26), 26.44 + k * 0.28, 0.3, 0.3, send=0.4)   # subagents
    place(rim(0.2), 27.56 + k * 0.28, 0.2)                                              # tools
stab('Gm7', 30.08, 0.42, top=86)                                                         # level up
place(vibes(82, 0.5, 0.24), 31.4, 0.3, 0.3, send=0.4)                                    # Bitovi
stab('Cm9', 31.8, 0.42, top=84)                                                          # our clients
for k, tt in enumerate([32.4, 32.8, 33.2]):
    place(vibes([79, 84, 87][k], 0.5, 0.26), tt, 0.3, 0.3, send=0.4)                    # value grows
stab('F7', 33.6, 0.48, top=89)
for k, A in enumerate([36.4, 38.0, 39.6, 41.2]):                                         # engineering projects
    place(rim(0.22), A, 0.2); place(kick(0.4), A)
    for j in range(3):
        place(tick(0.05, 1900 + 200 * j), A + 0.25 + j * 0.25, -0.2)
    place(vibes([82, 84, 86, 89][k], 0.5, 0.26), A + 1.0, 0.3, 0.3, send=0.4); place(clap(0.16), A + 1.0)
place(vibes(86, 0.6, 0.2), 39.4, 0.3, 0.3, send=0.4)                                     # agentic engineering
for k in range(5):
    place(vibes([70, 74, 77, 79, 82][k], 0.5, 0.26), 43.7 + k * 0.4, 0.3, 0.3, send=0.4)  # domain bars
stab('Dm7', 46.8, 0.45, top=86)                                                          # the biggest domain
for k in range(6):
    place(tick(0.06, 2200), 49.8 + k * 0.16, 0.3)                                        # cards dealt
place(whoosh(0.4, 0.08), 52.2, 0.3, send=0.2)
for k in range(4):
    place(tick(0.06, 1700), 52.88 + k * 0.16, -0.3)
for k, tt in enumerate([53.92, 54.4, 54.88, 55.36]):                                     # four of six
    stab(BARS[int(tt // BAR)], tt, 0.38, top=[82, 84, 86, 89][k]); place(vibes([82, 84, 86, 89][k], 0.5, 0.22), tt, 0.3, 0.3, send=0.4)
place(vibes(86, 0.6, 0.3), 57.3, 0.3, 0.3, send=0.4)                                     # best answer
for tt in (57.6, 57.9, 58.2):
    place(rim(0.22), tt, 0.2); place(brass(46, 0.18, 0.2, dark=0.5), tt, -0.2, send=0.2)
place(riser(1.5, 0.07, 400, 2600), 59.7, 0.0, send=0.25)                                 # the dial sweeps
stab('Ebmaj7', 61.6, 0.5, top=86)                                                        # 720: pass
place(riser(0.9, 0.07, 800, 3200), 62.8, 0.0, send=0.25)                                 # on past 900
stab('Dm7', 64.0, 0.52, top=89); place(vibes(89, 0.8, 0.24), 64.0, 0.3, 0.3, send=0.4)
for k in range(15):
    place(tick(0.05, 2000 + 60 * k), 66.0 + k * 0.13, 0.2)
for k in range(4):
    place(vibes([74, 77, 79, 82][k], 0.5, 0.24), 69.6 + k * 0.4, 0.3, 0.3, send=0.4)    # courses
    place(tick(0.06, 2400), 72.2 + k * 0.4, 0.2)
stab('Gm9', 75.4, 0.42, octave=-12, dark=0.7)                                            # the gap
for k in range(4):
    place(vibes([79, 82, 84, 86][k], 0.4, 0.22), 76.8 + k * 0.4, 0.3, 0.3, send=0.4)
place(kick(0.55), 80.8); place(clap(0.2), 80.8)                                          # across the bridge
for k in range(4):
    place(vibes([77, 79, 82, 84][k], 0.4, 0.22), 82.0 + k * 0.4, 0.3, 0.3, send=0.4)    # app modes
place(tick(0.1, 1500), 85.4, 0.1)                                                        # request access
for k, m in enumerate([77, 82, 86]):
    place(vibes(m, 1.0, 0.24), 86.6 + k * 0.05, 0.3, 0.3, send=0.45)                   # your exam is ready
for k in range(3):
    place(tick(0.06, 2400), 88.6 + k * 0.33, 0.2)
stab('Bb6', 89.6, 0.5, top=86); place(clap(0.22), 89.6)                                  # pass
EARN = 90.4
stab('Eb9', EARN, 0.55, top=89)                                                          # the medal
for k, m in enumerate([82, 86, 89, 94]):
    place(vibes(m, 1.2, 0.22), EARN + k * 0.05, 0.3, 0.3, send=0.45)
for tt in (96.96, 97.28, 97.6):                                                          # distractors
    place(rim(0.24), tt, 0.2); place(brass(41, 0.2, 0.22, dark=0.5), tt, -0.2, send=0.2)
place(vibes(86, 0.8, 0.3), 97.92, 0.3, 0.3, send=0.4)                                    # the best answer
for k, tt in enumerate([99.2, 99.8, 100.4]):                                             # practice scores climb
    place(vibes([77, 82, 86][k], 0.5, 0.26), tt, 0.3, 0.3, send=0.4)
stab('Dm7', 100.8, 0.5, top=89)                                                          # 900+
SEAT_NOTES = [70, 72, 74, 75, 77, 79, 81, 82, 84]
for k in range(9):                                                                       # one hit per seat
    tt = 103.6 + k * BEAT
    place(vibes(SEAT_NOTES[k] + 12, 0.6, 0.3), tt, 0.3, 0.3, send=0.4)
    place(brass(SEAT_NOTES[k], 0.2, 0.22), tt, -0.1, 0.5, send=0.2); place(kick(0.4), tt)
place(riser(0.9, 0.08, 500, 3200), 106.3, 0.0, send=0.3)                                 # the engineer jumps in
stab('Bb6', 107.2, 0.6, top=89); place(crash(0.3), 107.2, -0.3, send=0.3); place(kick(0.7), 107.2)
for k in range(9):
    place(tick(0.07, 2900), 107.4 + k * 1.0 / 9, 0.15)                                   # the name types in
stab('Eb9', 108.8, 0.55, top=91); place(kick(0.6), 108.8)
for k, m in enumerate([82, 86, 89, 94]):
    place(vibes(m, 1.4, 0.24), 108.8 + k * 0.05, 0.3, 0.3, send=0.45)
place(vibes(86, 0.8, 0.26), 114.1, 0.3, 0.3, send=0.4)

# ── reverb, leveling, master ────────────────────────────────────────
ir_n = int(2.0 * SR)
ti = np.arange(ir_n) / SR
irs = []
for ch in range(2):
    ir = rng.standard_normal(ir_n) * np.exp(-ti * 3.2)
    ir = band(ir, 250, 6000)
    ir[: int(0.012 * SR)] = 0
    irs.append(ir / np.sqrt(np.sum(ir ** 2)))
L = N + ir_n
nfft = 1 << (L - 1).bit_length()
out = dry.copy()
for ch in range(2):
    rev = np.fft.irfft(np.fft.rfft(wet[ch], nfft) * np.fft.rfft(irs[ch], nfft), nfft)[:N]
    out[ch] += rev * 0.55

for ch in range(2):   # gentle low shelf cut below 90 Hz
    X = np.fft.rfft(out[ch])
    f = np.fft.rfftfreq(N, 1 / SR)
    g = 1 - 0.4 / (1 + (f / 90) ** 4)
    g[f < 25] *= (f[f < 25] / 25) ** 2
    out[ch] = np.fft.irfft(X * g, N)

# level every scene to the same RMS (within limits), with short ramps at the cuts
CUTS = [0, 8.0, 17.6, 43.2, 68.8, 92.8, 102.4, 107.2, 113.6, FINAL]
rms = []
for a, b_ in zip(CUTS[:-1], CUTS[1:]):
    seg = out[:, int((a + 0.5) * SR):int(b_ * SR)]
    rms.append(np.sqrt(np.mean(seg ** 2)))
target = float(np.median(rms))
gains = [float(np.clip(target / r, 0.6, 1.6)) for r in rms]
t = np.arange(N) / SR
pts_t, pts_g = [0.0], [gains[0]]
for k in range(1, len(gains)):
    pts_t += [CUTS[k] - 0.25, CUTS[k] + 0.1]
    pts_g += [gains[k - 1], gains[k]]
pts_t.append(DUR); pts_g.append(gains[-1])
out *= np.interp(t, pts_t, pts_g)
print('scene gains (dB):', ' '.join(f'{20 * np.log10(x):+.1f}' for x in gains))

shape = np.interp(t, [0, 0.05, 117.5, 120.0], [0.0, 1.0, 1.0, 0.0])
shape *= np.where(t > 117.5, np.cos(np.clip((t - 117.5) / 2.5, 0, 1) * np.pi / 2) ** 2, 1)
out *= shape
out -= out.mean(axis=1, keepdims=True)

# set the body of the mix to about -19.5 dBFS RMS under a soft limiter with a -4 dBFS ceiling
CEIL = 10 ** (-4.0 / 20)
TARGET = 10 ** (-19.5 / 20)
body = slice(int(0.5 * SR), int(FINAL * SR))
g = TARGET / np.sqrt(np.mean(out[:, body] ** 2))
for _ in range(4):
    y = CEIL * np.tanh(g * out / CEIL)
    g *= TARGET / np.sqrt(np.mean(y[:, body] ** 2))
out = CEIL * np.tanh(g * out / CEIL)

here = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(here, 'build'), exist_ok=True)
path = os.path.join(here, 'build', 'music.wav')
pcm = (np.clip(out.T, -1, 1) * 32767).astype('<i2')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
rms_body = 20 * np.log10(np.sqrt(np.mean(out[:, body] ** 2)))
print(f'wrote {path}: {N / SR:.1f} s, peak {20 * np.log10(np.max(np.abs(out))):.1f} dBFS, body RMS {rms_body:.1f} dBFS')
