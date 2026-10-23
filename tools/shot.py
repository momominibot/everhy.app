#!/usr/bin/env python3
"""Phone screenshots of Ebb: shot.py out_prefix [scene ...]. Needs the dev server on 8096. Starts as a returning,
consented player (onboarding skipped) with a farm seeded at every crop stage. Writes <prefix>_<scene>.png and prints
page errors; 404s for empty extension slots are not errors. EBB_PORT=8097 points it at another server."""
import os, sys
from playwright.sync_api import sync_playwright
out = sys.argv[1]; scenes = sys.argv[2:] or ['bedroom', 'bathroom', 'farm', 'waterfall']
URL = f"http://localhost:{os.environ.get('EBB_PORT', '8096')}/?time=14:00"
SEED = """(() => { const s = EbbGame.state(), t = EbbStore.today(), b = s.farm.beds;
  const past = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  b[0] = { state: 'tilled', crop: null, watered: [] };
  b[1] = { state: 'planted', crop: 'turnip', watered: [t] };
  b[2] = { state: 'planted', crop: 'carrot', watered: [past(1)] };
  b[3] = { state: 'planted', crop: 'sunflower', watered: [past(3), past(2)] };
  EbbGame.api.refresh(); })()"""
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx; errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    # a returning player: the saved game carries the safety module's own onboarding record, so no sheet covers the room
    pg.goto(URL); pg.wait_for_function('window.EbbGame && EbbGame._ready'); pg.evaluate("localStorage.clear()")
    pg.evaluate("""() => { const s = EbbGame.state(); s.safety = Object.assign({}, s.safety, { onboardedAt: '2026-10-22T08:00:00Z',
      onboardVersion: (window.EbbSafetyUi && EbbSafetyUi.ONBOARD_VERSION) || 'onboard-2026-10-22.1' }); EbbGame.api.save(); }""")
    pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready'); pg.wait_for_timeout(300)
    if pg.evaluate("() => !!document.querySelector('.sf-onboard')"): errs.append('onboarding sheet opened for a returning player')
    pg.evaluate(SEED)
    for sc in scenes:
        pg.evaluate(f"EbbGame.enter('{sc}')"); pg.wait_for_timeout(900)
        pg.screenshot(path=f'{out}_{sc}.png')
    print('errors:', errs)
    br.close()
