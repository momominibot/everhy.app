#!/usr/bin/env python3
"""Walk the whole world in the live page: smoke_doors.py [port]. Needs the dev server (default 8096). For every scene
the engine knows (extensions included) she walks through each door and must arrive in the room it names on a walkable
spot; she walks to every spot's stand point and the action prompt must offer that spot; she reaches every bed stand.
Starts as a returning, consented player so no sheet covers the room."""
import sys
from playwright.sync_api import sync_playwright
port = sys.argv[1] if len(sys.argv) > 1 else '8096'
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto(f'http://localhost:{port}/?time=14:00'); pg.evaluate("localStorage.clear()")
    pg.evaluate("() => { try { if (window.EbbSafety && EbbSafety.seedReturning) EbbSafety.seedReturning(); } catch (e) {} }")
    pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready')
    pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")
    plan = pg.evaluate("""() => { const W = EbbWorld, out = []; Object.keys(W.SCENES).forEach(id => { const s = W.SCENES[id];
      s.doors.forEach(d => out.push({ kind: 'door', scene: id, id: d.id, to: d.to, x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }));
      s.spots.forEach(sp => out.push({ kind: 'spot', scene: id, id: sp.id, label: sp.label, x: sp.stand.x, y: sp.stand.y }));
      (s.beds || []).forEach((b, i) => out.push({ kind: 'bed', scene: id, id: 'bed' + i, x: b.stand.x, y: b.stand.y })); }); return out; }""")
    fails = 0
    for step in plan:
        pg.evaluate(f"EbbGame.enter('{step['scene']}')"); pg.wait_for_timeout(200)
        pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")
        pg.evaluate("(q) => EbbGame.walkTo(q)", {'x': step['x'], 'y': step['y']})
        try:
            if step['kind'] == 'door':
                pg.wait_for_function("to => EbbGame.api.scene() === to && !document.getElementById('scene').classList.contains('fading')", arg=step['to'], timeout=20000)
                if not pg.evaluate("() => EbbWorld.walkable(EbbGame.api.scene(), EbbGame.me())"): fails += 1; print('FAIL arrival not walkable', step)
            else:
                pg.wait_for_timeout(350) # the walk starts on the next frame
                pg.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=20000); pg.wait_for_timeout(120)
                me = pg.evaluate("() => ({ x: EbbGame.me().x, y: EbbGame.me().y, scene: EbbGame.api.scene(), prompt: (document.querySelector('.actionbar .prompt') || {}).textContent || '' })")
                if me['scene'] != step['scene'] or abs(me['x'] - step['x']) > 1.5 or abs(me['y'] - step['y']) > 1.5: fails += 1; print('FAIL did not reach the stand', step, me)
                elif step['kind'] == 'spot' and step['label'] not in me['prompt']: fails += 1; print('FAIL prompt', repr(step['label']), 'got', repr(me['prompt']), step['scene'], step['id'])
        except Exception as e:
            fails += 1; print('FAIL', 'door never opened' if step['kind'] == 'door' else 'walk stalled', step, str(e).split('\n')[0])
    # the live plate: the waterfall's loop plays over the still plate, and stays away under reduced motion
    live = 0
    live_scene = pg.evaluate("() => Object.keys(EbbWorld.SCENES).find(id => EbbWorld.SCENES[id].video) || ''")
    pg.evaluate("id => EbbGame.enter(id)", live_scene)
    try:
        pg.wait_for_function("() => { const v = document.querySelector('video.live-plate'); return v && !v.hidden && v.currentTime > 0.4 && EbbLive.active(); }", timeout=15000)
        if pg.evaluate("() => document.querySelectorAll('#props .atmo-waterfall').length") != 0: fails += 1; print('FAIL drawn water still shown over the live plate')
        pg.evaluate("document.documentElement.setAttribute('data-motion', 'reduce')")
        pg.wait_for_function("() => { const v = document.querySelector('video.live-plate'); return v && v.hidden && !EbbLive.active(); }", timeout=5000)
        pg.evaluate("document.documentElement.removeAttribute('data-motion')"); live = 3
        plan.extend([{'kind': 'live'}] * 3)
    except Exception as e:
        fails += 1; plan.append({'kind': 'live'}); print('FAIL live plate', str(e).split('\n')[0])
    # zoom: the wheel, a two-finger pinch and the keys change the stage size within bounds, and a pinch is not a tap
    def stage_w(): return pg.evaluate("() => document.getElementById('stage').getBoundingClientRect().width")
    pg.evaluate("EbbGame.enter('farm')"); pg.wait_for_timeout(200); base = stage_w(); zchecks = []
    pg.mouse.move(195, 500); pg.mouse.wheel(0, -600); pg.wait_for_timeout(100); zchecks.append(('wheel up zooms in', stage_w() > base * 1.3))
    pg.evaluate("EbbGame.api.zoom(0)"); pg.wait_for_timeout(50); zchecks.append(('zoom(0) resets', abs(stage_w() - base) < 1))
    pg.evaluate("EbbGame.api.zoom(100)"); zchecks.append(('zoom in is bounded', abs(stage_w() - base * 2.4) < 2))
    pg.evaluate("EbbGame.api.zoom(0.001)"); zchecks.append(('zoom out never uncovers the screen', stage_w() >= 389 and pg.evaluate("() => document.getElementById('stage').getBoundingClientRect().height") >= 843))
    pg.evaluate("EbbGame.api.zoom(0)")
    before = pg.evaluate("() => ({ x: EbbGame.me().x, y: EbbGame.me().y })")
    pg.evaluate("""() => { const sc = document.getElementById('scene'); const mk = (id, x, y) => new Touch({ identifier: id, target: sc, clientX: x, clientY: y });
      const fire = (type, ts) => sc.dispatchEvent(new TouchEvent(type, { touches: ts, changedTouches: ts, targetTouches: ts, bubbles: true, cancelable: true }));
      fire('touchstart', [mk(1, 150, 400), mk(2, 250, 400)]); fire('touchmove', [mk(1, 100, 400), mk(2, 300, 400)]); fire('touchend', []); }""")
    pg.wait_for_timeout(100); zchecks.append(('pinch zooms in', stage_w() > base * 1.6))
    pg.mouse.click(195, 600); pg.wait_for_timeout(300)
    after = pg.evaluate("() => ({ x: EbbGame.me().x, y: EbbGame.me().y, a: EbbGame.me().action })")
    zchecks.append(('a tap right after the pinch does not walk', after['a'] != 'walk' and abs(after['x'] - before['x']) < 0.5))
    pg.evaluate("EbbGame.api.zoom(0)")
    for name, ok in zchecks:
        plan.append({'kind': 'zoom'})
        if not ok: fails += 1; print('FAIL zoom:', name)
    print(f'smoke_doors: {len(plan) - fails} of {len(plan)} passed; page errors: {errs}')
    br.close(); sys.exit(1 if fails or errs else 0)
