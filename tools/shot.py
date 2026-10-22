#!/usr/bin/env python3
"""Phone screenshots of Ebb: shot.py out_prefix [scene ...]. Needs the dev server on 8096. Seeds a farm with every
crop stage so the plots can be checked. Writes <prefix>_<scene>.png and prints console errors (404s for empty
extension slots are expected on main)."""
import sys
from playwright.sync_api import sync_playwright
out = sys.argv[1]; scenes = sys.argv[2:] or ['bedroom', 'farm', 'waterfall']
SEED = """(() => { const s = EbbGame.state(), t = EbbStore.today(), b = s.farm.beds;
  const past = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  b[0] = { state: 'tilled', crop: null, watered: [] };
  b[1] = { state: 'planted', crop: 'turnip', watered: [t] };
  b[2] = { state: 'planted', crop: 'carrot', watered: [past(1)] };
  b[3] = { state: 'planted', crop: 'sunflower', watered: [past(3), past(2)] };
  b[4] = { state: 'planted', crop: 'turnip', watered: [past(2), past(1)] };
  EbbGame.api.refresh(); })()"""
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto('http://localhost:8096/'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready')
    pg.evaluate(SEED)
    for sc in scenes:
        pg.evaluate(f"EbbGame.enter('{sc}')"); pg.wait_for_timeout(900)
        pg.screenshot(path=f'{out}_{sc}.png')
    print('errors:', errs)
    br.close()
