#!/usr/bin/env python3
"""Cut a piece of a painted plate out along a traced outline, so the game can draw it over her (a scene's `fronts`).
The outline is read off a 1% grid of the plate. Writes art/occluders/<name>.webp cropped to the outline's box and prints
the rect (percent of the plate) for the scene data.
Usage: python3 tools/cut_front.py bathroom-tub"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.join(os.path.dirname(__file__), '..')
CUTS = {
    # the bath's front: from the inner front lip of the rim down round the body and the clawed feet
    'bathroom-tub': ('bathroom-dream-wide', [(24.2, 46.8), (26.5, 47.6), (29, 48.9), (32, 49.5), (35.5, 49.6), (39, 48.9), (42, 47.6), (44.5, 45.9),
                     (46.3, 44.2), (47.2, 44.5), (47.5, 46), (46.8, 48.5), (45, 51), (45.8, 52.5), (45.6, 55), (44, 55.3), (43, 54), (40, 55),
                     (36.5, 56.5), (35, 59.8), (32.5, 59.8), (32, 57), (29, 57), (27.5, 56.8), (26, 57), (25, 55), (26.2, 53), (25, 50.5), (24.2, 48.5)]),
}
def cut(name):
    plate, pts = CUTS[name]
    im = Image.open(os.path.join(ROOT, 'art', 'plates', plate + '.webp')).convert('RGBA'); W, H = im.size
    mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).polygon([(x * W / 100, y * H / 100) for x, y in pts], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    r = [round(min(xs) - 0.5, 1), round(min(ys) - 0.5, 1), round(max(xs) + 0.5, 1), round(max(ys) + 0.5, 1)]
    box = (int(r[0] * W / 100), int(r[1] * H / 100), int(r[2] * W / 100), int(r[3] * H / 100))
    out = im.copy(); out.putalpha(mask); out = out.crop(box)
    dst = os.path.join(ROOT, 'art', 'occluders', name + '.webp'); out.save(dst, 'WEBP', quality=94, method=6)
    # the exact rect of the saved crop, in percent, so the image lands on its own pixels
    print(json.dumps({'src': 'art/occluders/%s.webp' % name, 'rect': [round(box[0] * 100 / W, 3), round(box[1] * 100 / H, 3), round(box[2] * 100 / W, 3), round(box[3] * 100 / H, 3)]}))
if __name__ == '__main__':
    for n in (sys.argv[1:] or CUTS): cut(n)
