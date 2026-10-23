#!/usr/bin/env python3
"""Night versions of the indoor plates, relit locally from the day painting (no model call).

The whole picture is relit at once, so nothing is pasted over part of it: every pixel is taken down to a cool, dim
night colour, brightest things the most (daylight in a window falls to a soft blue dusk, white walls to blue-grey),
and then warm light is put back where the painting already has light in it: lamp shades, fairy lights, candles,
anything that glows warm. Each glow lights the room around it in its own colour and blooms a little.
Writes art/plates/night/<plate>.webp at the plate's size; js/ext/sky.js fades it in over the day plate with the lamps.
Usage: python3 tools/night_plates.py [plate ...] [--check out.png]"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
# extra lamp pools per plate, in percent of the plate (x, y, radius), for lights not painted as glowing
LAMPS = {'kitchen': [(31, 33, 11), (44, 27, 9), (60, 52, 16)], 'bathroom-dream-wide': [(50, 55, 14)], 'hawker': [(21, 37, 10), (50, 37, 10), (79, 37, 10)],
         'flowerdome': [(50, 40, 22)], 'train': [(50, 18, 30)], 'bus': [(50, 22, 26)]}
# the MRT and the bus stay lit at night, as real carriages are (their painted lights are white, so a relight dims them wrongly)
PLATES = ['bedroom-dream-wide', 'bathroom-dream-wide', 'living-dream-wide', 'kitchen', 'hawker', 'flowerdome']

def hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx

def blur(x, r):
    im = Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8))
    return np.array(im.filter(ImageFilter.GaussianBlur(r)), float) / 255

def relight(day, lamps=()):
    a = day.astype(float) / 255
    h, s, v = hsv(a)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    # night base: cool and dim; highlights come down hardest so daylight in a window reads as dusk blue, not white
    k = 0.50 - 0.18 * np.clip((lum - 0.62) / 0.38, 0, 1)
    tint = np.array([0.80, 0.86, 1.18])
    night = a * (k[..., None] * tint)
    # a little deep-blue fill so shadows are blue, not grey
    night = night + np.array([0.020, 0.028, 0.065]) * (1 - lum[..., None])
    # where the painting already glows: warm, bright, fairly saturated (lamps, fairy lights, candles, a lit shade)
    glow = ((h > 18) & (h < 60) & (s > 0.28) & (v > 0.86)) | ((v > 0.97) & (s > 0.12) & (h > 15) & (h < 70))
    # only things brighter than what is around them: a lamp or a fairy light, never a big even area such as the
    # backdrop round the room or a daylit pane of glass
    w0 = a.shape[1]
    local = v - blur(v, w0 * 0.018)
    glow = glow & (local > 0.055)
    g = glow.astype(float)
    g = np.array(Image.fromarray((g * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)), float) / 255
    w = a.shape[1]
    near = np.clip(blur(g, w * 0.012) * 2.2, 0, 1)             # the shade itself and its rim
    pool = np.clip(blur(g, w * 0.055) * 9.0, 0, 1)             # the warm pool it throws on the room
    # the scene's own lamps (lights the painting does not show glowing, such as a cooker hood) add a soft pool too
    if lamps:
        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        for lx, ly, lr in lamps:
            cx, cy, r = lx * a.shape[1] / 100, ly * a.shape[0] / 100, lr * a.shape[1] / 100
            pool = np.maximum(pool, 0.75 * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)))
    warm = np.array([1.0, 0.80, 0.56])
    lit = a * (0.34 + 0.50 * pool[..., None]) * warm            # the room as the lamp shows it
    out = night * (1 - pool[..., None] * 0.85) + lit * (pool[..., None] * 0.85)
    out = out * (1 - near[..., None]) + a * near[..., None]     # the glowing things keep their own colour
    bloom = blur(g, w * 0.02)[..., None] * np.array([1.0, 0.78, 0.48]) * 0.55
    out = 1 - (1 - out) * (1 - bloom)                           # screen in a soft bloom
    return np.clip(out * 255, 0, 255).astype(np.uint8)

def build(name):
    src = os.path.join(ROOT, 'art', 'plates', name + '.webp')
    day = np.array(Image.open(src).convert('RGB'))
    out = relight(day, LAMPS.get(name, ()))
    dst = os.path.join(ROOT, 'art', 'plates', 'night', name + '.webp')
    Image.fromarray(out).save(dst, 'WEBP', quality=90, method=6)
    return dst

if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    chk = sys.argv[sys.argv.index('--check') + 1] if '--check' in sys.argv else None
    if chk in args: args.remove(chk)
    names = args or PLATES
    for n in names: print(build(n))
    if chk:
        tiles = []
        for n in names:
            d = Image.open(os.path.join(ROOT, 'art', 'plates', n + '.webp')).convert('RGB'); nt = Image.open(os.path.join(ROOT, 'art', 'plates', 'night', n + '.webp'))
            sc = 420 / d.height; d = d.resize((int(d.width * sc), 420)); nt = nt.resize(d.size)
            t = Image.new('RGB', (d.width * 2 + 6, 420), 'white'); t.paste(d, (0, 0)); t.paste(nt, (d.width + 6, 0)); tiles.append(t)
        W = max(t.width for t in tiles); sheet = Image.new('RGB', (W, 426 * len(tiles)), 'white')
        for i, t in enumerate(tiles): sheet.paste(t, (0, i * 426))
        sheet.save(chk)
