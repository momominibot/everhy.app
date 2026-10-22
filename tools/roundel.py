#!/usr/bin/env python3
"""Tidy sliced course medallions (local, no model): keep only each round disc (drops cast shadows and key spill below
it), clamp green spill on its cream rim, and centre it in a square cell, so the round CSS icon shows the whole medallion. Rewrites art/course/icons_N.webp
and .json in place. Usage: roundel.py art/course/icons_1 [art/course/icons_2 ...] [--size 160]"""
import json, sys
import numpy as np
from PIL import Image

argv = sys.argv[1:]
S = 160
if '--size' in argv:
    i = argv.index('--size'); S = int(argv[i + 1]); del argv[i:i + 2]
args = argv
for prefix in args:
    meta = json.load(open(prefix + '.json'))
    strip = np.asarray(Image.open(prefix + '.webp').convert('RGBA')).astype(np.float32) / 255
    out = Image.new('RGBA', (S * meta['frames'], S), (0, 0, 0, 0))
    for k in range(meta['frames']):
        cell = strip[:, k * meta['w']:(k + 1) * meta['w']]
        al = cell[..., 3] > 0.5
        xs, ys = np.where(al.any(0))[0], np.where(al.any(1))[0]
        d = xs[-1] - xs[0] + 1                       # the disc is as wide as the medallion; a shadow only adds height
        cx, cy = (xs[0] + xs[-1]) / 2, ys[0] + d / 2
        yy, xx = np.mgrid[0:cell.shape[0], 0:cell.shape[1]]
        r = np.hypot(xx - cx, yy - cy)
        cell = cell.copy(); cell[..., 3] *= np.clip((d / 2 - r) / 1.5, 0, 1)
        rim = r > 0.8 * d / 2                         # the cream rim: any green there is key spill, never a motif
        cell[..., 1] = np.where(rim, np.minimum(cell[..., 1], np.maximum(cell[..., 0], cell[..., 2])), cell[..., 1])
        x0, y0 = int(round(cx - d / 2)), int(round(cy - d / 2))
        disc = Image.fromarray((cell * 255).round().astype(np.uint8), 'RGBA').crop((x0, y0, x0 + d, y0 + d))
        disc = disc.resize((S - 6, S - 6), Image.LANCZOS)
        out.alpha_composite(disc, (k * S + 3, 3))
    out.save(prefix + '.webp', quality=90, method=6)
    json.dump({'frames': meta['frames'], 'w': S, 'h': S, 'round': True}, open(prefix + '.json', 'w'))
    print(prefix, 'square cells', S)
