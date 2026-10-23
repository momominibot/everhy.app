#!/usr/bin/env python3
"""Headless browser smoke test of the Log panel at 390 px. Serves the repo locally; no outside network is used.
Run: python3 tools/smoke_log.py [shot.png]"""
import http.server, socketserver, sys, threading, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(ROOT))
srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{port}/index.html'
shot = sys.argv[1] if len(sys.argv) > 1 else None
fails, passes = [], 0


def check(name, ok):
    global passes
    if ok: passes += 1
    else: fails.append(name); print('FAIL', name)


def open_log(page):
    page.goto(URL)
    page.wait_for_function('window.EbbGame && window.EbbGame._ready')
    page.wait_for_timeout(300)
    if page.locator('.sf-onboard').count():  # the safety workstream's first-run welcome: skip it, as a returning player would
        page.locator('.sf-onboard').get_by_role('button', name='Skip all').click()
    page.evaluate("document.querySelectorAll('.routines-card').forEach(w => w.remove())")  # the morning card is not the log's business
    page.click('#moreBtn'); page.click('#panel-log')
    page.wait_for_selector('.ebb-log #lgInput')


def say(page, text):
    page.fill('#lgInput', text); page.press('#lgInput', 'Enter')


def obs(page):
    return page.evaluate('EbbGame.state().log.obs.filter(o => !o.retracted).length')


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    open_log(page)
    check('welcome line', 'in your own words' in page.inner_text('.lg-thread'))
    check('ring says not enough data', 'Not enough data yet' in page.inner_text('.lg-ring'))
    say(page, 'heavy flow, cramps 6/10, maybe a bit bloated')
    page.wait_for_selector('.lg-card .lg-save')
    items = page.inner_text('.lg-items')
    check('card lists heavy flow', 'Heavy flow' in items)
    check('card lists pain', 'Pain 6/10' in items)
    check('card marks hedged bloating', 'Bloating (maybe)' in items)
    check('nothing saved before Save', obs(page) == 0)
    page.click('.lg-edit'); page.wait_for_selector('.lg-editor select')
    page.select_option('.lg-items li:first-child select', 'medium')
    page.click('.lg-save')
    check('four entries saved', obs(page) == 4)
    check('edit applied before save', page.evaluate("EbbGame.state().log.obs.some(o => o.type === 'bleeding' && o.value === 'medium' && o.source === 'chat')"))
    check('ring shows day 1', 'Day 1' in page.inner_text('.lg-ring'))
    say(page, 'undo')
    page.wait_for_timeout(100)
    check('undo retracts the card', obs(page) == 0)
    check('undo reply', 'reversed your last change' in page.inner_text('.lg-thread'))
    say(page, 'some bleeding')
    page.wait_for_selector('text=is this spotting, or is your period starting?')
    page.click('.lg-card button:has-text("Period starting")')
    page.wait_for_selector('.lg-card .lg-save')
    check('clarified to period', 'Period (flow not given)' in page.inner_text('.lg-items'))
    page.click('.lg-save')
    check('period saved', obs(page) == 1)
    page.click('.lg-chip >> text=All good')
    page.wait_for_selector('.lg-card .lg-save')
    check('all good is a card, not a failure', 'All good is a real answer' in page.inner_text('.lg-card'))
    page.click('.lg-save')
    check('all good saved as a check-in', page.evaluate("EbbGame.state().log.obs.some(o => o.type === 'checkin' && o.value === 'all-good' && o.source === 'chip')"))
    page.click('.lg-chip >> text=Bleeding'); page.click('.lg-card button:has-text("Light flow")'); page.click('.lg-save')
    check('bleeding chip saved', page.evaluate("EbbGame.state().log.obs.filter(o => o.type === 'bleeding' && !o.retracted).length") == 2)
    say(page, 'how long were my last 6 cycles?')
    page.wait_for_timeout(100)
    check('ask the chart answers', 'Not enough data yet' in page.inner_text('.lg-thread'))
    say(page, 'the weather is lovely')
    page.wait_for_timeout(100)
    check('plain chat is not a failure', 'that’s fine' in page.inner_text('.lg-thread'))
    page.click('.lg-tabs >> text=Calendar')
    page.wait_for_selector('.lg-grid')
    days = page.eval_on_selector_all('.lg-grid [data-day]:not([disabled])', 'els => els.map(e => e.dataset.day)')
    target = days[0]
    page.click(f'[data-day="{target}"]'); page.click('.lg-dayedit button:has-text("Spotting")')
    check('calendar change waits for confirm', not page.evaluate(f"EbbGame.state().log.obs.some(o => o.start === '{target}' && o.source === 'calendar' && !o.retracted)"))
    page.click('.lg-calsave')
    check('calendar edit saved', page.evaluate(f"EbbGame.state().log.obs.some(o => o.start === '{target}' && o.value === 'spotting' && o.source === 'calendar')"))
    check('calendar marks spotting', 'spot' in page.get_attribute(f'[data-day="{target}"]', 'class'))
    page.click('.lg-tabs >> text=Chat')
    check('calendar edit echoed in thread', 'Calendar:' in page.inner_text('.lg-thread'))
    check('no horizontal scroll at 390', page.evaluate('document.documentElement.scrollWidth <= 390'))
    check('typing does not walk her', page.evaluate('EbbGame.me().action') != 'walk')
    check('game progress untouched by logging', page.evaluate('EbbGame.state().pond.offerings') == 0)
    if shot: page.screenshot(path=shot)
    page.keyboard.press('Escape')
    check('escape closes', page.query_selector('.ebb-log') is None)
    # every room topic opens through the 'log' spot kind as a bottom sheet that fits the phone
    TOPICS = {'bleeding': 'Flow and discharge', 'body': 'Body', 'cycle': 'Cycle', 'temperature': 'Waking temperature', 'sleep': 'Sleep', 'mood': 'Journal', 'mystery': 'Log'}
    for t, title in TOPICS.items():
        page.evaluate(f"EbbGame.act({{ spot: {{ id: 'test-{t}', kind: 'log', topic: '{t}', label: 'x', at: {{ x: 50, y: 50 }}, stand: {{ x: 50, y: 50 }} }} }})")
        want = t if t != 'mystery' else 'general'
        page.wait_for_selector(f'.ebb-log[data-topic="{want}"] .lg-chip')
        check(f'topic {t}: title', page.inner_text('#lgTitle') == title)
        check(f'topic {t}: chips', len(page.query_selector_all('.lg-chip')) >= 2)
        if t != 'mystery': check(f'topic {t}: opening line', page.inner_text('.lg-thread li:first-child').strip() != '')
        page.wait_for_function("document.querySelector('.lg-sheet').getAnimations().every(a => a.playState === 'finished')")
        box = page.eval_on_selector('.lg-sheet', 'e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom, r.width] }')
        inp = page.eval_on_selector('#lgInput', 'e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom] }')
        check(f'topic {t}: bottom sheet fits 390x844', box[0] > 60 and abs(box[1] - 844) < 1 and box[2] <= 390 and 0 < inp[0] and inp[1] <= 844)
        page.keyboard.press('Escape')
    # a few topic flows end to end
    page.evaluate("EbbGame.act({ spot: { id: 'tb', kind: 'log', topic: 'temperature', label: 'x', at: { x: 50, y: 50 }, stand: { x: 50, y: 50 } } })")
    page.wait_for_selector('.lg-chip'); page.click('.lg-chip >> text=Enter it')
    page.fill('.lg-num', '50'); page.click('.lg-card button:has-text("Next")')
    check('temperature: out of range is caught', page.is_visible('.lg-warn'))
    page.fill('.lg-num', '36.45'); page.click('.lg-card button:has-text("Next")'); page.click('.lg-save')
    check('temperature saved', page.evaluate("EbbGame.state().log.obs.some(o => o.type === 'temperature' && o.value === 36.45 && o.unit === 'C' && !o.retracted)"))
    page.keyboard.press('Escape')
    page.evaluate("EbbGame.act({ spot: { id: 'tm', kind: 'log', topic: 'mood', label: 'x', at: { x: 50, y: 50 }, stand: { x: 50, y: 50 } } })")
    page.wait_for_selector('#lgInput'); say(page, 'a long day, a bit stressed but proud of myself')
    page.wait_for_selector('.lg-card .lg-save')
    check('journal: note and mood on the card', 'Journal note' in page.inner_text('.lg-items') and 'stressed' in page.inner_text('.lg-items'))
    page.click('.lg-save')
    check('journal note saved verbatim', page.evaluate("EbbGame.state().log.obs.some(o => o.type === 'note' && o.value === 'a long day, a bit stressed but proud of myself')"))
    page.keyboard.press('Escape')
    page.evaluate("EbbGame.act({ spot: { id: 'ts', kind: 'log', topic: 'sleep', label: 'x', at: { x: 50, y: 50 }, stand: { x: 50, y: 50 } } })")
    page.wait_for_selector('#lgInput'); say(page, '7')
    page.wait_for_selector('.lg-card .lg-save')
    check('sleep topic: a bare number is hours', 'Slept 7 h' in page.inner_text('.lg-items'))
    page.keyboard.press('Escape')
    check('closing a sheet with an unsaved card saves nothing', not page.evaluate("EbbGame.state().log.obs.some(o => o.type === 'sleep' && o.value === 7)"))
    page.evaluate("EbbGame.act({ spot: { id: 'tw', kind: 'log', topic: 'bleeding', label: 'x', at: { x: 50, y: 50 }, stand: { x: 50, y: 50 } } })")
    page.wait_for_selector('.lg-chip'); page.click('.lg-chip >> text=Mucus'); page.click('.lg-card button:has-text("creamy")'); page.click('.lg-save')
    check('mucus saved from the toilet sheet', page.evaluate("EbbGame.state().log.obs.some(o => o.type === 'mucus' && o.value === 'creamy' && o.source === 'chip')"))
    page.keyboard.press('Escape')
    check('no page errors', not errors)
    if errors: print(errors)

    # safety hooks: crisis text shows nothing from logging; a confirmed write calls check and showAlert
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844})
    STUB = ("""() => { window.__alerts = []; window.__checks = [];
      window.EbbSafety = { crisis: t => /hurt myself/.test(t), check: (o, all, p) => { window.__checks.push([o.type, all.length, typeof p]); return o.value === 'heavy' ? [{ id: 'heavy' }] : []; },
        showAlert: a => window.__alerts.push(a.id) }; }""")
    p2 = ctx2.new_page()
    open_log(p2)
    p2.evaluate(STUB)  # after load: the real safety module (merged since) would otherwise replace the stand-in; the log reads it at call time
    before = p2.inner_text('.lg-thread')
    say(p2, 'i want to hurt myself and heavy flow')
    p2.wait_for_timeout(150)
    check('crisis: no card', p2.query_selector('.lg-card') is None)
    check('crisis: nothing added to the thread', p2.inner_text('.lg-thread') == before)
    p2.click('.lg-chip >> text=Bleeding')
    say(p2, 'i want to hurt myself')
    p2.wait_for_timeout(150)
    check('crisis: an open picker is cleared too', p2.query_selector('.lg-card') is None)
    say(p2, 'heavy flow and cramps')
    p2.wait_for_selector('.lg-card .lg-save'); p2.click('.lg-save')
    check('safety check called per new entry', p2.evaluate('window.__checks.length') == 2)
    check('safety alert shown', p2.evaluate('window.__alerts') == ['heavy'])
    p2.click('.lg-tabs >> text=Calendar'); p2.wait_for_selector('.lg-grid')
    day = p2.eval_on_selector_all('.lg-grid [data-day]:not([disabled])', 'els => els.map(e => e.dataset.day)')[0]
    p2.click(f'[data-day="{day}"]'); p2.click('.lg-dayedit button:has-text("Heavy flow")'); p2.click('.lg-calsave')
    check('safety check runs after a calendar write', p2.evaluate('window.__checks.length') == 3)
    b.close()

srv.shutdown()
print(f'log smoke: {passes} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
