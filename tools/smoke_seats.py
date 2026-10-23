#!/usr/bin/env python3
"""Headless browser check of the outdoor seats at 390 px. Serves this checkout on a free port; no outside network.
Run: python3 tools/smoke_seats.py [shot_prefix]. With a prefix it also writes <prefix>_hawker.png (seated at the kopi
table, sheet open), <prefix>_sip.png (the kopi sip running), <prefix>_lake.png (the Little Guilin bench) and
<prefix>_merlion.png (the stone bench)."""
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

STATE = """() => ({ sheet: !!document.querySelector('.seat-wrap'), title: (document.querySelector('.seat-sheet h2') || {}).textContent || '',
  actions: [...document.querySelectorAll('.seat-action b')].map(b => b.textContent), clock: (document.querySelector('.seat-clock') || {}).textContent || '',
  count: (document.querySelector('.seat-count') || {}).textContent || '', done: (document.querySelector('.seat-done') || {}).textContent || '',
  action: EbbGame.me().action, x: EbbGame.me().x, y: EbbGame.me().y, scene: EbbGame.api.scene(), seated: EbbSeats.seated(), running: EbbSeats.running(),
  prompt: (document.getElementById('prompt') || {}).hidden, up: !!document.querySelector('.seat-up'), ring: !!document.querySelector('#props .seat-ring'),
  steam: !!document.querySelector('#fx .seat-steam'), obs: EbbGame.state().observations.filter(o => o.source === 'seat').length })"""

def snap(pg, path):
    """a screenshot without the routines' own morning or evening card over the scene"""
    pg.evaluate("document.querySelectorAll('.routine-card [data-act=notnow]').forEach(b => b.click())"); pg.wait_for_timeout(250)
    pg.screenshot(path=path)

def walk_to(pg, spot):
    """as a tap on the seat would: walk to its stand point, then act on it"""
    pg.evaluate("(q) => EbbGame.walkTo(q.stand, { spot: q })", spot); pg.wait_for_timeout(350)
    pg.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=20000); pg.wait_for_timeout(300)
    if pg.locator('.seat-choice [data-act="mindful"]').count():  # she just sits first; the seat's options come with A mindful moment
        CHIPS.append(pg.locator('.seat-choice .btn').all_inner_texts())
        pg.click('.seat-choice [data-act="mindful"]'); pg.wait_for_timeout(250)

CHIPS = []
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto(URL); pg.evaluate("localStorage.clear()")
    pg.evaluate("() => { try { if (window.EbbSafety && EbbSafety.seedReturning) EbbSafety.seedReturning(); } catch (e) {} }")
    pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready')
    pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")

    # the three seats are the seat kind; the course's cushions are not
    kinds = pg.evaluate("() => ({ table: EbbWorld.SCENES.hawker.spots.find(s => s.id === 'table').kind, lake: EbbWorld.SCENES.waterfall.spots.find(s => s.id === 'bench').kind, stone: EbbWorld.SCENES.merlion.spots.find(s => s.id === 'bench').kind, cushion: EbbWorld.SCENES.bedroom.spots.find(s => s.id === 'cushion').kind, sofa: EbbWorld.SCENES.living.spots.find(s => s.id === 'sofa').kind })")
    check('the outdoor seats are seats, the cushions stay with the course', kinds == {'table': 'seat', 'lake': 'seat', 'stone': 'seat', 'cushion': 'cushion', 'sofa': 'cushion'}, str(kinds))

    # ---------- the hawker table ----------
    pg.evaluate("EbbGame.enter('hawker')"); pg.wait_for_timeout(300)
    table = pg.evaluate("() => EbbWorld.SCENES.hawker.spots.find(s => s.id === 'table')")
    s0 = pg.evaluate(STATE)
    check('nothing seated before the tap', not s0['sheet'] and not s0['seated'] and s0['action'] != 'sit')
    # standing near the seat shows the ring
    pg.evaluate("(q) => EbbGame.walkTo(q)", table['stand']); pg.wait_for_timeout(350)
    pg.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=20000); pg.wait_for_timeout(300)
    s1 = pg.evaluate(STATE)
    check('a ring on the seat when she stands near it', s1['ring'] and not s1['seated'], str(s1))
    check('the prompt offers the seat', pg.evaluate("() => document.getElementById('prompt').textContent") == table['label'])
    walk_to(pg, table)
    s2 = pg.evaluate(STATE)
    sit = pg.evaluate("(q) => EbbSeatRules.sitAt(q)", table)
    check('she sits on the table seat', s2['action'] == 'sit' and s2['seated'] and abs(s2['x'] - sit['x']) < 0.01 and abs(s2['y'] - sit['y']) < 0.01, str(s2))
    check('the seat sheet opens with the table actions', s2['sheet'] and s2['title'] == 'At the kopi table' and s2['actions'] == ['Sip your kopi', 'Three slow breaths', 'People-watch', 'Just sit'], str(s2))
    check('the walking prompt and the ring are gone while seated', s2['prompt'] and not s2['ring'])
    if shot: snap(pg, f'{shot}_hawker.png')
    # a walk tap on the floor does nothing while she sits
    pg.evaluate("(q) => EbbGame.walkTo(q)", {'x': 50, 'y': 160}); pg.wait_for_timeout(600)
    s3 = pg.evaluate(STATE)
    check('she just sits first: Just sit, A mindful moment, Get up, and no sheet before she asks', bool(CHIPS) and CHIPS[0] == ['Just sit', 'A mindful moment', 'Get up'])
    check('a floor tap does not move her while seated', s3['action'] == 'sit' and abs(s3['x'] - sit['x']) < 0.01, str(s3))
    pg.evaluate("document.getElementById('scene').click()"); pg.wait_for_timeout(400)
    check('a scene click does not stand her up', pg.evaluate(STATE)['action'] == 'sit')

    # three slow breaths: a clock, a count, pause and resume, then skip
    pg.click('.seat-action[data-action="breaths"]'); pg.wait_for_timeout(1300)
    r0 = pg.evaluate(STATE)
    check('breaths runs with a clock and a count', r0['running'] and r0['title'] == 'Three slow breaths' and r0['clock'].startswith('0:2') and r0['count'].startswith('Breath 1 of 3'), str(r0))
    pg.click('.seat-sheet [data-act="pause"]'); pg.wait_for_timeout(150)
    paused_clock = pg.evaluate(STATE)['clock']
    pg.wait_for_timeout(1200)
    r1 = pg.evaluate(STATE)
    check('pause holds the clock', 'paused' in r1['clock'] and r1['clock'] == paused_clock and pg.evaluate("() => document.querySelector('.seat-sheet [data-act=pause]').textContent") == 'Resume', str(r1))
    pg.click('.seat-sheet [data-act="pause"]'); pg.wait_for_timeout(1200)
    r2 = pg.evaluate(STATE)
    check('resume counts again', 'paused' not in r2['clock'] and r2['clock'] < paused_clock.replace(', paused', ''), str(r2) + ' ' + paused_clock)
    pg.click('.seat-sheet [data-act="skip"]'); pg.wait_for_timeout(300)
    r3 = pg.evaluate(STATE)
    check('skip after a few seconds saves nothing and returns to the menu', not r3['running'] and r3['sheet'] and r3['title'] == 'At the kopi table' and r3['obs'] == 0 and r3['done'].startswith('Skipped'), str(r3))
    check('still seated after skipping', r3['action'] == 'sit' and r3['seated'])

    # the kopi sip draws steam over the cup; a long enough run saves an observation (the clock is faked forward)
    pg.click('.seat-action[data-action="sip"]'); pg.wait_for_timeout(600)
    r4 = pg.evaluate(STATE)
    check('sipping shows steam over the cup', r4['running'] and r4['steam'], str(r4))
    if shot: snap(pg, f'{shot}_sip.png')
    # the clock is nudged forward a second at a time: a single big jump would only count the 1.5 s cap, by design
    pg.evaluate("() => { const real = Date.now; window.__realNow = real; window.__off = 0; Date.now = () => real() + window.__off; }")
    for _ in range(24): pg.evaluate("window.__off += 1000"); pg.wait_for_timeout(270)
    pg.wait_for_timeout(400)
    r5 = pg.evaluate(STATE)
    check('a sip run to the end saves one seat observation', not r5['running'] and r5['obs'] == 1 and 'Saved' in r5['done'] and not r5['steam'], str(r5))
    rec = pg.evaluate("() => EbbGame.state().observations.find(o => o.source === 'seat')")
    check('the record carries where and which seat', rec and rec['type'] == 'mindfulness' and rec['where'] == 'hawker' and rec['seat'] == 'table' and rec['status'] == 'finished' and rec['activeSec'] >= 20 and rec['practice'] == 'seat-sip', str(rec))
    pg.evaluate("() => { Date.now = window.__realNow; delete window.__realNow; delete window.__off; }")  # back to the real clock
    check('Date.now is real again', pg.evaluate("() => Math.abs(Date.now() - new Date().getTime()) < 50"))

    # Just sit: the sheet closes and a Get up button waits where the prompt was
    pg.click('.seat-action[data-action="still"]'); pg.wait_for_timeout(300)
    j = pg.evaluate(STATE)
    check('just sit leaves her seated with only a Get up button', not j['sheet'] and j['up'] and j['action'] == 'sit' and j['seated'], str(j))
    pg.click('.seat-up'); pg.wait_for_timeout(300)
    g = pg.evaluate(STATE)
    check('get up stands her where the walk ended', not g['seated'] and g['action'] != 'sit' and not g['up'] and not g['sheet'] and abs(g['x'] - table['stand']['x']) < 0.01 and abs(g['y'] - table['stand']['y']) < 0.01, str(g))
    check('the walking prompt is back', not g['prompt'])

    # ---------- the lake bench, and a scene change stands her up ----------
    pg.evaluate("EbbGame.enter('waterfall')"); pg.wait_for_timeout(300)
    lake = pg.evaluate("() => EbbWorld.SCENES.waterfall.spots.find(s => s.id === 'bench')")
    walk_to(pg, lake)
    l0 = pg.evaluate(STATE)
    check('she sits on the lake bench with its actions', l0['seated'] and l0['action'] == 'sit' and l0['title'] == 'On the lake bench' and l0['actions'] == ['Watch the water', 'Three slow breaths', 'Listen', 'Just sit'], str(l0))
    if shot: snap(pg, f'{shot}_lake.png')
    pg.click('.seat-action[data-action="water"]'); pg.wait_for_timeout(500)
    check('watch the water runs for a minute', pg.evaluate(STATE)['clock'].startswith('0:59') or pg.evaluate(STATE)['clock'].startswith('1:00'))
    pg.evaluate("EbbGame.enter('farm')"); pg.wait_for_timeout(500)
    l1 = pg.evaluate(STATE)
    check('a scene change clears the seat, the sheet and the clock', not l1['seated'] and not l1['sheet'] and not l1['running'] and l1['scene'] == 'farm' and l1['action'] != 'sit', str(l1))
    check('the short interrupted run saved nothing', l1['obs'] == 1)

    # ---------- the stone bench: Get up from the menu ----------
    pg.evaluate("EbbGame.enter('merlion')"); pg.wait_for_timeout(300)
    stone = pg.evaluate("() => EbbWorld.SCENES.merlion.spots.find(s => s.id === 'bench')")
    walk_to(pg, stone)
    m0 = pg.evaluate(STATE)
    check('the stone bench offers boats, breaths and just sit', m0['seated'] and m0['title'] == 'On the stone bench' and m0['actions'] == ['Watch the boats', 'Three slow breaths', 'Just sit'], str(m0))
    if shot: snap(pg, f'{shot}_merlion.png')
    pg.click('.seat-sheet [data-act="getup"]'); pg.wait_for_timeout(300)
    m1 = pg.evaluate(STATE)
    check('Get up from the menu stands her by the bench', not m1['seated'] and not m1['sheet'] and m1['action'] != 'sit' and abs(m1['x'] - stone['stand']['x']) < 0.01, str(m1))

    print(f'smoke_seats: {passes} of {passes + len(fails)} passed; page errors: {errs}')
    br.close(); srv.shutdown()
    sys.exit(1 if fails or errs else 0)
