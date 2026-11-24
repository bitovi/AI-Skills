# CCA-F overview video

Source for the two-minute motion-graphics overview shown at the top of the Study page
(`src/components/study/OverviewVideo.tsx`). It encourages Bitovi engineers to study for and
take the Claude Certified Architect - Foundations exam. This folder is not part of the app
build. Only the two outputs in `public/` ship.

It follows the pipeline of the sibling overview videos in the Bitovi vibes repo
(`video/ai-captains-overview/` and others): one canvas, a pure `seek(t)`, Playwright frames,
numpy music, and an ffmpeg encode. Colors follow this app's dark theme (`src/theme.css`) with
Bitovi red as the accent. Fonts are Inter and JetBrains Mono, the same as the app.

## Files

| File | What it does |
|---|---|
| `index.html` | Loads the fonts and `anim.js`. Open it through a local server to scrub and preview with music. |
| `anim.js` | The whole animation on one canvas. `seek(t)` draws the exact frame for time `t`. No wall clock, seeded randomness only. |
| `music.py` | Synthesizes the original big band track with numpy into `build/music.wav`. |
| `render.cjs` | Headless Chromium (Playwright) steps through every frame and writes PNGs. Several pages run in parallel. It is `.cjs` because the repo's `package.json` sets `"type": "module"`. |
| `make.sh` | Music, frames, H.264 + AAC encode, and the poster JPG. |
| `fonts/` | Inter and JetBrains Mono (latin subset, SIL Open Font License) from Google Fonts, so rendering is deterministic. |

## Re-render

```bash
bash video/cca-f-overview/make.sh          # several minutes on 4 cores
CRF=23 WORKERS=8 bash video/cca-f-overview/make.sh
```

Needs Python 3 with numpy, Node with Playwright and Chromium, and ffmpeg.
`build/frames/` takes about 5 GB while it exists. Delete it when you are done.

Outputs:

- `public/cca-f-overview.mp4` (1280x720, 30 fps, 120 s, H.264 High and AAC stereo)
- `public/cca-f-overview-poster.jpg` (frame at 117 s, the end card)

## Preview and stills

```bash
python3 -m http.server 8899 --directory video/cca-f-overview
# open http://localhost:8899/index.html  (add ?t=42 to jump to a time)

node video/cca-f-overview/render.cjs --stills 12,24,60   # PNGs in build/stills/
```

## Timing

The music is 150 BPM in B-flat major, so one bar is 1.6 seconds and 75 bars are exactly
120 seconds. Every scene starts on a bar line, and scenes push in from the right with a 0.8 s
overlap.

| Time (s) | Scene | Music |
|---|---|---|
| 0 to 8 | Hook: client engineering work (each chip with an agent icon) pops in, "Bitovi" lands in the middle and pulls it in. The engineer drops in | Saxes ask, brass answers, a band hit on "Bitovi" |
| 8 to 17.6 | The goal, officially recognized Anthropic Partners: "Bitovi" next to a faint "Anthropic", and 10 empty seats labelled "10 certified architects" | Muted trumpet over a two-feel |
| 17.6 to 25.6 | Reason 1, notoriety: the engineer on a podium, a generic credential card | Sax soli, theme A |
| 25.6 to 35.2 | Reason 2, capabilities: a coordinator, subagents, tools, and a loop, and a skill ring fills. Then the skill flows through Bitovi to a client building whose value bars rise | Sax soli |
| 35.2 to 43.2 | Reason 3, more leads: engineering project cards arrive, agents and the engineer build each one, and it ships | Sax soli, theme B |
| 43.2 to 49.6 | The exam: five domain bars grow to their weights | Trombone riffs, trumpet answers |
| 49.6 to 56 | Six production scenarios, shuffled, four flip up | Walking swing, a hit on each flip |
| 56 to 59.2 | Multiple choice: one best answer, three distractors | Walking swing |
| 59.2 to 68.8 | The score dial settles on the 720 pass mark, then pushes past the 900 practice target. A sheet of answers fills in | Risers, a hit on 720 and on 900 |
| 68.8 to 92.8 | The path: four courses, the Agent SDK gap bridged plank by plank, this app, the "Your exam is ready" email, and the exam. The medal is earned at 90.4 | Trumpets, a half-time tom break at the gap, saxes |
| 92.8 to 102.4 | This study app: the four modes light up, distractors get crossed out, then practice scores climb past 900 | Stop time, one band hit per mode |
| 102.4 to 113.6 | The payoff, just 10: the seats fill one per beat, the engineer takes the tenth, and "Anthropic" types in next to "Bitovi" | A swell while the seats fill, a snare roll, then the shout chorus at 107.2 |
| 113.6 to 120 | End card: start studying today, the URL, and the four study modes. Final chord at 115.2 | B-flat 6/9 button |

Some scenes reuse their first timing through a time shift in the `SCENES` table (reason 1, the
scenario cards, the question format, the path, and the first half of the app scene), so their inner
times in `anim.js` are one bar off, or slightly compressed, from the clock times above.

The engineer travels through every scene, and the medal on their badge stays hollow until it is
earned at the end of the path.

## Content rules

- No people are named. The target is stated: 10 certified architects. The video never shows or
  implies how many are certified today. The seats are empty in the goal scene, and in the payoff
  they fill one per beat as a picture of the finish, never resting part full.
- No real logos and no official badge designs. "Bitovi" and "Anthropic" are plain text in
  Inter. The medal is a generic shape.
- Facts come only from the brief: the four Learning Path courses (3 to 4 days), the Agent SDK
  gap, the five domain weights, four of six scenarios, multiple choice, a scaled score of 100
  to 1,000 with 720 to pass, a 900+ target on practice exams, no penalty for guessing, free for
  Bitovi engineers, and a full legal name on the account. The practice score bars in the app
  scene are an illustration and carry no numbers.

## Mix

The drums are made only from tones: kick, a woody snare, a soft bell-like ride, and toms. There are
no brushes, hats, noise sweeps, or whooshes, because listeners heard them as static. The sax breath
and piano hammer noise are also off. Less than 0.1% of the energy sits above 6 kHz. Each scene is
leveled to the same loudness, then the mix is set to about -19.5 dBFS RMS under a soft limiter at
-4 dBFS, so the encoded peaks stay near -5 dBFS.

To change a caption, edit `CAPS` in `anim.js`. Picture hits in `music.py` use the same times as
`anim.js`, so move both together.
