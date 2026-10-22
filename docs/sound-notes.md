# Ebb sound (22 Oct 2026)

Files: `js/ext/sound.js`, `css/ext/sound.css`, `tools/test-sound.js` (node), `tools/smoke_sound.py` (Playwright, 390 x 844).

## What it does
- Everything is synthesised with Web Audio from noise and simple tones. No audio files, no network.
- Ambience per place, crossfaded over 1.6 s when the place changes: room tone (bedroom), room tone with bath drips
  (bathroom), room tone with a little wind (barn), breeze and birds (farm), running water (waterfall), lapping water
  with slow bubbles (hot spring).
- The ambience follows where she stands, eased ten times a second (Animal Crossing style):
  - waterfall: gain and a low-pass rise together as she nears the pond spot, and it pans to the side it is on. About
    8 dB quieter and much duller from the far path than at the pond's edge.
  - farm: birds louder and more frequent by the tree at the top, quieter by the shed and down by the path.
  - bathroom: drips from the painted tub at about (37, 60), loudest at the floor's edge below it, silent across the
    room. While she redecorates, the drips follow the movable tub.
- Action sounds, read from `EbbGame.api.me()` each frame: footsteps on wood (bedroom, barn), tile (bathroom), soil
  (farm) and grass (waterfall, spring), matched to the walk phase; hoe, seeds, watering can, picking.
- Game sounds: a soft pop when a sheet opens (any `[role=dialog]` added to the body), a tick on button taps (not the
  action button, which has its own sounds), a sparkle when the basket grows or a barn heart is earned, a tiny ta-da the
  first time she does each farm action, makes an offering or visits a place, a swoosh as a door fade starts, a latch
  when she comes in or goes out of a room, and a chime for a pond offering (a longer one for the Goddess's gift).
- Every sound fires on a change, never every frame, and each has a minimum gap (tick 60 ms, pop 250 ms, sparkle
  350 ms, ta-da 900 ms), so a burst of taps cannot make a stream.
- First times are kept in the game save under `state().sound.firsts`, and are noted even with sound off: a first time
  only happens once. Where she starts the game is not a first visit.
- Off by default. The round button at the bottom-left of the scene and More > "Sound: on/off" toggle it. The
  AudioContext is made only inside that tap. The choice is kept in `localStorage['ebb_sound_v1']` as `{"on":true}`;
  every read and write is guarded. When it was left on, nothing plays until her first tap anywhere, then it starts.
  Audio is suspended while the page is hidden.

## For other workstreams
- A new place gets a sound from its id or name, or from `indoor: true`. To choose: give the scene `sound: 'room' |
  'bath' | 'barn' | 'meadow' | 'falls' | 'spring'` and, if wanted, `surface: 'wood' | 'tile' | 'soil' | 'grass'`.
  `soundSources: { birds: [[x, y, r]], hush: [[x, y, r]], tub: [x, y] }` places the sources.
- `EbbSound.play(name)` plays a named sound now if sound is on (`tick`, `pop`, `sparkle`, `tada`, `swoosh`, `door`,
  `chime`, `gift`, the steps and the farm tools). `EbbSound.duck(true|false)` lowers the ambience under a voice.

## Levels
`python3 tools/smoke_sound.py --levels` renders every sound offline through the real mix and prints peak and the
loudest K-weighted 100 ms window; ambiences at their nearest. On 22 Oct all 22 sounds were within 5 dB of the median
(action and game sounds -27 to -35, ambiences -32 to -35), peaks -11 dBFS or lower, the far waterfall 8 dB under the
near one, and a busy moment (waterfall plus six sounds at once) peaked at -9 dBFS. A DynamicsCompressor after the
master gain is a last guard. `--wav FILE` writes a preview of every sound in order.

## For the integrator
- The toggle takes the bottom-left corner (the map button has bottom-right). `sound.css` caps the prompt's width so a
  very long label wraps before it reaches the toggle.
- If the bathroom render changes, update `SOURCES.bathroom.tub`; if the farm render changes, `SOURCES.farm`.
- Not tested on a real phone yet. iOS may need her tap to resume after a call; the first-tap listener handles that.
