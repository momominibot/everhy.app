#!/usr/bin/env python3
"""Headless browser check of the routines at 390x844: the More menu lists both routines with their step counts, the
editor reorders, removes and adds steps and keeps the changes, Start walks her to the bed and runs a timed step with a
visible clock, pause and skip; the next step walks her to the cushion; both save mindfulness observations marked
routine: morning; the third step crosses into the kitchen; Stop for now keeps the run, which resumes after a reload;
the gentle card offers Start and remembers Not now. Step lengths are shortened to a few seconds for the test.
Serves the repo on a spare port, fails on any console error. Run: python3 tools/smoke_routines.py [shots_dir]"""
import functools, http.server, json, socket, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def main():
    save = {"v": 1, "scene": "bedroom", "pos": None, "outfit": None, "observations": [], "pond": {"offerings": 0, "gift": False},
            "safety": {"onboardSkippedAt": "2026-10-22T08:00:00Z"},
            "farm": {"beds": [{"state": "grass", "crop": None, "watered": []} for _ in range(6)], "seedDay": None, "seedsLeft": 0, "basket": {}, "seeds": {}}}
    srv, port = serve()
    errors, checks = [], []

    def check(name, ok):
        checks.append((name, bool(ok)))
        print(('ok   ' if ok else 'FAIL ') + name, flush=True)

    def shot(page, name):
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(SHOTS / f'{name}.png'))

    def act(page, a):
        page.locator(f'.routine-wrap [data-act="{a}"]').click()

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        ctx.add_init_script("window.__said = []; const _play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__said.push(this.src || ''); try { return _play.call(this).catch(() => {}); } catch (e) { return Promise.resolve(); } };")  # which clips were asked to play
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ebb_save_v1', %s); sessionStorage.setItem('seeded', '1'); }" % json.dumps(json.dumps(save)))
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text + ' ' + (m.location or {}).get('url', '')) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/index.html')
        page.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbRoutineRules && window.EbbRoutines')
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.routine-card').forEach(c => c.remove())")  # whatever the real clock showed
        page.evaluate("() => EbbRoutines.prompt(8)")  # the morning card stays up through the editor, as it would on a real morning
        page.wait_for_selector('.routine-card')
        today = page.evaluate('() => EbbStore.today()')

        # the More menu names both routines with their counts
        page.click('#moreBtn')
        m, e = page.locator('#panel-routine-morning'), page.locator('#panel-routine-evening')
        check('More lists Morning routine (5 steps)', m.count() == 1 and m.inner_text() == 'Morning routine (5 steps)')
        check('More lists Evening routine (5 steps)', e.count() == 1 and e.inner_text() == 'Evening routine (5 steps)')
        m.click()
        page.wait_for_selector('.routine-wrap')
        steps = page.locator('.routine-steps .rt-step')
        check('the morning sheet lists five steps in the default order', [steps.nth(i).get_attribute('data-id') for i in range(steps.count())] == ['wake', 'stretch', 'water', 'sounds', 'intention'])
        check('status says ready, no em dash', 'Ready' in page.locator('.rt-status').inner_text() and '—' not in page.locator('.routine-sheet').inner_text())
        check('Start is the primary action', page.locator('.routine-wrap [data-act="start"]').inner_text() == 'Start')
        shot(page, 'routines-01-morning-sheet')

        # the editor: move, remove, add, lengths, all saved at once
        act(page, 'edit')
        page.wait_for_selector('.routine-steps.editing')
        check('editor shows the five steps with controls', page.locator('.routine-steps.editing .rt-step').count() == 5 and page.locator('.rt-ctl').count() == 15)
        check('first Up and last Down are disabled', page.locator('.rt-step[data-id="wake"] [data-ctl="up"]').is_disabled() and page.locator('.rt-step[data-id="intention"] [data-ctl="down"]').is_disabled())
        check('one step to add (How did you sleep)', page.locator('.rt-addbtn').count() == 1 and page.locator('.rt-addbtn').get_attribute('data-add') == 'sleeplog')
        shot(page, 'routines-02-editor')
        page.locator('.rt-step[data-id="stretch"] [data-ctl="down"]').click()
        page.wait_for_timeout(100)
        ids = lambda: page.evaluate("() => EbbGame.state().routines.lists.morning.map(s => s.id)")
        check('Down swaps stretch and water', ids() == ['wake', 'water', 'stretch', 'sounds', 'intention'])
        page.locator('.rt-step[data-id="stretch"] [data-ctl="up"]').click()
        page.wait_for_timeout(100)
        check('Up swaps them back', ids() == ['wake', 'stretch', 'water', 'sounds', 'intention'])
        page.locator('.rt-addbtn[data-add="sleeplog"]').click()
        page.wait_for_timeout(100)
        check('Add appends the sixth step and the add list goes away', ids()[-1] == 'sleeplog' and page.locator('.rt-addbtn').count() == 0 and 'Six is plenty' in page.locator('.routine-sheet').inner_text())
        page.locator('.rt-step[data-id="sleeplog"] [data-ctl="remove"]').click()
        page.wait_for_timeout(100)
        check('Remove takes it away again', ids() == ['wake', 'stretch', 'water', 'sounds', 'intention'])
        page.locator('.rt-step[data-id="wake"] .rt-secs .pill[data-secs="45"]').click()
        check('a length pill saves the seconds', page.evaluate("() => EbbGame.state().routines.lists.morning[0].secs") == 45)
        saved = json.loads(page.evaluate("() => localStorage.getItem(EbbStore.KEY)"))
        check('the list is in the saved game', saved['routines']['lists']['morning'][0] == {'id': 'wake', 'secs': 45})
        check('More label follows the count', page.locator('#panel-routine-morning').inner_text() == 'Morning routine (5 steps)')
        act(page, 'done')
        page.wait_for_selector('.routine-wrap [data-act="start"]')

        # shorten the timed steps so the test can watch them finish
        page.evaluate("() => { const l = EbbGame.state().routines.lists.morning; l[0].secs = 5; l[1].secs = 6; l[2].secs = 5; EbbGame.api.save(); }")
        bed = page.evaluate("() => EbbWorld.SCENES.bedroom.spots.find(s => s.id === 'bed').stand")
        cushion = page.evaluate("() => EbbWorld.SCENES.bedroom.spots.find(s => s.id === 'cushion').stand")
        act(page, 'start')
        check('the sheet and the card close and the run starts at step 1', page.locator('.routine-wrap').count() == 0 and page.locator('.routine-card').count() == 0 and page.evaluate("() => EbbRoutines.active()") == {'routine': 'morning', 'index': 0})
        page.wait_for_selector('.routine-wrap.running', timeout=15000)
        me = page.evaluate("() => { const m = EbbGame.me(); return [m.x, m.y]; }")
        check('she walked to the bed before the step opened (%s vs %s)' % (me, bed), abs(me[0] - bed['x']) < 2.5 and abs(me[1] - bed['y']) < 2.5)
        check('step 1 shows its cue, clock and Step 1 of 5', page.locator('.rt-cue').inner_text().startswith('Stay where you are') and 'left' in page.locator('.rt-clock').inner_text() and 'Step 1 of 5' in page.locator('.rt-head').inner_text())
        shot(page, 'routines-03-step-running')
        t0 = page.locator('.rt-clock').inner_text()
        act(page, 'pause')
        p1 = page.locator('.rt-clock').inner_text()
        page.wait_for_timeout(1300)
        check('Pause stops the clock', 'paused' in p1 and page.locator('.rt-clock').inner_text() == p1 and page.locator('.routine-wrap [data-act="pause"]').inner_text() == 'Resume')
        act(page, 'pause')
        page.wait_for_timeout(1300)
        check('Resume counts down again', 'paused' not in page.locator('.rt-clock').inner_text() and page.locator('.rt-clock').inner_text() != p1)
        page.wait_for_function("() => (EbbGame.state().observations || []).length === 1", timeout=12000)
        obs = page.evaluate("() => EbbGame.state().observations[0]")
        check('step 1 saved a mindfulness observation marked routine: morning', obs['type'] == 'mindfulness' and obs['routine'] == 'morning' and obs['step'] == 'wake' and obs['practice'] == 'routine-wake' and obs['status'] == 'finished' and obs['plannedSec'] == 5 and obs['date'] == today and obs['source'] == 'routine')
        run = page.evaluate("() => EbbGame.state().routines.runs[%s].morning" % json.dumps(today))
        check('the run moved to step 2', run['index'] == 1 and run['done'] == {'wake': True} and run['finished'] is None)

        # step 2: she walks to the cushion by the window
        page.wait_for_selector('.routine-wrap.running .rt-cue', timeout=15000)
        page.wait_for_function("() => document.querySelector('.rt-head') && /Step 2 of 5/.test(document.querySelector('.rt-head').textContent)", timeout=15000)
        me = page.evaluate("() => { const m = EbbGame.me(); return [m.x, m.y]; }")
        want = page.evaluate("() => EbbRoutineRules.CATALOG.stretch.poseAt")
        check('she walked over and stretches on the rug beside the cushion', abs(me[0] - want['x']) < 2.5 and abs(me[1] - want['y']) < 2.5)
        check('step 2 is the stretch with its first cue', 'Stretch by the window' in page.locator('.rt-head').inner_text() and page.locator('.rt-cue').inner_text().startswith('Stand easy'))
        check('she stands and reaches up while she stretches', page.evaluate("() => EbbGame.me().pose") == 'stretch' and page.evaluate("() => EbbGame.me().action") == 'sit')
        check('the stretch strip is what is drawn', page.evaluate("() => [...document.querySelectorAll('#me image')].some(i => /stretch/.test(i.getAttribute('href')) && i.getAttribute('opacity') !== '0')"))
        page.wait_for_timeout(900)  # the camera glides to her (about half a second)
        check('the sheet never hides her: her feet are above it', page.evaluate("() => { const m = document.getElementById('me').getBoundingClientRect(), sh = document.querySelector('.sheet-wrap > .sheet').getBoundingClientRect(); return m.bottom <= sh.top + 4 && m.top >= 0; }"))
        shot(page, 'routines-04-step-two')
        page.wait_for_function("() => (EbbGame.state().observations || []).length === 2", timeout=12000)
        page.wait_for_timeout(400)
        check('the stretch lets her go when it ends', page.evaluate("() => EbbGame.me().pose") != 'stretch')
        check('two observations, both morning', page.evaluate("() => EbbGame.state().observations.every(o => o.routine === 'morning')") and page.evaluate("() => EbbGame.state().observations[1].step") == 'stretch')
        hearts = page.locator('#counts span', has_text='Hearts')
        check('Hearts counter exists in the bar', hearts.count() == 1)

        # step 3 is in the kitchen: she crosses rooms, then Stop for now keeps the run
        page.wait_for_function("() => document.querySelector('.rt-head') && /Step 3 of 5/.test(document.querySelector('.rt-head').textContent)", timeout=20000)
        check('step 3 took her to the kitchen', page.evaluate("() => EbbGame.api.scene()") == 'living' and 'A glass of water' in page.locator('.rt-head').inner_text())
        act(page, 'stop')
        check('Stop for now closes the sheet and ends the active run', page.locator('.routine-wrap').count() == 0 and page.evaluate("() => EbbRoutines.active()") is None)
        run = page.evaluate("() => EbbGame.state().routines.runs[%s].morning" % json.dumps(today))
        check('the run is kept at step 3, unfinished', run['index'] == 2 and run['finished'] is None)
        check('no observation for the stopped step', page.evaluate("() => EbbGame.state().observations.length") == 2)

        # reload: the sheet offers to carry on where she left off
        page.reload()
        page.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbRoutines')
        page.wait_for_timeout(600)
        page.evaluate("document.querySelectorAll('.routine-card').forEach(c => c.remove())")
        page.click('#moreBtn'); page.click('#panel-routine-morning')
        page.wait_for_selector('.routine-wrap')
        check('after a reload the sheet shows two ticks and the next step', page.locator('.rt-step.done').count() == 2 and page.locator('.rt-step.next').get_attribute('data-id') == 'water')
        check('status says paused at step 3 and the button says Carry on', 'Paused at step 3' in page.locator('.rt-status').inner_text() and page.locator('.routine-wrap [data-act="start"]').inner_text() == 'Carry on')
        shot(page, 'routines-05-resume')
        act(page, 'close')

        # the gentle card: shown for the evening at 20:00, Not now is remembered for the day
        page.evaluate("() => EbbRoutines.prompt(20)")
        page.wait_for_selector('.routine-card')
        card = page.locator('.routine-card')
        check('the card offers the evening routine with Start and Not now', card.get_attribute('data-routine') == 'evening' and card.locator('[data-act="start"]').inner_text() == 'Start' and card.locator('[data-act="notnow"]').count() == 1)
        box = card.bounding_box(); top = page.locator('.top').bounding_box(); sun = page.locator('#todayBtn').bounding_box() if page.locator('#todayBtn').count() else None
        check('the card sits under the bar, clear of the sun button, inside the phone', box['y'] > top['y'] + top['height'] and (not sun or box['y'] >= sun['y'] + sun['height'] - 1) and box['x'] + box['width'] <= 390)
        shot(page, 'routines-06-card')
        check("Erin asks out loud when the card shows", any('art/routines/voice/' in u for u in page.evaluate('window.__said')))
        card.locator('[data-act="voice"]').click()
        check('Mute Erin is remembered in the save', page.evaluate('() => EbbGame.state().routineVoice') is False and card.locator('[data-act="voice"]').inner_text() != 'Mute Erin')
        n_said = len(page.evaluate('window.__said'))
        page.evaluate("() => { document.querySelectorAll('.routine-card').forEach(c => c.remove()); EbbRoutines.card('evening'); }")
        check('muted, the card stays silent', len(page.evaluate('window.__said')) == n_said)
        page.evaluate("() => { EbbGame.state().routineVoice = true; EbbGame.api.save(); document.querySelectorAll('.routine-card').forEach(c => c.remove()); EbbRoutines.card('evening'); }")
        card = page.locator('.routine-card')
        card.locator('[data-act="notnow"]').click()
        check('Not now hides the card and is saved for the day', page.locator('.routine-card').count() == 0 and page.evaluate("() => EbbGame.state().routines.notNow[%s].evening" % json.dumps(today)) is True)
        page.evaluate("() => EbbRoutines.prompt(20)")
        page.wait_for_timeout(200)
        check('no card again this evening', page.locator('.routine-card').count() == 0)
        page.evaluate("() => EbbRoutines.prompt(8)")
        page.wait_for_selector('.routine-card')
        check('the morning card offers to carry on', page.locator('.routine-card').get_attribute('data-routine') == 'morning' and page.locator('.routine-card [data-act="start"]').inner_text() == 'Carry on')
        page.evaluate("document.querySelectorAll('.routine-card').forEach(c => c.remove())")
        check('nothing in the sheets or cards used an em dash', '—' not in page.evaluate("() => document.body.innerText"))
        b.close()
    srv.shutdown()
    bad = [n for n, ok in checks if not ok]
    print(f'smoke_routines: {len(checks) - len(bad)} of {len(checks)} checks passed; console errors: {len(errors)}')
    for e in errors:
        print('  console:', e)
    sys.exit(1 if bad or errors else 0)


if __name__ == '__main__':
    main()
