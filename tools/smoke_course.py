#!/usr/bin/env python3
"""Headless browser smoke for the Ebb course at phone width (390 px). Serves the repo on a spare local port, drives the
Course panel, the runner (pause, hidden time, end, note, save), the cushion before and after the course starts, the
"That felt hard" stop path and the opt-in monthly summary. Nothing leaves the machine.
Run: python3 tools/smoke_course.py [--shots DIR]"""
import functools, http.server, json, socket, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
passed, failed = 0, 0


def check(name, ok):
    global passed, failed
    if ok:
        passed += 1
    else:
        failed += 1
        print('FAIL', name)


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def shot(page, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / f'{name}.png'))


def btn(page, act):
    page.locator(f'.course-wrap [data-act="{act}"]').click()


def main():
    srv, port = serve()
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2).new_page()
        page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/index.html')
        page.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbCourse')
        cushion = "EbbWorld.SCENES.bedroom.spots.find(s => s.kind === 'cushion')"
        page.wait_for_timeout(300)
        if page.locator('.sf-onboard').count():  # the safety workstream's first-run welcome: skip it
            page.locator('.sf-onboard').get_by_role('button', name='Skip all').click()

        # the cushion before the course: three short voice-guided practices, with simple sitting still one tap away
        page.evaluate(f'EbbGame.act({{ spot: {cushion} }})')
        check('cushion before course offers three guided practices and simple sitting', page.locator('.course-wrap h2', has_text='On the cushion').count() == 1 and page.locator('.course-card').count() == 3 and [d for d in page.eval_on_selector_all('.course-card', 'els => els.map(e => e.dataset.practice)')] == ['arrive', 'breath', 'sound'] and page.locator('.course-wrap [data-act="simple"]').count() == 1)
        check('she sits on the cushion', page.evaluate('EbbGame.me().action') == 'sit')
        page.get_by_role('button', name='Not now').click()
        check('she stands again', page.evaluate('EbbGame.me().action') == 'idle')

        # course panel
        page.click('#moreBtn'); page.click('#panel-course')
        check('course panel opens', page.locator('.course-wrap h2', has_text='Course').count() == 1)
        check('called MBSR-informed', 'MBSR-informed' in page.inner_text('.course-wrap'))
        if (ROOT / 'art/course/icons_1.webp').exists():
            page.wait_for_selector('.course-cover.art', timeout=4000)  # the open panel repaints once the art loads
            check('clay cover shows', page.locator('.course-cover.art').count() == 1)
        shot(page, '01-course-start')
        btn(page, 'start')
        check('eight weeks listed', page.locator('.course-week').count() == 8)
        if (ROOT / 'art/course/icons_3.webp').exists():
            check('clay icons on every week', page.locator('.course-week .cicon.art').count() == 8)
        check('week 1 is this week', 'current' in page.get_attribute('[data-week="1"]', 'class'))
        check('week 2 waits for its date', page.locator('[data-week="2"]').is_disabled() and 'Opens' in page.inner_text('[data-week="2"]'))
        shot(page, '02-weeks')
        page.click('[data-week="1"]')
        check('week shows practices, invitation and teacher step', page.locator('.course-card').count() == 2 and 'Everyday invitation' in page.inner_text('.course-wrap') and page.locator('.checkin .btn').is_disabled())
        shot(page, '03-week1')
        page.click('[data-practice="arrive"]')
        check('length defaults to 3 min', page.locator('.pill[aria-pressed="true"]', has_text='3 min').count() == 1)
        btn(page, 'begin')
        cue = page.inner_text('.course-cue')
        check('Erin voice chosen by default', page.locator('.course-wrap audio.course-voice').count() == 1)
        clip = page.evaluate("EbbCourse.clipFor(EbbCourseVoice, document.querySelector('.course-cue').textContent)")
        check('the clip for this exact caption is loaded', bool(clip) and page.get_attribute('audio.course-voice', 'src') == clip)
        try:  # give the clip up to 4 s to start: under load the first decode can be slow
            page.wait_for_function("(a => a && !a.paused && a.currentTime > 0)(document.querySelector('audio.course-voice'))", timeout=4000)
            playing = True
        except Exception:
            playing = False
            print('voice state:', page.evaluate("(a => ({ paused: a.paused, t: a.currentTime, ready: a.readyState, net: a.networkState, err: a.error && a.error.code, src: a.getAttribute('src') }))(document.querySelector('audio.course-voice'))"))
        check('the voice plays', playing)
        check('a caption shows', len(cue) > 10)
        check('pause and end visible', page.locator('[data-act="pause"]').is_visible() and page.locator('[data-act="end"]').is_visible())
        page.wait_for_timeout(2300)
        btn(page, 'pause')
        c1 = page.inner_text('.course-clock')
        check('paused shown', 'paused' in c1)
        check('the voice pauses with the timer', page.evaluate("document.querySelector('audio.course-voice').paused"))
        page.wait_for_timeout(1600)
        check('paused time does not count', page.inner_text('.course-clock') == c1)
        btn(page, 'pause')  # resume
        page.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hid }); window.__hid = true; document.dispatchEvent(new Event('visibilitychange'))")
        c2 = page.inner_text('.course-clock')
        check('the voice is silent while hidden', page.evaluate("document.querySelector('audio.course-voice').paused"))
        page.wait_for_timeout(1600)
        check('hidden time does not count', page.inner_text('.course-clock') == c2)
        page.evaluate("window.__hid = false; document.dispatchEvent(new Event('visibilitychange'))")
        check('welcome back line', 'timer waited' in page.inner_text('.course-back'))
        shot(page, '04-runner')
        btn(page, 'end')
        check('ending asks what she noticed', page.locator('.course-note').count() == 1 and page.locator('[data-act="skip"]').count() == 1)
        page.fill('.course-note', 'Noisy street, mind busy.')
        btn(page, 'continue')
        check('ending does not save by itself', page.evaluate('EbbGame.state().observations.length') == 0)
        shot(page, '05-save')
        btn(page, 'save')
        rec = page.evaluate('EbbGame.state().observations[0]')
        check('saved with course provenance', rec['source'] == 'course' and rec['practice'] == 'arrive' and rec['scriptVersion'] == 'draft-1' and rec['anchor'] == 'touch')
        check('saved active time is the running, visible time', 1 <= rec['activeSec'] <= 4 and rec['status'] == 'partial')
        check('note kept with the record', page.evaluate(f"EbbGame.state().course.notes['{rec['id']}'].text") == 'Noisy street, mind busy.')
        check('back on the week after saving', page.locator('.course-wrap h2', has_text='Week 1').count() == 1)
        btn(page, 'back'); page.locator('.course-wrap .btn', has_text='Close').click()

        # the cushion now opens the course runner
        page.evaluate(f'EbbGame.act({{ spot: {cushion} }})')
        check('cushion opens the course once started', page.locator('.course-wrap h2', has_text='On the cushion').count() == 1)
        check('cushion offers week 1 practices', page.locator('.course-card').count() == 2)
        shot(page, '06-cushion')
        page.click('[data-practice="bodyscan"]')
        page.locator('.course-wrap .pill', has_text='Captions only').click()
        btn(page, 'begin')
        check('captions only: no voice', page.get_attribute('audio.course-voice', 'src') is None and len(page.inner_text('.course-cue')) > 10)
        page.wait_for_timeout(200); page.wait_for_timeout(1200); btn(page, 'end'); btn(page, 'skip')
        btn(page, 'hard')
        check('that felt hard is gentle', 'stopping is always fine' in page.inner_text('.course-wrap'))
        btn(page, 'stopcourse')
        check('course paused from the hard path', page.evaluate('EbbGame.state().course.stopped') is not None)
        shot(page, '07-hard')
        btn(page, 'nosave')
        check('not saved when she chose not to', page.evaluate('EbbGame.state().observations.length') == 1)
        check('she stands after the cushion', page.evaluate('EbbGame.me().action') == 'idle' and page.locator('.course-wrap').count() == 0)
        page.evaluate(f'EbbGame.act({{ spot: {cushion} }})')
        check('paused course: cushion back to the guided practices and simple sitting', page.locator('.course-wrap h2', has_text='On the cushion').count() == 1 and page.locator('.course-card').count() == 3 and [d for d in page.eval_on_selector_all('.course-card', 'els => els.map(e => e.dataset.practice)')] == ['arrive', 'breath', 'sound'] and page.locator('.course-wrap [data-act="simple"]').count() == 1)
        page.get_by_role('button', name='Not now').click()

        # carry on, history and the opt-in summary
        page.click('#moreBtn'); page.click('#panel-course')
        btn(page, 'resume'); btn(page, 'history')
        check('summary is off until she opts in', page.locator('.course-summary').is_hidden())
        page.check('.course-optin input')
        s = page.inner_text('.course-summary')
        check('summary in plain words', 'practised on 1 day' in s and 'score' not in s.lower() and 'streak' not in s.lower())
        check('history lists the saved practice', page.locator('.course-history li').count() == 1)
        shot(page, '08-history')
        check('no sideways scroll at 390 px', page.evaluate('document.documentElement.scrollWidth') <= 390)
        page.reload(); page.wait_for_function('window.EbbGame && EbbGame._ready')
        check('course and opt-in persist', page.evaluate('EbbGame.state().course.summaryOptIn') is True and page.evaluate('EbbGame.state().course.weekReached') == 1)
        check('her voice choice is remembered', page.evaluate('EbbGame.state().course.voice') == 'off')
        b.close()
    srv.shutdown()
    check('no console errors', not errors)
    for e in errors:
        print('console:', e)
    print(f'{passed} passed, {failed} failed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
