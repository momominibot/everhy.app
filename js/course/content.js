/* Ebb course content: an MBSR-informed eight-week course and its practice library.
 * Every script here is an ORIGINAL DRAFT written for Ebb, awaiting review by a qualified MBSR teacher before use with
 * patients. It is not MBSR, not a certified course, and makes no health claims. Nothing here is offered for hot flushes.
 * Cue times are fractions of the planned length, so the same script fits 3, 5 or 10 minutes. */
(function (root) {
  'use strict';
  var VERSION = 'draft-1';

  /* icon = frame index in art/course/icons.webp (a 3x3 clay sheet, reading order) */
  var ICON = { cushion: 0, feather: 1, cloud: 2, mat: 3, tea: 4, pebbles: 5, heart: 6, lantern: 7, bell: 8 };

  var SETTLE = 'Let your body settle where it is. Eyes open or closed, whatever feels right today.';
  var CLOSE = 'In a moment this practice ends. Notice how you are right now, without needing it to be any particular way.';
  var WANDER = 'Minds wander. When you notice it has, that noticing is the practice. Gently come back.';

  var PRACTICES = {
    arrive: {
      title: 'Arriving', icon: ICON.cushion, minutes: 3, anchor: 'touch',
      blurb: 'A few minutes to land where you are.',
      cues: [[0, SETTLE], [0.12, 'Notice the places where your body is supported: the floor, the seat, your hands resting.'],
        [0.3, 'Notice what is here: sounds, the air on your skin, the weight of your body.'],
        [0.5, 'Nothing to fix and nowhere to get to. Just this moment, as it is.'],
        [0.7, WANDER], [0.88, CLOSE]]
    },
    bodyscan: {
      title: 'Short body scan', icon: ICON.feather, minutes: 5, anchor: 'body',
      blurb: 'Attention moves slowly through the body. Sitting or lying down.',
      cues: [[0, 'Find a position you can rest in, sitting or lying down. ' + SETTLE.slice(SETTLE.indexOf('Eyes'))],
        [0.08, 'Bring attention to your feet. Notice whatever is there: warmth, coolness, tingling, or nothing much.'],
        [0.22, 'Let attention move up through the legs, slowly, the way light moves across a room.'],
        [0.38, 'Now the belly and the back. Notice the movement of breathing here, if you can feel it.'],
        [0.52, 'The hands, the arms, the shoulders. If there is discomfort, you can notice it, or move gently. Both are fine.'],
        [0.66, 'The neck, the face, the top of the head.'],
        [0.78, 'Now the whole body, resting here. ' + WANDER], [0.9, CLOSE]]
    },
    breath: {
      title: 'Sitting with the breath', icon: ICON.cloud, minutes: 3, anchor: 'breath',
      blurb: 'Rest attention on breathing, just as it is.',
      cues: [[0, SETTLE], [0.12, 'Notice where you feel the breath most easily: the nose, the chest or the belly.'],
        [0.28, 'No need to change the breath. Let it breathe itself.'],
        [0.45, WANDER], [0.62, 'Notice the next breath, and the next. Each one a fresh start.'],
        [0.78, 'If the breath does not feel like a comfortable place to rest, you can rest on sounds or your hands instead.'], [0.9, CLOSE]]
    },
    sound: {
      title: 'Sitting with sounds', icon: ICON.bell, minutes: 3, anchor: 'sound',
      blurb: 'Let sounds come and go.',
      cues: [[0, SETTLE], [0.12, 'Let sounds come to you, near and far. No need to go looking for them.'],
        [0.3, 'Notice sounds begin, change and fade. No need to name them.'],
        [0.48, 'Notice the quiet between sounds too.'], [0.66, WANDER], [0.9, CLOSE]]
    },
    touch: {
      title: 'Sitting with touch', icon: ICON.cushion, minutes: 3, anchor: 'touch',
      blurb: 'Rest attention where the body meets the seat and the floor.',
      cues: [[0, SETTLE], [0.12, 'Notice where your body touches the seat and the floor.'],
        [0.3, 'Notice weight, warmth, pressure, or nothing in particular.'],
        [0.48, 'Your hands: notice how they rest, and what they feel.'], [0.66, WANDER], [0.9, CLOSE]]
    },
    movement: {
      title: 'Mindful movement', icon: ICON.mat, minutes: 5, anchor: 'body',
      blurb: 'Slow, gentle movement. There is a seated version.',
      note: 'Move only within what is comfortable for you today. Skip any movement you like.',
      cues: [[0, 'Stand with your feet a little apart. Let your arms hang. Notice your feet on the floor.'],
        [0.12, 'Slowly raise your arms out to the sides, only as far as is comfortable. Notice the stretch.'],
        [0.26, 'Slowly lower them. Pause, and notice what you feel.'],
        [0.4, 'Gently roll your shoulders a few times, back and then forward.'],
        [0.54, 'Shift your weight a little to one foot, then the other. Slow and easy.'],
        [0.68, 'Stand still. Notice the body after moving. If the mind has wandered, gently come back.'],
        [0.88, CLOSE]],
      seated: [[0, 'Sit with your feet flat on the floor and your back supported. Notice your feet.'],
        [0.12, 'Slowly lift your arms forwards, only as far as is comfortable. Notice the stretch.'],
        [0.26, 'Slowly lower them to your lap. Pause, and notice what you feel.'],
        [0.4, 'Gently roll your shoulders a few times, back and then forward.'],
        [0.54, 'Turn your head slowly to one side, then back to the middle, then the other side.'],
        [0.68, 'Rest. Notice the body after moving. If the mind has wandered, gently come back.'],
        [0.88, CLOSE]]
    },
    tea: {
      title: 'A cup of tea', icon: ICON.tea, minutes: 3, anchor: 'senses',
      blurb: 'An everyday moment, with full attention. Any drink is fine.',
      cues: [[0, 'Hold your cup, or imagine holding it. Notice its warmth or coolness in your hands.'],
        [0.15, 'Notice the colour, the steam, the way the light sits on the surface.'],
        [0.32, 'Notice the smell, before you drink.'], [0.48, 'Take a small sip. Notice taste, temperature, swallowing.'],
        [0.66, 'Another sip, at your own pace. ' + WANDER], [0.88, CLOSE]]
    },
    stress: {
      title: 'A pause for hard moments', icon: ICON.pebbles, minutes: 3, anchor: 'breath',
      blurb: 'Pause, notice, breathe, then choose your next step.',
      cues: [[0, 'Bring to mind a mildly tense moment from today, or just how you are right now. Nothing big.'],
        [0.15, 'Pause. Notice what is here: thoughts, feelings, sensations in the body. Just noticing.'],
        [0.35, 'Notice a few breaths, or your feet on the floor. Something steady.'],
        [0.55, 'Let your attention widen to the whole body, sitting or standing here.'],
        [0.72, 'When you are ready, ask: what would help, right now? There is no right answer.'], [0.88, CLOSE]]
    },
    kindness: {
      title: 'Kindness', icon: ICON.heart, minutes: 3, anchor: 'kindness',
      blurb: 'Quiet, friendly wishes, for yourself and others.',
      cues: [[0, SETTLE], [0.12, 'If you like, rest a hand on your chest or somewhere comforting.'],
        [0.26, 'Silently offer yourself a simple wish, such as: may I be at ease. Use any words that feel true.'],
        [0.44, 'If the words feel flat or strange, that is common. Just the intention is enough.'],
        [0.6, 'Bring to mind someone you care about, and offer them a wish too.'],
        [0.76, 'Now let the wish reach out to anyone, everywhere.'], [0.9, CLOSE]]
    },
    carry: {
      title: 'Your own practice', icon: ICON.lantern, minutes: 5, anchor: 'choice', anchors: ['breath', 'sound', 'touch'],
      blurb: 'Choose where attention rests. Mostly quiet.',
      cues: [[0, SETTLE], [0.1, 'Choose your anchor and let attention rest there.'], [0.4, WANDER],
        [0.7, 'Stay with this moment, as it is.'], [0.9, CLOSE]]
    }
  };

  var CHECKIN = {
    status: 'placeholder',
    /* STAFF NOTE: placeholder until real human contact (a teacher or clinic contact) is set up. Do not present this as
     * available support. The user-facing copy below is deliberately neutral. */
    staffNote: 'Placeholder: no teacher contact is wired up yet. Needs a real booking or message route before launch.',
    title: 'Check in with your teacher',
    body: 'A short conversation about how the week went. Your clinic will let you know how to arrange it.',
    action: 'Not available yet'
  };

  var WEEKS = [
    { n: 1, title: 'Arriving', icon: ICON.cushion, practices: ['arrive', 'bodyscan'],
      intro: 'This week is simply about arriving: noticing where you are, a few minutes at a time. Nothing to get right.',
      invitation: 'Once a day, notice the first sip of a drink, as if it were new.' },
    { n: 2, title: 'The body scan', icon: ICON.feather, practices: ['bodyscan', 'touch'],
      intro: 'Attention moves slowly through the body. Sometimes you will feel a lot, sometimes very little. Both are fine.',
      invitation: 'While waiting somewhere, notice your feet on the ground.' },
    { n: 3, title: 'The breath and the wandering mind', icon: ICON.cloud, practices: ['breath', 'sound'],
      intro: 'The mind wanders. Noticing that it has wandered, and coming back, is the practice itself, not a mistake.',
      invitation: 'When you catch the mind wandering, notice where it went, then come back.' },
    { n: 4, title: 'Mindful movement', icon: ICON.mat, practices: ['movement', 'breath'],
      intro: 'Gentle, slow movement, standing or seated. Move only within what feels comfortable today.',
      invitation: 'Walk a few steps somewhere ordinary, noticing your feet.' },
    { n: 5, title: 'Everyday awareness', icon: ICON.tea, practices: ['tea', 'sound'],
      intro: 'Ordinary moments can be practice too: a drink, a shower, washing up.',
      invitation: 'Choose one everyday task and do it a little more slowly, noticing.' },
    { n: 6, title: 'Responding to stress', icon: ICON.pebbles, practices: ['stress', 'breath'],
      intro: 'A short pause can create a little space between what happens and what we do next.',
      invitation: 'When something feels tense, try the pause once.' },
    { n: 7, title: 'Kindness', icon: ICON.heart, practices: ['kindness', 'bodyscan'],
      intro: 'Friendly attention, towards yourself and others. If it feels awkward, that is common.',
      invitation: 'Do one small kind thing for yourself.' },
    { n: 8, title: 'Carrying it on', icon: ICON.lantern, practices: ['carry', 'stress', 'kindness'],
      intro: 'You choose what to keep. A few minutes, on the days you want to, in your own way.',
      invitation: 'Pick a time and a place where a short practice might fit.' }
  ];

  var COPY = {
    name: 'Ebb mindfulness course',
    kind: 'An MBSR-informed course',
    draft: 'Practice scripts are drafts awaiting review by a qualified MBSR teacher.',
    hard: ['Thank you for saying so. Practices can sometimes stir things up, and stopping is always fine.',
      'Next time you could try a shorter practice, keep your eyes open, or rest on sounds or your hands instead of the breath.',
      'If difficult feelings stay with you, please talk to someone you trust or your doctor.']
  };

  root.EbbCourseContent = { VERSION: VERSION, ICON: ICON, PRACTICES: PRACTICES, WEEKS: WEEKS, CHECKIN: CHECKIN, COPY: COPY, ICON_COUNT: 9 };
})(typeof window !== 'undefined' ? window : globalThis);
