/* === GOLFKONGEN: MIN BAGG – v10.1 (autosøk, bag-søk, autokategori, kompakt UI, flight sort) ===
 * Side: /sider/min-bagg
 * Loader må sette:
 *   window.GK_SUPABASE_URL
 *   window.GK_SUPABASE_ANON_KEY
 *
 * Supabase:
 *  - mybag_bags: email (PK text), bag (jsonb)
 *  - RPC:
 *      get_mybag_top3(limit_per_group int) -> [{type,name,product_url,image_url,picks}]
 *      increment_popular_disc(p_type,p_name,p_url,p_image) -> 204 ok
 */
(function () {
  'use strict';

  var VERSION = 'v10.1-2026-02-01';
  var PATH = (location.pathname || '').replace(/\/+$/, '').toLowerCase();
  if (PATH !== '/sider/min-bagg') return;

  // --------------- global wired once ---------------
  if (!window.__MINBAGG_GLOBAL_WIRED__) {
    window.__MINBAGG_GLOBAL_WIRED__ = true;

    window.addEventListener('pageshow', function () {
      try { window.__MINBAGG_REINIT__ && window.__MINBAGG_REINIT__('pageshow'); } catch (_) {}
    });

    document.addEventListener('visibilitychange', function () {
      try {
        if (!document.hidden) window.__MINBAGG_REINIT__ && window.__MINBAGG_REINIT__('visibilitychange');
      } catch (_) {}
    });

    window.__MINBAGG_DEBUG__ = function () {
      var scripts = Array.prototype.slice.call(document.scripts || [])
        .map(function (s) { return s && s.src ? s.src : ''; })
        .filter(Boolean);
      console.log('[MINBAGG] VERSION:', VERSION);
      console.log('[MINBAGG] PATH:', PATH);
      console.log('[MINBAGG] GK_SUPABASE_URL:', window.GK_SUPABASE_URL);
      console.log('[MINBAGG] GK_SUPABASE_ANON_KEY:', window.GK_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
      console.log('[MINBAGG] scripts(min-bagg):', scripts.filter(function (u) { return u.indexOf('min-bagg') >= 0; }));
      console.log('[MINBAGG] running:', !!window.__MINBAGG_APP_RUNNING__);
      console.log('[MINBAGG] has supa singleton:', !!window.__MINBAGG_SUPA__);
    };
  }

  // --------------- helpers ---------------
  function log() { try { console.log.apply(console, arguments); } catch (_) {} }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function norm(s) { return (s == null) ? '' : String(s); }
  function normImg(v) {
    v = (v || '').trim();
    if (!v) return '';
    if (v.indexOf(',') >= 0) v = v.split(',')[0].trim();
    if (v.indexOf(' ') >= 0) v = v.split(' ')[0].trim();
    if (v.indexOf('//') === 0) v = 'https:' + v;
    if (v.indexOf('/') === 0) v = location.origin + v;
    return v;
  }
  function todayIso() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  // --------------- config ---------------
  function getSupaConfig() {
    var url = (window.GK_SUPABASE_URL || '').trim();
    var anon = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();
    return { url: url, anon: anon };
  }

  // --------------- marker (support BOTH ids) ---------------
  function getLoginMarker() {
    var m = document.getElementById('gk-login-marker') || document.getElementById('mybag-login-marker');
    if (!m) return { loggedIn: false, firstname: '', email: '' };
    var ds = m.dataset || {};
    var li = String(ds.loggedIn || ds.loggedin || '0');
    return {
      loggedIn: li === '1',
      firstname: ds.firstname || '',
      email: ds.email || ''
    };
  }

  // --------------- root ---------------
  function ensureRoot() {
    var root = document.getElementById('min-bagg-root');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'min-bagg-root';

    var host = document.getElementById('page-content-area')
      || document.querySelector('.col-12.py-4')
      || document.body;

    host.appendChild(root);
    return root;
  }

  // --------------- styles ---------------
  function injectStyles() {
    if (document.getElementById('minbagg-style')) return;

    var css =
      '.minbagg-app{max-width:1100px;margin:0 auto;padding:14px;color:#e8eef6;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}' +
      '.minbagg-banner{margin:10px 0 14px 0;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);font-size:13px;line-height:1.35}' +
      '.minbagg-h1{font-size:22px;margin:6px 0 2px 0}' +
      '.minbagg-muted{opacity:.85;font-size:13px;line-height:1.35}' +
      '.minbagg-card{border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.12);padding:12px}' +
      '.minbagg-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
      '.minbagg-btn{cursor:pointer;user-select:none;border-radius:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-size:14px}' +
      '.minbagg-btn:hover{background:rgba(255,255,255,.10)}' +
      '.minbagg-btn.primary{border-color:rgba(44,174,96,.55);background:rgba(44,174,96,.14)}' +
      '.minbagg-btn.primary:hover{background:rgba(44,174,96,.20)}' +
      '.minbagg-btn.ghost{background:transparent}' +

      '.minbagg-section{margin-top:12px}' +

      '.minbagg-baghead{display:flex;gap:12px;align-items:center;flex-wrap:wrap}' +
      '.minbagg-bagimg{width:68px;height:68px;border-radius:16px;object-fit:cover;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10)}' +
      '.minbagg-bagtitle{font-size:18px;font-weight:900;margin:0}' +

      '.minbagg-boxgrid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px}' +
      '@media(min-width:900px){.minbagg-boxgrid{grid-template-columns:1fr 1fr}}' +
      '.minbagg-slot h3{margin:0 0 8px 0;font-size:14px}' +

      // Compact disc cards
      '.minbagg-disc{display:flex;gap:10px;align-items:flex-start;padding:8px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.14);position:relative}' +
      '.minbagg-disc img{width:44px;height:44px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.08)}' +
      '.minbagg-disc .meta{flex:1 1 auto;min-width:180px}' +
      '.minbagg-disc .name{font-weight:800;line-height:1.2}' +
      '.minbagg-disc .sub{opacity:.8;font-size:12px;margin-top:2px}' +
      '.minbagg-disc textarea{width:100%;min-height:46px;resize:vertical;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;padding:8px 10px;outline:none;margin-top:8px;display:none}' +
      '.minbagg-note-toggle{margin-top:8px;display:inline-flex;gap:8px;align-items:center;font-size:12px;opacity:.92;cursor:pointer;user-select:none}' +
      '.minbagg-note-toggle:hover{text-decoration:underline}' +

      // color chip (existing disc)
      '.minbagg-colorchip{width:18px;height:18px;border-radius:999px;border:2px solid rgba(255,255,255,.20);cursor:pointer}' +
      '.minbagg-colorchip:hover{border-color:#fff}' +
      '.minbagg-chipwrap{display:flex;gap:8px;align-items:center;justify-content:flex-end}' +
      '.minbagg-pop{position:absolute;top:44px;right:10px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#0f1114;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:10px;display:none;z-index:50}' +
      '.minbagg-pop.on{display:block}' +
      '.minbagg-palette{display:flex;gap:8px;flex-wrap:wrap;max-width:210px}' +
      '.minbagg-color{width:24px;height:24px;border-radius:999px;border:2px solid rgba(255,255,255,.18);cursor:pointer}' +
      '.minbagg-color.on{border-color:#fff;box-shadow:0 0 0 2px rgba(44,174,96,.35)}' +

      // top list
      '.minbagg-top4{display:grid;grid-template-columns:1fr;gap:10px}' +
      '@media(min-width:700px){.minbagg-top4{grid-template-columns:1fr 1fr}}' +
      '.minbagg-topitem{display:flex;gap:8px;align-items:center;padding:8px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.14)}' +
      '.minbagg-topitem img{width:34px;height:34px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.08)}' +
      '.minbagg-topitem a{color:inherit;text-decoration:none}' +
      '.minbagg-topitem a:hover{text-decoration:underline}' +
      '.minbagg-pill{font-size:12px;opacity:.85;margin-left:auto}' +

      // collapsible
      '.minbagg-toggle{display:flex;align-items:center;justify-content:space-between;cursor:pointer}' +
      '.minbagg-toggle strong{font-size:14px}' +
      '.minbagg-panel{margin-top:10px;display:none}' +
      '.minbagg-panel.on{display:block}' +

      // flight list
      '.minbagg-table{width:100%;border-collapse:collapse;font-size:13px}' +
      '.minbagg-table th,.minbagg-table td{border-bottom:1px solid rgba(255,255,255,.08);padding:8px 6px;text-align:left;vertical-align:top}' +
      '.minbagg-warn{margin-top:10px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,165,0,.08)}' +

      // map
      '.minbagg-map{border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.14);padding:12px;overflow:hidden}' +
      '.minbagg-mapgrid{position:relative;height:300px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.12))}' +
      '.minbagg-dot{position:absolute;transform:translate(-50%,-50%);min-width:22px;height:22px;border-radius:999px;border:2px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;cursor:pointer}' +
      '.minbagg-dot .cnt{position:absolute;top:-8px;right:-8px;min-width:18px;height:18px;border-radius:999px;background:#111827;border:1px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:11px}' +
      '.minbagg-maplegend{display:flex;justify-content:space-between;opacity:.8;font-size:12px;margin-top:10px}' +

      // modal
      '.minbagg-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);display:none;align-items:center;justify-content:center;padding:16px;z-index:9999}' +
      '.minbagg-modal.on{display:flex}' +
      '.minbagg-dialog{width:min(940px,100%);border-radius:18px;border:1px solid rgba(255,255,255,.14);background:#0f1114;color:#fff;box-shadow:0 14px 60px rgba(0,0,0,.55)}' +
      '.minbagg-dialog .hd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}' +
      '.minbagg-dialog .bd{padding:14px}' +
      '.minbagg-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 12px 0}' +
      '.minbagg-tab{padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);cursor:pointer;font-size:13px}' +
      '.minbagg-tab.on{border-color:rgba(44,174,96,.55);background:rgba(44,174,96,.14)}' +
      '.minbagg-inp{width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none}' +
      '.minbagg-select{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none}' +
      '.minbagg-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;margin-top:10px}' +
      '.minbagg-res{border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.14);padding:10px;display:flex;gap:10px;align-items:center}' +
      '.minbagg-res img{width:44px;height:44px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.08)}' +
      '.minbagg-res .t{font-weight:800;font-size:13px;line-height:1.25}' +
      '.minbagg-res .a{margin-top:6px}' +
      '.minbagg-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}' +
      '@media(max-width:520px){.minbagg-grid2{grid-template-columns:1fr}}';

    var st = document.createElement('style');
    st.id = 'minbagg-style';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  // --------------- Supabase client (singleton) ---------------
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    return window.__MINBAGG_SUPA__;
  }

  // --------------- Supabase DB ---------------
  async function dbLoadBag(supa, email) {
    if (!email) return null;
    var res = await supa.from('mybag_bags').select('bag').eq('email', email).maybeSingle();
    if (res && res.error) throw res.error;
    return (res && res.data) ? (res.data.bag || null) : null;
  }

  async function dbSaveBag(supa, email, bagObj) {
    if (!email) throw new Error('Mangler e-post på Supabase-bruker.');
    var payload = { email: email, bag: bagObj || {}, updated_at: new Date().toISOString() };
    var res = await supa.from('mybag_bags').upsert(payload, { onConflict: 'email' }).select('email').maybeSingle();
    if (res && res.error) throw res.error;
    return true;
  }

  async function fetchTop3ByType(supa, limitPerGroup) {
    limitPerGroup = limitPerGroup || 3;
    var r = await supa.rpc('get_mybag_top3', { limit_per_group: limitPerGroup });
    if (r && r.error) throw r.error;
    return (r && r.data) ? r.data : [];
  }

  async function rpcIncrementPopular(supa, type, name, url, image) {
    try {
      var r = await supa.rpc('increment_popular_disc', {
        p_type: type,
        p_name: name,
        p_url: url || null,
        p_image: image || null
      });
      if (r && r.error) throw r.error;
      return true;
    } catch (e) {
      log('[MINBAGG] increment_popular_disc failed (ignored)', e);
      return false;
    }
  }

  // --------------- Quickbutik search ---------------
  function pickProduct(p) {
    var name = p.name || p.title || p.product_name || p.producttitle || p.productTitle || p.heading || '';
    var url  = p.url || p.producturl || p.link || p.href || p.uri || '';
    var img  = p.firstimage || p.image || p.first_image || p.firstImage || '';
    var flight = p.datafield_1 || (p.product && p.product.datafield_1) || '';
    return {
      name: norm(name).trim(),
      url: norm(url).trim(),
      image: normImg(norm(img)),
      flightText: norm(flight).trim()
    };
  }

  async function qbSearch(query) {
    var q = norm(query).trim();
    if (!q) return [];
    var url = '/shop/search?s=' + encodeURIComponent(q) + '&out=json&limit=12';
    var r = await fetch(url, { credentials: 'same-origin' });
    var t = await r.text();
    var j;
    try { j = JSON.parse(t); } catch (_) { return []; }
    var arr = (j && j.searchresults) ? j.searchresults : [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var prod = arr[i] && (arr[i].product || arr[i]);
      if (!prod) continue;
      var pp = pickProduct(prod);
      if (!pp.name) continue;
      out.push(pp);
    }
    return out;
  }

  // --------------- model ---------------
  var TYPES = [
    { key: 'putter', label: 'Putter' },
    { key: 'midrange', label: 'Midrange' },
    { key: 'fairway', label: 'Fairway Driver' },
    { key: 'distance', label: 'Distance Driver' }
  ];

  function emptyModel() {
    return {
      bagInfo: { name: '', image: '' },          // “egen bagg” i bakgrunnen (vises øverst, redigeres via knapp)
      discs: { putter: [], midrange: [], fairway: [], distance: [] },
      profile: { level: '', hand: '', style: '', terrain: '' }
    };
  }

  function normalizeModel(raw) {
    if (!raw) return emptyModel();

    if (raw && typeof raw === 'object' && raw.discs && raw.bagInfo) {
      var m = emptyModel();
      m.bagInfo = Object.assign(m.bagInfo, raw.bagInfo || {});
      m.discs = Object.assign(m.discs, raw.discs || {});
      m.profile = Object.assign(m.profile, raw.profile || {});
      TYPES.forEach(function (t) { if (!Array.isArray(m.discs[t.key])) m.discs[t.key] = []; });
      return m;
    }

    if (Array.isArray(raw)) {
      var mm = emptyModel();
      mm.discs.fairway = raw.map(function (x) {
        return {
          id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
          name: x.name || '',
          url: x.url || '',
          image: x.image || '',
          flightText: x.flightText || '',
          addedAt: x.addedAt || todayIso(),
          color: x.color || '',
          note: x.note || ''
        };
      });
      return mm;
    }

    return emptyModel();
  }

  function palette() {
    return [
      '#ffffff', '#111827', '#ef4444', '#f97316', '#facc15',
      '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'
    ];
  }

  // --------------- flight parse + map ---------------
  function numLoose(s) {
    // allow -, , and .
    s = norm(s).trim();
    if (!s) return NaN;
    s = s.replace(',', '.');
    // keep only digits, dot, minus
    s = s.replace(/[^0-9\.\-]/g, '');
    return Number(s);
  }

  function parseFlight(f) {
    f = norm(f).trim().replace(/[\/,]+/g, ' ');
    var parts = f.split(/\s+/).filter(Boolean);
    if (parts.length < 4) return null;
    var sp = numLoose(parts[0]), gl = numLoose(parts[1]), tu = numLoose(parts[2]), fa = numLoose(parts[3]);
    if ([sp, gl, tu, fa].some(function (x) { return Number.isNaN(x); })) return null;
    return { speed: sp, glide: gl, turn: tu, fade: fa };
  }

  function guessTypeFromFlightText(flightText) {
    var f = parseFlight(flightText);
    if (!f) return '';
    var s = f.speed;
    if (s <= 3) return 'putter';
    if (s <= 5) return 'midrange';
    if (s <= 8) return 'fairway';
    return 'distance';
  }

  function mapXY(f) {
    var x = 50 + (-f.turn * 12) - (f.fade * 6);
    var y = 55 + (f.speed - 7) * 4;
    x = Math.max(8, Math.min(92, x));
    y = Math.max(10, Math.min(90, y));
    return { x: x, y: y };
  }

  // --------------- UI building blocks ---------------
  function bannerHtml() {
    return '<strong>🚧 Under konstruksjon</strong> Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.';
  }

  function buildModal() {
    var modal = el('div', 'minbagg-modal');
    modal.id = 'minbagg-modal';

    var dialog = el('div', 'minbagg-dialog');

    var hd = el('div', 'hd');
    var title = el('div', '', 'Legg til');
    var close = el('button', 'minbagg-btn', 'Lukk');
    hd.appendChild(title);
    hd.appendChild(close);

    var bd = el('div', 'bd');

    dialog.appendChild(hd);
    dialog.appendChild(bd);
    modal.appendChild(dialog);

    close.addEventListener('click', function () { modal.classList.remove('on'); });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('on');
    });

    document.body.appendChild(modal);

    return { modal: modal, body: bd, setTitle: function (t) { title.textContent = t; } };
  }

  function mkToggleCard(titleText, defaultOpen) {
    var card = el('div', 'minbagg-card');
    var top = el('div', 'minbagg-toggle');
    var left = el('div', '');
    left.appendChild(el('strong', '', titleText));
    var right = el('div', 'minbagg-muted', defaultOpen ? 'Skjul' : 'Vis');
    top.appendChild(left);
    top.appendChild(right);

    var panel = el('div', 'minbagg-panel' + (defaultOpen ? ' on' : ''));

    top.addEventListener('click', function () {
      var on = panel.classList.toggle('on');
      right.textContent = on ? 'Skjul' : 'Vis';
    });

    card.appendChild(top);
    card.appendChild(panel);
    return { card: card, panel: panel };
  }

  // --------------- Guest view ---------------
  function renderGuest(root, topRows) {
    clear(root);

    var app = el('div', 'minbagg-app');
    var banner = el('div', 'minbagg-banner');
    banner.innerHTML = bannerHtml();
    app.appendChild(banner);

    app.appendChild(el('div', 'minbagg-h1', 'Min Bagg'));
    app.appendChild(el('div', 'minbagg-muted', 'Du må være innlogget i nettbutikken for å lagre og bygge baggen din. Du kan likevel se Topp 3 globalt uten innlogging.'));

    var cta = el('div', 'minbagg-card');
    var row = el('div', 'minbagg-row');
    var a1 = el('a', 'minbagg-btn primary', 'Logg inn'); a1.href = '/customer/login';
    var a2 = el('a', 'minbagg-btn', 'Opprett konto'); a2.href = '/customer/register';
    row.appendChild(a1); row.appendChild(a2);
    cta.appendChild(row);
    app.appendChild(cta);

    app.appendChild(buildTop3Block(topRows));

    root.appendChild(app);
  }

  function buildTop3Block(topRows) {
    var wrap = el('div', 'minbagg-card minbagg-section');
    wrap.appendChild(el('div', 'minbagg-h1', 'Topp 3 globalt'));

    var grid = el('div', 'minbagg-top4');
    wrap.appendChild(grid);

    var by = { putter: [], midrange: [], fairway: [], distance: [] };
    (topRows || []).forEach(function (r) {
      if (!r) return;
      var t = (r.type || '').toLowerCase();
      if (by[t]) by[t].push(r);
    });

    TYPES.forEach(function (t) {
      var box = el('div', 'minbagg-card');
      box.appendChild(el('h3', '', t.label));

      var arr = by[t.key] || [];
      if (!arr.length) {
        box.appendChild(el('div', 'minbagg-muted', 'Ingen data ennå.'));
      } else {
        for (var i = 0; i < Math.min(3, arr.length); i++) {
          var it = arr[i] || {};
          var name = it.name || it.disc || 'Ukjent';
          var img = normImg(it.image_url || '');
          var url = it.product_url || '';
          var picks = (it.picks != null ? it.picks : 0);

          var row2 = el('div', 'minbagg-topitem');
          var im = document.createElement('img');
          im.src = img || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
          im.alt = '';
          row2.appendChild(im);

          var title = el('div', '');
          if (url) {
            var link = document.createElement('a');
            link.href = url;
            link.textContent = name;
            title.appendChild(link);
          } else {
            title.textContent = name;
          }
          row2.appendChild(title);

          row2.appendChild(el('div', 'minbagg-pill', String(picks)));
          box.appendChild(row2);
        }
      }

      grid.appendChild(box);
    });

    return wrap;
  }

  // --------------- Connect view ---------------
  function renderConnectView(root, marker, supa) {
    clear(root);

    var app = el('div', 'minbagg-app');
    var banner = el('div', 'minbagg-banner');
    banner.innerHTML = bannerHtml();
    app.appendChild(banner);

    app.appendChild(el('div', 'minbagg-h1', 'Min Bagg'));
    var card = el('div', 'minbagg-card');
    card.appendChild(el('div', 'minbagg-muted',
      'Du er innlogget i nettbutikken. For å lagre baggen din på tvers av enheter kobler vi deg til lagring via en engangslink på e-post (Supabase).'));

    var row = el('div', 'minbagg-row');
    row.style.marginTop = '12px';

    var inp = document.createElement('input');
    inp.className = 'minbagg-inp';
    inp.type = 'email';
    inp.placeholder = 'E-post for engangslink';
    inp.value = (marker.email || '').trim();
    inp.style.maxWidth = '420px';
    row.appendChild(inp);

    var btn = el('button', 'minbagg-btn primary', 'Send engangslink');
    row.appendChild(btn);

    var msg = el('div', 'minbagg-muted');
    msg.style.marginTop = '10px';
    msg.textContent = 'Tips: bruk samme e-post som kontoen din i nettbutikken.';

    btn.addEventListener('click', async function () {
      var e = (inp.value || '').trim();
      if (!e || e.indexOf('@') === -1) { msg.textContent = 'Skriv inn en gyldig e-post først.'; return; }

      btn.disabled = true;
      msg.textContent = 'Sender engangslink…';
      try {
        var redirectTo = location.origin + location.pathname;
        var res = await supa.auth.signInWithOtp({ email: e, options: { emailRedirectTo: redirectTo } });
        if (res && res.error) throw res.error;
        msg.textContent = 'Sjekk e-posten din og trykk på linken. Du blir sendt tilbake hit.';
      } catch (err) {
        msg.textContent = 'Kunne ikke sende engangslink: ' + (err && err.message ? err.message : String(err));
      } finally {
        btn.disabled = false;
      }
    });

    card.appendChild(row);
    card.appendChild(msg);

    app.appendChild(card);
    root.appendChild(app);
  }

  // --------------- Logged app ---------------
  function renderLogged(root, marker, supa, user, topRows) {
    clear(root);

    var state = {
      email: (user && user.email) ? user.email : '',
      firstname: marker.firstname || 'Min',
      model: emptyModel(),
      modal: null,
      modalBody: null,
      modalSetTitle: null,
      saving: false,
      topRows: topRows || []
    };

    var scheduleSave = debounce(async function () {
      if (!state.email) return;
      if (state.saving) return;
      state.saving = true;
      try { await dbSaveBag(supa, state.email, state.model); }
      catch (e) { log('[MINBAGG] save failed', e); }
      finally { state.saving = false; }
    }, 600);

    function openModal(title) {
      if (!state.modal) {
        var m = buildModal();
        state.modal = m.modal;
        state.modalBody = m.body;
        state.modalSetTitle = m.setTitle;
      }
      state.modalSetTitle(title || 'Legg til');
      state.modal.classList.add('on');
    }

    async function refreshTop() {
      try {
        state.topRows = await fetchTop3ByType(supa, 3);
        rerender();
      } catch (e) {
        log('[MINBAGG] refreshTop failed', e);
      }
    }

    function bagAllDiscs() {
      var out = [];
      TYPES.forEach(function (t) {
        var arr = state.model.discs[t.key] || [];
        arr.forEach(function (d) { out.push({ type: t.key, disc: d }); });
      });
      return out;
    }

    function buildHeader(app) {
      var banner = el('div', 'minbagg-banner');
      banner.innerHTML = bannerHtml();
      app.appendChild(banner);

      var head = el('div', 'minbagg-baghead');

      var img = document.createElement('img');
      img.className = 'minbagg-bagimg';
      img.src = normImg(state.model.bagInfo.image) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      img.alt = '';
      head.appendChild(img);

      var col = el('div', '');
      col.appendChild(el('div', 'minbagg-bagtitle', (state.firstname || 'Min') + ' sin bagg'));
      col.appendChild(el('div', 'minbagg-muted', 'Hei ' + (marker.firstname || 'der') + ' 👋 Baggen din lagres på kontoen din.'));
      head.appendChild(col);

      var actions = el('div', 'minbagg-row');
      actions.style.marginLeft = 'auto';

      var btnBag = el('button', 'minbagg-btn ghost', 'Legg til bagg');
      btnBag.addEventListener('click', function () {
        openModal('Legg til bagg');
        renderModalBag();
      });

      var btnAdd = el('button', 'minbagg-btn primary', 'Legg til disk');
      btnAdd.addEventListener('click', function () {
        openModal('Legg til disk');
        renderModalDisc();
      });

      actions.appendChild(btnBag);
      actions.appendChild(btnAdd);
      head.appendChild(actions);

      app.appendChild(head);
    }

    function renderBagBoxes(parent) {
      var grid = el('div', 'minbagg-boxgrid minbagg-section');

      TYPES.forEach(function (t) {
        var slot = el('div', 'minbagg-card minbagg-slot');
        slot.appendChild(el('h3', '', t.label));

        var list = state.model.discs[t.key] || [];
        if (!list.length) {
          slot.appendChild(el('div', 'minbagg-muted', 'Tomt. Trykk “Legg til disk” for å legge inn disker.'));
        } else {
          list.forEach(function (it, idx) {
            var row = el('div', 'minbagg-disc');
            if (it.color) row.style.borderColor = it.color;

            var im = document.createElement('img');
            im.src = normImg(it.image) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
            im.alt = '';
            row.appendChild(im);

            var meta = el('div', 'meta');

            var name = el('div', 'name');
            if (it.url) {
              var a = document.createElement('a');
              a.href = it.url;
              a.textContent = it.name || '';
              a.style.color = 'inherit';
              a.style.textDecoration = 'none';
              a.addEventListener('mouseenter', function () { a.style.textDecoration = 'underline'; });
              a.addEventListener('mouseleave', function () { a.style.textDecoration = 'none'; });
              name.appendChild(a);
            } else {
              name.textContent = it.name || '';
            }
            meta.appendChild(name);

            meta.appendChild(el('div', 'sub',
              (it.flightText ? ('Flight: ' + it.flightText + ' • ') : '') + 'Lagt til: ' + (it.addedAt || '')
            ));

            var noteToggle = el('div', 'minbagg-note-toggle', it.note ? 'Kommentar (åpen)' : 'Kommentar');
            var ta = document.createElement('textarea');
            ta.placeholder = 'Kommentar (valgfritt)…';
            ta.value = it.note || '';

            function setNoteOpen(open) {
              ta.style.display = open ? 'block' : 'none';
              noteToggle.textContent = open ? 'Skjul kommentar' : (it.note ? 'Kommentar (lagret)' : 'Kommentar');
            }

            setNoteOpen(false);

            noteToggle.addEventListener('click', function (e) {
              e.stopPropagation();
              setNoteOpen(ta.style.display === 'none');
            });

            ta.addEventListener('input', function () {
              it.note = ta.value;
              noteToggle.textContent = 'Skjul kommentar';
              scheduleSave();
            });

            meta.appendChild(noteToggle);
            meta.appendChild(ta);

            row.appendChild(meta);

            // right controls: color chip + delete
            var right = el('div', '');
            right.style.display = 'flex';
            right.style.flexDirection = 'column';
            right.style.gap = '8px';
            right.style.alignItems = 'flex-end';

            var chipWrap = el('div', 'minbagg-chipwrap');
            var chip = el('div', 'minbagg-colorchip');
            chip.style.background = it.color || 'rgba(255,255,255,.18)';
            chip.title = 'Endre farge';
            chipWrap.appendChild(chip);

            var pop = el('div', 'minbagg-pop');
            var pal = el('div', 'minbagg-palette');
            palette().forEach(function (c) {
              var dot = el('div', 'minbagg-color' + ((it.color || '').toLowerCase() === c.toLowerCase() ? ' on' : ''));
              dot.style.background = c;
              dot.addEventListener('click', function (e) {
                e.stopPropagation();
                it.color = c;
                chip.style.background = c;
                pop.classList.remove('on');
                scheduleSave();
                rerender();
              });
              pal.appendChild(dot);
            });
            pop.appendChild(pal);
            row.appendChild(pop);

            chip.addEventListener('click', function (e) {
              e.stopPropagation();
              pop.classList.toggle('on');
            });

            row.addEventListener('click', function () { pop.classList.remove('on'); });

            right.appendChild(chipWrap);

            var btnDel = el('button', 'minbagg-btn', 'Fjern');
            btnDel.addEventListener('click', function (e) {
              e.stopPropagation();
              state.model.discs[t.key].splice(idx, 1);
              scheduleSave();
              rerender();
            });
            right.appendChild(btnDel);

            row.appendChild(right);
            slot.appendChild(row);
          });
        }

        grid.appendChild(slot);
      });

      parent.appendChild(grid);
    }

    function renderFlightList(parent) {
      var t = mkToggleCard('Flight lista', true);
      var panel = t.panel;

      var all = bagAllDiscs()
        .map(function (x) {
          var f = parseFlight(x.disc.flightText || '');
          return { type: x.type, name: x.disc.name, flight: x.disc.flightText || '', parsed: f };
        })
        .filter(function (x) { return x.name; });

      if (!all.length) {
        panel.appendChild(el('div', 'minbagg-muted', 'Legg til noen disker først, så dukker flight-lista opp her.'));
        parent.appendChild(t.card);
        return;
      }

      // sort by speed desc (unknown speed -> bottom)
      all.sort(function (a, b) {
        var as = a.parsed ? a.parsed.speed : -9999;
        var bs = b.parsed ? b.parsed.speed : -9999;
        return bs - as;
      });

      // detect duplicates by exact flight string
      var dup = {};
      all.forEach(function (x) {
        var k = (x.flight || '').trim();
        if (!k) return;
        dup[k] = (dup[k] || 0) + 1;
      });

      var table = document.createElement('table');
      table.className = 'minbagg-table';
      table.innerHTML = '<thead><tr><th>Disk</th><th>Type</th><th>Flight</th></tr></thead>';
      var tb = document.createElement('tbody');

      all.forEach(function (x) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td'); td1.textContent = x.name;
        var td2 = document.createElement('td'); td2.textContent = x.type;
        var td3 = document.createElement('td'); td3.textContent = x.flight || '—';
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
        tb.appendChild(tr);
      });

      table.appendChild(tb);
      panel.appendChild(table);

      var dups = Object.keys(dup).filter(function (k) { return k && dup[k] > 1; });
      if (dups.length) {
        var warn = el('div', 'minbagg-warn');
        warn.innerHTML = '<strong>Obs:</strong> Du har flere disker med helt lik flight: ' +
          dups.slice(0, 6).map(function (k) { return '<span style="opacity:.9">(' + k + ') x' + dup[k] + '</span>'; }).join(' ') +
          (dups.length > 6 ? ' …' : '');
        panel.appendChild(warn);
      }

      parent.appendChild(t.card);
    }

    function renderFlightMap(parent) {
      var t = mkToggleCard('Flight kart', false);
      var panel = t.panel;

      var all = bagAllDiscs().map(function (x) {
        var f = parseFlight(x.disc.flightText || '');
        if (!f) return null;
        var pos = mapXY(f);
        return { name: x.disc.name, type: x.type, color: x.disc.color || '', x: pos.x, y: pos.y };
      }).filter(Boolean);

      if (!all.length) {
        panel.appendChild(el('div', 'minbagg-muted', 'Legg til disker med flight (Speed Glide Turn Fade) for å se kartet.'));
        parent.appendChild(t.card);
        return;
      }

      var buckets = {};
      all.forEach(function (d) {
        var k = Math.round(d.x) + ':' + Math.round(d.y);
        if (!buckets[k]) buckets[k] = [];
        buckets[k].push(d);
      });

      var wrap = el('div', 'minbagg-map');
      var grid = el('div', 'minbagg-mapgrid');

      Object.keys(buckets).forEach(function (k) {
        var arr = buckets[k];
        var d = arr[0];

        var dot = el('div', 'minbagg-dot');
        dot.style.left = d.x + '%';
        dot.style.top = d.y + '%';
        dot.style.background = d.color || 'rgba(255,255,255,.12)';
        dot.title = (arr.length > 1) ? (arr.length + ' disker her') : (d.name + ' (' + d.type + ')');
        dot.textContent = arr.length > 1 ? '' : (d.name || '').slice(0, 1).toUpperCase();

        if (arr.length > 1) {
          var cnt = el('div', 'cnt', String(arr.length));
          dot.appendChild(cnt);
        }

        dot.addEventListener('click', function (e) {
          e.stopPropagation();
          var names = arr.map(function (x) { return x.name; }).filter(Boolean);
          alert(names.join('\n'));
        });

        grid.appendChild(dot);
      });

      wrap.appendChild(grid);

      var leg = el('div', 'minbagg-maplegend');
      leg.innerHTML = '<div>Overstabil ⟵</div><div>⟶ Understabil</div>';
      wrap.appendChild(leg);

      panel.appendChild(wrap);
      parent.appendChild(t.card);
    }

    function renderProfile(parent) {
      var t = mkToggleCard('Spørsmål (for anbefalinger)', true);
      var panel = t.panel;

      panel.appendChild(el('div', 'minbagg-muted', 'Svarene lagres og kan endres senere.'));

      function row(label, opts, key) {
        var w = el('div', 'minbagg-section');
        w.appendChild(el('div', 'minbagg-muted', label));

        var sel = document.createElement('select');
        sel.className = 'minbagg-select';
        var opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = 'Velg…';
        sel.appendChild(opt0);
        opts.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o; op.textContent = o;
          sel.appendChild(op);
        });
        sel.value = state.model.profile[key] || '';

        sel.addEventListener('change', function () {
          state.model.profile[key] = sel.value;
          scheduleSave();
          rerender();
        });

        w.appendChild(sel);
        return w;
      }

      panel.appendChild(row('Nivå', ['Nybegynner', 'Amatør', 'Viderekommen', 'Proff'], 'level'));
      panel.appendChild(row('Hånd', ['Høyre', 'Venstre'], 'hand'));
      panel.appendChild(row('Kast', ['Backhand', 'Forehand', 'Begge'], 'style'));
      panel.appendChild(row('Banetype', ['Skog', 'Åpent', 'Blandet'], 'terrain'));

      parent.appendChild(t.card);
    }

    function renderRecos(parent) {
      var t = mkToggleCard('Forslag til nye disker', true);
      var panel = t.panel;

      function countType(k) { return (state.model.discs[k] || []).length; }
      var missing = TYPES.filter(function (x) { return countType(x.key) === 0; });

      var card = el('div', 'minbagg-card');
      card.appendChild(el('div', 'minbagg-muted',
        'Første versjon: enkle forslag basert på hva som mangler i baggen + svarene dine. (Vi bygger “evig rullering” senere.)'
      ));

      if (!missing.length) {
        card.appendChild(el('div', 'minbagg-muted', 'Ser bra ut – du har minst én disc i hver kategori 👍'));
      } else {
        card.appendChild(el('div', 'minbagg-muted', 'Du mangler: ' + missing.map(function (x) { return x.label; }).join(', ')));
      }

      var row = el('div', 'minbagg-row');
      row.style.marginTop = '10px';

      var btn = el('button', 'minbagg-btn primary', 'Gi meg 2 forslag (placeholder)');
      var msg = el('div', 'minbagg-muted');
      msg.style.marginTop = '10px';

      btn.addEventListener('click', function () {
        msg.textContent =
          'Forslag 1: (kommer) • Forslag 2: (kommer). Neste steg er å hente ut aktuelle produkter fra GolfKongen basert på dine svar og bag-innhold.';
      });

      row.appendChild(btn);
      panel.appendChild(card);
      panel.appendChild(row);
      panel.appendChild(msg);

      parent.appendChild(t.card);
    }

    // --------------- MODAL: bag (search or manual) ---------------
    function renderModalBag() {
      clear(state.modalBody);

      var tabs = el('div', 'minbagg-tabs');
      var tabSearch = el('div', 'minbagg-tab on', 'Søk i GolfKongen');
      var tabManual = el('div', 'minbagg-tab', 'Legg til egen');
      tabs.appendChild(tabSearch);
      tabs.appendChild(tabManual);
      state.modalBody.appendChild(tabs);

      var content = el('div', '');
      content.style.marginTop = '12px';
      state.modalBody.appendChild(content);

      var mode = 'search';
      function setMode(m) {
        mode = m;
        tabSearch.classList.toggle('on', mode === 'search');
        tabManual.classList.toggle('on', mode === 'manual');
        renderMode();
      }
      tabSearch.addEventListener('click', function () { setMode('search'); });
      tabManual.addEventListener('click', function () { setMode('manual'); });

      var doSuggest = debounce(async function (q, box) {
        clear(box);
        if (!q || q.trim().length < 2) return;

        box.appendChild(el('div', 'minbagg-muted', 'Laster…'));
        try {
          var items = await qbSearch(q);
          clear(box);

          if (!items.length) {
            box.appendChild(el('div', 'minbagg-muted', 'Ingen treff.'));
            return;
          }

          items.forEach(function (p) {
            var card = el('div', 'minbagg-res');
            var im = document.createElement('img');
            im.src = p.image || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
            im.alt = '';
            card.appendChild(im);

            var mid = el('div', '');
            mid.appendChild(el('div', 't', p.name));

            var actions = el('div', 'a');
            var add = el('button', 'minbagg-btn primary', 'Velg');
            add.addEventListener('click', function () {
              state.model.bagInfo.name = (p.name || '').trim();
              state.model.bagInfo.image = normImg((p.image || '').trim());
              scheduleSave();
              try { state.modal.classList.remove('on'); } catch (_) {}
              rerender();
            });
            actions.appendChild(add);
            mid.appendChild(actions);

            card.appendChild(mid);
            box.appendChild(card);
          });
        } catch (e) {
          clear(box);
          box.appendChild(el('div', 'minbagg-muted', 'Kunne ikke søke akkurat nå.'));
          log('[MINBAGG] bag qbSearch failed', e);
        }
      }, 250);

      function renderMode() {
        clear(content);

        if (mode === 'search') {
          var inp = document.createElement('input');
          inp.className = 'minbagg-inp';
          inp.placeholder = 'Søk etter bagg (f.eks. “bag”, “sekk”, “backpack”)…';

          var results = el('div', 'minbagg-results');
          content.appendChild(inp);
          content.appendChild(results);

          inp.addEventListener('input', function () {
            doSuggest(inp.value || '', results);
          });

          // preload suggestions if we have a name
          if (state.model.bagInfo && state.model.bagInfo.name) {
            inp.value = state.model.bagInfo.name;
            doSuggest(inp.value, results);
          }

        } else {
          var info = el('div', 'minbagg-muted', 'Legg inn bagg-navn + bilde (kun visning øverst).');
          content.appendChild(info);

          var inpName = document.createElement('input');
          inpName.className = 'minbagg-inp';
          inpName.placeholder = 'Bagg-navn (valgfritt)';
          inpName.value = state.model.bagInfo.name || '';
          inpName.style.marginTop = '10px';

          var inpImg = document.createElement('input');
          inpImg.className = 'minbagg-inp';
          inpImg.placeholder = 'Bilde-URL (valgfritt)';
          inpImg.value = state.model.bagInfo.image || '';
          inpImg.style.marginTop = '10px';

          content.appendChild(inpName);
          content.appendChild(inpImg);

          var btn = el('button', 'minbagg-btn primary', 'Lagre bagg');
          btn.style.marginTop = '10px';
          content.appendChild(btn);

          var msg = el('div', 'minbagg-muted');
          msg.style.marginTop = '10px';
          content.appendChild(msg);

          btn.addEventListener('click', function () {
            state.model.bagInfo.name = (inpName.value || '').trim();
            state.model.bagInfo.image = normImg((inpImg.value || '').trim());
            scheduleSave();
            msg.textContent = 'Lagret ✅';
            rerender();
          });
        }
      }

      renderMode();
    }

    // --------------- MODAL: add disc (autosøk + autokategori + 4 flight inputs manual) ---------------
    function renderModalDisc() {
      clear(state.modalBody);

      var tabs = el('div', 'minbagg-tabs');
      var tabSearch = el('div', 'minbagg-tab on', 'Søk i GolfKongen');
      var tabManual = el('div', 'minbagg-tab', 'Legg til egen');
      tabs.appendChild(tabSearch);
      tabs.appendChild(tabManual);
      state.modalBody.appendChild(tabs);

      var controls = el('div', 'minbagg-row');
      controls.style.marginTop = '6px';

      // type dropdown (can be forced if auto missing)
      var typeSel = document.createElement('select');
      typeSel.className = 'minbagg-select';

      var op0 = document.createElement('option');
      op0.value = '';
      op0.textContent = 'Velg kategori…';
      typeSel.appendChild(op0);

      TYPES.forEach(function (t) {
        var op = document.createElement('option');
        op.value = t.key; op.textContent = t.label;
        typeSel.appendChild(op);
      });

      controls.appendChild(el('div', 'minbagg-muted', 'Kategori:'));
      controls.appendChild(typeSel);

      // color palette
      controls.appendChild(el('div', 'minbagg-muted', 'Farge:'));
      var palWrap = el('div', 'minbagg-row');
      palWrap.style.gap = '8px';

      var chosen = palette()[0];
      function mkDot(c, on) {
        var d = el('div', 'minbagg-color' + (on ? ' on' : ''));
        d.style.background = c;
        d.addEventListener('click', function () {
          chosen = c;
          Array.prototype.slice.call(palWrap.children).forEach(function (x) { x.classList.remove('on'); });
          d.classList.add('on');
        });
        return d;
      }
      palette().forEach(function (c, i) { palWrap.appendChild(mkDot(c, i === 0)); });

      controls.appendChild(palWrap);
      state.modalBody.appendChild(controls);

      var content = el('div', '');
      content.style.marginTop = '12px';
      state.modalBody.appendChild(content);

      var mode = 'search';
      function setMode(m) {
        mode = m;
        tabSearch.classList.toggle('on', mode === 'search');
        tabManual.classList.toggle('on', mode === 'manual');
        renderMode();
      }
      tabSearch.addEventListener('click', function () { setMode('search'); });
      tabManual.addEventListener('click', function () { setMode('manual'); });

      async function addDisc(data) {
        var autoType = guessTypeFromFlightText(data.flightText || '');
        if (autoType) typeSel.value = autoType;

        var type = typeSel.value || '';
        if (!type) {
          alert('Velg kategori før du legger til.');
          return;
        }

        var item = {
          id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
          name: (data.name || '').trim(),
          url: (data.url || '').trim(),
          image: normImg((data.image || '').trim()),
          flightText: (data.flightText || '').trim(),
          addedAt: todayIso(),
          color: chosen || '',
          note: ''
        };
        if (!item.name) return;

        if (!state.model.discs[type]) state.model.discs[type] = [];
        state.model.discs[type].push(item);

        await rpcIncrementPopular(supa, type, item.name, item.url, item.image);

        scheduleSave();
        await refreshTop();

        rerender();
      }

      var doSuggest = debounce(async function (q, resultsBox) {
        clear(resultsBox);
        q = (q || '').trim();
        if (q.length < 2) return;

        resultsBox.appendChild(el('div', 'minbagg-muted', 'Laster…'));

        try {
          var items = await qbSearch(q);
          clear(resultsBox);

          if (!items.length) {
            resultsBox.appendChild(el('div', 'minbagg-muted', 'Ingen treff.'));
            return;
          }

          items.forEach(function (p) {
            var card = el('div', 'minbagg-res');
            var im = document.createElement('img');
            im.src = p.image || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
            im.alt = '';
            card.appendChild(im);

            var mid = el('div', '');
            mid.appendChild(el('div', 't', p.name));
            if (p.flightText) mid.appendChild(el('div', 'minbagg-muted', 'Flight: ' + p.flightText));

            // autokategori på hover/render
            var auto = guessTypeFromFlightText(p.flightText || '');
            if (auto) {
              var lbl = TYPES.filter(function (x) { return x.key === auto; })[0];
              if (lbl) mid.appendChild(el('div', 'minbagg-muted', 'Forslag kategori: ' + lbl.label));
            }

            var actions = el('div', 'a');
            var add = el('button', 'minbagg-btn primary', 'Legg til');
            add.addEventListener('click', function () {
              // set dropdown if we can
              var guess = guessTypeFromFlightText(p.flightText || '');
              if (guess) typeSel.value = guess;
              addDisc(p);
            });
            actions.appendChild(add);
            mid.appendChild(actions);

            card.appendChild(mid);
            resultsBox.appendChild(card);
          });
        } catch (e) {
          clear(resultsBox);
          resultsBox.appendChild(el('div', 'minbagg-muted', 'Kunne ikke søke akkurat nå.'));
          log('[MINBAGG] qbSearch failed', e);
        }
      }, 250);

      function renderMode() {
        clear(content);

        if (mode === 'search') {
          var inp = document.createElement('input');
          inp.className = 'minbagg-inp';
          inp.placeholder = 'Søk (f.eks. buzzz, luna, md3)…';

          var results = el('div', 'minbagg-results');
          content.appendChild(inp);
          content.appendChild(el('div', 'minbagg-muted', 'Forslag dukker opp mens du skriver. Trykk “Legg til” på riktig disk.'));
          content.appendChild(results);

          inp.addEventListener('input', function () {
            doSuggest(inp.value || '', results);
          });

        } else {
          // manual with 4 flight inputs
          var name = document.createElement('input');
          name.className = 'minbagg-inp';
          name.placeholder = 'Navn (f.eks. Buzzz)';

          var url = document.createElement('input');
          url.className = 'minbagg-inp';
          url.placeholder = 'Produkt-URL (valgfritt)';
          url.style.marginTop = '10px';

          var img = document.createElement('input');
          img.className = 'minbagg-inp';
          img.placeholder = 'Bilde-URL (valgfritt)';
          img.style.marginTop = '10px';

          var grid2 = el('div', 'minbagg-grid2');
          var sp = document.createElement('input'); sp.className = 'minbagg-inp'; sp.placeholder = 'Speed';
          var gl = document.createElement('input'); gl.className = 'minbagg-inp'; gl.placeholder = 'Glide';
          var tu = document.createElement('input'); tu.className = 'minbagg-inp'; tu.placeholder = 'Turn (kan ha - og ,)';
          var fa = document.createElement('input'); fa.className = 'minbagg-inp'; fa.placeholder = 'Fade (kan ha - og ,)';
          grid2.appendChild(sp); grid2.appendChild(gl); grid2.appendChild(tu); grid2.appendChild(fa);

          var btnAdd = el('button', 'minbagg-btn primary', 'Legg til disk');
          btnAdd.style.marginTop = '10px';

          var msg = el('div', 'minbagg-muted');
          msg.style.marginTop = '10px';

          btnAdd.addEventListener('click', async function () {
            var n = (name.value || '').trim();
            if (!n) { msg.textContent = 'Skriv inn et navn først.'; return; }

            // flight string (optional)
            var hasAny = (sp.value || gl.value || tu.value || fa.value);
            var flightText = '';
            if (hasAny) {
              flightText =
                (sp.value || '').trim() + ' ' +
                (gl.value || '').trim() + ' ' +
                (tu.value || '').trim() + ' ' +
                (fa.value || '').trim();
              flightText = flightText.trim();
            }

            msg.textContent = 'Legger til…';
            await addDisc({
              name: n,
              url: (url.value || '').trim(),
              image: normImg((img.value || '').trim()),
              flightText: flightText
            });

            msg.textContent = 'Lagt til ✅';
            name.value = ''; url.value = ''; img.value = '';
            sp.value = ''; gl.value = ''; tu.value = ''; fa.value = '';
          });

          content.appendChild(name);
          content.appendChild(url);
          content.appendChild(img);
          content.appendChild(grid2);
          content.appendChild(btnAdd);
          content.appendChild(msg);
        }
      }

      renderMode();
    }

    function rerender() {
      clear(root);

      var app = el('div', 'minbagg-app');
      buildHeader(app);

      // Bag boxes (disker i kategorier)
      renderBagBoxes(app);

      // Flight list (sorted by speed desc)
      renderFlightList(app);

      // Flight map (next)
      renderFlightMap(app);

      // Profile
      renderProfile(app);

      // Recos (next)
      renderRecos(app);

      // Top 3 global
      app.appendChild(buildTop3Block(state.topRows));

      root.appendChild(app);
    }

    // load & start
    (async function init() {
      try {
        var raw = await dbLoadBag(supa, state.email);
        state.model = normalizeModel(raw);
      } catch (e) {
        log('[MINBAGG] dbLoadBag failed', e);
        state.model = emptyModel();
      }
      rerender();
    })();
  }

  // --------------- MAIN init (reinit-safe) ---------------
  async function initOnce(reason) {
    injectStyles();
    var root = ensureRoot();
    var marker = getLoginMarker();

    window.__MINBAGG_APP_RUNNING__ = true;

    try {
      var supa = await ensureSupabaseClient();

      if (!marker.loggedIn) {
        var rows = await fetchTop3ByType(supa, 3);
        renderGuest(root, rows);
        log('[MINBAGG] guest OK', reason || 'init', VERSION);
        return;
      }

      var sess = await supa.auth.getSession();
      var session = (sess && sess.data) ? sess.data.session : null;

      if (!session || !session.user) {
        renderConnectView(root, marker, supa);
        log('[MINBAGG] connect view', reason || 'init', VERSION);
        return;
      }

      var gu = await supa.auth.getUser();
      var user = (gu && gu.data) ? (gu.data.user || session.user) : (session.user || null);
      if (!user) {
        renderConnectView(root, marker, supa);
        log('[MINBAGG] connect view (no user)', reason || 'init', VERSION);
        return;
      }

      var topRows = await fetchTop3ByType(supa, 3);
      renderLogged(root, marker, supa, user, topRows);
      log('[MINBAGG] logged OK', reason || 'init', VERSION);

    } catch (err) {
      clear(root);
      var box = el('div', 'minbagg-app');
      var b = el('div', 'minbagg-banner');
      b.textContent = 'Min Bagg kunne ikke starte.';
      box.appendChild(b);
      box.appendChild(el('div', 'minbagg-muted', String(err && err.message ? err.message : err)));
      root.appendChild(box);
      log('[MINBAGG] fatal', err);
    }
  }

  window.__MINBAGG_REINIT__ = function (why) {
    try { initOnce(why || 'reinit'); } catch (e) { log('[MINBAGG] reinit failed', e); }
  };

  function start() {
    initOnce('start');
    setTimeout(function(){ try { initOnce('retry-300ms'); } catch(_){} }, 300);
    setTimeout(function(){ try { initOnce('retry-1200ms'); } catch(_){} }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
