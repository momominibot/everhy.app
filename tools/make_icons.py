#!/usr/bin/env python3
"""Key Ebb's clay app icon render and write the installable icon sizes.

Usage: make_icons.py [art/raw/icon_moon.png]
- the key colour is the median of the render's border (Seedream magenta is never pure #FF00FF);
- alpha comes from how far each pixel sits from the key in RGB, with key spill pulled out of the soft edge;
- writes art/icons/icon-192.png and icon-512.png (subject at 78% on the cream app background) and
  icon-maskable-512.png (subject inside the 80% safe circle, at 56%), all opaque so every platform draws them alike.
Nothing leaves the machine."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BG = (246, 239, 230)  # --bg in css/ebb.css


def keyed(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    k = np.median(border, axis=0)
    d = np.sqrt(((a - k) ** 2).sum(-1))
    lo, hi = 60.0, 140.0
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    # pull the key colour out of half-transparent edge pixels so no magenta fringe is left
    t = alpha[..., None]
    rgb = np.where(t > 0.01, (a - (1 - t) * k) / np.maximum(t, 0.01), a)
    rgb = np.clip(rgb, 0, 255)
    img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    return img.crop(img.getbbox())


def place(subject, size, fill):
    canvas = Image.new('RGBA', (size, size), BG + (255,))
    # a soft lighter centre, like the warm light in the scenes
    glow = Image.new('L', (size, size), 0)
    g = np.zeros((size, size), np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.sqrt((xx - size / 2) ** 2 + (yy - size * 0.46) ** 2) / (size * 0.62)
    g = np.clip(1 - r, 0, 1) ** 1.5 * 70
    glow = Image.fromarray(g.astype(np.uint8), 'L')
    canvas = Image.composite(Image.new('RGBA', (size, size), (255, 251, 244, 255)), canvas, glow)
    s = fill * size / max(subject.size)
    sub = subject.resize((round(subject.width * s), round(subject.height * s)), Image.LANCZOS)
    x, y = (size - sub.width) // 2, (size - sub.height) // 2
    # the shadow is drawn on a full canvas so its blur is never clipped at the subject's box
    mask = Image.new('L', (size, size), 0)
    mask.paste(sub.getchannel('A').point(lambda v: v * 0.22), (x, y + round(size * 0.02)))
    mask = mask.filter(ImageFilter.GaussianBlur(size * 0.02))
    canvas = Image.composite(Image.new('RGBA', (size, size), (90, 60, 60, 255)), canvas, mask)
    canvas.alpha_composite(sub, (x, y))
    return canvas.convert('RGB')


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'art/raw/icon_moon.png'
    out = ROOT / 'art/icons'
    out.mkdir(parents=True, exist_ok=True)
    sub = keyed(src)
    sub.save(out / 'icon-subject.png')
    place(sub, 512, 0.78).save(out / 'icon-512.png', optimize=True)
    place(sub, 512, 0.78).resize((192, 192), Image.LANCZOS).save(out / 'icon-192.png', optimize=True)
    place(sub, 512, 0.56).save(out / 'icon-maskable-512.png', optimize=True)
    place(sub, 512, 0.78).resize((180, 180), Image.LANCZOS).save(out / 'apple-touch-icon.png', optimize=True)
    for p in sorted(out.glob('*.png')):
        print(p.name, Image.open(p).size, p.stat().st_size)


if __name__ == '__main__':
    main()
