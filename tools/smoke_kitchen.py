#!/usr/bin/env python3
"""Headless browser check of the kitchen at 390 px. Serves this checkout on a free port; no outside network.
Run: python3 tools/smoke_kitchen.py [shot_prefix]. With a prefix it also writes <prefix>_hob.png (her at the hob) and
<prefix>_sheet.png (the hob's card). Seeds a basket, walks her to the hob, cooks a turnip soup in real time (20 s),
checks the basket and the meals change, logs it as food, tries the oven with too little, blends a smoothie's card,
washes her hands at the basin (another 20 s) and expects the saved mindful moment. Zero console errors."""
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

STATE = """() => ({ scene: EbbGame.api.scene(), action: EbbGame.me().action, view: EbbGame.me().view, x: EbbGame.me().x, y: EbbGame.me().y,
  sheet: !!document.querySelector('.kitchen-wrap'), title: (document.querySelector('.kitchen-wrap h2') || {}).textContent || '',
  cooking: !!EbbKitchen.cooking(), glow: !!document.querySelector('#props .kitchen-glow'), ring: !!document.querySelector('#props .kitchen-ring'),
  steam: !!document.querySelector('#fx .kitchen-steam'), basket: Object.assign({}, EbbGame.state().farm.basket),
  meals: (EbbGame.state().kitchen || { meals: [] }).meals.length, hud: String(Object.values(EbbGame.state().farm.basket).reduce((a, b) => a + b, 0)), /* the basket lives in the Bag now, not the top bar */
  prompt: (document.getElementById('prompt') || {}).textContent, promptHidden: (document.getElementById('prompt') || {}).hidden,
  log: !!document.querySelector('.ebb-log'), clock: (document.querySelector('.kitchen-clock') || {}).textContent || '',
  cue: (document.querySelector('.kitchen-cue') || {}).textContent || '' })"""

def walk_to(pg, spot):
    pg.evaluate("(q) => EbbGame.walkTo(q.stand, { spot: q })", spot); pg.wait_for_timeout(350)
    pg.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=30000); pg.wait_for_timeout(400)

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto(URL); pg.evaluate("localStorage.clear()")
    pg.evaluate("() => { try { if (window.EbbSafety && EbbSafety.seedReturning) EbbSafety.seedReturning(); } catch (e) {} }")
    pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready')
    pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")
    check('the kitchen is a place and the living room has a way in', pg.evaluate("() => !!EbbWorld.SCENES.kitchen && EbbWorld.SCENES.living.doors.some(d => d.to === 'kitchen')"))
    check('the plate loads', pg.evaluate("() => fetch('art/plates/kitchen.webp').then(r => r.ok)"))
    # a basket from the garden, the hens and the jetty
    pg.evaluate("() => { const s = EbbGame.state(); s.farm.basket = { turnip: 2, carrot: 1, egg: 1 }; EbbGame.api.save(); EbbGame.api.refresh(); }")
    pg.evaluate("EbbGame.enter('kitchen')"); pg.wait_for_timeout(400)
    s0 = pg.evaluate(STATE)
    check('she is in the kitchen with the basket counted', s0['scene'] == 'kitchen' and s0['hud'] == '4', str(s0))
    hob = pg.evaluate("() => EbbWorld.SCENES.kitchen.spots.find(s => s.id === 'hob')")

    # walk to the hob: the prompt names it, the ring marks it, and arriving as a tap would opens the hob's card
    pg.evaluate("(q) => EbbGame.walkTo(q.stand)", hob); pg.wait_for_timeout(350)
    pg.wait_for_function("() => EbbGame.me().action !== 'walk'", timeout=30000); pg.wait_for_timeout(400)
    s1 = pg.evaluate(STATE)
    check('she reaches the hob stand', abs(s1['x'] - hob['stand']['x']) < 1.5 and abs(s1['y'] - hob['stand']['y']) < 1.5 and s1['scene'] == 'kitchen', str(s1))
    check('the prompt offers cooking', s1['prompt'] == 'Cook something' and not s1['promptHidden'], str(s1))
    check('the near appliance wears a soft ring', s1['ring'], str(s1))
    if shot:
        pg.evaluate("document.querySelectorAll('[data-act=notnow]').forEach(b => b.click())")  # main's morning routine card, if the clock is in its window
        pg.wait_for_timeout(600); pg.screenshot(path=f'{shot}_hob.png')
    pg.evaluate("document.getElementById('prompt').click()"); pg.wait_for_timeout(300)
    s2 = pg.evaluate(STATE)
    check('the hob card opens and she faces the counter', s2['sheet'] and s2['title'] == 'Hob' and s2['view'] == 'back', str(s2))
    dishes = pg.evaluate("() => [...document.querySelectorAll('.kitchen-dish')].map(b => [b.dataset.recipe, !b.disabled, b.querySelector('small').textContent])")
    check('five dishes listed, soup and egg possible, the rest short', [d[0] for d in dishes] == ['turnipSoup', 'carrotStirFry', 'sunflowerSnack', 'friedEgg', 'grilledFish'] and [d[1] for d in dishes] == [True, False, False, True, False], str(dishes))
    check('a short dish says what it needs', any('Needs 2 carrots' in d[2] for d in dishes) and any('Needs a fish of any size' in d[2] for d in dishes), str(dishes))
    if shot: pg.screenshot(path=f'{shot}_sheet.png')

    # cook the soup: a visible clock, steam over the hob, a glow under the pot, her at work
    pg.click('.kitchen-dish[data-recipe="turnipSoup"]'); pg.wait_for_timeout(700)
    s3 = pg.evaluate(STATE)
    check('the clock counts down from twenty', s3['clock'].startswith('0:19') or s3['clock'].startswith('0:20'), str(s3))
    check('steam rises through the fx layer and the hob glows', s3['steam'] and s3['glow'] and s3['cooking'], str(s3))
    check('nothing is used until it is done', s3['basket'].get('turnip') == 2 and s3['meals'] == 0, str(s3))
    check('a floor tap does not walk her away mid-cook', (pg.evaluate("""() => { const sc = document.getElementById('scene'), r = sc.getBoundingClientRect();
      sc.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.85 })); return true; }""") and pg.wait_for_timeout(400) is None and pg.evaluate("() => EbbGame.me().action !== 'walk'")))
    # pause holds the clock
    pg.click('#kitchenPause'); pg.wait_for_timeout(1500)
    c1 = pg.evaluate("() => document.querySelector('.kitchen-clock').textContent")
    pg.wait_for_timeout(1500)
    c2 = pg.evaluate("() => document.querySelector('.kitchen-clock').textContent")
    check('paused: the clock holds and says so', c1 == c2 and 'paused' in c1 and not pg.evaluate(STATE)['steam'], f'{c1!r} {c2!r}')
    pg.click('#kitchenPause')
    pg.wait_for_function("() => document.querySelector('#kitchenDone') || document.querySelector('#kitchenClose')", timeout=30000); pg.wait_for_timeout(300)
    s4 = pg.evaluate(STATE)
    check('the soup is done: both turnips used, the rest kept', s4['basket'].get('turnip') is None and s4['basket'].get('carrot') == 1 and s4['basket'].get('egg') == 1, str(s4))
    check('the meal is remembered and the basket count drops', s4['meals'] == 1 and s4['hud'] == '2' and pg.evaluate("() => EbbGame.state().kitchen.meals[0].dish === 'turnipSoup' && EbbGame.state().kitchen.meals[0].date === EbbStore.today()"), str(s4))
    check('the done card and the glow is off', 'Cooked: turnip soup' in s4['cue'] and not s4['glow'] and not s4['cooking'], str(s4))
    check('the save survives a reload', pg.evaluate("() => JSON.parse(localStorage.getItem('ebb_save_v1')).kitchen.meals.length === 1"))
    # log it as food: the existing food log opens with the meal typed, ready to send
    pg.click('#kitchenLog')
    pg.wait_for_function("() => document.querySelector('.ebb-log #lgInput') && document.querySelector('.ebb-log #lgInput').value", timeout=5000)
    s5 = pg.evaluate(STATE)
    check('the food log opens with the meal ready to send', s5['log'] and not s5['sheet'] and pg.evaluate("() => document.querySelector('.ebb-log #lgInput').value") == 'Had turnip soup from the kitchen', str(s5))
    check('she is free again', s5['action'] != 'work' and pg.evaluate("() => EbbGame.me().view") == 'front', str(s5))
    pg.evaluate("EbbLog.close()"); pg.wait_for_timeout(200)

    # the oven with too little: one carrot and one egg bake nothing, and the card says so warmly
    oven = pg.evaluate("() => EbbWorld.SCENES.kitchen.spots.find(s => s.id === 'oven')")
    walk_to(pg, oven)
    s6 = pg.evaluate(STATE)
    body = pg.evaluate("() => (document.querySelector('.kitchen-wrap .sheet-body') || {}).textContent || ''")
    check('the oven card opens', s6['sheet'] and s6['title'] == 'Oven', str(s6))
    check('with too little it points to the garden and lists what a bake wants', 'garden' in body and 'two carrots and an egg' in body and not pg.evaluate("() => document.querySelectorAll('.kitchen-dish').length"), body)
    check('the basket is untouched', s6['basket'] == {'carrot': 1, 'egg': 1}, str(s6))
    pg.click('#kitchenClose'); pg.wait_for_timeout(200)

    # the Thermomix: the one carrot makes a carrot smoothie card; Stop uses nothing
    tm = pg.evaluate("() => EbbWorld.SCENES.kitchen.spots.find(s => s.id === 'thermomix')")
    walk_to(pg, tm)
    names = pg.evaluate("() => [...document.querySelectorAll('.kitchen-dish')].map(b => [b.querySelector('b').textContent, !b.disabled])")
    check('the Thermomix offers a carrot smoothie', names == [['Carrot smoothie', True]] and pg.evaluate(STATE)['title'] == 'Thermomix', str(names))
    pg.click('.kitchen-dish[data-recipe="smoothie"]'); pg.wait_for_timeout(1200)
    pg.click('#kitchenStop'); pg.wait_for_timeout(200)
    s7 = pg.evaluate(STATE)
    check('stopping early uses nothing', s7['basket'] == {'carrot': 1, 'egg': 1} and s7['meals'] == 1 and 'Nothing used' in pg.evaluate("() => document.querySelector('.kitchen-wrap .sheet-body').textContent"), str(s7))
    pg.click('#kitchenClose'); pg.wait_for_timeout(200)

    # the basin: twenty seconds, three breaths, saved as a mindful moment in the kitchen
    basin = pg.evaluate("() => EbbWorld.SCENES.kitchen.spots.find(s => s.id === 'basin')")
    before = pg.evaluate("() => EbbGame.state().observations.length")
    walk_to(pg, basin)
    s8 = pg.evaluate(STATE)
    check('the basin card opens with the first cue and the clock', s8['sheet'] and s8['title'] == 'Basin' and 'Warm water' in s8['cue'] and s8['clock'].startswith('0:'), str(s8))
    check('no glow at the basin, steam at the tap', not s8['glow'] and s8['steam'], str(s8))
    pg.wait_for_timeout(8000)
    check('the cues move on with the time', 'breath' in pg.evaluate(STATE)['cue'].lower())
    pg.wait_for_function("() => !!document.querySelector('#kitchenDone')", timeout=30000); pg.wait_for_timeout(200)
    obs = pg.evaluate("() => EbbGame.state().observations.slice(-1)[0]")
    check('a mindfulness observation is saved from the kitchen', pg.evaluate("() => EbbGame.state().observations.length") == before + 1 and obs['type'] == 'mindfulness' and obs['where'] == 'kitchen' and obs['status'] == 'finished' and obs['activeSec'] >= 19 and obs['date'] == pg.evaluate("EbbStore.today()"), str(obs))
    check('the card says so', 'Saved as a mindful moment' in pg.evaluate("() => document.querySelector('.kitchen-wrap .sheet-body').textContent"))
    check('the record survives a reload', pg.evaluate("() => JSON.parse(localStorage.getItem('ebb_save_v1')).observations.slice(-1)[0].where === 'kitchen'"))
    pg.click('#kitchenDone'); pg.wait_for_timeout(200)
    s9 = pg.evaluate(STATE)
    check('everything is put away after the basin', not s9['sheet'] and not s9['cooking'] and not s9['steam'] and s9['action'] == 'idle', str(s9))

    # through the arch back to the living room, and in again through the new door
    door = pg.evaluate("() => { const d = EbbWorld.SCENES.kitchen.doors[0]; return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }")
    pg.evaluate("(q) => EbbGame.walkTo(q)", door)
    try:
        pg.wait_for_function("() => EbbGame.api.scene() === 'living' && !document.getElementById('scene').classList.contains('fading')", timeout=30000); check('the arch leads back to the living room', pg.evaluate("() => EbbWorld.walkable('living', EbbGame.me())"))
    except Exception as e: check('the arch leads back to the living room', False, str(e).split('\n')[0])
    pg.wait_for_timeout(700)
    into = pg.evaluate("() => { const d = EbbWorld.SCENES.living.doors.find(d => d.to === 'kitchen'); return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }")
    pg.evaluate("(q) => EbbGame.walkTo(q)", into)
    try:
        pg.wait_for_function("() => EbbGame.api.scene() === 'kitchen' && !document.getElementById('scene').classList.contains('fading')", timeout=30000); check('the living room door leads into the kitchen', pg.evaluate("() => EbbWorld.walkable('kitchen', EbbGame.me())"))
    except Exception as e: check('the living room door leads into the kitchen', False, str(e).split('\n')[0])

    check('no page or console errors', not errs, str(errs))
    br.close()
print(f'smoke_kitchen: {passes} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
