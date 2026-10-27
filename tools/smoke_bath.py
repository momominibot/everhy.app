#!/usr/bin/env python3
"""Headless browser smoke test of the bathroom rework at 390 px: the Ovia button and topic picker, the mindful
brushing sheet at the sink, and the toilet's quiet pause. Serves the repo locally; no outside network is used.
Run: python3 tools/smoke_bath.py [shot.png]"""
import http.server, socketserver, sys, threading, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(ROOT))
srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{port}/index.html?hearts=999'
shot = sys.argv[1] if len(sys.argv) > 1 else None
fails, passes = [], []


def check(name, ok):
    (passes if ok else fails).append(name)
    if not ok: print('FAIL', name)


def goto(page):
    page.goto(URL)
    page.wait_for_function('window.EbbGame && window.EbbGame._ready')
    page.wait_for_timeout(300)
    if page.locator('.sf-onboard').count():
        page.locator('.sf-onboard').get_by_role('button', name='Skip all').click()
    page.evaluate("document.querySelectorAll('.routines-card').forEach(w => w.remove())")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text and 'ripples.js' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERR ' + str(e)))

    goto(page)

    # 1. the Ovia button is always present
    check('Ovia button present', bool(page.query_selector('#oviaBtn')))
    page.evaluate('EbbLog.home()')
    page.wait_for_selector('.lg-home .lg-topics')
    topics = page.evaluate("[...document.querySelectorAll('.lg-topic')].map(x => x.textContent.trim())")
    check('topic picker lists seven topics', len(topics) == 7)
    for want in ['Flow and cycle', 'Body', 'Sleep', 'Mood', 'Food and drink', 'Waking temperature', 'Just chat']:
        check('topic picker has ' + want, any(t.startswith(want) for t in topics))

    # 2. a topic opens its log sheet
    page.evaluate("""() => { const t=[...document.querySelectorAll('.lg-topic')].find(x=>x.textContent.trim().startsWith('Body')); t.click(); }""")
    page.wait_for_selector(".ebb-log[data-topic='body'] #lgInput")
    check('Body topic opens its log chat', page.evaluate("document.querySelector('.ebb-log').dataset.topic") == 'body')
    page.evaluate('EbbLog.close()')
    page.wait_for_timeout(200)

    # 3. the bathroom fixtures no longer log
    page.evaluate("EbbGame.api.enter('bathroom')")
    page.wait_for_timeout(800)
    kinds = page.evaluate("""() => { const s=EbbWorld.SCENES.bathroom.spots; return { sink:s.find(x=>x.id==='sink').kind, toilet:s.find(x=>x.id==='toilet').kind }; }""")
    check('sink is a brushing action, not a log', kinds['sink'] == 'brushing')
    check('toilet is a quiet action, not a log', kinds['toilet'] == 'toilet')

    # 4. walking to the sink runs the mindful brushing sheet
    page.evaluate("""() => { const s=EbbWorld.SCENES.bathroom.spots.find(x=>x.id==='sink'); EbbGame.walkTo(s.stand, {spot:s}); }""")
    page.wait_for_selector('.bath-wrap .bath-sheet')
    check('brushing sheet opens', bool(page.query_selector('.bath-wrap .bath-sheet')))
    cue = page.evaluate("document.querySelector('.bath-wrap .rt-cue').textContent")
    check('brushing shows a cue', 'sink' in cue)
    clock = page.evaluate("document.querySelector('.bath-wrap .rt-clock').textContent")
    check('brushing shows a running clock', 'left' in clock and 'paused' not in clock)
    check('brushing offers a mute-Erin control', bool(page.query_selector('.bath-wrap .rt-voice')))
    # the cues have Erin clips
    clip_count = page.evaluate('Object.keys(EbbBathVoice.clips).length')
    check('all eight brushing cues have Erin clips', clip_count == 8)
    if shot: page.screenshot(path=shot)
    page.evaluate("document.querySelector(\"[data-act='stop']\").click()")
    page.wait_for_timeout(200)

    # 5. the toilet is a quiet pause that saves nothing
    page.evaluate("""() => { const s=EbbWorld.SCENES.bathroom.spots.find(x=>x.id==='toilet'); EbbGame.walkTo(s.stand, {spot:s}); }""")
    page.wait_for_selector('.bath-wrap .bath-sheet')
    tcue = page.evaluate("document.querySelector('.bath-wrap .rt-cue').textContent")
    check('toilet says nothing is saved', 'Nothing is saved' in tcue)
    page.evaluate("document.querySelector(\"[data-act='done']\").click()")
    page.wait_for_timeout(200)

    check('no console errors', not errors)
    if errors: print(errors)
    b.close()

print(f'smoke_bath: {len(passes)} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
