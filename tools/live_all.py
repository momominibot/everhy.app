#!/usr/bin/env python3
"""Living plates for several scenes in one guarded sequence: live_all.py <jobs.json>. Each job: {id, plate (png),
mask: [[shape, x0, y0, x1, y1], ...] in plate percent (shape rect|ellipse; y in the tall 0..175 unit), prompt}.
For each job: draws the soft mask to art/live/<id>-mask.png, runs tools/live_plate.py once (it refuses while
art/RUN.lock or art/BLOCKED.json exists and blocks on any failure), then tools/live_compose.py into
art/plates/<id>-live.mp4 and .webm. Stops at the first failure; already finished clips are skipped."""
import json, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
ROOT = Path(__file__).resolve().parents[1]
jobs = json.load(open(sys.argv[1]))
for j in jobs:
    plate = ROOT / j['plate']; W, H = Image.open(plate).size
    mask = ROOT / 'art/live' / (j['id'] + '-mask.png'); clip = ROOT / 'art/live' / (j['id'] + '-seedance.mp4'); out = ROOT / 'art/plates' / (j['id'] + '-live.mp4')
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    def px(x, y): return (x / 100 * W, y / 175 * H)
    for shape, x0, y0, x1, y1 in j['mask']:
        (d.ellipse if shape == 'ellipse' else d.rectangle)([px(x0, y0), px(x1, y1)], fill=255)
    m.filter(ImageFilter.GaussianBlur(14)).save(mask)
    if not clip.exists():
        r = subprocess.run([sys.executable, str(ROOT / 'tools/live_plate.py'), str(plate), str(clip), j['prompt']])
        if r.returncode != 0: print('STOP at', j['id'], 'rc', r.returncode); sys.exit(r.returncode)
    r = subprocess.run([sys.executable, str(ROOT / 'tools/live_compose.py'), str(clip), str(mask), str(plate), str(out)])
    if r.returncode != 0: print('STOP compose', j['id']); sys.exit(r.returncode)
    print('live plate ready', out.name)
print('all done')
