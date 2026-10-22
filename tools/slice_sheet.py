#!/usr/bin/env python3
"""Slice a green-screen pose sheet into a normalised sprite strip for Ebb.

Usage: slice_sheet.py sheet.png out_prefix --count N [--ref ref.webp --match height|head] [--height 300]
                      [--centre box|head] [--order rows|cols]

- the key colour is the median of the sheet's border, so off-green backgrounds key cleanly;
- frames are the N largest shapes; small specks (stray hair, a shoelace) join the nearest frame;
- frames are ordered in reading order (rows top to bottom, then left to right);
- scale: --match height makes the sheet's median frame height equal the reference sprite's height (walks);
  --match head makes the median head width (widest row in the top 35%) equal the reference's (sit and work poses);
  with no --ref the median frame height becomes --height;
- every frame's feet sit on the cell's bottom edge, centred on its box or on its head;
- writes out_prefix.webp (frames side by side) and out_prefix.json {frames, w, h}.
Nothing leaves the machine."""
import argparse, json
import numpy as np
from PIL import Image
from scipy import ndimage


def key(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    k = np.median(border, axis=0)
    hot = [i for i in range(3) if k[i] > 0.5] or [int(np.argmax(k))]  # green, blue, or magenta (red + blue)
    cold = [i for i in range(3) if i not in hot]
    lo_of = lambda x: np.max(x[..., cold], axis=-1) if cold else 0
    excess = np.min(a[..., hot], axis=-1) - lo_of(a)
    kex = float(np.min(k[hot]) - (max(k[cold]) if cold else 0))
    hi, lo = kex * 0.75, kex * 0.35
    alpha = np.clip((hi - excess) / max(1e-6, hi - lo), 0, 1)
    spill = np.clip(excess, 0, 1) * (1 - alpha * 0.6)
    for ch in hot:
        a[..., ch] -= spill
    return np.dstack([np.clip(a, 0, 1), alpha])


def frames(rgba, count):
    al = rgba[..., 3] > 0.5
    lab, n = ndimage.label(al)
    if n == 0:
        raise SystemExit('no shapes found')
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    main = [int(i) + 1 for i in order[:count]]
    objs = ndimage.find_objects(lab)
    boxes = {m: list((objs[m - 1][1].start, objs[m - 1][0].start, objs[m - 1][1].stop, objs[m - 1][0].stop)) for m in main}
    owner = {m: m for m in main}
    for i in order[count:]:  # specks join the nearest main frame (by box distance)
        lid = int(i) + 1
        if sizes[i] < 30:
            continue
        b = objs[lid - 1]; cx = (b[1].start + b[1].stop) / 2; cy = (b[0].start + b[0].stop) / 2
        best = min(main, key=lambda m: max(0, boxes[m][0] - cx, cx - boxes[m][2]) + max(0, boxes[m][1] - cy, cy - boxes[m][3]))
        owner[lid] = best
        bb = boxes[best]; boxes[best] = [min(bb[0], b[1].start), min(bb[1], b[0].start), max(bb[2], b[1].stop), max(bb[3], b[0].stop)]
    out = []
    for m in main:
        x0, y0, x1, y1 = boxes[m]
        mask = np.zeros(lab.shape, bool)
        for lid, o in owner.items():
            if o == m:
                mask |= lab == lid
        crop = rgba[y0:y1, x0:x1].copy()
        crop[..., 3] *= ndimage.binary_dilation(mask[y0:y1, x0:x1], iterations=2)
        out.append(((x0 + x1) / 2, (y0 + y1) / 2, y1 - y0, crop))
    # reading order: group into rows by centre y
    out.sort(key=lambda f: f[1])
    rows, cur = [], [out[0]]
    for f in out[1:]:
        if abs(f[1] - cur[-1][1]) < max(f[2], cur[-1][2]) * 0.5:
            cur.append(f)
        else:
            rows.append(cur); cur = [f]
    rows.append(cur)
    return [f[3] for r in rows for f in sorted(r, key=lambda f: f[0])]


def head_width(crop):
    al = crop[..., 3] > 0.5
    ys = np.where(al.any(1))[0]
    top = al[ys[0]: ys[0] + int(len(ys) * 0.35)]
    return int(top.sum(1).max())


def head_centre(crop):
    al = crop[..., 3] > 0.5
    ys = np.where(al.any(1))[0]
    top = al[ys[0]: ys[0] + int(len(ys) * 0.3)]
    xs = np.where(top)[1]
    return float(xs.mean())


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).round().astype(np.uint8), 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet'); ap.add_argument('out')
    ap.add_argument('--count', type=int, required=True)
    ap.add_argument('--ref'); ap.add_argument('--match', choices=['height', 'head'], default='height')
    ap.add_argument('--height', type=int, default=300)
    ap.add_argument('--centre', choices=['box', 'head'], default='box')
    a = ap.parse_args()
    crops = frames(key(Image.open(a.sheet)), a.count)
    heights = sorted(c.shape[0] for c in crops)
    med_h = heights[len(heights) // 2]
    if a.ref:
        ref = np.asarray(Image.open(a.ref).convert('RGBA')).astype(np.float32) / 255
        ys = np.where((ref[..., 3] > 0.5).any(1))[0]
        if a.match == 'height':
            scale = (ys[-1] - ys[0] + 1) / med_h
        else:
            hw = sorted(head_width(c) for c in crops)
            scale = head_width(ref[ys[0]: ys[-1] + 1]) / hw[len(hw) // 2]
    else:
        scale = a.height / med_h
    imgs = []
    for c in crops:
        im = to_img(c)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        imgs.append(im)
    W = max(i.width for i in imgs) + 8
    H = max(i.height for i in imgs) + 4
    strip = Image.new('RGBA', (W * len(imgs), H), (0, 0, 0, 0))
    for k, im in enumerate(imgs):
        arr = np.asarray(im).astype(np.float32) / 255
        cx = head_centre(arr) if a.centre == 'head' else im.width / 2
        x = int(round(k * W + W / 2 - cx))
        x = max(k * W, min(k * W + W - im.width, x))
        strip.alpha_composite(im, (x, H - im.height))
    strip.save(a.out + '.webp', quality=90, method=6)
    json.dump({'frames': len(imgs), 'w': W, 'h': H}, open(a.out + '.json', 'w'))
    print({'out': a.out, 'frames': len(imgs), 'cell': [W, H], 'scale': round(scale, 3)})


if __name__ == '__main__':
    main()
