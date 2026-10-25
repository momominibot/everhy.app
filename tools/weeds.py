#!/usr/bin/env python3
"""tools/weeds.py: the garden's weed patches, packed from Seedream clay tufts over each bed's own soil (25 Oct: Jamie, "regenerate the
weeds on the soil... not SVG... from Seed Dream. The weeds have to cover the whole plot of soil").

Usage: python3 tools/weeds.py [--check check.png]

Input: art/raw/weeds-a.png and weeds-b.png, two 3x3 sheets of clay weed tufts on magenta (one guarded Seedream run on 25 Oct, made for
another app's farm in the same clay style; prompts beside them in *.prompt.json). Magenta, not green, so the key never eats the leaves.

Output: art/props/weeds.webp + weeds.json, one frame per painted garden bed (BEDS below, in js/ebb-world.js order). Each frame is a
cell w*1.15 wide and w*0.62 tall, centred on the bed's x with its bottom at y + w*0.17, which is exactly how js/ebb-props.js
paintedBed() draws it. The tufts sit on a jittered grid over the bed's soil outline (read off art/plates/garden.webp on a 1-unit
grid), back to front, each seated with a soft shadow, sized in scene units and by the plate's depth so they read beside the crops.
Then run python3 tools/build_clay_sets.py so the game knows the strip. Nothing leaves the machine."""
import random, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SHEETS = [ROOT / 'art/raw/weeds-a.png', ROOT / 'art/raw/weeds-b.png']
# (x, y, w) as in js/ebb-world.js farm.beds, and the soil's corners in scene units: back left, back right, front right, front left
BEDS = [((35, 125, 26), [(23.6, 122.0), (46.4, 122.0), (46.2, 128.9), (23.0, 128.9)]),
        ((65, 125, 26), [(54.6, 122.0), (77.4, 122.0), (77.9, 128.9), (54.6, 128.9)]),
        ((31, 139, 30), [(20.2, 133.4), (45.6, 133.4), (45.3, 143.0), (18.6, 143.0)]),
        ((67, 139, 30), [(55.0, 133.4), (80.0, 133.4), (82.8, 143.0), (55.3, 143.0)])]
CELL = (600, 323)                      # px; the aspect is 1.15 : 0.62, the same for every bed
DEPTH = (112, 0.24, 175, 0.33)         # the garden's depth line: figure scale by y
INSET = 0.035                          # roots stay a hair inside the wooden frame


def depth(y):
    f = max(0.0, min(1.0, (y - DEPTH[0]) / (DEPTH[2] - DEPTH[0])))
    return DEPTH[1] + (DEPTH[3] - DEPTH[1]) * f


def key_magenta(path):
    """Magenta backdrop and its darker pink shadows out, only where joined to the border; soft edge; magenta spill pulled down."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = (im[..., i] / 255 for i in range(3))
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b); d = np.maximum(mx - mn, 1e-6)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    cand = (hue > 285) & (hue < 350) & (s > 0.25) & (mx > 0.03)
    lab, _ = ndimage.label(cand); border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border)) | (cand & (s > 0.3))  # and every pocket of backdrop caught between leaves, however small
    fg = ndimage.binary_opening(~bg, iterations=1)
    a = ndimage.gaussian_filter(fg.astype(np.float32), 1.0); a = np.where(fg, np.maximum(a, 0.5), a * 0.6); a = np.clip((a - 0.15) / 0.85, 0, 1)
    rgb = im.copy(); lim = rgb[..., 1] + 12; spill = (rgb[..., 0] > lim) & (rgb[..., 2] > lim)  # no leaf or flower here is magenta, so pull the tint out everywhere
    rgb[..., 0] = np.where(spill, np.minimum(rgb[..., 0], lim + 20), rgb[..., 0]); rgb[..., 2] = np.where(spill, np.minimum(rgb[..., 2], lim), rgb[..., 2])
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')


def tufts(path):
    """The nine tufts of a 3x3 sheet: shapes grouped by the grid cell their centre falls in, each trimmed and kept to its own cell."""
    im = key_magenta(path); a = np.asarray(im)[..., 3]; cell = im.width / 3
    lab, _ = ndimage.label(a > 100); groups = {}
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None or int((lab[sl] == k).sum()) < 400: continue
        cy, cx = ndimage.center_of_mass(lab == k); gk = (int(cy // cell), int(cx // cell))
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop; o = groups.get(gk)
        groups[gk] = (min(o[0], y0), max(o[1], y1), min(o[2], x0), max(o[3], x1)) if o else (y0, y1, x0, x1)
    out = []
    for (row, col), (y0, y1, x0, x1) in sorted(groups.items()):
        arr = np.asarray(im.crop((x0, y0, x1, y1))).copy()
        ys, xs = np.mgrid[y0:y1, x0:x1]; inside = (ys // cell == row) & (xs // cell == col)
        arr[..., 3] = np.where(inside, arr[..., 3], 0); out.append(Image.fromarray(arr, 'RGBA'))
    return out


def quad_point(q, u, v):
    """u across (left to right), v back to front, both 0..1, inside the soil quad."""
    (blx, bly), (brx, bry), (frx, fry), (flx, fly) = q
    lx, ly = blx + (flx - blx) * v, bly + (fly - bly) * v
    rx, ry = brx + (frx - brx) * v, bry + (fry - bry) * v
    return lx + (rx - lx) * u, ly + (ry - ly) * u


def compose(pool, bed, quad, seed):
    (bx, by, bw) = bed; cw, chh = bw * 1.15, bw * 0.62; left, top = bx - cw / 2, by + bw * 0.17 - chh
    px = CELL[0] / cw                                           # canvas px per scene unit for this bed
    to_px = lambda x, y: ((x - left) * px, (y - top) * px)
    width = max(quad[1][0], quad[2][0]) - min(quad[0][0], quad[3][0]); height = quad[3][1] - quad[0][1]
    nu, nv = int(np.ceil(width / 2.5)), int(np.ceil(height / 1.0))
    rnd = random.Random(seed); pts = []
    for j in range(nv):
        for i in range(nu):
            pts.append((INSET + (i + rnd.uniform(0.15, 0.85)) / nu * (1 - 2 * INSET), INSET + (j + rnd.uniform(0.2, 0.8)) / nv * (1 - 2 * INSET)))
    pts += [(rnd.uniform(INSET, 1 - INSET), rnd.uniform(INSET, 1 - INSET)) for _ in range(nu + nv)]  # a few more fill the gaps
    pts += [((i + rnd.uniform(0.2, 0.8)) / (nu + 1), rnd.uniform(0.985, 1.0)) for i in range(nu + 1)]  # a row rooted at the front rim, so no bare strip shows along it
    items = []
    for u, v in pts:
        x, y = quad_point(quad, u, v); k = depth(y) / depth(125)
        t = rnd.choice(pool); w = rnd.uniform(3.0, 4.4) * k; h = t.height * w / t.width
        if h > 4.3 * k: w, h = w * 4.3 * k / h, 4.3 * k
        items.append((y, x, v, t, w, h, rnd.random() < 0.5, rnd.uniform(0.92, 1.05)))
    items.sort(key=lambda it: it[0])                            # back to front by where each tuft is rooted
    canvas = Image.new('RGBA', CELL, (0, 0, 0, 0))
    for y, x, v, t, w, h, flip, light in items:
        X, Y = to_px(x, y); W, Hh = max(1, round(w * px)), max(1, round(h * px))
        shade = Image.new('RGBA', CELL, (0, 0, 0, 0)); ImageDraw.Draw(shade).ellipse((X - W * 0.42, Y - Hh * 0.10, X + W * 0.42, Y + Hh * 0.08), fill=(40, 26, 18, 80))
        canvas.alpha_composite(shade.filter(ImageFilter.GaussianBlur(px * 0.25)))  # seated in the soil, not pasted on it
        tt = t.resize((W, Hh), Image.LANCZOS)
        if flip: tt = tt.transpose(Image.FLIP_LEFT_RIGHT)
        tt = ImageEnhance.Brightness(tt).enhance(light * (0.93 + 0.07 * v))  # the back rows a touch darker, nearer the bed's wall
        canvas.alpha_composite(tt, (round(X - W / 2), round(Y - Hh * 0.9)))  # the base sits a little into the soil
    return canvas


def main():
    pool = [t for s in SHEETS for t in tufts(s)]
    print('tufts', len(pool))
    if len(pool) < 16: sys.exit('expected 18 tufts from the two sheets')
    frames = [compose(pool, bed, quad, 2510 + i) for i, (bed, quad) in enumerate(BEDS)]
    strip = Image.new('RGBA', (CELL[0] * len(frames), CELL[1]), (0, 0, 0, 0))
    for i, f in enumerate(frames): strip.alpha_composite(f, (CELL[0] * i, 0))
    strip.save(ROOT / 'art/props/weeds.webp', 'WEBP', quality=88, alpha_quality=100, method=6)
    (ROOT / 'art/props/weeds.json').write_text('{"frames": %d, "w": %d, "h": %d}' % (len(frames), CELL[0], CELL[1]))
    print('wrote art/props/weeds.webp', strip.size)
    if '--check' in sys.argv:  # each frame laid where the game draws it, over the plate
        plate = Image.open(ROOT / 'art/plates/garden.webp').convert('RGBA'); u = plate.width / 100
        for (bx, by, bw), _q in BEDS:
            i = [b for b, _ in BEDS].index((bx, by, bw)); cw, chh = bw * 1.15, bw * 0.62
            f = frames[i].resize((round(cw * u), round(chh * u)), Image.LANCZOS)
            plate.alpha_composite(f, (round((bx - cw / 2) * u), round((by + bw * 0.17 - chh) * u)))
        plate.crop((0, int(108 * u), plate.width, int(150 * u))).save(sys.argv[sys.argv.index('--check') + 1])


if __name__ == '__main__':
    main()
