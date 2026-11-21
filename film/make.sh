#!/usr/bin/env bash
# Build one film end to end: frames → mix → encode → soft subtitles → copy to the submission folder.
# Usage: film/make.sh en | film/make.sh hi
set -euo pipefail
cd "$(dirname "$0")/.."
L=${1:-en}; SUF=$([ "$L" = en ] && echo "" || echo "-$L"); FR=$([ "$L" = en ] && echo film/build/frames || echo "film/build/frames-$L")
FILM_LANG=$L node film/narrate.mjs > /dev/null
FILM_LANG=$L node film/render.mjs frames 30
FILM_LANG=$L node film/mix.mjs
TOTAL=$(python3 -c "import json;print(round(json.load(open('film/build/timeline$SUF.json'))['total'],2))")
ffmpeg -y -loglevel error -framerate 30 -i "$FR/f%05d.jpg" -i "film/build/mix$SUF.wav" -map 0:v -map 1:a \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -t "$TOTAL" "film/build/av$SUF.mp4"
SUBLANG=$([ "$L" = en ] && echo eng || echo hin)
ffmpeg -y -loglevel error -i "film/build/av$SUF.mp4" -i "film/out/artha-demo$SUF.srt" -map 0:v -map 0:a -map 1:s -c:v copy -c:a copy \
  -c:s mov_text -metadata:s:s:0 language=$SUBLANG -movflags +faststart "film/out/artha-demo$SUF.mp4"
mkdir -p ~/Desktop/FL/Artha-Submission
cp "film/out/artha-demo$SUF.mp4" "film/out/artha-demo$SUF.srt" ~/Desktop/FL/Artha-Submission/
echo "DONE $L: $(ffprobe -v error -show_entries format=duration -of csv=p=0 film/out/artha-demo$SUF.mp4)s"
