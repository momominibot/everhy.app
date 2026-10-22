# Ebb sound (22 Oct 2026)

Files: `js/ext/sound.js`, `css/ext/sound.css`, `tools/test-sound.js` (node), `tools/smoke_sound.py` (Playwright, 390 x 844).

## What it does
- Everything is synthesised with Web Audio from noise and simple tones. No audio files, no network.
- Ambience per place, crossfaded over 1.6 s when the place changes: room tone (bedroom, bathroom), room tone with a
  little wind (barn), breeze and birds (farm), running water (waterfall), lapping water with slow bubbles (hot spring).
- Action sounds, read from `EbbGame.api.me()` each frame: footsteps on wood indoors, soil on the farm, grass at the
  waterfall and spring (2.6 a second, matched to the walk phase); hoe, seeds, watering can, picking; a door when a
  door fade starts (or when a place changes with no fade); a chime when `state().pond.offerings` goes up, and a longer
  one when the Goddess's gift is given.
- Off by default. The round button at the bottom-left of the scene and More > "Sound: on/off" toggle it. The
  AudioContext is made only inside that tap. The choice is kept in `localStorage['ebb_sound_v1']` as `{"on":true}`;
  every read and write is guarded. When it was left on, nothing plays until her first tap anywhere (browsers require a
  tap), then it starts by itself. Audio is suspended while the page is hidden.

## For other workstreams
- A new place gets a sound from its id or name (`room`, `house`, `shop`... read as indoors; `river`, `fall` as water;
  `spring`, `pool` as the spring; anything else as the meadow). To choose: give the scene `sound: 'room' | 'barn' |
  'meadow' | 'falls' | 'spring'` and, if wanted, `surface: 'wood' | 'soil' | 'grass'`.
- `EbbSound.play(name)` plays a named sound now if sound is on (names: `step:wood`, `step:soil`, `step:grass`, `can`,
  `hoe`, `seed`, `pick`, `door`, `chime`, `gift`). `api.work()` with tools other than can, hoe, seed and pick is silent.
- `EbbSound.duck(true|false)` lowers the ambience under a voice (the course's Erin clips could call it).

## Levels
`python3 tools/smoke_sound.py --levels` renders every sound offline through the real mix and prints peak and the
loudest K-weighted 100 ms window. On 22 Oct every sound was within 5 dB of the median (action sounds -27 to -33,
ambiences -32 to -35, room tone the quietest), peaks -11 dBFS or lower, and a busy moment (waterfall plus six action
sounds at once) peaked at -9 dBFS. A DynamicsCompressor after the master gain is a last guard against clipping.
`--wav FILE` writes a preview of every sound in order.

## For the integrator
- The toggle takes the bottom-left corner, level with the action button. `sound.css` caps the prompt's width so a very
  long label wraps instead of reaching the toggle.
- Not tested on a real phone yet. iOS may need her tap to resume after a call or another app takes the audio; the
  first-tap listener handles that.
