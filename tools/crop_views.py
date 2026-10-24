#!/usr/bin/env python3
"""Cut a three-view turnaround sheet on green into front/side/back squares on white for Meshy.
Usage: crop_views.py art/raw/<sheet>.png <prefix>  ->  art/meshy/<prefix>_front.png, _side.png, _back.png"""
import sys
import numpy as np
from PIL import Image

src, prefix = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert('RGB')).astype(int)
bg = np.median(np.concatenate([im[:20].reshape(-1, 3), im[-20:].reshape(-1, 3)]), axis=0)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
greenish = (g > r + 40) & (g > b + 40)  # the green screen, speckles and all
fg = (np.abs(im - bg).sum(2) > 90) & ~greenish
from scipy import ndimage
lab, n = ndimage.label(ndimage.binary_opening(fg, iterations=2))
sizes = ndimage.sum(fg, lab, range(1, n + 1))
fg = np.isin(lab, 1 + np.where(sizes > 2000)[0])  # keep only figure-sized shapes, drop stray specks
cols = fg.any(0)
runs, start = [], None
for x, on in enumerate(list(cols) + [False]):
    if on and start is None: start = x
    if not on and start is not None:
        if x - start > 40: runs.append((start, x))
        start = None
if len(runs) != 3: sys.exit('expected 3 views, found %d' % len(runs))
for name, (x0, x1) in zip(['front', 'side', 'back'], runs):
    ys = np.where(fg[:, x0:x1].any(1))[0]; y0, y1 = ys[0], ys[-1]
    crop = np.where(fg[y0:y1 + 1, x0:x1][..., None], im[y0:y1 + 1, x0:x1], 255).astype('uint8')
    h, w = crop.shape[:2]; S = int(max(h, w) * 1.15)
    c = Image.new('RGB', (S, S), (255, 255, 255)); c.paste(Image.fromarray(crop), ((S - w) // 2, (S - h) // 2))
    c.resize((1024, 1024), Image.LANCZOS).save('art/meshy/%s_%s.png' % (prefix, name))
print('cut', runs)
