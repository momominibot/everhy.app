/* EveRhy provision shop: the fruit stall at the back of the hawker centre also sells a few provisions (eggs, rice,
 * ginger, chilli) for hearts, so every home recipe can be made: grow it, catch it, or buy it here. Rules live in
 * js/grocer/rules.js (pure); hearts come from and go to the one ledger (js/dome/rules.js). */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || !root.EbbGame) return;
  if (!root.EbbGrocerRules) { var sc = doc.createElement('script'); sc.src = 'js/grocer/rules.js'; sc.async = false; doc.head.appendChild(sc); }
  function R() { return root.EbbGrocerRules; }
  function D() { return root.EbbDomeRules; }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var wrap = null;
  function close() { if (wrap) { wrap.remove(); wrap = null; } }
  function open(api) {
    close();
    wrap = el('div', 'sheet-wrap grocer-wrap');
    var sh = el('section', 'sheet grocer-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Provisions'); sh.tabIndex = -1;
    wrap.appendChild(sh);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') close(); });
    function draw(said) {
      sh.innerHTML = '';
      var head = el('div', 'grocer-head'); head.appendChild(el('h2', '', 'Provisions'));
      var x = el('button', 'btn small', 'Close'); x.type = 'button'; x.addEventListener('click', close); head.appendChild(x); sh.appendChild(head);
      var st = api.state(), have = D() ? D().balance(st.points) : 0;
      sh.appendChild(el('p', 'muted grocer-line', said || 'Fresh from the market, paid in hearts. Cook with them at home.'));
      var bal = el('p', 'grocer-balance'); bal.innerHTML = 'Your hearts <b id="grocerHearts"></b>'; bal.querySelector('b').textContent = String(have); sh.appendChild(bal);
      var list = el('ul', 'grocer-list');
      R().GOODS.forEach(function (g) {
        var li = el('li', 'grocer-item'); li.dataset.good = g.id;
        var t = el('span', 'grocer-text'); t.appendChild(el('b', '', g.name)); t.appendChild(el('small', '', g.price + ' hearts. ' + g.line + ((st.farm.basket[g.id] || 0) ? ' You have ' + st.farm.basket[g.id] + '.' : '')));
        li.appendChild(t);
        var b = el('button', 'btn grocer-buy', have >= g.price ? 'Buy' : 'Not yet'); b.type = 'button'; b.id = 'buy-' + g.id; b.disabled = have < g.price;
        b.setAttribute('aria-label', (have >= g.price ? 'Buy ' : 'Not enough hearts for ') + g.name.toLowerCase() + ', ' + g.price + ' hearts');
        b.addEventListener('click', function () {
          var r = R().buy(api.state(), g.id, api.today(), D());
          if (!r.ok) { draw(r.reason === 'short' ? (r.need || g.price) + ' more hearts and this is yours.' : ''); return; }
          api.save(); api.refresh();
          try { if (root.EbbSound && typeof root.EbbSound.play === 'function') root.EbbSound.play('chime'); } catch (e) { }
          draw('One ' + g.name.toLowerCase() + ' in your basket. Cook with it at home.');
          var again = sh.querySelector('#buy-' + g.id); if (again && !again.disabled) again.focus(); else sh.focus();
        });
        li.appendChild(b); list.appendChild(li);
      });
      sh.appendChild(list);
      if (!have) sh.appendChild(el('p', 'muted small', 'Hearts come from logging how you are, finishing a practice, and Today’s invitations.'));
    }
    draw(); doc.body.appendChild(wrap); sh.focus();
  }
  root.EbbGame.registerKind('grocer', function (spot, api) { open(api); });
  root.EbbGrocer = { open: function () { open(root.EbbGame.api); }, close: close };
})(window);
