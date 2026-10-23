#!/usr/bin/env python3
"""Headless browser check of tucking into bed at 390 px. Serves this checkout on a free port; no outside network.
Run: python3 tools/smoke_sleep.py [shot_prefix]. With a prefix it also writes <prefix>_asleep.png (her in bed) and
<prefix>_lamp.png (standing by the moved bunny lamp)."""
import http.server, socketserver, sys, threading, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{port}/index.html?time=14:00'
shot = sys.argv[1] if len(sys.argv) > 1 else None
fails, passes = [], 0

def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(name); print('FAIL', name, extra)

STATE = """() => ({ overlay: !!document.querySelector('#props .sleep-overlay'), me: getComputedStyle(document.getElementById('me')).display,
  dim: !!document.querySelector('#stage > .sleep-dim.on'), sheet: !!document.querySelector('.sleep-wrap'), log: !!document.querySelector('.ebb-log'),
  action: EbbGame.me().action, x: EbbGame.me().x, y: EbbGame.me().y, scene: EbbGame.api.scene(), inBed: EbbSleep.inBed(),
  prompt: (document.getElementById('prompt') || {}).hidden })"""

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto(URL); pg.evaluate("localStorage.clear()")
    pg.evaluate("() => { try { if (window.EbbSafety && EbbSafety.seedReturning) EbbSafety.seedReturning(); } catch (e) {} }")
    pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready')
    pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")
    pg.evaluate("EbbGame.enter('bedroom')"); pg.wait_for_timeout(300)
    bed = pg.evaluate("() => EbbWorld.SCENES.bedroom.spots.find(s => s.id === 'bed')")
    check('the bed is the sleep kind', bed['kind'] == 'sleep')
    s0 = pg.evaluate(STATE)
    check('nothing asleep before the tap', not s0['overlay'] and s0['me'] != 'none' and not s0['dim'] and not s0['sheet'])

    # she walks to the bed and climbs in, as a tap on the bed would
    pg.evaluate("(q) => EbbGame.walkTo(q.stand, { spot: q })", bed); pg.wait_for_timeout(350)
    pg.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=20000); pg.wait_for_timeout(300)
    s1 = pg.evaluate(STATE)
    check('she is in bed after the walk', s1['inBed'] and s1['action'] == 'sit', str(s1))
    check('the asleep overlay is drawn in the props layer', s1['overlay'], str(s1))
    check('her sprite is hidden', s1['me'] == 'none', str(s1))
    check('the room is dimmed inside the stage', s1['dim'], str(s1))
    check('the Good night sheet is open', s1['sheet'] and pg.evaluate("document.querySelector('.sleep-wrap h2').textContent") == 'Good night', str(s1))
    check('no prompt while she sleeps', s1['prompt'] is True, str(s1))
    ov = pg.evaluate("() => { const i = document.querySelector('#props .sleep-overlay'); return [i.getAttribute('x'), i.getAttribute('y'), i.getAttribute('width'), i.getAttribute('height')].map(Number); }")
    check('the overlay sits at the bed rect', ov == [22, 34, 34, 32], str(ov))
    check('the overlay image loads', pg.evaluate("() => fetch('art/overlays/bedroom-asleep.webp').then(r => r.ok)"))
    check('the arch door is still drawn in front', pg.evaluate("() => !!document.querySelector('#front image[href*=\"bedroom-arch-door\"]')"))
    if shot:
        pg.wait_for_timeout(1500); pg.screenshot(path=f'{shot}_asleep.png')

    # a tap on the floor does not move her while she is in bed
    before = (s1['x'], s1['y'])
    pg.evaluate("document.querySelector('.sleep-wrap').remove()")  # the sheet would swallow the tap; the engine's sitting state must hold on its own
    pg.evaluate("""() => { const sc = document.getElementById('scene'), r = sc.getBoundingClientRect();
      sc.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.8 })); }""")
    pg.wait_for_timeout(500)
    s2 = pg.evaluate(STATE)
    check('a floor tap does not get her out of bed', s2['inBed'] and s2['action'] == 'sit' and (s2['x'], s2['y']) == before, str(s2))
    check('the sheet comes back on its own', s2['sheet'] or pg.wait_for_function("() => !!document.querySelector('.sleep-wrap')", timeout=2000))

    # logging last night's sleep opens the log extension's own sleep pop-up; closing it brings the sheet back
    pg.click('.sleep-wrap [data-act="log"]')
    pg.wait_for_function("() => !!document.querySelector('.ebb-log')", timeout=5000)
    s3 = pg.evaluate(STATE)
    check('the sleep log opened', s3['log'] and pg.evaluate("document.querySelector('.ebb-log').dataset.topic") == 'sleep', str(s3))
    check('she stays in bed while logging', s3['inBed'] and s3['overlay'] and s3['me'] == 'none', str(s3))
    check('the Good night sheet stepped aside for the log', not s3['sheet'], str(s3))
    pg.evaluate("EbbLog.close()")
    pg.wait_for_function("() => !!document.querySelector('.sleep-wrap') && !document.querySelector('.ebb-log')", timeout=3000)
    check('the sheet returns once the log closes', True)

    # get up: everything restored, she stands by the bed
    pg.click('.sleep-wrap [data-act="getup"]'); pg.wait_for_timeout(300)
    s4 = pg.evaluate(STATE)
    check('she is up', not s4['inBed'] and s4['action'] == 'idle', str(s4))
    check('the overlay is gone', not s4['overlay'], str(s4))
    check('her sprite shows again', s4['me'] != 'none', str(s4))
    check('the room is bright again', not s4['dim'], str(s4))
    check('the sheet is closed', not s4['sheet'], str(s4))
    check('she stands by the bed', abs(s4['x'] - bed['stand']['x']) < 0.6 and abs(s4['y'] - bed['stand']['y']) < 0.6, str(s4))
    pg.wait_for_timeout(200)
    check('the prompt by the bed asks how she slept', pg.evaluate("document.getElementById('prompt').textContent") == 'How did you sleep?' and not pg.evaluate("document.getElementById('prompt').hidden"))
    check('a second tuck works through the prompt', pg.evaluate("() => { document.getElementById('prompt').click(); return EbbSleep.inBed(); }"))
    pg.wait_for_timeout(200)

    # a scene change gets her up on its own
    pg.evaluate("EbbGame.enter('bathroom')"); pg.wait_for_timeout(600)
    s5 = pg.evaluate(STATE)
    check('leaving the room gets her up', not s5['inBed'] and s5['scene'] == 'bathroom' and not s5['dim'] and not s5['sheet'] and s5['me'] != 'none', str(s5))
    pg.evaluate("EbbGame.enter('bedroom')"); pg.wait_for_timeout(300)
    check('back in the bedroom nothing lingers', not pg.evaluate(STATE)['overlay'] and not pg.evaluate("!!document.querySelector('#stage > .sleep-dim.on')"))

    # the moved lamp: she arrives from the bathroom beside it, on open floor, and can walk straight to the wider door
    arrive = pg.evaluate("() => EbbWorld.SCENES.bathroom.doors.find(d => d.to === 'bedroom').arrive")
    pg.evaluate("(a) => EbbGame.enter('bedroom', a)", arrive); pg.wait_for_timeout(900)
    check('she stands on walkable floor beside the lamp', pg.evaluate("() => EbbWorld.walkable('bedroom', EbbGame.me())"))
    if shot: pg.screenshot(path=f'{shot}_lamp.png')
    door = pg.evaluate("() => { const d = EbbWorld.SCENES.bedroom.doors.find(d => d.id === 'toBathroom'); return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }")
    pg.evaluate("(q) => EbbGame.walkTo(q)", door)
    try:
        pg.wait_for_function("() => EbbGame.api.scene() === 'bathroom' && !document.getElementById('scene').classList.contains('fading')", timeout=20000); check('the wider door still leads to the bathroom', True)
    except Exception as e: check('the wider door still leads to the bathroom', False, str(e).split('\n')[0])

    check('no page or console errors', not errs, str(errs))
    br.close()
print(f'smoke_sleep: {passes} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
