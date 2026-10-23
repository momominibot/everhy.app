#!/usr/bin/env python3
"""Night layers for the isometric rooms, made locally from each painted plate (no model call).

For each room plate it writes art/night/<plate>.webp, the same size as the plate and transparent except:
  * the window glass: pixels inside a hand-set box (percent of the plate) that are light and not wood, rim or curtain,
    filled with a deep blue night sky, a few stars and a soft moon glow, so the frames and curtains stay as painted;
  * the empty space around the room: everything joined to the plate's border that matches the backdrop colour,
    filled with a soft starry dusk, so the room floats in a night sky instead of a flat cream.
js/ext/sky.js shows the layer over the room's night tint, with the same strength as the lamps.
Usage: python3 tools/night_rooms.py [--check out.png]"""
import sys, os, random
from collections import deque
from PIL import Image, ImageFilter, ImageDraw
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..')
# per plate, read off a 1% grid of the painting: the room's outline (everything outside it is backdrop) and each
# window's glass as an ellipse [cx, cy, rx, ry] or a polygon of corners, all in percent of the plate
ROOMS = {
    'bedroom-dream-wide': {'room': [(1, 26), (48, 3), (99.5, 29.5), (99.5, 69.5), (50.5, 97.5), (1, 68)],
                           'glass': [('ellipse', (35.6, 23.6, 5.2, 7.6)), ('poly', [(60.4, 20), (70.2, 24.8), (70.2, 33.5), (60.4, 30.5)])]},
    'bathroom-dream-wide': {'room': [(3, 24), (48.5, 3.5), (97.5, 27), (97.5, 70.5), (51, 97.5), (2.5, 69.5)],
                            'glass': [('ellipse', (35, 24, 5.2, 7.2))]},
    'living-dream-wide': {'room': [(3, 22.5), (48.5, 5), (86, 23.5), (86, 41.5), (96.5, 45.5), (97, 77.5), (51.5, 97.5), (3, 71.5)],
                          'glass': [('ellipse', (25, 26.3, 4.9, 6.3)), ('poly', [(75.6, 46.2), (89.6, 52), (89.6, 61.6), (75.6, 56.2)])]},
    'kitchen': {'room': [(4, 28), (50, 5.5), (96.5, 27), (96.5, 68.5), (55, 96), (4, 72)],
                'glass': [('poly', [(39.6, 21.6), (45.8, 18.9), (45.8, 30.5), (39.6, 33.5)])]},
}

def hsv(a):
    r, g, b = a[..., 0] / 255.0, a[..., 1] / 255.0, a[..., 2] / 255.0
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx

def poly_mask(w, h, pts):
    im = Image.new('L', (w, h), 0); ImageDraw.Draw(im).polygon([(x * w / 100, y * h / 100) for x, y in pts], fill=255)
    return np.array(im) > 127

def outside_mask(a, room):
    h, w, _ = a.shape
    return ~poly_mask(w, h, room)

def glass_mask(a, shape):
    h, w, _ = a.shape
    kind, g = shape
    im = Image.new('L', (w, h), 0); d = ImageDraw.Draw(im)
    if kind == 'ellipse':
        cx, cy, rx, ry = g; d.ellipse([(cx - rx) * w / 100, (cy - ry) * h / 100, (cx + rx) * w / 100, (cy + ry) * h / 100], fill=255)
    else:
        d.polygon([(x * w / 100, y * h / 100) for x, y in g], fill=255)
    inside = np.array(im) > 127
    hue, sat, val = hsv(a[..., :3].astype(float))
    wood = (hue > 15) & (hue < 48) & (sat > 0.30) & (val < 0.93)   # honey wood bars stay painted
    plant = (hue > 60) & (hue < 170) & (sat > 0.25) & (val < 0.75)  # a potted plant on the sill stays (pale trees outside turn to sky)
    return inside & ~wood & ~plant

def sky(w, h, rnd, top, bottom):
    t = np.linspace(0, 1, h)[:, None]
    col = np.array(top, float)[None, None, :] * (1 - t[..., None]) + np.array(bottom, float)[None, None, :] * t[..., None]
    return np.repeat(col, w, axis=1)

def build(name):
    src = os.path.join(ROOT, 'art', 'plates', name + '.webp')
    a = np.array(Image.open(src).convert('RGBA'))
    h, w, _ = a.shape
    rnd = random.Random(name)
    out = np.zeros((h, w, 4), float)
    # around the room: a soft dusk, darker at the top
    om = outside_mask(a, ROOMS[name]['room'])
    bg = sky(w, h, rnd, (40, 36, 74), (96, 72, 112))
    alpha = Image.fromarray((om * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
    out[..., :3] = bg; out[..., 3] = np.array(alpha, float)
    # windows: deep blue glass, a little lighter low down
    gm = np.zeros((h, w), bool)
    for shape in ROOMS[name]['glass']: gm |= glass_mask(a, shape)
    ga = np.array(Image.fromarray((gm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), float)
    # each pane is its own little sky: deep blue at its top, a soft lilac glow at its bottom (not one flat fill)
    gsky = np.zeros((h, w, 3), float)
    for shape in ROOMS[name]['glass']:
        one = glass_mask(a, shape); ys = np.where(one.any(axis=1))[0]
        if not len(ys): continue
        y0, y1 = ys.min(), ys.max() + 1
        t = np.clip((np.arange(h) - y0) / max(1, y1 - y0), 0, 1)[:, None, None]
        col = np.array((38, 52, 112), float) * (1 - t) + np.array((150, 134, 196), float) * t
        gsky = np.where(one[..., None], np.broadcast_to(col, (h, w, 3)), gsky)
    sel = ga > 0
    out[sel, :3] = gsky[sel]; out[..., 3] = np.maximum(out[..., 3], ga * 0.94)
    img = Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')
    # a small moon in the biggest window, and a faint glass sheen across each pane
    big = max(ROOMS[name]['glass'], key=lambda sh: glass_mask(a, sh).sum())
    bm = glass_mask(a, big); ys, xs = np.where(bm)
    if len(xs):
        cx, cy = int(np.percentile(xs, 68)), int(np.percentile(ys, 30)); r = max(6, int((xs.max() - xs.min()) * 0.13))
        halo = Image.new('RGBA', img.size, (0, 0, 0, 0)); hd = ImageDraw.Draw(halo)
        hd.ellipse([cx - r * 2.4, cy - r * 2.4, cx + r * 2.4, cy + r * 2.4], fill=(255, 240, 210, 70))
        halo = halo.filter(ImageFilter.GaussianBlur(r)); hd = ImageDraw.Draw(halo)
        hd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 246, 214, 255))
        hd.ellipse([cx - r * 0.35, cy - r * 0.9, cx + r * 1.5, cy + r * 0.7], fill=(0, 0, 0, 0))  # a crescent
        clip = Image.fromarray((bm * 255).astype(np.uint8))
        halo.putalpha(Image.fromarray(np.minimum(np.array(halo.split()[3]), np.array(clip))))
        img = Image.alpha_composite(img, halo)
    sheen = Image.new('RGBA', img.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sheen)
    for k in range(0, w + h, 9):
        if (k // 9) % 11 in (0, 1): sd.line([(k, 0), (k - h, h)], fill=(255, 255, 255, 26), width=6)
    sm = np.array(sheen.split()[3]) * (np.array(Image.fromarray((gm * 255).astype(np.uint8))) / 255.0)
    sheen.putalpha(Image.fromarray(sm.astype(np.uint8))); img = Image.alpha_composite(img, sheen)
    # stars in the glass and in the sky around the room
    d = ImageDraw.Draw(img)
    pts = np.argwhere(gm); pts2 = np.argwhere(om[: int(h * 0.55)])
    for arr, n in ((pts, 5 * len(ROOMS[name]['glass'])), (pts2, 70)):
        for _ in range(n if len(arr) else 0):
            y, x = arr[rnd.randrange(len(arr))]
            r = rnd.choice((0.8, 1.0, 1.3, 1.8)); c = (255, 248, 220, rnd.randrange(170, 255))
            d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    dst = os.path.join(ROOT, 'art', 'night', name + '.webp')
    img.save(dst, 'WEBP', quality=88, method=6)
    return dst, int(gm.sum()), int(om.sum())

if __name__ == '__main__':
    for n in ROOMS:
        print(*build(n))
    if '--check' in sys.argv:
        outp = sys.argv[sys.argv.index('--check') + 1]
        tiles = []
        for n in ROOMS:
            base = Image.open(os.path.join(ROOT, 'art', 'plates', n + '.webp')).convert('RGBA')
            dark = Image.blend(base, Image.new('RGBA', base.size, (60, 50, 70, 255)), 0.28)
            tiles.append(Image.alpha_composite(dark, Image.open(os.path.join(ROOT, 'art', 'night', n + '.webp'))).resize((512, 512)))
        sheet = Image.new('RGB', (1024, 1024)); [sheet.paste(t, ((i % 2) * 512, (i // 2) * 512)) for i, t in enumerate(tiles)]
        sheet.save(outp)
