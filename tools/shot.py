#!/usr/bin/env python3
"""Screenshot Ebb scenes with headless Chromium: shot.py out_prefix [scene ...]. Needs the dev server on 8096."""
import sys
from playwright.sync_api import sync_playwright
out = sys.argv[1]; scenes = sys.argv[2:] or ['bedroom', 'farm', 'waterfall']
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 430, 'height': 760}, device_scale_factor=2)
    errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8096/'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready')
    for sc in scenes:
        pg.evaluate(f"EbbGame.enter('{sc}')"); pg.wait_for_timeout(900)
        pg.locator('#scene').screenshot(path=f'{out}_{sc}.png')
    print('errors:', errs)
    b.close()
