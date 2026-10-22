/* Ebb store: one versioned save in this browser. Game state (where she is, what she wears, the farm, the pond) is kept
 * apart from observations (practice records), which carry their own provenance and are never fed back into the game.
 * Storage can be missing or full: every read and write is guarded and the game still runs from memory. */
(function (root) {
  'use strict';
  var KEY = 'ebb_save_v1', VERSION = 1;
  var memory = null;

  function today(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function blank() {
    return { v: VERSION, scene: 'bedroom', pos: null, outfit: null,
      farm: root.EbbFarm ? root.EbbFarm.fresh(6) : null,
      pond: { offerings: 0, gift: false }, observations: [] };
  }
  function load() {
    if (memory) return memory;
    var raw = null;
    try { raw = root.localStorage && root.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var s = null;
    try { s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
    memory = s && s.v === VERSION ? Object.assign(blank(), s) : blank();
    if (!memory.farm || !Array.isArray(memory.farm.beds)) memory.farm = blank().farm;
    if (!Array.isArray(memory.observations)) memory.observations = [];
    return memory;
  }
  function save() {
    try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(memory)); return true; } catch (e) { return false; }
  }
  function update(fn) { var s = load(); fn(s); save(); return s; }

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* a practice observation: what was done, for how long, and where it came from */
  function addPractice(p) {
    var rec = {
      id: uid(), type: 'mindfulness', date: today(p.start ? new Date(p.start) : undefined),
      practice: String(p.practice || 'sitting'), anchor: String(p.anchor || 'breath'),
      scriptVersion: String(p.scriptVersion || 'draft-1'), plannedSec: Math.max(0, Math.round(p.plannedSec || 0)),
      activeSec: Math.max(0, Math.round(p.activeSec || 0)), status: p.status === 'finished' ? 'finished' : 'partial',
      start: p.start || null, end: p.end || null, source: String(p.source || 'game'), confirmed: true
    };
    update(function (s) { s.observations.push(rec); });
    return rec;
  }

  function reset() { memory = blank(); try { root.localStorage && root.localStorage.removeItem(KEY); } catch (e) { } }

  root.EbbStore = { load: load, save: save, update: update, addPractice: addPractice, today: today, reset: reset, KEY: KEY };
})(typeof window !== 'undefined' ? window : globalThis);
