#!/bin/bash
# Cut main's rendered course art into the files the Course panel reads. Local only, no model calls.
# Usage: tools/course_art.sh <dir holding course_icons_1..3.png and course_cover.png>
set -euo pipefail
SRC=${1:?source art/raw dir}; cd "$(dirname "$0")/.."
mkdir -p art/raw art/course
for n in 1 2 3; do
  cp "$SRC/course_icons_$n.png" art/raw/
  [ -f "$SRC/course_icons_$n.png.prompt.json" ] && cp "$SRC/course_icons_$n.png.prompt.json" art/raw/
  python3 tools/slice_sheet.py "art/raw/course_icons_$n.png" "art/course/icons_$n" --count 3 --height 160
done
cp "$SRC/course_cover.png" art/raw/
[ -f "$SRC/course_cover.png.prompt.json" ] && cp "$SRC/course_cover.png.prompt.json" art/raw/
python3 -c "from PIL import Image; Image.open('art/raw/course_cover.png').convert('RGB').resize((768, 768), Image.LANCZOS).save('art/course/cover.webp', quality=82, method=6)"
ls -la art/course/*.webp
