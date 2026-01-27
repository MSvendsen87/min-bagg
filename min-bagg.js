/* === GOLFKONGEN: MIN BAGG – SAFE (ES5, ingen async/await) ===
 * Kjør kun på /sider/min-bagg
 * - GUEST: viser "Under konstruksjon" + Topp 3 globalt (fra Supabase view)
 * - LOGGET INN: viser bygg bagg + lagring til Supabase (mybag_bags via email)
 *
 * Viktig: Ingen "async/await" i denne fila -> unngår "Unexpected token 'async'"
 */
(function () {
  'use strict';

  // Kjør kun på /sider/min-bagg
  var path = ((location && location.pathname) ? location.pathname : '').replace(/\/+$/, '').toLowerCase();
  if (path !== '/sider/min-bagg') return;

  if (window.__MINBAGG_APP_RUNNING__) return;
  window.__MINBAGG_APP_RUNNING__ = true;

  // Konfig (fra loader/global)
  var SUPA_URL = (window.GK_SUPABASE_URL || '').trim();
  var SUPA_ANON = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();

  function log() { try { console.log.apply(console, arguments); } catch (_) {} }

    // Konfig (fra loader/global)
  var SUPA_URL = (window.GK_SUPABASE_URL || '').trim();
  var SUPA_ANON = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();

  function log() { try { console.log.apply(console, arguments); } catch (_) {} }

  // --- Supabase: last UMD + lag klient (ingen top-level await) ---
  var __supaClient = null;

  function loadSupabaseUmd(cb) {
    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') return cb(null);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.async = true;
      s.onload = function () { cb(null); };
      s.onerror = function () { cb(new Error('Kunne ikke laste supabase-js UMD fra jsDelivr')); };
      document.head.appendChild(s);
    } catch (e) {
      cb(e);
    }
  }

  function getSupabaseClient(cb) {
    try {
      if (__supaClient) return cb(null, __supaClient);

      if (!SUPA_URL || !SUPA_ANON) {
        // Dette er den du ser på siden nå
        return cb(new Error('Min Bagg: mangler Supabase-konfig i loader (GK_SUPABASE_URL / GK_SUPABASE_ANON_KEY).'));
      }

      loadSupabaseUmd(function (err) {
        if (err) return cb(err);
        try {
          __supaClient = window.supabase.createClient(SUPA_URL, SUPA_ANON, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          cb(null, __supaClient);
        } catch (e2) {
          cb(e2);
        }
      });
    } catch (e3) {
      cb(e3);
    }
  }


  // ---------------- DOM helpers ----------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function elHtml(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  // ---------------- Minimal CSS ----------------
  function injectCss() {
    if (document.getElementById('minbagg-css')) return;
    var css = ''
      + '.minbagg-wrap{max-width:1100px;margin:0 auto;padding:10px 0;}'
      + '.minbagg-banner{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);padding:10px 12px;border-radius:10px;margin:10px 0;}'
      + '.minbagg-app h2{margin:10px 0 6px 0;}'
      + '.minbagg-muted{opacity:.78;font-size:13px;}'
      + '.minbagg-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0;}'
      + '.minbagg-split{display:flex;gap:14px;flex-wrap:wrap;}'
      + '.minbagg-col{flex:1;min-width:280px;}'
      + '.minbagg-card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);border-radius:12px;padding:12px;margin:10px 0;}'
      + '.minbagg-input{width:100%;box-sizing:border-box;padding:10px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);color:#fff;outline:none;}'
      + '.minbagg-btn{padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;}'
      + '.minbagg-btn.primary{background:rgba(46, 204, 113,.18);border-color:rgba(46,204,113,.35);}'

      + '.minbagg-res{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px;border:1px solid rgba(255,255,255,.10);border-radius:12px;margin:8px 0;background:rgba(255,255,255,.02);}'
      + '.minbagg-res img{width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid rgba(255,255,255,.12);}'
      + '.minbagg-res .t{font-weight:600;margin:0 0 2px 0;}'
      + '.minbagg-res .s{font-size:12px;opacity:.75;}'
      + '.minbagg-bagitem{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px;border:1px solid rgba(255,255,255,.10);border-radius:12px;margin:8px 0;background:rgba(255,255,255,.02);}'
      + '.minbagg-bagitem .left{display:flex;gap:10px;align-items:center;}'
      + '.minbagg-bagitem img{width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid rgba(255,255,255,.12);}';

    var st = document.createElement('style');
    st.id = 'minbagg-css';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  // ---------------- Supabase loader ----------------
  function loadSupabaseUmd(cb) {
  try {
    if (window.supabase && window.supabase.createClient) return cb(true);

    // last inn UMD hvis ikke finnes
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.async = true;
    s.onload = function () { cb(!!(window.supabase && window.supabase.createClient)); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  } catch (e) {
    cb(false);
  }
}

function ensureSupabaseClient() {
  try {
    // Les config fra flere mulige globale navn (for robusthet)
    var url =
      (window.GK_SUPABASE_URL || window.__GK_SUPABASE_URL__ || window.SUPABASE_URL || SUPA_URL || '').trim();

    var key =
      (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY ||
       window.__GK_SUPABASE_ANON_KEY__ || window.SUPABASE_ANON_KEY || SUPA_ANON || '').trim();

    if (!url || !key) return null;
    if (window.supabase && window.supabase.createClient) {
      return window.supabase.createClient(url, key);
    }
  } catch (e) {}
  return null;
}


  // ---------------- DB helpers ----------------
  function dbLoadBag(supa, email) {
    // mybag_bags: email PK, bag jsonb
    return supa
      .from('mybag_bags')
      .select('bag')
      .eq('email', email)
      .maybeSingle();
  }

  function dbSaveBag(supa, email, bagArr) {
    return supa
      .from('mybag_bags')
      .upsert({ email: email, bag: bagArr, updated_at: new Date().toISOString() }, { onConflict: 'email' });
  }

  function fetchTop3(supa) {
    // view: mybag_popular (forventet)
    return supa
      .from('mybag_popular')
      .select('*')
      .limit(200)
      .then(function (res) {
        if (res && res.error) throw res.error;
        var rows = (res && res.data) ? res.data : [];
        var by = {};
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var g = (r.group || r.disc_group || r.category || 'Discs');
          if (!by[g]) by[g] = [];
          by[g].push({
            name: (r.name || r.disc_name || r.disc || ''),
            url: (r.url || r.product_url || r.link || ''),
            image: (r.image || r.image_url || ''),
            count: (r.count || r.total || 0)
          });
        }
        var out = [];
        for (var k in by) {
          if (!by.hasOwnProperty(k)) continue;
          by[k].sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
          out.push({ group: k, items: by[k].slice(0, 3) });
        }
        out.sort(function (a, b) { return String(a.group).localeCompare(String(b.group)); });
        return out;
      })
      .catch(function () { return []; });
  }

  // ---------------- Quickbutik search ----------------
  function qbSearch(q) {
    var url = '/shop/search?s=' + encodeURIComponent(q) + '&out=json&limit=12';
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { j = null; }
        if (!j || !j.searchresults) return [];
        var out = [];
        for (var i = 0; i < j.searchresults.length; i++) {
          var p = (j.searchresults[i] && j.searchresults[i].product) ? j.searchresults[i].product : null;
          if (!p) continue;
          out.push({
            name: p.name || '',
            url: p.url || '',
            image: p.firstimage || ''
          });
        }
        return out;
      });
  }

  // ---------------- Render Top3 ----------------
  function renderTop3Into(container, top3) {
    clear(container);
    if (!top3 || !top3.length) {
      container.appendChild(el('div', 'minbagg-muted', 'Ingen global data ennå.'));
      return;
    }

    for (var i = 0; i < top3.length; i++) {
      var g = top3[i];
      var box = el('div', 'minbagg-card');
      box.appendChild(el('div', 'minbagg-muted', g.group || 'Discs'));

      var list = el('div', '');
      var items = g.items || [];
      for (var j = 0; j < items.length; j++) {
        (function (it) {
          var row = el('div', 'minbagg-res');
          var left = el('div', '');
          left.style.display = 'flex';
          left.style.gap = '10px';
          left.style.alignItems = 'center';

          if (it.image) {
            var im = document.createElement('img');
            im.src = it.image;
            im.alt = it.name || '';
            left.appendChild(im);
          }

          var txt = el('div', '');
          txt.appendChild(el('div', 't', it.name || ''));
          var a = el('a', 's', (it.url ? 'Se produkt' : ''));
          a.href = it.url || '#';
          a.target = '_self';
          a.rel = 'nofollow';
          txt.appendChild(a);
          left.appendChild(txt);

          var right = el('div', 'minbagg-muted', 'Valgt ' + (it.count || 0) + ' ganger');
          row.appendChild(left);
          row.appendChild(right);

          list.appendChild(row);
        })(items[j]);
      }

      box.appendChild(list);
      container.appendChild(box);
    }
  }

  // ---------------- Main app ----------------
  function renderApp(root, marker, supa, supaUser) {
    clear(root);
    injectCss();

    var wrap = el('div', 'minbagg-wrap');
    var app = el('div', 'minbagg-app');
    wrap.appendChild(app);

    // Banner
    app.appendChild(elHtml('div', 'minbagg-banner',
      '🚧 <strong>Under konstruksjon</strong> &nbsp;Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.'
    ));

    app.appendChild(el('h2', '', 'Min Bagg'));

    // Split layout
    var split = el('div', 'minbagg-split');
    var left = el('div', 'minbagg-col');
    var right = el('div', 'minbagg-col');
    split.appendChild(left);
    split.appendChild(right);
    app.appendChild(split);

    // --- Right: Top 3 globalt
    var topCard = el('div', 'minbagg-card');
    topCard.appendChild(el('h3', '', 'Topp 3 globalt'));
    var topInner = el('div', 'minbagg-muted', 'Laster...');
    topCard.appendChild(topInner);
    right.appendChild(topCard);

    // Hook for later update
    app.__renderTop3 = function (top3) { renderTop3Into(topInner, top3); };

    // --- Guest UI (kun info)
    if (!supaUser || !supaUser.email) {
      left.appendChild(el('div', 'minbagg-muted',
        'Du må være innlogget i nettbutikken for å lagre og bygge baggen din.'
      ));
      // last top3 for guest
      fetchTop3(supa).then(function (top3) { app.__renderTop3(top3); });
      root.appendChild(wrap);
      return;
    }

    // --- Logged in UI
    var state = { bag: [], lastSavedAt: null };

    left.appendChild(el('div', 'minbagg-muted',
      'Hei ' + (marker && marker.firstname ? marker.firstname : 'der') + ' 👋  Baggen din lagres på kontoen din.'
    ));

    // Search add
    var addCard = el('div', 'minbagg-card');
    addCard.appendChild(el('h3', '', 'Legg til disk'));
    var searchInput = el('input', 'minbagg-input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Søk i nettbutikken (f.eks. Buzzz, Destroyer…)';
    addCard.appendChild(searchInput);

    var results = el('div', '');
    addCard.appendChild(results);

    // Manual add
    var manual = el('div', 'minbagg-card');
    manual.appendChild(el('h3', '', 'Legg til manuelt'));
    var manName = el('input', 'minbagg-input');
    manName.type = 'text';
    manName.placeholder = 'Navn (f.eks. Buzzz)';
    var manUrl = el('input', 'minbagg-input');
    manUrl.type = 'text';
    manUrl.placeholder = 'URL (valgfritt)';
    manUrl.style.marginTop = '8px';

    var manBtn = el('button', 'minbagg-btn primary', 'Legg til');
    manBtn.style.marginTop = '8px';

    manual.appendChild(manName);
    manual.appendChild(manUrl);
    manual.appendChild(manBtn);

    // Bag list
    var bagCard = el('div', 'minbagg-card');
    bagCard.appendChild(el('h3', '', 'Baggen din'));
    var bagList = el('div', '');
    bagCard.appendChild(bagList);

    left.appendChild(addCard);
    left.appendChild(manual);
    left.appendChild(bagCard);

    function renderBag() {
      clear(bagList);
      if (!state.bag.length) {
        bagList.appendChild(el('div', 'minbagg-muted', 'Ingen disker i baggen ennå.'));
        return;
      }

      for (var i = 0; i < state.bag.length; i++) {
        (function (idx) {
          var it = state.bag[idx] || {};
          var row = el('div', 'minbagg-bagitem');

          var l = el('div', 'left');
          if (it.image) {
            var im = document.createElement('img');
            im.src = it.image;
            im.alt = it.name || '';
            l.appendChild(im);
          }
          var t = el('div', '');
          var name = el('div', '', it.name || '');
          name.style.fontWeight = '600';
          t.appendChild(name);

          if (it.url) {
            var a = el('a', 'minbagg-muted', 'Se produkt');
            a.href = it.url;
            a.target = '_self';
            a.rel = 'nofollow';
            t.appendChild(a);
          }
          l.appendChild(t);

          var rm = el('button', 'minbagg-btn', 'Fjern');
          rm.addEventListener('click', function () {
            state.bag.splice(idx, 1);
            renderBag();
            scheduleSave();
          });

          row.appendChild(l);
          row.appendChild(rm);
          bagList.appendChild(row);
        })(i);
      }
    }

    function addDisc(item) {
      // item: {name,url,image}
      state.bag.unshift({
        name: item.name || '',
        url: item.url || '',
        image: item.image || '',
        addedAt: new Date().toISOString().slice(0, 10)
      });
      renderBag();
      scheduleSave();
    }

    // Save debounce
    var saveTimer = null;
    var savingNow = false;

    function doSaveNow() {
      if (savingNow) return;
      savingNow = true;
      dbSaveBag(supa, supaUser.email, state.bag)
        .then(function () {
          state.lastSavedAt = new Date();
        })
        .catch(function (err) {
          log('[MINBAGG] save failed', err);
        })
        .finally(function () {
          savingNow = false;
        });
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(doSaveNow, 600);
    }

    // Search UX (debounce)
    var searchTimer = null;

    function setResultsLoading() {
      clear(results);
      results.appendChild(el('div', 'minbagg-muted', 'Søker...'));
    }
    function setResultsEmpty(msg) {
      clear(results);
      results.appendChild(el('div', 'minbagg-muted', msg || 'Ingen treff.'));
    }

    function renderResults(items) {
      clear(results);
      if (!items || !items.length) {
        setResultsEmpty('Ingen treff. Prøv et annet søk.');
        return;
      }

      for (var i = 0; i < items.length; i++) {
        (function (it) {
          var box = el('div', 'minbagg-res');

          var left = el('div', '');
          left.style.display = 'flex';
          left.style.gap = '10px';
          left.style.alignItems = 'center';

          if (it.image) {
            var img = document.createElement('img');
            img.src = it.image;
            img.alt = it.name || '';
            left.appendChild(img);
          }

          var mid = el('div', '');
          mid.appendChild(el('div', 't', it.name || ''));
          var act = el('div', '');
          act.style.display = 'flex';
          act.style.gap = '8px';

          var a = el('a', 'minbagg-muted', it.url ? 'Se' : '');
          a.href = it.url || '#';
          a.target = '_self';
          a.rel = 'nofollow';

          var b = el('button', 'minbagg-btn primary', 'Legg til');
          b.addEventListener('click', function () {
            addDisc({ name: it.name, url: it.url, image: it.image });
          });

          act.appendChild(a);
          act.appendChild(b);

          mid.appendChild(act);
          left.appendChild(mid);

          box.appendChild(left);
          results.appendChild(box);
        })(items[i]);
      }
    }

    searchInput.addEventListener('input', function () {
      var q = (searchInput.value || '').trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (!q) { clear(results); return; }
      searchTimer = setTimeout(function () {
        setResultsLoading();
        qbSearch(q)
          .then(function (items) { renderResults(items); })
          .catch(function (err) {
            log('[MINBAGG] search error', err);
            setResultsEmpty('Kunne ikke søke akkurat nå.');
          });
      }, 250);
    });

    // Manual add
    manBtn.addEventListener('click', function () {
      var n = (manName.value || '').trim();
      if (!n) return;
      addDisc({ name: n, url: (manUrl.value || '').trim(), image: '' });
      manName.value = '';
      manUrl.value = '';
    });

    // Init load: DB -> render -> top3
    dbLoadBag(supa, supaUser.email)
      .then(function (res) {
        var bag = (res && res.data && res.data.bag) ? res.data.bag : [];
        if (Object.prototype.toString.call(bag) === '[object Array]') {
          state.bag = bag;
        }
      })
      .catch(function (err) {
        log('[MINBAGG] load failed', err);
      })
      .finally(function () {
        renderBag();
      });

    fetchTop3(supa).then(function (top3) { app.__renderTop3(top3); });

    root.appendChild(wrap);
  }

  // ---------------- Boot ----------------
  function boot() {
    try {
      var root = document.querySelector('#min-bagg-root') || document.querySelector('main') || document.body;
      var supa = ensureSupabaseClient();
      if (!supa) {
        clear(root);
        root.appendChild(el('div', 'minbagg-muted', 'Min Bagg: mangler Supabase-konfig i loader.'));
        return;
      }

      // Finn “login marker” fra loader (Quickbutik)
      var st = window.__GK_LOGIN_STATE__ || {};
      // Forventet:
      // st.loggedIn: true/false
      // st.email
      // st.firstname
      var marker = {
        firstname: st.firstname || ''
      };

      log('[MINBAGG] login marker:', (st.loggedIn ? 'LOGGED IN' : 'GUEST'), (marker.firstname ? '(' + marker.firstname + ')' : ''));

      if (!st.loggedIn || !st.email) {
        renderApp(root, marker, supa, null);
        return;
      }

      // Logged in
      renderApp(root, marker, supa, { email: st.email });
    } catch (err) {
      try {
        console.log('[MINBAGG] fatal', err);
      } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }

})();
