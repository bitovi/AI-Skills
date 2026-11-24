#!/usr/bin/env bash
# Re-render the overview video from source.
#   OUT_DIR=../../public bash make.sh
# Name, duration, tempo, style, and fps come from video.json.
# Writes build/ (git-ignored), then <name>.mp4 and <name>-poster.jpg into OUT_DIR.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cfg() { python3 -c "import json,sys; print(json.load(open('$HERE/video.json')).get(sys.argv[1], sys.argv[2]))" "$1" "$2"; }
NAME="${NAME:-$(cfg name overview)}"
FPS="$(cfg fps 30)"
OUT_DIR="${OUT_DIR:-$HERE/build/out}"
mkdir -p "$OUT_DIR"
cd "$HERE"

echo "1/4 music"
python3 music.py

echo "2/4 frames"
rm -rf build/frames
WORKERS="${WORKERS:-4}" node render.cjs

echo "3/4 encode"
ffmpeg -loglevel error -y -framerate "$FPS" -i build/frames/f%05d.png -i build/music.wav \
  -c:v libx264 -profile:v high -preset slow -crf "${CRF:-21}" -pix_fmt yuv420p -tune animation \
  -c:a aac -b:a 160k -ac 2 -movflags +faststart -shortest \
  "$OUT_DIR/$NAME.mp4"

echo "4/4 poster (the end card, 3 s before the end unless POSTER_FRAME is set)"
LAST=$(ls build/frames | tail -1 | tr -dc 0-9)
POSTER_FRAME="${POSTER_FRAME:-$(printf %05d $((10#$LAST - 3 * FPS)))}"
ffmpeg -loglevel error -y -i "build/frames/f$POSTER_FRAME.png" -q:v 3 "$OUT_DIR/$NAME-poster.jpg"

ls -lh "$OUT_DIR/$NAME.mp4" "$OUT_DIR/$NAME-poster.jpg"
echo "Delete build/frames when done (about 5 GB)."
