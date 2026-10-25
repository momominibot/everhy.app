#!/usr/bin/env python3
"""Turn proto/avatar3d.html into the self-contained page published as an artifact.
The artifact host serves no .glb, so the models go as base64 .txt and the page decodes them.
Usage: build_avatar_pub.py <out dir> [avatar, default avatar_white]
The avatar's <name>_fixed GLB (weights repaired by fix_weights.py) is used when present, else <name>_moves; <name>_idles is added only when it exists (older sets kept the calm idle there)."""
import base64, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = Path(sys.argv[1]); D.mkdir(parents=True, exist_ok=True)
AV = sys.argv[2] if len(sys.argv) > 2 else 'avatar_white'
IDLES = (ROOT / 'art/meshy' / (AV + '_idles') / 'animation_glb_url.glb').exists()
shutil.copy(ROOT / 'art/plates/bedroom-dream-wide.webp', D / 'bedroom.webp')
shutil.copy(ROOT / 'art/chars/genz/idle.webp', D / 'sprite.webp')
shutil.copy(ROOT / 'art/chars/genz/idle.json', D / 'sprite.json')
shutil.copy(ROOT / 'js/ebb-world.js', D / 'ebb-world.js')  # the game's floor, furniture blocks and path planner
(D / 'art/occluders').mkdir(parents=True, exist_ok=True); shutil.copy(ROOT / 'art/occluders/bedroom-arch-door.webp', D / 'art/occluders/bedroom-arch-door.webp')
for f in D.glob('*.glb.txt'): f.unlink()
for src, name in [((AV + '_fixed') if (ROOT / 'art/meshy' / (AV + '_fixed')).exists() else (AV + '_moves'), 'moves.glb')] + ([(AV + '_idles', 'idles.glb')] if IDLES else []):
    (D / (name + '.txt')).write_bytes(base64.encodebytes((ROOT / 'art/meshy' / src / 'animation_glb_url.glb').read_bytes()))
s = (ROOT / 'proto/avatar3d.html').read_text()
s = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', s)
s = s.replace('<meta charset="utf-8">\n', '').replace('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n', '')
s = s.replace('</head>\n<body>\n', '').replace('</body>\n</html>\n', '')
assert s.count('../art/plates/bedroom-dream-wide.webp') == 2
s = s.replace('../art/plates/bedroom-dream-wide.webp', 'bedroom.webp')
REP = [
    ('<title>EveRhy 3D Avatar Test</title>', '<title>EveRhy 3D Avatar</title>\n<meta name="claude:viewport-fit-sides" content="cover">'),
    ("SRC = q.get('model') || '../art/meshy/' + (q.get('skin') || 'avatar_white_fixed') + '/animation_glb_url.glb';", "SRC = 'moves.glb';"),
    ("if (!q.get('model') && !names.includes('Idle_7')) new GLTFLoader().load(SRC.replace(/avatar_(\\w+?)_moves\\//, 'avatar_$1_idles/'), g2 => {", "if (" + ('true' if IDLES else 'false') + ") loadGlb('idles.glb', g2 => {"),
    ("current = null; play('idle'); } }, undefined, () => {});", "current = null; play('idle'); } }, () => {});"),
    ("'../art/chars/genz/idle.json'", "'sprite.json'"), ("'../art/chars/genz/idle.webp'", "'sprite.webp'"),
    ('.bar { position: fixed; left: 12px; right: 12px; bottom: calc(14px + env(safe-area-inset-bottom));',
     '.bar { position: fixed; left: 0; right: 0; bottom: 0; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 0 calc(14px + env(safe-area-inset-bottom, 0px));'),
    ('.note { position: fixed; top: calc(12px + env(safe-area-inset-top)); left: 12px; right: 12px;',
     '.note { position: fixed; top: calc(12px + env(safe-area-inset-top, 0px)); left: max(16px, env(safe-area-inset-left, 0px)); right: max(16px, env(safe-area-inset-right, 0px));'),
    ('.bar button {', '.bar button:focus-visible { outline: 3px solid #7a3550; outline-offset: 2px; }\n  .bar button {'),
    ("note.innerHTML = 'Fairer 3D test<small>' + gltf.animations.length + ' moves: ' + names.join(', ') + '. Tap the floor to walk.</small>';",
     "note.innerHTML = 'Her in 3D<small>Tap the floor to walk. Old sprite shows her as she is now.</small>';"),
    ('window.__t = { shadow, holder, camera, scene, me, cam, turn, bones, get model() { return model; } };\n', ''),
    ('<script src="../js/ebb-world.js"></script>', '<script src="ebb-world.js"></script>'),
    ("im.src = '../' + f.src;", 'im.src = f.src;'),
    ('new GLTFLoader().load(SRC, gltf => {',
     "/* the models ship as base64 text (the host serves no .glb), decoded here and handed to the loader */\n"
     "async function glb(name) { const t = await (await fetch(name + '.txt')).text(); const bin = atob(t.replace(/\\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }\n"
     "function loadGlb(name, onLoad, onError) { glb(name).then(buf => new GLTFLoader().parse(buf, '', onLoad, onError)).catch(onError); }\n"
     "loadGlb(SRC, gltf => {"),
    ("}, undefined, e => { note.textContent = 'Could not load ' + SRC + ' (' + e.message + ')'; });",
     "}, e => { note.textContent = 'Could not load her model (' + (e && e.message) + ')'; });"),
]
for a, b in REP:
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)
(D / 'index.html').write_text(s)
print('built', D)
