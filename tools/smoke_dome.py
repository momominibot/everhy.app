#!/usr/bin/env python3
"""Headless browser check of the Flower Dome at 390x844: a returning player with three confirmed log entries and one
finished practice already saved opens in the dome with 45 points in the top bar beside Hearts; she walks to the seed
stall, the sheet opens with her balance and a Buy button per crop, buying a turnip seed debits 20 points and raises the
Seeds count, a seed she cannot afford shows a kind line with its button disabled, the record survives a reload, the
glass doors lead to Merlion Park and its new door leads back, and hearts never move. Serves the repo on a spare port,
fails on any console error. Run: python3 tools/smoke_dome.py [shots_dir]"""
import datetime, functools, http.server, json, socket, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.js': 'text/javascript'}
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def main():
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    obs = [{"id": f"o{i}", "type": t, "value": v, "start": today, "end": today, "created": now, "confirmed": True, "source": "chat"}
           for i, (t, v) in enumerate([("mood", "calm"), ("sleep", 7), ("food", "laksa")])]
    obs.append({"id": "o9", "type": "mood", "value": "draft", "start": today, "end": today, "created": now, "confirmed": False})
    practices = [{"id": "p1", "type": "mindfulness", "date": today, "status": "finished", "activeSec": 180, "end": now, "confirmed": True},
                 {"id": "p2", "type": "mindfulness", "date": today, "status": "partial", "activeSec": 40, "end": now, "confirmed": True}]
    beds = [{"state": "grass", "crop": None, "watered": []} for _ in range(6)]
    save = {"v": 1, "scene": "dome", "pos": None, "outfit": None, "observations": practices, "pond": {"offerings": 0, "gift": False},
            "safety": {"onboardSkippedAt": "2026-10-22T08:00:00Z"}, "log": {"v": 1, "obs": obs, "thread": [], "batches": []},
            "farm": {"beds": beds, "seedDay": None, "seedsLeft": 0, "basket": {}, "seeds": {}}}
    srv, port = serve()
    errors, checks = [], []

    def check(name, ok, detail=''):
        checks.append((name, bool(ok)))
        print(('ok   ' if ok else 'FAIL ') + name + ('' if ok or not detail else '  (' + detail + ')'), flush=True)

    def shot(page, name):
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(SHOTS / f'{name}.png'))

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ebb_save_v1', %s); sessionStorage.setItem('seeded', '1'); }" % json.dumps(json.dumps(save)))
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text + ' ' + (m.location or {}).get('url', '')) if m.type == 'error' and '404' not in m.text else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/index.html?time=14:00')
        page.wait_for_function('window.EbbGame && window.EbbGame._ready && window.EbbDomeRules && window.EbbDome')
        page.wait_for_timeout(600)
        page.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")

        def hud(label):
            return page.locator('#counts span', has_text=label).locator('b').inner_text()
        check('she opens in the Flower Dome', page.evaluate("() => EbbGame.api.scene()") == 'dome' and page.locator('#place').inner_text() == 'Flower Dome')
        check('she stands on the paving', page.evaluate("() => EbbWorld.walkable('dome', EbbGame.me())"))
        check('Points in the top bar beside Hearts: 45 from three entries and one finished practice', page.locator('#counts span', has_text='Points').count() == 1 and hud('Points') == '45' and page.locator('#counts span', has_text='Hearts').count() == 1)
        check('the ledger has four entries and nothing for the draft or the partial practice', page.evaluate("() => { const p = EbbGame.state().points; return p.entries.length === 4 && p.total === 45 && p.spent === 0; }"))
        hearts0 = hud('Hearts')
        page.wait_for_timeout(900)
        shot(page, 'dome-01-in-the-dome')

        # to the stall: she walks there and the sheet opens on arrival
        stand = page.evaluate("() => EbbWorld.SCENES.dome.spots.find(s => s.id === 'stall').stand")
        page.evaluate("q => { const sp = EbbWorld.SCENES.dome.spots.find(s => s.id === 'stall'); EbbGame.walkTo(q, { spot: sp }); }", stand)
        page.wait_for_selector('.dome-wrap', timeout=20000)
        check('the stall sheet opens when she arrives', page.locator('.sheet.dome').count() == 1 and abs(page.evaluate("() => EbbGame.me().x") - stand['x']) < 1.5)
        check('her balance is shown', page.locator('#domePoints').inner_text() == '45')
        rows = page.evaluate("() => [...document.querySelectorAll('.dome-item')].map(li => [li.dataset.crop, li.querySelector('b').textContent, li.querySelector('small').textContent, li.querySelector('button').disabled, li.querySelector('button').textContent])")
        check('one row per crop with its price, all affordable at 45', rows == [['turnip', 'Turnip seed', '20 points', False, 'Buy'], ['carrot', 'Carrot seed', '30 points', False, 'Buy'], ['sunflower', 'Sunflower seed', '40 points', False, 'Buy']], str(rows))
        check('the sheet says logging earns points', 'Logging earns points' in page.locator('.dome-earn').inner_text() and 'three free seeds' in page.locator('.dome-shed').inner_text())
        box = page.locator('.sheet.dome').bounding_box()
        check('sheet fits the phone', box['width'] <= 390 and box['x'] >= 0)

        page.click('#buy-turnip')
        page.wait_for_function("() => (EbbGame.state().farm.seeds.turnip || 0) === 1")
        check('a turnip seed is in the farm', page.evaluate("() => EbbGame.state().farm.seeds.turnip") == 1)
        check('20 points spent: 25 left in the sheet and the top bar', page.locator('#domePoints').inner_text() == '25' and hud('Points') == '25')
        check('the Seeds count in the top bar rises to 1', hud('Seeds') == '1')
        check('the stall says so', 'turnip seed' in page.locator('.dome-said').inner_text())
        check('the sunflower at 40 is now out of reach with a kind line', page.locator('#buy-sunflower').is_disabled() and page.locator('#buy-sunflower').inner_text() == 'Not yet' and '15 more points' in page.locator('.dome-item[data-crop="sunflower"] .dome-short').inner_text())
        check('the carrot at 30 is refused by the rules too', page.evaluate("() => { const r = EbbDomeRules.buy(EbbGame.state(), 'sunflower', EbbStore.today(), EbbFarm.CROPS); return !r.ok && r.reason === 'short'; }"))
        check('the row remembers she has one', 'you have 1' in page.locator('.dome-item[data-crop="turnip"] small').first.inner_text())
        shot(page, 'dome-02-stall-sheet')
        page.click('#buy-turnip')
        page.wait_for_function("() => (EbbGame.state().farm.seeds.turnip || 0) === 2")
        check('a second turnip: 5 left, every button waits', page.locator('#domePoints').inner_text() == '5' and page.locator('.dome-buy:disabled').count() == 3)
        check('hearts never moved', hud('Hearts') == hearts0 and page.evaluate("() => JSON.stringify((EbbGame.state().daily || {}).total || 0)") in ('0', hearts0))
        page.keyboard.press('Escape')
        check('Escape closes the stall', page.locator('.dome-wrap').count() == 0)

        # the save: entries, spend rows, seeds
        saved = json.loads(page.evaluate("() => localStorage.getItem(EbbStore.KEY)"))
        check('saved under state.points with two spend entries', saved['points']['total'] == 45 and saved['points']['spent'] == 40 and sum(1 for e in saved['points']['entries'] if e['n'] < 0) == 2 and saved['farm']['seeds'] == {'turnip': 2})
        page.reload()
        page.wait_for_function('window.EbbGame && window.EbbGame._ready && window.EbbDome')
        page.wait_for_timeout(700)
        page.evaluate("document.querySelectorAll('.sheet-wrap').forEach(w => w.remove())")
        check('after a reload the points and seeds stay', hud('Points') == '5' and hud('Seeds') == '2' and page.evaluate("() => EbbGame.state().points.entries.length") == 6)

        # a new confirmed entry raises the points without any event: the ledger follows the data
        page.evaluate("() => { const st = EbbGame.state(); st.log.obs.push({ id: 'oNew', type: 'mood', value: 'bright', start: EbbStore.today(), end: EbbStore.today(), created: new Date().toISOString(), confirmed: true }); EbbStore.save(); }")
        page.wait_for_function("() => [...document.querySelectorAll('#counts span')].some(s => /Points/.test(s.textContent) && s.querySelector('b').textContent === '15')", timeout=6000)
        check('a new confirmed entry adds 10 after the save', hud('Points') == '15')
        page.wait_for_function("() => { const t = document.getElementById('toast'); return !t.hidden && /points/.test(t.textContent); }", timeout=6000)
        check('a quiet toast says so', 'points' in page.locator('#toast').inner_text())
        page.evaluate("() => { const st = EbbGame.state(); for (let i = 0; i < 9; i++) st.log.obs.push({ id: 'oCap' + i, type: 'mood', value: 'x', start: EbbStore.today(), end: EbbStore.today(), created: new Date().toISOString(), confirmed: true }); EbbStore.save(); }")
        page.wait_for_timeout(400)
        check('the day caps at 60 earned', page.evaluate("() => EbbGame.state().points.total") == 60 and hud('Points') == '20')

        # out through the glass doors to Merlion Park, and back through the new door
        door = page.evaluate("() => { const d = EbbWorld.SCENES.dome.doors[0]; return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }")
        page.evaluate("q => EbbGame.walkTo(q)", door)
        page.wait_for_function("() => EbbGame.api.scene() === 'merlion' && !document.getElementById('scene').classList.contains('fading')", timeout=20000)
        check('the glass doors lead to Merlion Park on walkable ground', page.evaluate("() => EbbWorld.walkable('merlion', EbbGame.me())"))
        back = page.evaluate("() => { const d = EbbWorld.SCENES.merlion.doors.find(x => x.id === 'toDome'); return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; }")
        page.evaluate("q => EbbGame.walkTo(q)", back)
        page.wait_for_function("() => EbbGame.api.scene() === 'dome' && !document.getElementById('scene').classList.contains('fading')", timeout=25000)
        check('Merlion Park\'s new door leads back into the dome', page.evaluate("() => EbbWorld.walkable('dome', EbbGame.me())"))

        # the map: the dome pin is open and marks her place
        page.click('#mapBtn'); page.wait_for_selector('.map-wrap')
        check('the map shows the Flower Dome as here', page.locator('.map-place[data-pin="dome"]').get_attribute('aria-current') == 'location' and page.locator('.map-pin[data-pin="dome"]').count() == 1)
        shot(page, 'dome-03-map')
        page.keyboard.press('Escape')
        b.close()
    srv.shutdown()
    bad = [n for n, ok in checks if not ok]
    print(f'smoke_dome: {len(checks) - len(bad)} of {len(checks)} checks passed; console errors: {len(errors)}')
    for e in errors:
        print('  console:', e)
    sys.exit(1 if bad or errors else 0)


if __name__ == '__main__':
    main()
