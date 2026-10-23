#!/usr/bin/env python3
"""Draw the game's own coordinate grid on a plate so you can read floor corners, doors and stand points by eye.
Usage: grid.py <plate image> <out.png> [--step 5]
x runs 0..100 across the plate; y runs 0..(100 * height / width) down it, so a tall 768x1344 plate is 0..175 and a
square plate 0..100. Every line is labelled; every second line is darker. Open out.png and read the numbers."""
import sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
step = float(sys.argv[sys.argv.index('--step') + 1]) if '--step' in sys.argv else 5.0
im = Image.open(src).convert('RGB'); W, H = im.size; k = W / 100.0; ymax = H / k
d = ImageDraw.Draw(im, 'RGBA')
i = 0; v = 0.0
while v <= 100.0001:
    x = v * k; dark = i % 2 == 0
    d.line([(x, 0), (x, H)], fill=(255, 0, 80, 150 if dark else 70), width=1)
    if dark: d.text((x + 2, 2), f'{v:g}', fill=(255, 0, 80, 255))
    v += step; i += 1
i = 0; v = 0.0
while v <= ymax + 0.0001:
    y = v * k; dark = i % 2 == 0
    d.line([(0, y), (W, y)], fill=(0, 90, 255, 150 if dark else 70), width=1)
    if dark: d.text((2, y + 2), f'{v:g}', fill=(0, 90, 255, 255))
    v += step; i += 1
im.save(out); print(f'{out}: x 0..100, y 0..{ymax:.0f}, step {step:g}')
