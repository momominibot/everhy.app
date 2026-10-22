#!/usr/bin/env python3
"""Cut the Seedream log icon sheet (2x2 on magenta) into four keyed 128 px WebP icons for the Log panel.
Usage: python3 tools/cut_log_icons.py   (reads art/raw/log_icons_sheet.png, writes art/log/*.webp). Local only."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
src = Image.open(ROOT / 'art/raw/log_icons_sheet.png').convert('RGB')
a = np.asarray(src).astype(np.float32)
border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
k = np.median(border, axis=0)
dist = np.sqrt(((a - k) ** 2).sum(axis=2))
alpha = np.clip((dist - 90) / 60, 0, 1)
alpha[:8, :] = 0; alpha[-8:, :] = 0; alpha[:, :8] = 0; alpha[:, -8:] = 0  # sheet edge specks
# un-mix the magenta fringe from semi-transparent edge pixels
rgb = a.copy()
m = (alpha > 0) & (alpha < 1)
rgb[m] = np.clip((a[m] - (1 - alpha[m, None]) * k) / alpha[m, None], 0, 255)
rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')
H, W = a.shape[:2]
names = [['drop', 'swirl'], ['sun', 'unsure']]
out = ROOT / 'art/log'; out.mkdir(parents=True, exist_ok=True)
for r in range(2):
    for c in range(2):
        cell = img.crop((c * W // 2, r * H // 2, (c + 1) * W // 2, (r + 1) * H // 2))
        bb = cell.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
        cell = cell.crop(bb)
        s = max(cell.size); sq = Image.new('RGBA', (s + 16, s + 16), (0, 0, 0, 0))
        sq.paste(cell, ((s + 16 - cell.width) // 2, (s + 16 - cell.height) // 2))
        sq.resize((128, 128), Image.LANCZOS).save(out / f'{names[r][c]}.webp', 'WEBP', quality=90)
        print(names[r][c], bb)
