#!/usr/bin/env python3
"""One guarded Seedance image-to-video run for a living plate: live_plate.py <plate.png> <out.mp4> "<prompt>".
Same discipline as run_batch.py: refuses while art/RUN.lock or art/BLOCKED.json exists, submits exactly once, never
retries, and on any failure (HTTP error, failed task, timeout, odd response) writes art/BLOCKED.json and exits 5.
The task id is written beside the output as soon as the server returns it, so a lost poll can be resumed by hand
with GET /contents/generations/tasks/<id> rather than resubmitted. Key: ~/.config/volcengine/api_key."""
import base64, io, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]; ART = ROOT / 'art'; LOCK = ART / 'RUN.lock'; BLOCK = ART / 'BLOCKED.json'
BASE = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
MODEL = 'doubao-seedance-2-0-260128'
plate, out, prompt = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
def block(stage, detail):
    BLOCK.write_text(json.dumps({'item': out.stem, 'stage': stage, 'detail': str(detail)[:2000], 'at': time.ctime()}, indent=1))
    print('BLOCKED at', stage, ':', str(detail)[:300], file=sys.stderr); sys.exit(5)
if LOCK.exists(): print('another art run holds', LOCK, file=sys.stderr); sys.exit(3)
if BLOCK.exists(): print('a blocked run waits for Jamie:', BLOCK, file=sys.stderr); sys.exit(4)
key = open(os.path.expanduser('~/.config/volcengine/api_key')).read().strip()
LOCK.write_text(f'live_plate {out.name} {time.ctime()}\n')
try:
    im = Image.open(plate).convert('RGB'); buf = io.BytesIO(); im.save(buf, 'JPEG', quality=92)
    data_uri = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    body = {'model': MODEL, 'content': [{'type': 'text', 'text': prompt}, {'type': 'image_url', 'image_url': {'url': data_uri}}],
            'ratio': 'adaptive', 'resolution': '720p', 'duration': 5, 'generate_audio': False, 'watermark': False}
    out.with_suffix('.prompt.json').write_text(json.dumps({'model': MODEL, 'prompt': prompt, 'plate': str(plate), 'size': im.size,
                                                           'ratio': 'adaptive', 'resolution': '720p', 'duration': 5}, indent=1))
    req = urllib.request.Request(BASE, data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r: sub = json.loads(r.read())
    except urllib.error.HTTPError as e: block('submit', f'HTTP {e.code}: {e.read()[:800]!r}')
    except Exception as e: block('submit', repr(e))
    tid = sub.get('id')
    if not tid: block('submit', f'no task id in {sub!r}')
    out.with_suffix('.task.json').write_text(json.dumps(sub, indent=1)); print('task', tid, 'submitted after', round(time.time() - t0, 1), 's')
    while True:
        time.sleep(6)
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + '/' + tid, headers={'Authorization': 'Bearer ' + key}), timeout=60) as r: d = json.loads(r.read())
        except Exception as e: block('poll', repr(e))
        st = d.get('status'); print(' ', round(time.time() - t0), 's', st, flush=True)
        if st == 'succeeded':
            url = (d.get('content') or {}).get('video_url')
            if not url: block('result', f'succeeded without video_url: {d!r}')
            urllib.request.urlretrieve(url, out); out.with_suffix('.task.json').write_text(json.dumps(d, indent=1))
            print('saved', out, out.stat().st_size, 'bytes'); break
        if st in ('failed', 'cancelled', 'expired'): block('task ' + st, d)
        if time.time() - t0 > 900: block('timeout', f'still {st} after 900 s; task {tid}')
finally:
    if LOCK.exists(): LOCK.unlink()
