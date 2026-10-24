#!/usr/bin/env python3
"""How smooth is it on a mid-range phone? Headless Chromium at 390x844, device pixel ratio 3, touch, the CPU slowed
4x (roughly a mid-range Android), against the dev server on :8096. In each place she walks a few steps while every
frame's time is recorded in the page; it reports per place the median and 95th-percentile frame time, the share of
frames slower than 20 ms (a visible stutter at 60 fps), long tasks over 50 ms, and how many elements the page has.
Nothing leaves the machine; no model calls.
Usage: python3 tools/perf.py [--engine chromium|webkit] [--scenes bedroom,garden] [--time HH:MM] [--cpu 4] [--warm] [--gate] [--json out.json]
--gate fails when a place change takes over 60 ms, over 5% of frames are slow, or any task runs over 50 ms.
enter = the longest gap between two frames while a place changes (a hitch if it is far over 17 ms)."""
import sys, json, statistics, os
# the test browsers live outside ~/Library/Caches, which a nightly cleanup on this Mac empties
_pw = os.path.expanduser('~/Library/Application Support/ms-playwright')
if os.path.isdir(_pw): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', _pw)
from playwright.sync_api import sync_playwright

def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default

SCENES = arg('--scenes', 'bedroom,bathroom,living,kitchen,farm,hawker,merlion,jetty,waterfall,spring,dome').split(',')
TIME, CPU, OUT, ENGINE = arg('--time', '10:00'), float(arg('--cpu', '4')), arg('--json', None), arg('--engine', 'chromium')
PROBE = """() => new Promise(done => {
  const frames = [], longs = []; let last = performance.now(), stop = false;
  const po = new PerformanceObserver(l => l.getEntries().forEach(e => longs.push(e.duration))); try { po.observe({ entryTypes: ['longtask'] }); } catch (e) {}
  function f(t) { frames.push(t - last); last = t; if (!stop) requestAnimationFrame(f); }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(f); });
  setTimeout(() => { stop = true; po.disconnect(); done({ frames, longs, nodes: document.getElementsByTagName('*').length }); }, 4000);
})"""

def main():
    rows = []
    with sync_playwright() as p:
        br = getattr(p, ENGINE).launch()
        opts = {'viewport': {'width': 390, 'height': 844}, 'device_scale_factor': 3, 'has_touch': True}
        if ENGINE == 'chromium': opts['is_mobile'] = True
        ctx = br.new_context(**opts)
        pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg) if ENGINE == 'chromium' else None
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8096/index.html?time=' + TIME); pg.wait_for_function('window.EbbGame && EbbGame._ready')
        pg.evaluate("localStorage.clear()")
        pg.evaluate("""() => { const s = EbbGame.state(); s.safety = Object.assign({}, s.safety, { onboardedAt: '2026-10-22T08:00:00Z',
          onboardVersion: (window.EbbSafetyUi && EbbSafetyUi.ONBOARD_VERSION) || 'onboard-2026-10-22.1' }); EbbGame.api.save(); }""")
        pg.reload(); pg.wait_for_function('window.EbbGame && EbbGame._ready'); pg.wait_for_timeout(800)
        if cdp: cdp.send('Emulation.setCPUThrottlingRate', {'rate': CPU})
        for sc in SCENES:
            pg.evaluate("() => document.querySelectorAll('.routine-wrap,.sheet-wrap').forEach(e => e.remove())")
            if '--warm' in sys.argv:  # as a door or the map does: the place is warmed while the screen fades (320 ms)
                pg.evaluate("sc => EbbGame.api.warm && EbbGame.api.warm(sc)", sc); pg.wait_for_timeout(320)
            gap = pg.evaluate("""(sc) => new Promise(done => { let last = performance.now(), worst = 0, n = 0;
              function f(t) { worst = Math.max(worst, t - last); last = t; if (++n < 60) requestAnimationFrame(f); else done(Math.round(worst)); }
              requestAnimationFrame(t => { last = t; EbbGame.enter(sc); requestAnimationFrame(f); }); })""", sc)
            pg.wait_for_timeout(1500)
            pg.evaluate("() => document.querySelectorAll('.routine-wrap,.sheet-wrap').forEach(e => e.remove())")
            # a short walk across the floor and back, so the camera, depth sort and props all work
            pg.evaluate("""(sc) => { const s = EbbWorld.SCENES[sc], me = EbbGame.me(), pts = [];
              (s.spots || []).forEach(p => pts.push(p.stand)); const far = pts.sort((a, b) => Math.hypot(b.x - me.x, b.y - me.y) - Math.hypot(a.x - me.x, a.y - me.y))[0];
              if (far) EbbGame.walkTo(far); }""", sc)
            r = pg.evaluate(PROBE)
            fr = [x for x in r['frames'] if x > 0]
            fr.sort()
            row = {'scene': sc, 'enterGap': gap, 'frames': len(fr), 'p50': round(statistics.median(fr), 1) if fr else None,
                   'p95': round(fr[int(len(fr) * 0.95) - 1], 1) if fr else None,
                   'slow': round(100 * sum(1 for x in fr if x > 20) / max(1, len(fr)), 1), 'long': len(r['longs']),
                   'longMax': round(max(r['longs']), 0) if r['longs'] else 0, 'nodes': r['nodes']}
            rows.append(row)
            print('%-10s enter %4s ms  frames %4d  p50 %5s ms  p95 %5s ms  slow %5s%%  long %2d (max %s ms)  nodes %d' % (sc, gap, row['frames'], row['p50'], row['p95'], row['slow'], row['long'], row['longMax'], row['nodes']))
        br.close()
    if errs: print('page errors:', errs[:3])
    if '--gate' in sys.argv:  # the smoothness budget the check suite holds every change to
        bad = [r for r in rows if r['enterGap'] > 60 or r['slow'] > 5 or r['long'] > 0] + ([{'scene': 'page errors'}] if errs else [])
        print('smoothness: ' + ('ok' if not bad else 'OVER BUDGET in ' + ', '.join(r['scene'] for r in bad)))
        sys.exit(1 if bad else 0)
    if OUT: json.dump({'time': TIME, 'cpu': CPU, 'rows': rows}, open(OUT, 'w'), indent=1)

if __name__ == '__main__':
    main()
