/* Ebb meditation library, pure rules: a small catalogue of practices, each usable in one or more postures (lie,
 * sit, stand) and at one or more lengths. cues are [fraction, caption] (an optional third item is a sound id), so
 * the same script paces itself at any chosen length. Nothing here is scored, nothing is sent anywhere, and a
 * practice left alone costs nothing. The runner and filters live in js/ext/meditate.js. */
(function (root) {
  'use strict';
  var VERSION = 'meditate-2026-10-28.1';
  var POSTURES = { lie: 'Lying down', sit: 'Sitting up', stand: 'Standing' };
  var PRACTICES = {
    breath: { title: 'Slow breath', blurb: 'Follow the breath, and come back when the mind wanders.',
      postures: ['lie', 'sit'], lengths: [300, 600],
      cues: [
        [0, 'Settle in, and let the breath move at its own pace.'],
        [0.2, 'Breathe in gently. Let the out-breath take a little longer.'],
        [0.45, 'If the mind drifts, that is fine. Gently come back to the next breath.'],
        [0.7, 'Let the shoulders drop. Let the face soften.'],
        [0.9, 'A last few breaths, and let the practice end on its own.']] },
    body: { title: 'Body scan', blurb: 'Rest attention on each part of the body, in its own time.',
      postures: ['lie'], lengths: [600, 1200],
      cues: [
        [0, 'Lie down, and let your weight sink into the bed.'],
        [0.12, 'Bring your attention to your feet. Let them rest, without changing anything.'],
        [0.25, 'Move up to the legs. Let them be heavy, and let go.'],
        [0.4, 'Notice the hips and the belly. Let the belly rise and fall as you breathe.'],
        [0.55, 'Rest the hands and the shoulders. Let the shoulders melt away from the ears.'],
        [0.7, 'Soften the face, the jaw, the eyes. Let the whole face be at rest.'],
        [0.85, 'Now feel the whole body breathing, all of it together.'],
        [0.95, 'When you are ready, let the practice finish in its own time.']] },
    sound: { title: 'Sound awareness', blurb: 'Listen to sounds come and go, without holding on.',
      postures: ['lie', 'sit'], lengths: [300, 600],
      cues: [
        [0, 'Let your attention rest on listening. What is the first sound you notice?'],
        [0.34, 'And a second, maybe further away.'],
        [0.67, 'A third. Let them all come and go, without holding on.'],
        [0.9, 'A last moment of listening. Then let the sounds come and go.']] },
    kindness: { title: 'Kindness practice', blurb: 'Offer a little kindness, first to yourself.',
      postures: ['sit'], lengths: [300, 600],
      cues: [
        [0, 'Sit easy, and let the breath settle.'],
        [0.2, 'Place a hand on your heart if that feels kind. Notice the warmth.'],
        [0.4, 'Say in your own mind: may I be safe. May I be well.'],
        [0.6, 'May I be gentle with myself, just as I am.'],
        [0.8, 'Now bring someone kind to mind, and wish them well too.'],
        [0.95, 'A last breath, and let the kindness stay with you.']] },
    ground: { title: 'Grounding: five things', blurb: 'Settle a busy mind through the senses.',
      postures: ['sit', 'stand'], lengths: [300],
      cues: [
        [0, 'This is a gentle way to settle a busy mind. Start by looking around.'],
        [0.2, 'Notice five things you can see, one by one.'],
        [0.4, 'Four things you can feel, your feet on the floor, your clothes.'],
        [0.6, 'Three things you can hear, near or far.'],
        [0.78, 'Two things you can smell, and one slow breath.'],
        [0.92, 'You are here, right now, and that is enough for this moment.']] },
    winddown: { title: 'Letting go', blurb: 'Set the day down, and let the body rest.',
      postures: ['lie'], lengths: [600, 1200],
      cues: [
        [0, 'Lie down, and let the day be finished.'],
        [0.2, 'Take a slow breath in, and let it all go as you breathe out.'],
        [0.4, 'Anything left from today, set it down beside the bed. It can wait.'],
        [0.6, 'Let the body be heavy. Let the breath be soft.'],
        [0.8, 'Rest now. There is nothing more to do.'],
        [0.95, 'Goodnight. Let sleep come in its own time.']] },
    pause: { title: 'Pause and reset', blurb: 'One quiet minute to reset, wherever you are.',
      postures: ['sit', 'stand'], lengths: [300],
      cues: [
        [0, 'Stop for a moment, and let both feet rest on the floor.'],
        [0.25, 'One slow breath in, and a longer breath out.'],
        [0.5, 'Roll your shoulders back, and let them drop.'],
        [0.75, 'Notice how you feel now, without changing it.'],
        [0.92, 'One more breath, and go on gently.']] }
  };

  function ids() { return Object.keys(PRACTICES); }
  function minLabel(sec) { return sec < 60 ? sec + ' s' : Math.round(sec / 60) + ' min'; }
  /* practices that fit the chosen posture and offer the chosen length: pass null to ignore a filter */
  function matches(id, posture, length) {
    var p = PRACTICES[id];
    if (posture && p.postures.indexOf(posture) < 0) return false;
    if (length && p.lengths.indexOf(length) < 0) return false;
    return true;
  }
  function filter(posture, length) { return ids().filter(function (id) { return matches(id, posture, length); }); }
  function allLengths() { return ids().reduce(function (a, id) { PRACTICES[id].lengths.forEach(function (l) { if (a.indexOf(l) < 0) a.push(l); }); return a; }, []).sort(function (a, b) { return a - b; }); }
  function cueAt(cues, frac) { var i = 0; (cues || []).forEach(function (c, k) { if (c[0] <= frac) i = k; }); return i; }

  root.EbbMeditateRules = { VERSION: VERSION, POSTURES: POSTURES, PRACTICES: PRACTICES,
    ids: ids, minLabel: minLabel, matches: matches, filter: filter, allLengths: allLengths, cueAt: cueAt };
})(typeof window !== 'undefined' ? window : globalThis);
