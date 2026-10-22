#!/usr/bin/env python3
"""Headless browser check of the daily loop at 390x844: the sun button and the More entry open the Today sheet, it lists
three invitations with the first-open greeting, watering a bed (she walks to a seeded planted bed and the engine waters
it) ticks "Water the garden", a heart toast and the Hearts counter follow, and the record survives a reload.
The page's clock is shifted (Date only, timers untouched) to the nearest day whose picks include watering, so the
check does not depend on the calendar. Serves the repo on a spare port, fails on any console error.
Run: python3 tools/smoke_today.py [shots_dir]"""
import datetime, functools, http.server, json, socket, subprocess, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def picks_for(days):
    """Ask the pure rules (in node) which invitations each of the next days gets."""
    script = """
const vm=require('vm'),fs=require('fs');const c={console,Math,JSON,Date,Object,Array,String,Number};c.globalThis=c;vm.createContext(c);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
console.log(JSON.stringify(process.argv.slice(2).map(d=>c.EbbTodayRules.picks(d))));"""
    out = subprocess.run(['node', '-e', script, str(ROOT / 'js/today/rules.js'), *days], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main():
    real = datetime.date.today()
    days = [(real + datetime.timedelta(days=i)).isoformat() for i in range(14)]
    picks = picks_for(days)
    offset = next(i for i, p in enumerate(picks) if 'water' in p)
    today = days[offset]
    print(f'clock shifted by {offset} day(s) to {today}: picks {picks[offset]}', flush=True)

    beds = [{"state": "grass", "crop": None, "watered": []} for _ in range(6)]
    beds[0] = {"state": "planted", "crop": "turnip", "watered": []}
    save = {"v": 1, "scene": "farm", "pos": None, "outfit": None, "observations": [], "pond": {"offerings": 0, "gift": False},
            "safety": {"onboardSkippedAt": "2026-10-22T08:00:00Z"},  # a returning player: the first-launch welcome is done
            "farm": {"beds": beds, "seedDay": None, "seedsLeft": 0, "basket": {}, "seeds": {}}}
    shift = """(function () { var OFF = %d, RD = Date;
      function D() { if (!(this instanceof D)) return RD(); if (!arguments.length) return new RD(RD.now() + OFF);
        return new (Function.prototype.bind.apply(RD, [null].concat([].slice.call(arguments))))(); }
      D.prototype = RD.prototype; D.now = function () { return RD.now() + OFF; }; D.parse = RD.parse; D.UTC = RD.UTC; window.Date = D; })();""" % (offset * 86400000)
    srv, port = serve()
    errors, checks = [], []

    def check(name, ok):
        checks.append((name, bool(ok)))
        print(('ok   ' if ok else 'FAIL ') + name, flush=True)

    def shot(page, name):
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(SHOTS / f'{name}.png'))

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        if offset:
            ctx.add_init_script(shift)
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ebb_save_v1', %s); sessionStorage.setItem('seeded', '1'); }" % json.dumps(json.dumps(save)))
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text + ' ' + (m.location or {}).get('url', '')) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/index.html')
        page.wait_for_function('window.EbbGame && window.EbbGame._ready && window.EbbTodayRules && window.EbbToday')
        page.wait_for_timeout(400)

        check('the page thinks today is the shifted day', page.evaluate('() => EbbStore.today()') == today)
        check('sun button under the bar', page.evaluate("() => { const b = document.getElementById('todayBtn'), r = b && b.getBoundingClientRect(), t = document.querySelector('.top').getBoundingClientRect(); return !!b && r.top >= t.bottom && r.left < 60; }"))
        hud = page.locator('#counts span', has_text='Hearts')
        check('Hearts counter in the top bar reads 0', hud.count() == 1 and hud.locator('b').inner_text() == '0')

        # first open from the sun button: greeting, three invitations, none done
        page.click('#todayBtn')
        page.wait_for_selector('.today-wrap')
        items = page.locator('.today-item')
        check('sheet shows three invitations', items.count() == 3)
        labels = [items.nth(i).locator('b').inner_text() for i in range(3)]
        check('they are today\'s picks', labels == [page.evaluate("id => EbbTodayRules.INVITES[id].label", p) for p in picks[offset]])
        check('none ticked yet', page.locator('.today-item.done').count() == 0)
        greet = page.locator('.today-greet p')
        check('first open greets with two lines and the date', greet.count() == 2 and today[-2:].lstrip('0') in greet.nth(0).inner_text() and greet.nth(0).inner_text().startswith('Good '))
        weather = page.evaluate("() => window.EbbSky && typeof EbbSky.state === 'function' ? (EbbSky.state() || {}).weather : null")
        second = greet.nth(1).inner_text()
        check('second line matches the sky module (%s)' % weather, (weather == 'rain' and 'Rain' in second) or (weather == 'clear' and 'clear' in second) or (weather not in ('rain', 'clear') and 'invitations' in second))
        check('hearts today 0', page.locator('#todayHearts').inner_text() == '0' and page.locator('#todayTotal').inner_text() == '0')
        check('kind line present, no em dash', page.locator('.today-line').count() == 1 and '—' not in page.locator('.sheet.today').inner_text())
        box = page.locator('.sheet.today').bounding_box()
        check('sheet fits the phone width', box['width'] <= 390 and box['x'] >= 0)
        shot(page, 'today-01-sheet-first-open')
        page.click('#todayClose')
        check('sheet closes', page.locator('.today-wrap').count() == 0)

        # water the planted bed: she walks to it and the engine does the watering
        bed = page.evaluate("() => EbbWorld.SCENES.farm.beds[0]")
        check('bed 0 wants water', page.evaluate("() => EbbFarm.nextAction(EbbGame.state().farm, 0, EbbStore.today())") == 'water')
        page.evaluate("b => EbbGame.walkTo(EbbWorld.bedStand(b), { bed: 0 })", bed)  # the farm's beds carry their own stand points beside the soil
        page.wait_for_function("() => EbbGame.state().farm.beds[0].watered.length === 1", timeout=15000)
        check('the bed is watered today', page.evaluate("() => EbbGame.state().farm.beds[0].watered[0]") == today)
        page.wait_for_function("() => document.querySelector('#counts span b') && [...document.querySelectorAll('#counts span')].some(s => /Hearts/.test(s.textContent) && s.querySelector('b').textContent === '1')", timeout=6000)
        check('Hearts counter rises to 1', hud.locator('b').inner_text() == '1')
        page.wait_for_function("() => { const t = document.getElementById('toast'); return !t.hidden && /heart/i.test(t.textContent); }", timeout=6000)
        check('a heart toast appears', 'heart' in page.locator('#toast').inner_text().lower())
        check('a heart bubble above her head', page.evaluate("() => { const h = document.querySelector('.life-pop path[fill=\"#ee8a9a\"]'); const g = h && h.closest('g[transform]'); return !!h && !!g && g.style.display !== 'none'; }"))
        shot(page, 'today-02-heart-toast')

        # second open from the More menu: water ticked, no greeting again
        page.click('#moreBtn')
        page.click('#panel-today')
        page.wait_for_selector('.today-wrap')
        check('More menu opens the sheet', page.locator('.today-wrap').count() == 1)
        check('water the garden is ticked, nothing else', page.locator('.today-item.done').count() == 1 and page.locator('.today-item.done').get_attribute('data-id') == 'water')
        check('no greeting on the second open', page.locator('.today-greet').count() == 0)
        check('hearts today 1, total 1', page.locator('#todayHearts').inner_text() == '1' and page.locator('#todayTotal').inner_text() == '1')
        check('one heart line', 'One heart' in page.locator('.today-line').inner_text())
        check('one day with a heart', 'One day' in page.locator('.today-run').inner_text())
        shot(page, 'today-03-sheet-after-watering')
        page.keyboard.press('Escape')
        check('Escape closes the sheet', page.locator('.today-wrap').count() == 0)

        # the record is saved and survives a reload; hearts stay
        saved = json.loads(page.evaluate("() => localStorage.getItem(EbbStore.KEY)"))
        check('saved under state.daily', saved.get('daily', {}).get('total') == 1 and saved['daily']['days'][today]['done'] == {'water': True})
        page.reload()
        page.wait_for_function('window.EbbGame && window.EbbGame._ready && window.EbbToday')
        page.wait_for_timeout(1300)
        check('Hearts counter still 1 after reload', page.locator('#counts span', has_text='Hearts').locator('b').inner_text() == '1')
        page.click('#todayBtn'); page.wait_for_selector('.today-wrap')
        check('tick kept after reload', page.locator('.today-item.done').count() == 1)
        page.click('#todayClose')

        shot(page, 'today-04-farm')
        b.close()
    srv.shutdown()
    bad = [n for n, ok in checks if not ok]
    print(f'smoke_today: {len(checks) - len(bad)} of {len(checks)} checks passed; console errors: {len(errors)}')
    for e in errors:
        print('  console:', e)
    sys.exit(1 if bad or errors else 0)


if __name__ == '__main__':
    main()
