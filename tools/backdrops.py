#!/usr/bin/env python3
"""Tiny pre-blurred backdrops: for every plate (and night plate) a 48 px wide, already blurred and slightly warmed copy in
art/plates/blur/ (and art/plates/blur/night/). The page stretches it smoothly behind the stage, which looks the same as a
28 px CSS blur of the full plate but costs the phone nothing: no full-screen filter to compute on every scene change.
Usage: python3 tools/backdrops.py"""
import os, glob
from PIL import Image, ImageFilter, ImageEnhance
ROOT = os.path.join(os.path.dirname(__file__), '..')
def make(src, dst):
    im = Image.open(src).convert('RGB')
    w = 48; h = max(1, round(im.height * w / im.width))
    small = im.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.6))
    small = ImageEnhance.Brightness(ImageEnhance.Color(small).enhance(1.1)).enhance(1.04)
    os.makedirs(os.path.dirname(dst), exist_ok=True); small.save(dst, 'WEBP', quality=82)
n = 0
for src in sorted(glob.glob(os.path.join(ROOT, 'art', 'plates', '*.webp'))):
    make(src, os.path.join(ROOT, 'art', 'plates', 'blur', os.path.basename(src))); n += 1
for src in sorted(glob.glob(os.path.join(ROOT, 'art', 'plates', 'night', '*.webp'))):
    make(src, os.path.join(ROOT, 'art', 'plates', 'blur', 'night', os.path.basename(src))); n += 1
print(n, 'backdrops')
