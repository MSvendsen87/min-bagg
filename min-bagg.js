/* ============================================================================
   GOLFKONGEN – MIN BAGG (v2026-02-01 stable)
   - Kun /sider/min-bagg
   - Flight fra Quickbutik søk JSON: product.datafield_1 (FUNGERER)
   - Kun én bag-visning: 4 kategoribokser (putter/midrange/fairway/distance)
   - Farge: flere valg + ramme rundt disk-kort i valgt farge
   - Kommentar i stedet for URL under disk
   - Topplister: RPC get_mybag_top3 (4 grupper)
   - Lagring: mybag_bags (email PK) -> bag jsonb { bagInfo, discs }
============================================================================ */
(function () {
  'use strict';

  // -------------------- Gatekeeper -----------------------------------------
  var path = (location && location.pathname) ? String(location.pathname) : '';
  path = path.replace(/\/+$/, '');
  if (path !== '/sider/min-bagg') return;
  if (window.__DISABLE_MINBAGG__ === true) return;

  // Ikke blokker BFCache/back. Vi bruker en "soft guard" som resettes på pageshow.
  if (!window.__MINBAGG_SOFT_LOCK__) window.__MINBAGG_SOFT_LOCK__ = { running: false };

  // -------------------- Utils ----------------------------------------------
  function log() { try { console.log.apply(console, arguments); } catch (_) {} }
  function safeStr(x) { return (x === null || x === undefined) ? '' : String(x); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = String(txt);
    return n;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function debounce(fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }
  function todayISO() {
    try {
      var d = new Date();
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var da = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + da;
    } catch (_) { return ''; }
  }
  function toNum(x) {
    if (x === null || x === undefined) return NaN;
    var s = String(x).trim().replace(',', '.');
    if (!s) return NaN;
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  // -------------------- Root + styles --------------------------------------
  function ensureRoot() {
    var root = document.getElementById('min-bagg-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'min-bagg-root';
      var area = document.getElementById('page-content-area') || document.body;
      area.appendChild(root);
    }
    return root;
  }

  function injectStyles() {
    if (document.getElementById('minbagg-styles')) return;
    var css = `
      #min-bagg-root{color:#e8eef6}
      .minbagg-wrap{max-width:1100px;margin:0 auto;padding:14px}
      .minbagg-card{background:rgba(20,24,32,.72);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px}
      .minbagg-title{font-size:22px;margin:0 0 6px 0}
      .minbagg-sub{opacity:.9;margin:0 0 10px 0;line-height:1.35}
      .minbagg-muted{opacity:.78}
      .minbagg-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .minbagg-btn{appearance:none;border:0;border-radius:12px;padding:10px 12px;font-weight:900;cursor:pointer;background:#2e8b57;color:#fff}
      .minbagg-btn.secondary{background:transparent;border:1px solid rgba(255,255,255,.18)}
      .minbagg-btn.small{padding:7px 10px;border-radius:10px;font-weight:900}
      .minbagg-hr{height:1px;background:rgba(255,255,255,.12);margin:12px 0}
      .minbagg-input,.minbagg-select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:#e8eef6}
      .minbagg-label{font-size:12px;opacity:.85;margin:0 0 6px 2px}
      .minbagg-list{display:flex;flex-direction:column;gap:8px}
      .minbagg-item{display:flex;gap:10px;align-items:center;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18)}
      .minbagg-thumb{width:44px;height:44px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}
      .minbagg-name{font-weight:900}
      .minbagg-meta{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
      .minbagg-meta .sub{opacity:.78;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .minbagg-link{color:#cfe9ff;text-decoration:none}
      .minbagg-link:hover{text-decoration:underline}

      .minbagg-banner{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px 12px}
      .minbagg-banner b{white-space:nowrap}

      /* 4 bokser */
      .minbagg-boxgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:760px){.minbagg-boxgrid{grid-template-columns:1fr}}

      /* Topplister nederst */
      .minbagg-top3-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:560px){.minbagg-top3-grid{grid-template-columns:1fr}}

      /* Modal: midt/øverst på skjermen */
      .minbagg-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
        align-items:flex-start;justify-content:center;z-index:99999;padding:12px;overflow:auto}
      .minbagg-modal{margin-top:24px;width:min(860px,100%);max-height:86vh;overflow:auto;
        background:rgba(18,22,30,.98);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px}
      .minbagg-modal-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .minbagg-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .minbagg-tab{cursor:pointer;padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.04);font-weight:900}
      .minbagg-tab.active{background:#2e8b57;border-color:#2e8b57}

      .minbagg-swatches{display:flex;gap:8px;flex-wrap:wrap}
      .minbagg-swatch{width:24px;height:24px;border-radius:999px;border:2px solid rgba(255,255,255,.20);
        cursor:pointer;box-sizing:border-box}
      .minbagg-swatch.active{border-color:#fff;outline:2px solid rgba(46,139,87,.9);outline-offset:2px}

      .minbagg-collapsible{border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden}
      .minbagg-collapsible button{width:100%;text-align:left;padding:10px 12px;background:rgba(255,255,255,.04);
        border:0;color:#e8eef6;font-weight:900;cursor:pointer}
      .minbagg-collapsible .body{padding:10px 12px;background:rgba(0,0,0,.12);display:none}
      .minbagg-collapsible.open .body{display:block}
    `;
    var st = document.createElement('style');
    st.id = 'minbagg-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // -------------------- Config + Supabase -----------------------------------
  function getSupaConfig() {
    var url = (window.GK_SUPABASE_URL || '').trim();
    var anon = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();
    return { url: url, anon: anon };
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.async = true;
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function ensureSupabaseClient() {
    if (window.__MINBAGG_SUPA__) return window.__MINBAGG_SUPA__;
    var cfg = getSupaConfig();
    if (!cfg.url || !cfg.anon) throw new Error('Manglende Supabase config (GK_SUPABASE_URL / GK_SUPABASE_ANON_KEY).');

    if (!window.supabase || !window.supabase.createClient) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js');
    }
    window.__MINBAGG_SUPA__ = window.supabase.createClient(cfg.url, cfg.anon, {
      auth: { persistSession: true, storageKey: 'gk_minbagg_auth_v1' }
    });
    return window.__MINBAGG_SUPA__;
  }

  // -------------------- Quickbutik login marker -----------------------------
  function getLoginMarker() {
    var m = document.getElementById('gk-login-marker');
    var ds = (m && m.dataset) ? m.dataset : {};
    return { loggedIn: ds.loggedIn === '1', firstname: ds.firstname || '', email: ds.email || '' };
  }

  // -------------------- Type helpers ---------------------------------------
  function inferTypeFromUrl(url) {
    var u = (url || '').toLowerCase();
    if (u.indexOf('/discgolf/disc-putter') !== -1) return 'putter';
    if (u.indexOf('/discgolf/midrange') !== -1) return 'midrange';
    if (u.indexOf('/discgolf/fairway-driver') !== -1) return 'fairway';
    if (u.indexOf('/discgolf/driver') !== -1) return 'distance';
    return '';
  }
  function typeLabel(t) {
    if (t === 'putter') return 'Putter';
    if (t === 'midrange') return 'Midrange';
    if (t === 'fairway') return 'Fairway Driver';
    if (t === 'distance') return 'Distance Driver';
    return 'Velg kategori…';
  }

  // -------------------- Flight parsing (KEY FIX) ----------------------------
  // Quickbutik: product.datafield_1 kommer fra /shop/search out=json
  function parseFlightText(flightText) {
    var raw = safeStr(flightText).trim();
    if (!raw) return null;

    // Finn 4 tall (tillater -, komma og punktum)
    var nums = raw.match(/-?\d+(?:[.,]\d+)?/g);
    if (!nums || nums.length < 4) return null;

    return {
      speed: safeStr(nums[0]).replace(',', '.'),
      glide: safeStr(nums[1]).replace(',', '.'),
      turn: safeStr(nums[2]).replace(',', '.'),
      fade: safeStr(nums[3]).replace(',', '.')
    };
  }
  function formatFlightLabel(f) {
    if (!f) return '';
    return 'Flight: Speed: ' + safeStr(f.speed) +
      ' | Glide: ' + safeStr(f.glide) +
      ' | Turn: ' + safeStr(f.turn) +
      ' | Fade: ' + safeStr(f.fade);
  }

  // -------------------- Quickbutik search (includes datafield_1) ------------
  async function shopSearch(q) {
    q = safeStr(q).trim();
    if (!q) return [];
    var url = '/shop/search?s=' + encodeURIComponent(q) + '&out=json&limit=12';
    var r = await fetch(url, { credentials: 'same-origin' });
    var t = await r.text();
    var j = null;
    try { j = JSON.parse(t); } catch (_) { return []; }

    var arr = (j && j.searchresults) ? j.searchresults : [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var p = (arr[i] && arr[i].product) ? arr[i].product : null;
      if (!p) continue;

      out.push({
        name: safeStr(p.title || p.producttitle || p.name).trim(),
        url: safeStr(p.url || p.producturl || p.href).trim(),
        image: safeStr(p.firstimage || p.image).trim(),
        flightText: safeStr(p.datafield_1 || '').trim(),   // <-- HER ligger flight
        typeGuess: '' // settes ved valg (fra URL)
      });
    }
    return out.filter(function (x) { return x && x.name && x.url; }).slice(0, 12);
  }

  // -------------------- Supabase RPC ----------------------------------------
  async function fetchTop3Grouped(supa) {
    var r = await supa.rpc('get_mybag_top3', { limit_per_group: 3 });
    if (r && r.error) throw r.error;
    var rows = (r && r.data) ? r.data : [];
    var groups = { putter: [], midrange: [], fairway: [], distance: [] };
    for (var i = 0; i < rows.length; i++) {
      var x = rows[i] || {};
      var tp = safeStr(x.type).toLowerCase();
      if (groups[tp]) groups[tp].push(x);
    }
    return groups;
  }
  async function incrementPopular(supa, item) {
    try {
      var r = await supa.rpc('increment_popular_disc', {
        p_type: item.type,
        p_name: item.name,
        p_url: item.url || null,
        p_image: item.image || null
      });
      if (r && r.error) log('[MINBAGG] popular inc error', r.error);
    } catch (e) {
      log('[MINBAGG] popular inc fail', e);
    }
  }

  // -------------------- DB (mybag_bags) -------------------------------------
  async function dbLoadBag(supa, email) {
    var res = await supa.from('mybag_bags').select('bag').eq('email', email).maybeSingle();
    if (res && res.error) throw res.error;
    var bag = res && res.data ? res.data.bag : null;

    // Old format: array
    if (Array.isArray(bag)) return { bagInfo: null, discs: bag };

    // New format: object
    if (bag && typeof bag === 'object') {
      return {
        bagInfo: bag.bagInfo || null,
        discs: Array.isArray(bag.discs) ? bag.discs : (Array.isArray(bag.bag) ? bag.bag : [])
      };
    }
    return { bagInfo: null, discs: [] };
  }
  async function dbSaveBag(supa, email, state) {
    var payload = { bagInfo: state.bagInfo || null, discs: state.discs || [] };
    var up = await supa.from('mybag_bags').upsert({ email: email, bag: payload }, { onConflict: 'email' });
    if (up && up.error) throw up.error;
  }

  // -------------------- State ----------------------------------------------
  var state = { bagInfo: null, discs: [] };

  function normalizeDiscItem(it) {
    it = it || {};
    var flight = null;
    if (it.flight && typeof it.flight === 'object') flight = it.flight;
    if (!flight && it.flightText) flight = parseFlightText(it.flightText);

    var out = {
      id: it.id || ('d_' + Math.random().toString(16).slice(2)),
      name: safeStr(it.name).trim(),
      url: safeStr(it.url).trim(),
      image: safeStr(it.image).trim(),
      type: safeStr(it.type).trim(),
      color: safeStr(it.color).trim(),
      note: safeStr(it.note).trim(),
      flight: flight,
      addedAt: it.addedAt || todayISO()
    };

    if (!out.type) {
      var inf = inferTypeFromUrl(out.url);
      if (inf) out.type = inf;
    }
    return out;
  }

  // -------------------- Modal helpers --------------------------------------
  function openModal(title, buildFn) {
    var bd = el('div', 'minbagg-modal-backdrop');
    var modal = el('div', 'minbagg-modal');

    var head = el('div', 'minbagg-modal-head');
    head.appendChild(el('div', 'minbagg-title', title));

    var closeBtn = el('button', 'minbagg-btn secondary', 'Lukk');
    closeBtn.addEventListener('click', function () { try { document.body.removeChild(bd); } catch (_) {} });
    head.appendChild(closeBtn);

    modal.appendChild(head);
    modal.appendChild(el('div', 'minbagg-hr'));

    buildFn(modal, function close() {
      try { document.body.removeChild(bd); } catch (_) {}
    });

    bd.addEventListener('click', function (e) {
      if (e.target === bd) { try { document.body.removeChild(bd); } catch (_) {} }
    });

    bd.appendChild(modal);
    document.body.appendChild(bd);
  }

  function swatchPicker(initial, onPick) {
    // Flere farger (bedre dekning)
    var colors = [
      '#ffffff','#000000','#c0c0c0','#808080',
      '#ff0000','#ff4d4d','#b30000',
      '#ff7a00','#ffb020','#ffd000',
      '#00ff00','#2e8b57','#0b5d3a','#00d3a7',
      '#00a2ff','#2aa1ff','#0057ff','#0033a0',
      '#b06cff','#7b2cff','#ff00ff','#ff4fd8',
      '#8b4513','#c68642','#f5deb3'
    ];
    var wrap = el('div', 'minbagg-swatches');
    var current = initial || '';
    colors.forEach(function (c) {
      var s = el('div', 'minbagg-swatch');
      s.style.background = c;
      if (current === c) s.classList.add('active');
      s.addEventListener('click', function () {
        current = c;
        Array.prototype.forEach.call(wrap.children, function (ch) { ch.classList.remove('active'); });
        s.classList.add('active');
        onPick(c);
      });
      wrap.appendChild(s);
    });
    return wrap;
  }

  // -------------------- Render ---------------------------------------------
  function renderBase(root) {
    clear(root);
    var wrap = el('div', 'minbagg-wrap');
    root.appendChild(wrap);

    var banner = el('div', 'minbagg-banner');
    banner.appendChild(el('b', '', '🚧 Under konstruksjon'));
    banner.appendChild(el('div', 'minbagg-muted',
      'Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.'));
    wrap.appendChild(banner);

    wrap.appendChild(el('div', 'minbagg-hr'));
    return wrap;
  }

  function renderGuest(wrap) {
    var card = el('div', 'minbagg-card');
    card.appendChild(el('h2', 'minbagg-title', 'Min Bagg'));
    card.appendChild(el('p', 'minbagg-sub',
      'Du må være innlogget i nettbutikken for å lagre og bygge baggen din. Du kan likevel se Topp 3 globalt uten innlogging.'));

    var row = el('div', 'minbagg-row');
    var a1 = el('a', 'minbagg-btn', 'Logg inn');
    a1.href = '/customer/login'; a1.style.textDecoration = 'none';
    var a2 = el('a', 'minbagg-btn secondary', 'Opprett konto');
    a2.href = '/customer/register'; a2.style.textDecoration = 'none';
    row.appendChild(a1); row.appendChild(a2);

    card.appendChild(row);
    wrap.appendChild(card);
    wrap.appendChild(el('div', 'minbagg-hr'));
  }

  function renderHeaderLoggedIn(wrap, marker, onAddBag, onAddDisc) {
    var card = el('div', 'minbagg-card');
    card.appendChild(el('h2', 'minbagg-title', (marker.firstname ? (marker.firstname + ' SIN BAGG') : 'Min Bagg')));
    card.appendChild(el('p', 'minbagg-sub', (marker.firstname ? ('Hei ' + marker.firstname + ' 👋 ') : '') + 'Baggen din lagres på kontoen din.'));

    // Vis kun navn + bilde (ingen "egen bagg"-rute)
    if (state.bagInfo && (state.bagInfo.name || state.bagInfo.image)) {
      var row = el('div', 'minbagg-item');
      if (state.bagInfo.image) {
        var im = el('img', 'minbagg-thumb');
        im.src = state.bagInfo.image;
        im.alt = '';
        im.loading = 'lazy';
        row.appendChild(im);
      }
      var meta = el('div', 'minbagg-meta');
      meta.appendChild(el('div', 'minbagg-name', state.bagInfo.name || 'Bag'));
      row.appendChild(meta);
      card.appendChild(row);
    }

    var btnRow = el('div', 'minbagg-row');
    var bBag = el('button', 'minbagg-btn secondary', 'Legg til bagg');
    bBag.addEventListener('click', onAddBag);
    var bDisc = el('button', 'minbagg-btn', 'Legg til disk');
    bDisc.addEventListener('click', onAddDisc);
    btnRow.appendChild(bBag);
    btnRow.appendChild(bDisc);
    card.appendChild(btnRow);

    wrap.appendChild(card);
    wrap.appendChild(el('div', 'minbagg-hr'));
  }

  function renderFourBoxes(wrap, onEdit) {
    var grid = el('div', 'minbagg-boxgrid');

    ['putter','midrange','fairway','distance'].forEach(function (t) {
      var box = el('div', 'minbagg-card');
      box.appendChild(el('h3', '', typeLabel(t)));

      var items = state.discs.filter(function (d) { return d.type === t; });
      if (!items.length) {
        box.appendChild(el('div', 'minbagg-muted', 'Tomt ennå – legg til en disk.'));
      } else {
        var list = el('div', 'minbagg-list');
        items.forEach(function (it) {
          var row = el('div', 'minbagg-item');

          // Farge som RAMME
          if (it.color) {
            row.style.borderColor = it.color;
            row.style.boxShadow = '0 0 0 2px ' + it.color + ' inset';
          }

          var img = el('img', 'minbagg-thumb');
          img.alt = '';
          img.loading = 'lazy';
          img.src = it.image || '';
          if (!img.src) img.style.display = 'none';
          row.appendChild(img);

          var meta = el('div', 'minbagg-meta');
          meta.appendChild(el('div', 'minbagg-name', it.name || ''));

          // URL-linje fjernet -> Flight + Kommentar
          if (it.flight) meta.appendChild(el('div', 'sub', formatFlightLabel(it.flight)));
          else meta.appendChild(el('div', 'sub', 'Flight mangler'));

          if (it.note) meta.appendChild(el('div', 'sub', '📝 ' + it.note));
          else meta.appendChild(el('div', 'sub', '📝 Ingen kommentar'));

          row.appendChild(meta);

          var btn = el('button', 'minbagg-btn small secondary', 'Endre');
          btn.addEventListener('click', function () { onEdit(it); });
          row.appendChild(btn);

          list.appendChild(row);
        });
        box.appendChild(list);
      }

      grid.appendChild(box);
    });

    wrap.appendChild(grid);
    wrap.appendChild(el('div', 'minbagg-hr'));
  }

  function renderFlightList(wrap) {
    var wrapC = el('div', 'minbagg-collapsible');
    var btn = el('button', '', 'Flight lista');
    var body = el('div', 'body');
    wrapC.appendChild(btn);
    wrapC.appendChild(body);
    btn.addEventListener('click', function () { wrapC.classList.toggle('open'); });

    var list = state.discs.slice();
    list.sort(function (a, b) {
      var sa = (a.flight && a.flight.speed !== undefined) ? toNum(a.flight.speed) : NaN;
      var sb = (b.flight && b.flight.speed !== undefined) ? toNum(b.flight.speed) : NaN;
      if (isNaN(sa)) sa = -9999;
      if (isNaN(sb)) sb = -9999;
      return sb - sa;
    });

    if (!list.length) {
      body.appendChild(el('div', 'minbagg-muted', 'Ingen disker i baggen ennå.'));
    } else {
      var dup = {};
      list.forEach(function (d) {
        var f = d.flight || {};
        var key = [safeStr(f.speed), safeStr(f.glide), safeStr(f.turn), safeStr(f.fade)].join('|');
        dup[key] = (dup[key] || 0) + 1;
      });

      var ul = el('div', 'minbagg-list');
      list.forEach(function (d) {
        var row = el('div', 'minbagg-item');
        var meta = el('div', 'minbagg-meta');
        meta.appendChild(el('div', 'minbagg-name', d.name || ''));
        meta.appendChild(el('div', 'sub', d.flight ? formatFlightLabel(d.flight) : 'Flight mangler'));
        var f = d.flight || {};
        var key = [safeStr(f.speed), safeStr(f.glide), safeStr(f.turn), safeStr(f.fade)].join('|');
        if (d.flight && dup[key] >= 2) meta.appendChild(el('div', 'sub', 'OBS: ' + dup[key] + ' disker har helt lik flight.'));
        row.appendChild(meta);
        ul.appendChild(row);
      });
      body.appendChild(ul);
    }

    wrap.appendChild(wrapC);
    wrap.appendChild(el('div', 'minbagg-hr'));
  }

  function renderTop3Section(wrap, groups) {
    var card = el('div', 'minbagg-card');
    card.appendChild(el('h2', 'minbagg-title', 'Topp 3 globalt'));
    card.appendChild(el('p', 'minbagg-sub', 'Basert på hva folk legger i baggen sin.'));

    var grid = el('div', 'minbagg-top3-grid');

    ['putter','midrange','fairway','distance'].forEach(function (t) {
      var c = el('div', 'minbagg-card');
      c.style.padding = '12px';
      c.appendChild(el('div', 'minbagg-name', typeLabel(t)));

      var list = el('div', 'minbagg-list');
      var rows = groups && groups[t] ? groups[t] : [];
      if (!rows.length) {
        list.appendChild(el('div', 'minbagg-muted', 'Ingen data ennå.'));
      } else {
        rows.forEach(function (r) {
          var row = el('div', 'minbagg-item');

          var img = el('img', 'minbagg-thumb');
          img.alt = '';
          img.loading = 'lazy';
          img.src = r.image_url || '';
          if (!img.src) img.style.display = 'none';
          row.appendChild(img);

          var meta = el('div', 'minbagg-meta');
          if (r.product_url) {
            var a = el('a', 'minbagg-name minbagg-link', r.name || '');
            a.href = r.product_url;
            meta.appendChild(a);
          } else {
            meta.appendChild(el('div', 'minbagg-name', r.name || ''));
          }
          meta.appendChild(el('div', 'sub', 'Valgt ' + (r.picks || 0) + ' ganger'));
          row.appendChild(meta);

          list.appendChild(row);
        });
      }

      c.appendChild(list);
      grid.appendChild(c);
    });

    card.appendChild(grid);
    wrap.appendChild(card);
  }

  // -------------------- Connect view (magic link) ---------------------------
  function renderConnectView(wrap, marker, supa) {
    var card = el('div', 'minbagg-card');
    card.appendChild(el('h2', 'minbagg-title', 'Koble Min Bagg'));
    card.appendChild(el('p', 'minbagg-sub', 'For å lagre baggen din må du koble kontoen én gang via magic link.'));

    var email = marker.email || '';
    card.appendChild(el('div', 'minbagg-label', 'E-post'));
    var inp = el('input', 'minbagg-input');
    inp.type = 'email';
    inp.placeholder = 'din@epost.no';
    inp.value = email;
    card.appendChild(inp);

    var btn = el('button', 'minbagg-btn', 'Send magic link');
    var msg = el('div', 'minbagg-muted', '');

    btn.addEventListener('click', async function () {
      msg.textContent = 'Sender…';
      try {
        var e = safeStr(inp.value).trim();
        if (!e) throw new Error('Skriv inn e-post.');
        var r = await supa.auth.signInWithOtp({
          email: e,
          options: { emailRedirectTo: location.origin + '/sider/min-bagg' }
        });
        if (r && r.error) throw r.error;
        msg.textContent = 'Sjekk e-posten din – trykk på linken for å fullføre innloggingen.';
      } catch (err) {
        msg.textContent = 'Feil: ' + (err && err.message ? err.message : String(err));
      }
    });

    card.appendChild(el('div', '', ''));
    card.appendChild(btn);
    card.appendChild(el('div', '', ''));
    card.appendChild(msg);

    wrap.appendChild(card);
  }

  // -------------------- Modals ---------------------------------------------
  function openAddBagModal(onSave) {
    openModal('Legg til bagg', function (modal, close) {
      var tabs = el('div', 'minbagg-tabs');
      var t1 = el('div', 'minbagg-tab active', 'Søk i butikken');
      var t2 = el('div', 'minbagg-tab', 'Legg til egen');
      tabs.appendChild(t1); tabs.appendChild(t2);
      modal.appendChild(tabs);

      var body = el('div', '');
      modal.appendChild(body);

      function setTab(n) {
        t1.classList.toggle('active', n === 1);
        t2.classList.toggle('active', n === 2);
        clear(body);

        if (n === 1) {
          body.appendChild(el('div', 'minbagg-label', 'Søk'));
          var q = el('input', 'minbagg-input');
          q.placeholder = 'Søk etter bagg i butikken…';
          body.appendChild(q);

          var list = el('div', 'minbagg-list');
          list.style.marginTop = '10px';
          body.appendChild(list);

          var selected = null;

          async function runSearch(v) {
            clear(list);
            v = safeStr(v).trim();
            if (!v) return;
            list.appendChild(el('div', 'minbagg-muted', 'Laster…'));
            var rows = await shopSearch(v);
            clear(list);
            if (!rows.length) { list.appendChild(el('div', 'minbagg-muted', 'Ingen treff.')); return; }

            rows.forEach(function (p) {
              var row = el('div', 'minbagg-item');
              var img = el('img', 'minbagg-thumb'); img.alt = ''; img.loading = 'lazy'; img.src = p.image || '';
              if (!img.src) img.style.display = 'none';
              row.appendChild(img);

              var meta = el('div', 'minbagg-meta');
              meta.appendChild(el('div', 'minbagg-name', p.name || ''));
              row.appendChild(meta);

              row.style.cursor = 'pointer';
              row.addEventListener('click', function () {
                selected = p;
                Array.prototype.forEach.call(list.children, function (ch) { ch.style.outline = ''; });
                row.style.outline = '2px solid rgba(46,139,87,.85)';
              });

              list.appendChild(row);
            });
          }

          q.addEventListener('input', debounce(function () { runSearch(q.value); }, 250));

          var save = el('button', 'minbagg-btn', 'Bruk valgt bagg');
          save.style.marginTop = '10px';
          save.addEventListener('click', function () {
            if (!selected) return;
            onSave({ name: selected.name || 'Bag', image: selected.image || '', url: selected.url || '' });
            close();
          });
          body.appendChild(save);

        } else {
          body.appendChild(el('div', 'minbagg-label', 'Navn'));
          var nInp = el('input', 'minbagg-input'); nInp.placeholder = 'Navn på baggen';
          body.appendChild(nInp);

          body.appendChild(el('div', 'minbagg-label', 'Bilde-URL (valgfritt)'));
          var iInp = el('input', 'minbagg-input'); iInp.placeholder = 'https://...';
          body.appendChild(iInp);

          var save2 = el('button', 'minbagg-btn', 'Lagre bagg');
          save2.style.marginTop = '10px';
          save2.addEventListener('click', function () {
            onSave({ name: safeStr(nInp.value).trim() || 'Bag', image: safeStr(iInp.value).trim(), url: '' });
            close();
          });
          body.appendChild(save2);
        }
      }

      t1.addEventListener('click', function () { setTab(1); });
      t2.addEventListener('click', function () { setTab(2); });
      setTab(1);
    });
  }

  function openAddDiscModal(onAdd) {
    openModal('Legg til disk', function (modal, close) {
      var tabs = el('div', 'minbagg-tabs');
      var t1 = el('div', 'minbagg-tab active', 'Søk i butikken');
      var t2 = el('div', 'minbagg-tab', 'Legg til egen');
      tabs.appendChild(t1); tabs.appendChild(t2);
      modal.appendChild(tabs);

      modal.appendChild(el('div', 'minbagg-hr'));

      // Kategori + farge øverst
      modal.appendChild(el('div', 'minbagg-label', 'Kategori'));
      var selType = el('select', 'minbagg-select');
      ['','putter','midrange','fairway','distance'].forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v ? typeLabel(v) : 'Velg kategori…';
        selType.appendChild(opt);
      });
      modal.appendChild(selType);

      modal.appendChild(el('div', 'minbagg-label', 'Farge'));
      var pickedColor = '';
      var sw = swatchPicker('', function (c) { pickedColor = c; });
      modal.appendChild(sw);

      modal.appendChild(el('div', 'minbagg-hr'));
      var body = el('div', '');
      modal.appendChild(body);

      function setTab(n) {
        t1.classList.toggle('active', n === 1);
        t2.classList.toggle('active', n === 2);
        clear(body);

        if (n === 1) {
          body.appendChild(el('div', 'minbagg-label', 'Søk'));
          var q = el('input', 'minbagg-input');
          q.placeholder = 'Søk i nettbutikken (f.eks. buzzz, luna, md3)…';
          body.appendChild(q);

          var list = el('div', 'minbagg-list');
          list.style.marginTop = '10px';
          body.appendChild(list);

          var selected = null;

          async function runSearch(v) {
            clear(list);
            v = safeStr(v).trim();
            if (!v) return;
            list.appendChild(el('div', 'minbagg-muted', 'Laster…'));
            var rows = await shopSearch(v);
            clear(list);
            if (!rows.length) { list.appendChild(el('div', 'minbagg-muted', 'Ingen treff.')); return; }

            rows.forEach(function (p) {
              var row = el('div', 'minbagg-item');
              var img = el('img', 'minbagg-thumb');
              img.alt = ''; img.loading = 'lazy';
              img.src = p.image || '';
              if (!img.src) img.style.display = 'none';
              row.appendChild(img);

              var meta = el('div', 'minbagg-meta');
              meta.appendChild(el('div', 'minbagg-name', p.name || ''));

              // VIS flight i søk (fra datafield_1) – dette bekrefter at flight er funnet
              var fl = parseFlightText(p.flightText);
              meta.appendChild(el('div', 'sub', fl ? formatFlightLabel(fl) : 'Flight mangler'));

              row.appendChild(meta);

              row.style.cursor = 'pointer';
              row.addEventListener('click', function () {
                selected = p;
                var inf = inferTypeFromUrl(p.url);
                if (inf) selType.value = inf;

                Array.prototype.forEach.call(list.children, function (ch) { ch.style.outline = ''; });
                row.style.outline = '2px solid rgba(46,139,87,.85)';
              });

              list.appendChild(row);
            });
          }

          // LIVE forslag mens man skriver
          q.addEventListener('input', debounce(function () { runSearch(q.value); }, 250));

          // Kommentar (minimert)
          var comWrap = el('div', 'minbagg-collapsible');
          var comBtn = el('button', '', 'Kommentar (valgfritt)');
          var comBody = el('div', 'body');
          var comInp = el('textarea', 'minbagg-input');
          comInp.rows = 3; comInp.placeholder = 'Skriv en kort kommentar…';
          comBody.appendChild(comInp);
          comWrap.appendChild(comBtn); comWrap.appendChild(comBody);
          comBtn.addEventListener('click', function () { comWrap.classList.toggle('open'); });
          comWrap.style.marginTop = '10px';
          body.appendChild(comWrap);

          var addBtn = el('button', 'minbagg-btn', 'Legg til');
          addBtn.style.marginTop = '10px';
          addBtn.addEventListener('click', function () {
            if (!selected) return;

            var tval = selType.value || inferTypeFromUrl(selected.url) || '';
            if (!tval) { alert('Velg kategori.'); return; }

            var flight = parseFlightText(selected.flightText);

            onAdd(normalizeDiscItem({
              name: selected.name,
              url: selected.url,
              image: selected.image,
              type: tval,
              color: pickedColor,
              note: safeStr(comInp.value).trim(),
              flight: flight,
              flightText: selected.flightText,
              addedAt: todayISO()
            }));

            close();
          });
          body.appendChild(addBtn);

        } else {
          // Egen disk
          body.appendChild(el('div', 'minbagg-label', 'Navn'));
          var nInp = el('input', 'minbagg-input');
          nInp.placeholder = 'F.eks. Buzzz';
          body.appendChild(nInp);

          body.appendChild(el('div', 'minbagg-label', 'URL (valgfritt)'));
          var uInp = el('input', 'minbagg-input');
          uInp.placeholder = 'https://golfkongen.no/...';
          body.appendChild(uInp);

          body.appendChild(el('div', 'minbagg-label', 'Bilde-URL (valgfritt)'));
          var iInp = el('input', 'minbagg-input');
          iInp.placeholder = 'https://...';
          body.appendChild(iInp);

          body.appendChild(el('div', 'minbagg-label', 'Flight (Speed / Glide / Turn / Fade)'));
          var rowF = el('div', 'minbagg-row');
          rowF.style.alignItems = 'stretch';
          rowF.style.gap = '8px';
          function fBox(ph) {
            var x = el('input', 'minbagg-input');
            x.placeholder = ph;
            x.style.maxWidth = '160px';
            return x;
          }
          var fS = fBox('Speed');
          var fG = fBox('Glide');
          var fT = fBox('Turn');
          var fF = fBox('Fade');
          rowF.appendChild(fS); rowF.appendChild(fG); rowF.appendChild(fT); rowF.appendChild(fF);
          body.appendChild(rowF);

          var comWrap2 = el('div', 'minbagg-collapsible');
          var comBtn2 = el('button', '', 'Kommentar (valgfritt)');
          var comBody2 = el('div', 'body');
          var comInp2 = el('textarea', 'minbagg-input');
          comInp2.rows = 3; comInp2.placeholder = 'Skriv en kort kommentar…';
          comBody2.appendChild(comInp2);
          comWrap2.appendChild(comBtn2); comWrap2.appendChild(comBody2);
          comBtn2.addEventListener('click', function () { comWrap2.classList.toggle('open'); });
          comWrap2.style.marginTop = '10px';
          body.appendChild(comWrap2);

          var addBtn2 = el('button', 'minbagg-btn', 'Legg til egen disk');
          addBtn2.style.marginTop = '10px';
          addBtn2.addEventListener('click', function () {
            var tval = selType.value || '';
            if (!tval) { alert('Velg kategori.'); return; }

            var flight = {
              speed: safeStr(fS.value).trim(),
              glide: safeStr(fG.value).trim(),
              turn: safeStr(fT.value).trim(),
              fade: safeStr(fF.value).trim()
            };

            var item = normalizeDiscItem({
              name: safeStr(nInp.value).trim(),
              url: safeStr(uInp.value).trim(),
              image: safeStr(iInp.value).trim(),
              type: tval,
              color: pickedColor,
              note: safeStr(comInp2.value).trim(),
              flight: flight,
              addedAt: todayISO()
            });

            if (!item.name) { alert('Skriv inn navn.'); return; }
            onAdd(item);
            close();
          });
          body.appendChild(addBtn2);
        }
      }

      t1.addEventListener('click', function () { setTab(1); });
      t2.addEventListener('click', function () { setTab(2); });
      setTab(1);
    });
  }

  function openEditDiscModal(item, onSave, onDelete) {
    openModal('Endre disk', function (modal, close) {
      var preview = el('div', 'minbagg-item');

      var img = el('img', 'minbagg-thumb');
      img.alt = ''; img.loading = 'lazy';
      img.src = item.image || '';
      if (!img.src) img.style.display = 'none';
      preview.appendChild(img);

      var meta = el('div', 'minbagg-meta');
      meta.appendChild(el('div', 'minbagg-name', item.name || ''));
      meta.appendChild(el('div', 'sub', typeLabel(item.type)));
      if (item.flight) meta.appendChild(el('div', 'sub', formatFlightLabel(item.flight)));
      preview.appendChild(meta);

      // farget ramme også i edit
      if (item.color) {
        preview.style.borderColor = item.color;
        preview.style.boxShadow = '0 0 0 2px ' + item.color + ' inset';
      }

      modal.appendChild(preview);
      modal.appendChild(el('div', 'minbagg-hr'));

      modal.appendChild(el('div', 'minbagg-label', 'Farge'));
      var picked = item.color || '';
      var sw = swatchPicker(picked, function (c) { picked = c; });
      modal.appendChild(sw);

      var comWrap = el('div', 'minbagg-collapsible');
      var comBtn = el('button', '', 'Kommentar');
      var comBody = el('div', 'body');
      var comInp = el('textarea', 'minbagg-input');
      comInp.rows = 3;
      comInp.value = item.note || '';
      comBody.appendChild(comInp);
      comWrap.appendChild(comBtn);
      comWrap.appendChild(comBody);
      comBtn.addEventListener('click', function () { comWrap.classList.toggle('open'); });
      comWrap.style.marginTop = '10px';
      modal.appendChild(comWrap);

      var row = el('div', 'minbagg-row');
      row.style.marginTop = '10px';

      var save = el('button', 'minbagg-btn', 'Lagre');
      save.addEventListener('click', function () {
        item.color = picked;
        item.note = safeStr(comInp.value).trim();
        onSave(item);
        close();
      });

      var del = el('button', 'minbagg-btn secondary', 'Fjern');
      del.addEventListener('click', function () {
        if (!confirm('Fjerne denne disken?')) return;
        onDelete(item);
        close();
      });

      row.appendChild(save);
      row.appendChild(del);
      modal.appendChild(row);
    });
  }

  // -------------------- MAIN init ------------------------------------------
  async function init(reason) {
    if (window.__MINBAGG_SOFT_LOCK__.running) return;
    window.__MINBAGG_SOFT_LOCK__.running = true;

    try {
      injectStyles();
      var root = ensureRoot();
      var wrap = renderBase(root);

      var marker = getLoginMarker();
      var supa = await ensureSupabaseClient();

      async function loadTop3Into(wrapNode) {
        try {
          var groups = await fetchTop3Grouped(supa);
          renderTop3Section(wrapNode, groups);
        } catch (e) {
          var c = el('div', 'minbagg-card');
          c.appendChild(el('div', 'minbagg-muted', 'Kunne ikke laste toppliste.'));
          wrapNode.appendChild(c);
          log('[MINBAGG] top3 fail', e);
        }
      }

      // Guest
      if (!marker.loggedIn) {
        renderGuest(wrap);
        await loadTop3Into(wrap);
        window.__MINBAGG_SOFT_LOCK__.running = false;
        return;
      }

      // Logged in requires Supabase session
      var sess = await supa.auth.getSession();
      var session = (sess && sess.data) ? sess.data.session : null;

      if (!session || !session.user) {
        renderConnectView(wrap, marker, supa);
        wrap.appendChild(el('div', 'minbagg-hr'));
        await loadTop3Into(wrap);
        window.__MINBAGG_SOFT_LOCK__.running = false;
        return;
      }

      var gu = await supa.auth.getUser();
      var user = (gu && gu.data) ? gu.data.user : (session.user || null);
      if (!user || !user.email) {
        renderConnectView(wrap, marker, supa);
        wrap.appendChild(el('div', 'minbagg-hr'));
        await loadTop3Into(wrap);
        window.__MINBAGG_SOFT_LOCK__.running = false;
        return;
      }

      // Load bag
      var loaded = await dbLoadBag(supa, user.email);
      state.bagInfo = loaded.bagInfo || null;
      state.discs = (loaded.discs || []).map(normalizeDiscItem);

      function renderAll() {
        clear(wrap);

        // banner
        var banner = el('div', 'minbagg-banner');
        banner.appendChild(el('b', '', '🚧 Under konstruksjon'));
        banner.appendChild(el('div', 'minbagg-muted',
          'Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.'));
        wrap.appendChild(banner);
        wrap.appendChild(el('div', 'minbagg-hr'));

        renderHeaderLoggedIn(wrap, marker,
          function onAddBag() {
            openAddBagModal(async function (bagInfo) {
              state.bagInfo = bagInfo;
              renderAll();
              await dbSaveBag(supa, user.email, state);
            });
          },
          function onAddDisc() {
            openAddDiscModal(async function (disc) {
              if (!disc.type) { alert('Velg kategori.'); return; }
              state.discs.push(disc);
              renderAll();
              await dbSaveBag(supa, user.email, state);

              // Popular inc + oppdater topplister
              await incrementPopular(supa, disc);
              // Re-render topplister ved å trigge etterpå (nedenfor)
            });
          }
        );

        // Kun kategorier (ingen dobbel “baggen din”)
        renderFourBoxes(wrap, function onEdit(item) {
          openEditDiscModal(item,
            async function save(it) {
              for (var i = 0; i < state.discs.length; i++) {
                if (state.discs[i].id === it.id) { state.discs[i] = it; break; }
              }
              renderAll();
              await dbSaveBag(supa, user.email, state);
            },
            async function del(it) {
              state.discs = state.discs.filter(function (x) { return x.id !== it.id; });
              renderAll();
              await dbSaveBag(supa, user.email, state);
            }
          );
        });

        // Flightlista
        renderFlightList(wrap);

        // Top3 nederst
        wrap.appendChild(el('div', 'minbagg-hr'));
        (async function () {
          var holder = el('div', 'minbagg-muted', 'Laster topplister…');
          wrap.appendChild(holder);
          try {
            var groups = await fetchTop3Grouped(supa);
            try { wrap.removeChild(holder); } catch (_) {}
            renderTop3Section(wrap, groups);
          } catch (e) {
            holder.textContent = 'Kunne ikke laste topplister.';
            log('[MINBAGG] top3 fail', e);
          }
        })();
      }

      renderAll();
      window.__MINBAGG_SOFT_LOCK__.running = false;

    } catch (err) {
      window.__MINBAGG_SOFT_LOCK__.running = false;
      var root2 = ensureRoot();
      clear(root2);
      injectStyles();
      var wrap2 = el('div', 'minbagg-wrap');
      var card2 = el('div', 'minbagg-card');
      card2.appendChild(el('div', 'minbagg-muted',
        'Min Bagg kunne ikke starte: ' + (err && err.message ? err.message : String(err))));
      wrap2.appendChild(card2);
      root2.appendChild(wrap2);
      log('[MINBAGG] fatal', err);
    }
  }

  function boot(reason) {
    // Reset “running” hvis vi kommer fra BFCache/pageshow
    // (pageshow kan fyre med persisted=true)
    init(reason);
  }

  // Boot on DOM + pageshow (fix “må hard refresh”)
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot('readyState');
  } else {
    document.addEventListener('DOMContentLoaded', function () { boot('DOMContentLoaded'); });
  }

  window.addEventListener('pageshow', function () {
    // Tillat re-init etter tilbake/fram
    window.__MINBAGG_SOFT_LOCK__.running = false;
    boot('pageshow');
  });

})();
