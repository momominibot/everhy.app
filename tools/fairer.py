#!/usr/bin/env python3
"""Make a character's skin a little fairer in every sprite strip, without a model call.

Usage: fairer.py <set dir> <out dir> [--amount 0.5] [--preview mask.png]

- skin is every opaque pixel whose hue, saturation and value sit in her skin's own band (warm peach-orange, bright);
  hair (dark), the hoodie (pale, unsaturated), jeans (blue), blush and lips (pink-red hues) fall outside it,
  and so does any patch under MIN_PATCH pixels (specks of shadow on a beige tudung);
- the mask is softened by a one-pixel blur so the edge between skin and hair or clothes never shows a line;
- each skin pixel moves towards a fairer peach: brighter and a little less saturated, scaled by --amount (0..1), so
  shading and clay highlights keep their shape;
- copies the .json files unchanged (frame sizes do not change). Nothing leaves the machine."""
import argparse, json, shutil, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HUE = (18.5 / 360, 28.5 / 360); SAT = (0.46, 0.86); VAL = 0.55  # measured: skin h 20-25, s 0.54-0.75; the cream hoodie h 30-34, s 0.33; shoes s 0.26; the classic peach tee h 12-17
MIN_PATCH = 30  # px: shadow on a beige tudung matches skin in colour but only as scattered specks; ears and fingers are bigger


def hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a[..., :3].max(-1); mn = a[..., :3].min(-1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    safe = np.maximum(d, 1e-6)
    h = np.where(mx == r, (g - b) / safe, np.where(mx == g, 2 + (b - r) / safe, 4 + (r - g) / safe))
    h = np.where(d > 1e-6, (h / 6) % 1, 0)
    return h, s, mx


def from_hsv(h, s, v):
    i = np.floor(h * 6).astype(int) % 6; f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v]); g = np.choose(i, [t, v, v, q, p, p]); b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def skin_mask(a):
    h, s, v = hsv(a[..., :3])
    m = (a[..., 3] > 0.5) & (h >= HUE[0]) & (h <= HUE[1]) & (s >= SAT[0]) & (s <= SAT[1]) & (v >= VAL)
    lab, n = ndimage.label(m, structure=np.ones((3, 3))); sizes = ndimage.sum(m, lab, range(1, n + 1))
    m = np.isin(lab, 1 + np.flatnonzero(sizes >= MIN_PATCH))  # tiny specks are not skin
    soft = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    return np.minimum(np.asarray(soft).astype(float) / 255 * 1.6, 1.0) * (a[..., 3] > 0.02)


def fairer(img, amount):
    a = np.asarray(img.convert('RGBA')).astype(float) / 255
    m = skin_mask(a)
    h, s, v = hsv(a[..., :3])
    s2 = s * (1 - 0.30 * amount); v2 = v + (1 - v) * 0.55 * amount  # brighter and a touch less orange; shading keeps its shape
    rgb2 = from_hsv(h, s2, v2)
    out = a.copy(); out[..., :3] = a[..., :3] * (1 - m[..., None]) + rgb2 * m[..., None]
    return Image.fromarray((out * 255).round().clip(0, 255).astype(np.uint8), 'RGBA'), m


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--amount', type=float, default=0.5)
    ap.add_argument('--preview')
    o = ap.parse_args(); src, out = Path(o.src), Path(o.out); out.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob('*.webp')):
        img, m = fairer(Image.open(f), o.amount)
        img.save(out / f.name, 'WEBP', quality=92, alpha_quality=100, method=6)  # lossless tripled the strips' size
        print(f'{f.name}: skin {m.mean() * 100:.1f}% of pixels')
    if src.resolve() != out.resolve():
        for f in src.glob('*.json'): shutil.copy(f, out / f.name)
    if o.preview:
        a = np.asarray(Image.open(src / 'idle.webp').convert('RGBA')).astype(float) / 255
        m = skin_mask(a); vis = a.copy(); vis[..., :3] = vis[..., :3] * (1 - m[..., None] * 0.7) + np.array([1, 0, 1]) * m[..., None] * 0.7
        Image.fromarray((vis * 255).astype(np.uint8), 'RGBA').save(o.preview)


if __name__ == '__main__':
    main()
