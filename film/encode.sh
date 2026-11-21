#!/usr/bin/env bash
# Frames + mix → film/out/artha-demo.mp4 (H.264 1080p30, AAC, soft English subtitles) and a small preview GIF.
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -loglevel error -framerate 30 -i film/build/frames/f%05d.jpg -i film/build/mix.wav \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -t 200.1 film/out/artha-demo.mp4
ffmpeg -y -loglevel error -ss 104 -t 6 -i film/out/artha-demo.mp4 -vf "fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" film/out/artha-demo-preview.gif
ls -la film/out
