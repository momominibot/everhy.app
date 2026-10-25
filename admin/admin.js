/* EveRhy study dashboard. Loads a set of Ebb exports (the demo file by default, or files dropped on the page) and
 * draws what EbbAgents.report returns: Ovia + the four agents, cohort tiles, coverage bars, the people table and, on
 * tapping a person, their detail cards with 28-day bar charts, warning signs and the day and four-week summaries.
 * Descriptions only, never advice: the page footer says so, and the agents never output a recommendation. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbAgents) return;

  var A = root.EbbAgents;
  var TIP = doc.getElementById('tip');

  /* ---------- tiny element helper ---------- */
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* ---------- status words and flag icons ---------- */
  var STATUS_WORD = { ok: 'On track', sparse: 'Sparse', none: 'None yet', missing: 'Not collected' };
  var FLAG_WORD = { urgent: '!', high: '!', medium: '!' };
  var FLAG_URG = { urgent: 'urgent', high: 'high', medium: 'medium' };

  /* ---------- cohort tiles ---------- */
  function drawTiles(c) {
    var t = doc.getElementById('tiles'); t.innerHTML = '';
    var rows = [['Total people', c.total], ['Research consented', c.consented], ['Active, last 7 days', c.active7], ['Warning signs now', c.flagged]];
    rows.forEach(function (r) {
      var d = el('div', 'tile');
      d.appendChild(el('div', 'num', String(r[1])));
      d.appendChild(el('div', 'lab', r[0]));
      t.appendChild(d);
    });
    doc.getElementById('excluded').textContent = c.notConsented ? c.notConsented + ' declined the study and are counted only.' : '';
  }

  /* ---------- coverage bars ---------- */
  function drawCoverage(c) {
    var box = doc.getElementById('coverage'); box.innerHTML = '';
    var denom = c.consented || 1;
    c.coverage.forEach(function (row) {
      var r = el('div', 'cov-row');
      r.appendChild(el('div', null, row.name));
      var track = el('div', 'cov-track'); var fill = el('div', 'cov-fill');
      fill.style.width = Math.round(row.withData / denom * 100) + '%';
      track.appendChild(fill); r.appendChild(track);
      r.appendChild(el('div', 'cov-n', row.withData));
      box.appendChild(r);
    });
  }

  /* ---------- agent team strip ---------- */
  function drawTeam() {
    var ul = doc.getElementById('team'); ul.innerHTML = '';
    function card(d, name, covers) {
      var li = el('li', 'agent'); li.dataset.d = d;
      var body = el('div', null);
      body.appendChild(el('b', null, name));
      body.appendChild(el('span', null, covers));
      li.appendChild(el('span', 'face', name[0]));
      li.appendChild(body);
      return li;
    }
    ul.appendChild(card('orch', A.ORCHESTRATOR, 'reads every consented person, day by day'));
    A.DOMAINS.forEach(function (d) { ul.appendChild(card(d, A.AGENT[d].name, A.AGENT[d].covers)); });
  }

  /* ---------- the people table ---------- */
  function drawPeople(report) {
    var tb = doc.querySelector('#people tbody'); tb.innerHTML = '';
    report.people.forEach(function (p, i) {
      var tr = el('tr'); tr.dataset.i = String(i); tr.tabIndex = 0;
      var name = el('td', null); var nameWrap = el('div', null);
      nameWrap.appendChild(el('span', null, p.id));
      if (p.synthetic) nameWrap.appendChild(el('span', 'muted small', '  (demo)'));
      name.appendChild(nameWrap);
      var last = el('td', null, p.lastActive || '-');
      var days = el('td', null, String(p.activeDays28 || 0));
      var flags = el('td', null);
      if (p.flags && p.flags.length) {
        p.flags.slice(0, 3).forEach(function (f) {
          var pill = el('span', 'flag ' + FLAG_URG[f.urgency] || 'medium');
          pill.appendChild(el('i', null, FLAG_WORD[f.urgency] || '!'));
          pill.appendChild(doc.createTextNode(f.message));
          flags.appendChild(pill);
        });
        if (p.flags.length > 3) flags.appendChild(el('span', 'muted small', ' +' + (p.flags.length - 3)));
      } else flags.appendChild(el('span', 'none-flag', 'None'));
      var ag = el('td', null); var dots = el('div', 'dots');
      A.DOMAINS.forEach(function (d) {
        var a = p.agents.filter(function (x) { return x.domain === d; })[0];
        var dot = el('span', 'dot' + (a && (a.status === 'none' || a.status === 'missing') ? ' none' : a && a.status === 'sparse' ? ' sparse' : ''));
        dot.dataset.d = d; dot.textContent = a ? a.status === 'ok' || a.status === 'sparse' ? 'ok' : '·' : '·';
        dots.appendChild(dot);
      });
      ag.appendChild(dots);
      tr.appendChild(name); tr.appendChild(last); tr.appendChild(days); tr.appendChild(flags); tr.appendChild(ag);
      tr.addEventListener('click', function () { selectPerson(report, i); });
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') selectPerson(report, i); });
      tb.appendChild(tr);
    });
  }

  /* ---------- 28-day bar chart ---------- */
  function chartSVG(series, unit) {
    var W = 300, H = 86, pad = 2, gap = 2, top = 10;
    var n = series.length; if (!n) return null;
    var vmax = 1; series.forEach(function (s) { if (s.value !== null && s.value > vmax) vmax = s.value; });
    var bw = (W - pad * 2 - gap * (n - 1)) / n;
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', unit || 'last 28 days');
    svg.appendChild(doc.createElementNS('http://www.w3.org/2000/svg', 'line')).setAttribute('class', 'axis');
    var axis = svg.querySelector('line'); axis.setAttribute('x1', '0'); axis.setAttribute('y1', String(H - 2)); axis.setAttribute('x2', String(W)); axis.setAttribute('y2', String(H - 2));
    var first = series[0] && series[0].day, last = series[n - 1] && series[n - 1].day;
    function label(x, t, anchor) { var tx = doc.createElementNS('http://www.w3.org/2000/svg', 'text'); tx.setAttribute('class', 'ax-lab'); tx.setAttribute('x', String(x)); tx.setAttribute('y', String(H - 3)); tx.setAttribute('text-anchor', anchor || 'middle'); tx.textContent = t; svg.appendChild(tx); }
    label(0, first ? String(first).slice(5) : '', 'start'); label(W, last ? String(last).slice(5) : '', 'end');
    series.forEach(function (s, i) {
      var x = pad + i * (bw + gap);
      if (s.value === null) return;
      var h = Math.max(2, (s.value / vmax) * (H - top - 4));
      var bar = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bar.setAttribute('class', 'bar'); bar.setAttribute('x', String(x)); bar.setAttribute('y', String(H - 2 - h));
      bar.setAttribute('width', String(bw)); bar.setAttribute('height', String(h)); bar.setAttribute('rx', '3'); bar.setAttribute('ry', '3');
      svg.appendChild(bar);
      var hit = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.setAttribute('class', 'hit'); hit.setAttribute('x', String(x)); hit.setAttribute('y', '0'); hit.setAttribute('width', String(bw)); hit.setAttribute('height', String(H));
      hit.dataset.day = s.day; hit.dataset.value = String(s.value);
      hit.addEventListener('mouseenter', function () { showTip(hit, s.day + ': ' + s.value + ' ' + (unit || '')); });
      hit.addEventListener('mouseleave', hideTip);
      svg.appendChild(hit);
    });
    return svg;
  }

  /* ---------- tooltip ---------- */
  function showTip(anchor, text) {
    TIP.textContent = text; TIP.hidden = false;
    var r = anchor.getBoundingClientRect();
    TIP.style.left = Math.max(8, r.left + r.width / 2) + 'px';
    TIP.style.top = Math.max(8, r.top - 26) + 'px';
    TIP.style.transform = 'translateX(-50%)';
  }
  function hideTip() { TIP.hidden = true; }

  /* ---------- one person's detail ---------- */
  function selectPerson(report, i) {
    var p = report.people[i]; var d = doc.getElementById('detail'); d.innerHTML = '';
    var rows = doc.querySelectorAll('#people tbody tr'); rows.forEach(function (r, j) { if (j === i) r.setAttribute('aria-selected', 'true'); else r.removeAttribute('aria-selected'); });
    var head = el('div', 'detail-head');
    var title = el('h3', null); title.appendChild(doc.createTextNode(p.id + '  '));
    title.appendChild(el('span', 'muted small', (p.profile.lifeStage || '') + (p.profile.lifeStage && p.profile.ageBand ? ', ' : '') + (p.profile.ageBand || '') + (p.synthetic ? ' · demo' : '')));
    head.appendChild(title);
    head.appendChild(el('span', 'muted small', 'last active ' + (p.lastActive || 'never')));
    d.appendChild(head);

    /* agent cards with charts */
    var grid = el('div', 'agents');
    p.agents.forEach(function (a) {
      var card = el('div', 'acard');
      var h = el('h3', null);
      h.appendChild(el('span', null, a.name));
      h.appendChild(el('span', 'who', a.agent + ' · ' + a.covers));
      h.appendChild(el('span', 'status', STATUS_WORD[a.status] || a.status));
      card.appendChild(h);
      var ul = el('ul', null); a.lines.forEach(function (ln) { ul.appendChild(el('li', null, ln)); });
      card.appendChild(ul);
      var chart = a.series && a.series.length ? chartSVG(a.series, a.unit) : null;
      if (chart) {
        var wrap = el('div', 'chart'); wrap.appendChild(chart);
        var foot = el('div', 'chart-foot');
        foot.appendChild(el('span', null, a.unit || 'last 28 days'));
        foot.appendChild(el('span', null, a.name + ' · ' + p.id));
        wrap.appendChild(foot); card.appendChild(wrap);
      }
      grid.appendChild(card);
    });
    d.appendChild(grid);

    /* warning signs */
    if (p.flags && p.flags.length) {
      var fc = el('div', 'card flags-card');
      fc.appendChild(el('h2', null, 'Warning signs (the app\'s own safety rules)'));
      var fl = el('ul', null); p.flags.forEach(function (f) {
        var li = el('li', null); var pill = el('span', 'flag ' + (FLAG_URG[f.urgency] || 'medium'));
        pill.appendChild(el('i', null, FLAG_WORD[f.urgency] || '!')); pill.appendChild(doc.createTextNode(f.message));
        li.appendChild(pill); fl.appendChild(li);
      });
      fc.appendChild(fl); d.appendChild(fc);
    } else { var nc = el('div', 'card flags-card'); nc.appendChild(el('h2', null, 'Warning signs')); nc.appendChild(el('p', 'muted small', 'None in the last 7 days.')); d.appendChild(nc); }

    /* daily and four-week summaries */
    var sums = el('div', 'summaries');
    var d1 = el('div', 'card'); d1.appendChild(el('h3', null, 'Today')); d1.appendChild(el('pre', null, p.daily)); sums.appendChild(d1);
    var d2 = el('div', 'card'); d2.appendChild(el('h3', null, 'Four weeks at a glance')); d2.appendChild(el('pre', null, p.fourWeeks || 'Nothing across the four agents yet.')); sums.appendChild(d2);
    d.appendChild(sums);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- draw the whole report ---------- */
  function drawReport(report, sourceLabel) {
    doc.getElementById('source').textContent = sourceLabel || 'Synthetic demo data';
    drawTeam(); drawTiles(report.cohort); drawCoverage(report.cohort); drawPeople(report);
    doc.getElementById('detail').innerHTML = '';
    if (report.people.length) selectPerson(report, 0);
    else {
      var d = doc.getElementById('detail'); d.appendChild(el('div', 'card', 'No consented people in this export.'));
    }
  }

  /* ---------- load exports (dropped files) ---------- */
  function parseFiles(files) {
    var list = [], remaining = files.length;
    if (!remaining) { drawReport(A.report([], today()), 'No data loaded'); return; }
    Array.prototype.forEach.call(files, function (f) {
      var r = new FileReader();
      r.onload = function () {
        try { list.push(JSON.parse(String(r.result))); }
        catch (e) { list.push({ app: 'Ebb', format: 'ebb-export-1', synthetic: true, pid: 'bad-' + f.name, save: { consent: { events: [] }, log: { obs: [] }, observations: [] } }); }
        if (!(--remaining)) { doc.getElementById('source').textContent = list.length + ' export' + (list.length === 1 ? '' : 's') + ' loaded'; drawReport(A.report(list, today()), list.length + ' exports loaded'); }
      };
      r.readAsText(f);
    });
  }

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ---------- boot: demo data by default, file input to replace ---------- */
  var filesInput = doc.getElementById('files');
  if (filesInput) filesInput.addEventListener('change', function () { if (filesInput.files && filesInput.files.length) parseFiles(filesInput.files); });

  function boot() {
    var exportsList = [];
    try {
      var d = doc.getElementById('demoData'); if (d && d.textContent) { var parsed = JSON.parse(d.textContent); exportsList = parsed.exports || []; }
    } catch (e) { exportsList = []; }
    if (!exportsList.length) {
      fetch('data/demo-exports.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
        drawReport(A.report(j.exports || [], today()), 'Synthetic demo data');
      }).catch(function () { drawReport(A.report([], today()), 'Synthetic demo data'); });
      return;
    }
    drawReport(A.report(exportsList, today()), 'Synthetic demo data');
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();

  root.EbbAdmin = { drawReport: drawReport, report: A.report };
})(typeof window !== 'undefined' ? window : globalThis);
