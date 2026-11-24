---
name: overview-video
description: Make a snappy animated overview video (motion graphics plus original music in a style you pick, any length) for a web page, embed it at the top of the page, and write a short Slack post to share it. Use when asked for an "overview video", "explainer video", "promo video", or "a video for this page".
argument-hint: page-url-or-topic
---
# Overview Video

Build a short motion-graphics video that explains one page or one ask, with original music, and embed it at the top of that page. Two minutes is the default. Length, tempo, and music style are set in one file, `video.json`.

The result should feel modern, snappy, and fun. It is **never** an animated slide deck. Every point gets an animated picture, and the caption only backs it up.

Everything is rendered from code, so it is deterministic and easy to change:

- `video.json` sets the name, duration, tempo (BPM), music style, key, fps, and optional music hits
- `anim.js` draws every frame on one canvas with a pure `seek(t)` function
- `music.py` synthesizes the music with numpy
- `render.cjs` steps headless Chromium (Playwright) through every frame
- `make.sh` runs music, frames, ffmpeg encode, and poster in one command

Output: 1280x720, H.264 High (yuv420p, `+faststart`) and AAC stereo. A 120 s video is about 12 MB.

## Arguments

The user invoked this with: $ARGUMENTS

## Files in this skill

| Path | What it is |
|---|---|
| `template/` | A working starter. Copy it into the target repo as `video/<name>/`. It renders a short demo out of the box. |
| `template/video.json` | The one place to set length, tempo, style, key, and fps. Every other file reads it. |
| `template/music.py` | Music starter with six styles: `swing`, `lofi`, `synthpop`, `funk`, `acoustic`, `cinematic`. Add your own in `STYLES`. |
| `template/anim.js` | Helpers (easing, chips, icons, bursts, curves, a robot), background with bokeh and grain, push transitions, caption pill, header, top-right chapter tracker, and a demo scene table |
| `template/render.cjs` | Frame renderer. `node render.cjs` for all frames, `node render.cjs --stills 12,24` for test stills. `.cjs` so it works in repos with `"type": "module"`. |
| `template/make.sh` | `OUT_DIR=../../public bash make.sh` runs everything and names the files from `video.json` |
| `template/index.html` | Preview page with a scrubber and music. Add `?t=42` to jump. |
| `template/fonts/` | Inter and JetBrains Mono (latin subset, SIL Open Font License), local so renders are identical |
| `reference/music-bigband-example.py` | A finished 150 BPM big band track from a shipped video, with horn sections and hits tied to the picture. Use it when you want a fuller arrangement than the starter. |
| `reference/README-example.md` | The README of that shipped video: timing table, content rules, and mix notes. Use it as the model for your README. |

Needs Python 3 with numpy, Node with Playwright and Chromium, and ffmpeg.

## Step 1: Gather the facts

1. Read the target page, plus any links the user gives (wiki pages, course pages, repos).
2. Write down the facts you will use. **Use only facts from these sources.** Do not invent numbers, names, or claims.
3. Ask, or decide and say, what the viewer should **do** after watching. That is the end card.
4. Note what must stay out. For a public page, leave out internal links, client names, people's names, internal counts, and real logos or badge art. Use plain text for brand names.

Also pick, or ask about:

- **Length.** Two minutes is the default. 30 to 60 s works for a teaser, up to 3 minutes for a walkthrough.
- **Music style.** Match the audience and the page. Swing big band is fun and upbeat. Lofi is calm. Synthpop feels techy. Funk is playful. Acoustic is warm. Cinematic feels big.

## Step 2: Set up and write the story

Copy `template/` to `video/<name>/` in the target repo (keep `build/` git-ignored), then edit `video.json`:

```json
{ "name": "my-overview", "duration": 120, "bpm": 150, "style": "swing", "key": "Bb", "fps": 30, "hits": [8.0, 17.6] }
```

- The video length is rounded to a **whole number of bars** at that BPM. `anim.js`, `render.cjs`, and `music.py` all use the same rule, so they always match. Example: 30 s at 90 BPM becomes 11 bars, which is 29.33 s.
- `hits` are times in seconds that get a band hit. Use your scene cuts and key picture moments.
- Good tempos: 140 to 160 for swing, 80 to 95 for lofi, 110 to 125 for synthpop, funk, or acoustic, 90 to 110 for cinematic.

Plan the scenes in a table before writing any code. Use about one scene per 10 to 12 seconds. A shape that works, shown as a share of the length:

| Share | Scene | Job |
|---|---|---|
| First 7% | Hook | The problem or the ask, in one picture |
| Next 10% | The goal | What success looks like |
| Next 20% | Reasons or parts | One scene per reason, each with its own picture |
| Next 40% | How it works or the path | Steps, shown as a journey |
| Next 15% | Payoff | The finish, shown with motion |
| Last 4 bars | End card | The call to action and the URL |

For a 30 s teaser, keep only hook, one reason, payoff, and end card.

Rules:

- **One point per scene.** Each scene has a picture that moves: things fill, connect, stack, ship, or light up.
- **One travelling object or character** moves through every scene and ties the story together.
- **Captions:** one short sentence each, with *highlighted* key words, on screen for at least 2.5 s.
- **Scenes cut on bar lines** of the music. Place them with `bar(k)` or `barAt(fraction)` in `anim.js`, never with raw seconds, so they stay on the beat if the length or tempo changes.
- **Writing style:** plain words, short sentences, no em dashes, no "not X, but Y". Factual and upbeat, not dramatic.

## Step 3: Build the animation

1. Set the colors in `C` to match the target site's theme.
2. Replace `T`, `PANS`, `SCENES`, `CAPS`, `HDR`, and the demo scene functions with your story. `DUR`, `BAR`, `BEAT`, and `NBARS` come from `video.json`.
3. Keep `seek(t)` a pure function of `t`. No `Date`, no `Math.random` (use `rng(seed)`), no CSS animation.

Design rules learned from review:

- Text at 24 px or larger. Titles shrink to fit, never overflow.
- No dense boxes of text, and no large empty areas. Fill the frame with motion.
- Push transitions with a 0.8 s overlap, speed lines, and small bursts on key beats.
- A large progress pill (top right) shows the chapter and progress.
- The poster is the frame 3 s before the end, which should be the end card. Set `POSTER_FRAME` to pick another.

Check often with stills:

```bash
node render.cjs --stills 4,12,30,60,90,117
ffmpeg -i build/stills/t%*.png ...   # or tile them into a contact sheet with xstack
```

Look at every still. Check for overlaps, cut-off text, captions that hide the picture, and empty frames.

## Step 4: Make the music

`python3 music.py` reads `video.json` and writes `build/music.wav`. It prints the style, bars, length, peak, and high-end energy.

To make it your own:

- Pick a style, tempo, and key in `video.json`, and list `hits` that match your `anim.js` times.
- To add a style, add an entry to `STYLES` with a chord `loop`, a `swing` ratio (0.5 is straight, about 0.64 is swung), and the `drums`, `bass`, `comp`, and `lead` parts. Add new patterns or sounds in the matching sections.
- For a fuller big band arrangement, start from `reference/music-bigband-example.py`. Change its `CUTS` and hit times to match your video.

Mix rules (from listener feedback):

- **No hiss.** Do not use brushes, hi-hats, noise sweeps, or noise whooshes. Listeners called them "static" and said they made it hard to focus. Make every drum and effect from tones: kick, a woody snare, a soft bell-like ride, toms, sine risers. The example file already does this.
- Keep energy above 6 kHz low: under 0.1% for soft styles. Bright synth styles land near 1%, which is tonal brightness, not hiss. Measure it.
- Level each scene to the same loudness, then set the body of the mix to about -19.5 dBFS RMS under a soft limiter at -4 dBFS.
- Put a band hit or vibraphone note on each key picture moment.

Measure the high end:

You cannot hear the track. Say so when you hand it over, and ask the user to listen.

## Step 5: Render and check

```bash
OUT_DIR=<public dir> bash video/<name>/make.sh
ffprobe -v error -show_entries format=duration,size -of csv=p=0 <public dir>/<name>.mp4
```

A 120 s video takes about 3 to 4 minutes on 4 cores, and `build/frames/` takes about 5 GB. Delete it when done.

To change **only the music**, keep the picture and swap the audio track:

```bash
python3 music.py
ffmpeg -y -i <name>.mp4 -i build/music.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -ac 2 -movflags +faststart -shortest new.mp4
```

Make a contact sheet of about one frame per scene and look at it before sharing.

## Step 6: Embed it

Put the player at the top of the page, under the main heading:

- `<video controls preload="metadata" playsinline poster="...">` with the mp4. No autoplay.
- Full width of the content column, rounded corners, `aspect-ratio: 16 / 9`.
- A short label above it, for example "Watch the two-minute overview".
- Use the site's base path for the URLs (for example `import.meta.env.BASE_URL` in Vite, or `{{BP}}` in hand-built pages).
- Check it at desktop and phone widths, in light and dark themes.

Add a README in `video/<name>/` with the files, the re-render command, a timing table, content rules, and mix notes. See `reference/README-example.md`.

## Step 7: Review loop

1. Send the user the mp4 to review, and say which music style and length you used, before opening a pull request.
2. List the story in one line per scene, plus any weak spots you know about.
3. Apply their notes, re-render, and send the new version. Repeat until they say ship it.
4. Then open the pull request, merge when told, and confirm the live mp4 has the expected `content-length`.

## Step 8: Write the Slack post (optional)

If the video asks people to do something, offer a short Slack post to share it. Use Slack formatting (`*bold*`, `•` bullets, numbered steps) and full URLs.

```
*<One-line ask, with the target if there is one>* 🎓

<One or two sentences: why it matters to the company.>

*Why do it*
• <benefit 1>
• <benefit 2>
• <benefit 3>

*Watch the overview video:* <page URL with the video>

*How to get there*
1. <first resource>: <URL>
2. <next resource>: <URL>
3. <practice or tool>: <URL>

*Tip:* <one practical tip>

Reply here or DM me with questions, and post in the thread when you're done! 🎉
```

Keep it brief. Do not name people or share counts the video leaves out.
