#!/usr/bin/env python3
"""Headless browser smoke for Ebb sound at phone size (390 x 844). Serves the repo on a spare local port; nothing
leaves the machine.
- Levels: renders every action sound and every ambience in an OfflineAudioContext through the real mix (without the
  limiter) and checks none clips and none is more than 10 dB quieter (or louder) than the median, by the loudest
  K-weighted 100 ms window. A busy moment (waterfall, chime, can, hoe, step, door at once) through the full mix stays under 0 dBFS.
- Behaviour: off by default with no AudioContext made, the toggle makes one only on its tap, the choice is remembered,
  ambience follows the place with a crossfade, footsteps follow the floor, farm actions, doors and the pond offering
  make their sounds, the More menu entry toggles too, remembered-on waits for a tap, storage that throws is survived.
- Layout: the toggle covers nothing (prompt, hint, top bar, toast) at 390 x 844.
Run: python3 tools/smoke_sound.py [--levels] [--shots DIR] [--wav FILE]"""
import base64, functools, http.server, json, socket, statistics, sys, threading, wave
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARG = lambda flag: Path(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else None
SHOTS, WAV = ARG('--shots'), ARG('--wav')
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
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


LEVELS = """async (wantPcm) => {
  const S = EbbSound, sr = 48000, out = {}, pcm = [];
  /* K-weighting (the loudness-standard pre-filter: a high shelf near 1.7 kHz and a gentle low cut), so a deep rumble
     is not counted as loud as a sound a phone speaker actually plays */
  const weigh = async (buf) => {
    const ctx = new OfflineAudioContext(2, buf.length, sr), src = ctx.createBufferSource(), hs = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
    src.buffer = buf; hs.type = 'highshelf'; hs.frequency.value = 1681; hs.gain.value = 4; hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
    src.connect(hs); hs.connect(hp); hp.connect(ctx.destination); src.start(0);
    return ctx.startRendering();
  };
  const measure = async (buf) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, win = 4800, hop = 1200;
    let peak = 0, best = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const kb = await weigh(buf), KL = kb.getChannelData(0), KR = kb.getChannelData(1);
    for (let s = 0; s + win <= n; s += hop) {
      let e = 0; for (let i = s; i < s + win; i++) e += (KL[i] * KL[i] + KR[i] * KR[i]) / 2;
      best = Math.max(best, Math.sqrt(e / win));
    }
    const db = v => v > 0 ? 20 * Math.log10(v) : -200;
    return { peak: db(peak), loud: db(best), secs: n / sr };
  };
  const names = Object.keys(S.VOICES).concat(Object.keys(S.AMBIENCES));
  for (const name of names) {
    const amb = !!S.AMBIENCES[name], secs = amb ? 8 : S.VOICES[name].dur + 0.25;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
    S.render(ctx, name, { seed: 7, seconds: secs, limiter: false });
    const buf = await ctx.startRendering();
    out[name] = Object.assign({ kind: amb ? 'ambience' : 'action' }, await measure(buf));
    if (wantPcm) { /* a preview to listen to: each sound, a short gap */
      const L = buf.getChannelData(0), R = buf.getChannelData(1), take = Math.min(L.length, sr * (amb ? 5 : 4));
      const a = new Int16Array(take * 2 + sr * 2);
      for (let i = 0; i < take; i++) { a[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; a[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
      let s = ''; const u8 = new Uint8Array(a.buffer); for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
      pcm.push([name, btoa(s)]);
    }
  }
  /* a busy moment through the full mix with its limiter */
  const ctx = new OfflineAudioContext(2, sr * 4, sr), bus = S.chain(ctx), a = S.AMBIENCES.falls.make(ctx, bus.amb, S.rng(1), 0);
  a.schedule(0, 4); a.stop(4);
  ['chime', 'can', 'hoe', 'step:grass', 'door', 'gift'].forEach((n, i) => S.VOICES[n].make(ctx, bus.sfx, 0.3 + i * 0.02, S.rng(2 + i)));
  out.__busy = await measure(await ctx.startRendering());
  return { levels: out, pcm };
}"""


def levels(page):
    res = page.evaluate(LEVELS, bool(WAV))
    lv = res['levels']; busy = lv.pop('__busy')
    med = statistics.median(v['loud'] for v in lv.values())
    print(f'{"sound":12} {"kind":9} {"peak dBFS":>9} {"loud dB":>9} {"vs median":>9}')
    for k, v in lv.items():
        print(f'{k:12} {v["kind"]:9} {v["peak"]:9.1f} {v["loud"]:9.1f} {v["loud"] - med:+9.1f}')
    print(f'{"busy mix":12} {"all":9} {busy["peak"]:9.1f} {busy["loud"]:9.1f}')
    for k, v in lv.items():
        check(f'{k} does not clip (peak {v["peak"]:.1f} dBFS)', v['peak'] < -1.0)
        check(f'{k} is not more than 10 dB quieter than the median ({v["loud"] - med:+.1f} dB)', v['loud'] >= med - 10)
        check(f'{k} is not more than 10 dB louder than the median ({v["loud"] - med:+.1f} dB)', v['loud'] <= med + 10)
        check(f'{k} is gentle (loudest window {v["loud"]:.1f} dBFS)', v['loud'] < -12)
    check(f'a busy moment stays under full scale ({busy["peak"]:.1f} dBFS)', busy['peak'] < 0)
    if WAV:
        frames = b''.join(base64.b64decode(b) for _, b in res['pcm'])
        with wave.open(str(WAV), 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000); w.writeframes(frames)
        print('preview order:', ', '.join(n for n, _ in res['pcm']), '->', WAV)


COUNT_CONTEXTS = """(() => { window.__acMade = 0;
  for (const k of ['AudioContext', 'webkitAudioContext']) { const AC = window[k]; if (!AC) continue;
    window[k] = class extends AC { constructor(...a) { super(...a); window.__acMade++; } }; } })()"""
THROWING_STORAGE = """(() => { const deny = () => { throw new Error('denied'); };
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { return { getItem: deny, setItem: deny, removeItem: deny, clear: deny, key: deny, length: 0 }; } }); })()"""


def status(page):
    return page.evaluate('EbbSound.status()')


def played(page):
    return [p['name'] for p in status(page)['played']]


def wait_played(page, name, ms=3000):
    try:
        page.wait_for_function(f"EbbSound.status().played.some(p => p.name === {json.dumps(name)})", timeout=ms)
        return True
    except Exception:
        return False


def box(page, sel):
    el = page.query_selector(sel)
    return el.bounding_box() if el and el.is_visible() else None


def overlap(a, b):
    return a and b and a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width'] and a['y'] < b['y'] + b['height'] and b['y'] < a['y'] + a['height']


def shot(page, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / f'{name}.png'))


def fresh(browser, port, errors, init=None):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(COUNT_CONTEXTS)
    if init:
        ctx.add_init_script(init)
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{port}/index.html')
    page.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbSound')
    return ctx, page


def tap_scene(page, x, y):
    """tap a point given in scene percent, wherever the camera has moved the stage"""
    r = page.evaluate("(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()")
    page.mouse.click(r['l'] + r['w'] * x / 100, r['t'] + r['h'] * y / 100)


def arrive(page, scene):
    page.wait_for_function(f"EbbGame.api.scene() === '{scene}' && !document.getElementById('scene').classList.contains('fading')", timeout=8000)
    page.wait_for_timeout(700)  # taps are ignored for 600 ms after a door


def main():
    srv, port = serve()
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--autoplay-policy=user-gesture-required'])

        # ---------- levels ----------
        c, page = fresh(b, port, errors)
        levels(page)
        c.close()
        if '--levels' in sys.argv:  # just the level table, for tuning
            b.close(); srv.shutdown(); print(f'{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)

        # ---------- off by default; the toggle makes the AudioContext ----------
        c, page = fresh(b, port, errors)
        page.evaluate('localStorage.clear()'); page.reload(); page.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbSound')
        btn = page.locator('#soundBtn')
        check('toggle is there', btn.count() == 1 and btn.is_visible())
        check('off by default', btn.get_attribute('aria-pressed') == 'false' and status(page)['on'] is False)
        check('no AudioContext before the tap', page.evaluate('window.__acMade') == 0 and status(page)['ctx'] == 'none')
        check('toggle has a name', 'Turn sound on' in (btn.get_attribute('aria-label') or ''))
        tap_scene(page, 40, 80); page.wait_for_timeout(600)
        check('walking with sound off makes no AudioContext', page.evaluate('window.__acMade') == 0 and not status(page)['played'])
        check('menu entry says off', page.locator('#panel-sound').text_content() == 'Sound: off')
        shot(page, 'sound-off-bedroom')

        btn.click()
        page.wait_for_function("EbbSound.status().ctx === 'running'", timeout=4000)
        check('one AudioContext, made by the tap', page.evaluate('window.__acMade') == 1)
        check('toggle shows on', btn.get_attribute('aria-pressed') == 'true' and 'Turn sound off' in btn.get_attribute('aria-label'))
        check('choice remembered', page.evaluate("localStorage.getItem('ebb_sound_v1')") == '{"on":true}')
        check('menu entry says on', page.locator('#panel-sound').text_content() == 'Sound: on')
        page.wait_for_function("EbbSound.status().ambience === 'room'", timeout=3000)
        check('bedroom plays room tone', status(page)['ambience'] == 'room')
        page.wait_for_timeout(1500)  # the toast fades so the shot shows the scene

        # walk to the cushion: wooden footsteps, and the prompt appears beside the toggle
        cushion = page.evaluate("EbbWorld.SCENES.bedroom.spots.find(s => s.kind === 'cushion').stand")
        page.evaluate(f"EbbGame.walkTo({json.dumps(cushion)}, null)")
        check('wooden footsteps in the bedroom', wait_played(page, 'step:wood'))
        page.wait_for_function("!document.getElementById('prompt').hidden", timeout=6000)
        page.wait_for_timeout(400)
        tb, pb, hb, top = box(page, '#soundBtn'), box(page, '#prompt'), box(page, '.hint'), box(page, '.top')
        check('toggle sits bottom-left', tb and tb['x'] < 40 and tb['y'] + tb['height'] > 844 - 90)
        check('toggle is a 44 px target', tb and tb['width'] >= 44 and tb['height'] >= 44)
        check('toggle clear of the action button', pb and not overlap(tb, pb) and tb['x'] + tb['width'] + 8 <= pb['x'])
        check('toggle clear of the hint', not overlap(tb, hb))
        check('toggle clear of the top bar', not overlap(tb, top))
        long_label = page.evaluate("""(() => { const p = document.getElementById('prompt'); p.textContent = 'A very long label for a spot that someone might add one day'; return p.getBoundingClientRect().toJSON(); })()""")
        check('a long prompt wraps before the toggle', not overlap(tb, long_label))
        page.wait_for_timeout(100)
        shot(page, 'sound-on-bedroom-390x844')

        # out through the door: a door, then the farm's birds and breeze, crossfaded
        door = page.evaluate("(() => { const d = EbbWorld.SCENES.bedroom.doors[0]; return { x: (d.rect[0] + d.rect[2]) / 2, y: (d.rect[1] + d.rect[3]) / 2 }; })()")
        page.evaluate(f"EbbGame.walkTo({json.dumps(door)}, null)")
        check('a door as she goes out', wait_played(page, 'door', 6000))
        arrive(page, 'farm')
        check('farm plays birds and breeze', status(page)['ambience'] == 'meadow')
        check('both ambiences overlap while crossfading', status(page)['layers'] == 2)
        page.wait_for_timeout(1800)
        check('the old ambience is gone after the crossfade', status(page)['layers'] == 1)
        tap_scene(page, 36, 93)
        check('soft footsteps on the farm', wait_played(page, 'step:soil'))
        tb, top = box(page, '#soundBtn'), box(page, '.top')
        check('toggle clear of the top bar on the farm', not overlap(tb, top))
        shot(page, 'sound-on-farm-390x844')

        # farm actions through the engine's own action path
        page.evaluate("""(() => { const f = EbbGame.state().farm, t = EbbStore.today();
          const past = n => { const d = new Date(); d.setDate(d.getDate() - n); return EbbStore.today(d); };
          f.beds[0] = { state: 'grass', crop: null, watered: [] };
          f.beds[1] = { state: 'planted', crop: 'turnip', watered: [past(2), past(1)] };
          f.seeds = { carrot: 1 }; EbbGame.api.refresh(); })()""")
        page.wait_for_function("EbbGame.me().action !== 'walk'", timeout=6000)
        for want in ['hoe', 'seed', 'can']:
            page.evaluate('EbbGame.act({ bed: 0 })')
            check(f'{want} sounds on the farm', wait_played(page, want))
            page.wait_for_timeout(800)
        page.evaluate('EbbGame.act({ bed: 1 })')
        check('picking sounds', wait_played(page, 'pick'))
        page.wait_for_timeout(800)
        n_actions = sum(1 for n in played(page) if n in ('hoe', 'seed', 'can', 'pick'))
        check(f'each action sounds once ({n_actions})', n_actions == 4)

        # a jump to the waterfall (no fade) still gets a door, then running water; the offering chimes
        doors = played(page).count('door')
        page.evaluate("EbbGame.api.enter('waterfall')")
        try:
            page.wait_for_function(f"EbbSound.status().played.filter(p => p.name === 'door').length > {doors}", timeout=2000); jumped = True
        except Exception:
            jumped = False
        check('a jump between places makes a door', jumped and played(page).count('door') == doors + 1)
        page.wait_for_function("EbbSound.status().ambience === 'falls'", timeout=3000)
        check('waterfall plays running water', status(page)['ambience'] == 'falls')
        page.wait_for_timeout(700)
        tap_scene(page, 30, 90)
        check('grass footsteps at the waterfall', wait_played(page, 'step:grass'))
        page.wait_for_function("EbbGame.me().action !== 'walk'", timeout=8000)
        page.evaluate("EbbGame.act({ spot: EbbWorld.SCENES.waterfall.spots.find(s => s.kind === 'pond') })")
        check('a pond offering chimes', wait_played(page, 'chime'))
        page.evaluate('EbbSound.duck(true)'); page.wait_for_timeout(200); page.evaluate('EbbSound.duck(false)')
        check('ducking the ambience under a voice runs', status(page)['ctx'] == 'running')
        check('every sound was made in this one context', page.evaluate('window.__acMade') == 1)

        # off again from the toggle, then on from the More menu
        page.wait_for_timeout(500)
        btn.click()
        check('toggle off', btn.get_attribute('aria-pressed') == 'false' and page.evaluate("localStorage.getItem('ebb_sound_v1')") == '{"on":false}')
        page.wait_for_function("EbbSound.status().ctx === 'suspended'", timeout=3000)
        check('audio is suspended when off', status(page)['ctx'] == 'suspended')
        before = len(played(page))
        tap_scene(page, 60, 88); page.wait_for_timeout(900)
        check('no sounds while off', len(played(page)) == before)
        page.click('#moreBtn'); page.click('#panel-sound')
        page.wait_for_function("EbbSound.status().ctx === 'running'", timeout=3000)
        check('the menu entry turns it back on', status(page)['on'] is True and btn.get_attribute('aria-pressed') == 'true')
        check('still one AudioContext', page.evaluate('window.__acMade') == 1)
        page.wait_for_function("EbbSound.status().ambience === 'falls'", timeout=3000)
        check('ambience comes back with it', status(page)['ambience'] == 'falls')

        # remembered on: nothing plays until a tap, then it starts by itself
        page.reload(); page.wait_for_function('window.EbbGame && EbbGame._ready && window.EbbSound')
        check('remembered on after a reload', page.locator('#soundBtn').get_attribute('aria-pressed') == 'true')
        check('no AudioContext until she taps', page.evaluate('window.__acMade') == 0)
        page.wait_for_timeout(700)
        tap_scene(page, 40, 88)
        page.wait_for_function("EbbSound.status().ctx === 'running'", timeout=3000)
        check('her first tap starts it', page.evaluate('window.__acMade') == 1)
        c.close()

        # storage that throws: the game runs, the toggle still works for this visit
        c, page = fresh(b, port, errors, THROWING_STORAGE)
        check('storage that throws: toggle starts off', page.locator('#soundBtn').get_attribute('aria-pressed') == 'false')
        page.locator('#soundBtn').click()
        page.wait_for_function("EbbSound.status().ctx === 'running'", timeout=3000)
        check('storage that throws: it still turns on', status(page)['on'] is True)
        c.close()

        b.close()
    srv.shutdown()
    check('no page errors ' + ' | '.join(errors[:3]), not errors)
    print(f'{passed} passed, {failed} failed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
