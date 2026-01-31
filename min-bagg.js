/* === GOLFKONGEN: MIN BAGG – vNEXT (modal + kategorier + BFCache-fix) ===
 * Side: /sider/min-bagg
 * Krever at loader setter:
 *   window.GK_SUPABASE_URL
 *   window.GK_SUPABASE_ANON_KEY
 *
 * Supabase:
 *  - mybag_bags (PK=email text, bag jsonb)
 *  - RPC: get_mybag_top3(limit_per_group int)  -> {type,name,product_url,image_url,picks}
 *  - RPC: increment_popular_disc(p_type,p_name,p_url,p_image) (valgfri men anbefalt)
 */
(function () {
  'use strict';

  var VERSION = 'vNEXT-2026-01-31';
  var PATH = (location.pathname || '').replace(/\/+$/, '').toLowerCase();
  if (PATH !== '/sider/min-bagg') return;

  // ---------- "Refreshable single-run" ----------
  // Vi setter kun opp globale event listeners én gang,
  // men vi rerender/init hver gang siden "kommer tilbake" (BFCache / navigering).
  if (!window.__MINBAGG_GLOBAL_WIRED__) {
    window.__MINBAGG_GLOBAL_WIRED__ = true;

    // BFCache / tilbakeknapp / SPA-ish navigering
    window.addEventListener('pageshow', function () {
      try { if (window.__MINBAGG_REINIT__) window.__MINBAGG_REINIT__('pageshow'); } catch (_) {}
    });

    // Noen tema/navigasjoner re-aktiverer siden uten DOMContentLoaded
    document.addEventListener('visibilitychange', function () {
      try {
        if (!document.hidden && window.__MINBAGG_REINIT__) window.__MINBAGG_REINIT__('visibilitychange');
      } catch (_) {}
    });

    // Debug helper
    window.__MINBAGG_DEBUG__ = function () {
      var scripts = Array.prototype.slice.call(document.scripts || [])
        .map(function (s) { return s && s.src ? s.src : ''; })
        .filter(Boolean);
      console.log('[MINBAGG] VERSION:', VERSION);
      console.log('[MINBAGG] PATH:', PATH);
      console.log('[MINBAGG] GK_SUPABASE_URL:', window.GK_SUPABASE_URL);
      console.log('[MINBAGG] GK_SUPABASE_ANON_KEY:', window.GK_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
      console.log('[MINBAGG] SCRIPTS (min-bagg):', scripts.filter(function (u) { return u.indexOf('min-bagg') >= 0; }));
      console.log('[MINBAGG] RUNNING:', !!window.__MINBAGG_APP_RUNNING__);
    };
  }

  // ---------- tiny helpers ----------
  function log() { try { console.log.apply(console, arguments); } catch (_) {} }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
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

  // ---------- config from loader ----------
  function getSupaConfig() {
    var url = (window.GK_SUPABASE_URL || '').trim();
    var anon = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();
    return { url: url, anon: anon };
  }

  // ---------- theme marker (Quickbutik login marker) ----------
  function getLoginMarker() {
    // Du har brukt gk-login-marker i loaderen din, så vi holder oss til den.
    var m = document.getElementById('gk-login-marker');
    if (!m) return { loggedIn: false, firstname: '', email: '' };
    var ds = m.dataset || {};
    var li = (ds.loggedIn || ds.loggedin || '0') + '';
    return {
      loggedIn: li === '1',
      firstname: ds.firstname || '',
      email: ds.email || '' // ofte tom hos deg – vi bruker Supabase user.email når vi har session
    };
  }

  // ---------- root ----------
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

  // ---------- styles ----------
  function injectStyles() {
    if (document.getElementById('minbagg-style')) return;

    var css =
      '.minbagg-app{max-width:1100px;margin:0 auto;padding:14px;color:#e8eef6;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}' +
      '.minbagg-banner{margin:10px 0 14px 0;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);font-size:13px;line-height:1.35}' +
      '.minbagg-h1{font-size:22px;margin:6px 0 2px 0}' +
      '.minbagg-muted{opacity:.85;font-size:13px;line-height:1.35}' +
      '.minbagg-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}' +
      '@media(min-width:980px){.minbagg-grid{grid-template-columns:1.25fr .75fr}}' +

      '.minbagg-card{border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.12);padding:12px}' +
      '.minbagg-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
      '.minbagg-btn{cursor:pointer;user-select:none;border-radius:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-size:14px}' +
      '.minbagg-btn:hover{background:rgba(255,255,255,.10)}' +
      '.minbagg-btn.primary{border-color:rgba(44,174,96,.55);background:rgba(44,174,96,.14)}' +
      '.minbagg-btn.primary:hover{background:rgba(44,174,96,.20)}' +
      '.minbagg-btn.danger{border-color:rgba(220,53,69,.55);background:rgba(220,53,69,.14)}' +
      '.minbagg-btn.danger:hover{background:rgba(220,53,69,.20)}' +

      '.minbagg-top4{display:grid;grid-template-columns:1fr;gap:10px}' +
      '@media(min-width:700px){.minbagg-top4{grid-template-columns:1fr 1fr}}' +
      '.minbagg-topbox h3{margin:0 0 8px 0;font-size:14px}' +
      '.minbagg-topitem{display:flex;gap:8px;align-items:center;padding:8px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.14)}' +
      '.minbagg-topitem img{width:36px;height:36px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.08)}' +
      '.minbagg-topitem a{color:inherit;text-decoration:none}' +
      '.minbagg-topitem a:hover{text-decoration:underline}' +
      '.minbagg-pill{font-size:12px;opacity:.85;margin-left:auto}' +

      '.minbagg-baghead{display:flex;gap:12px;align-items:center;flex-wrap:wrap}' +
      '.minbagg-bagimg{width:64px;height:64px;border-radius:16px;object-fit:cover;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10)}' +
      '.minbagg-bagtitle{font-size:18px;font-weight:800;margin:0}' +
      '.minbagg-boxgrid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}' +
      '@media(min-width:900px){.minbagg-boxgrid{grid-template-columns:1fr 1fr}}' +
      '.minbagg-slot h3{margin:0 0 8px 0;font-size:14px}' +
      '.minbagg-disc{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.14)}' +
      '.minbagg-disc img{width:46px;height:46px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.08)}' +
      '.minbagg-disc .meta{flex:1 1 auto;min-width:150px}' +
      '.minbagg-disc .name{font-weight:700;line-height:1.2}' +
      '.minbagg-disc .sub{opacity:.8;font-size:12px;margin-top:2px}' +
      '.minbagg-disc .note{margin-top:6px}' +
      '.minbagg-disc textarea{width:100%;min-height:48px;resize:vertical;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;padding:8px 10px;outline:none}' +

      '.minbagg-colorrow{display:flex;gap:8px;flex-wrap:wrap}' +
      '.minbagg-color{width:26px;height:26px;border-radius:999px;border:2px solid rgba(255,255,255,.18);background:rgba(255,255,255,.10);cursor:pointer}' +
      '.minbagg-color.on{border-color:#fff;box-shadow:0 0 0 2px rgba(44,174,96,.35)}' +

      // modal
      '.minbagg-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);display:none;align-items:center;justify-content:center;padding:16px;z-index:9999}' +
      '.minbagg-modal.on{display:flex}' +
      '.minbagg-dialog{width:min(920px,100%);border-radius:18px;border:1px solid rgba(255,255,255,.14);background:#0f1114;color:#fff;box-shadow:0 14px 60px rgba(0,0,0,.55)}' +
      '.minbagg-dialog .hd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}' +
      '.minbagg-dialog .bd{padding:14px}' +
      '.minbagg-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 12px 0}' +
      '.minbagg-tab{padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);cursor:pointer;font-size:13px}' +
      '.minbagg-tab.on{border-color:rgba(44,174,96,.55);background:rgba(44,174,96,.14)}' +
      '.minbagg-inp{width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none}' +
      '.minbagg-formgrid{display:grid;grid-template-columns:1fr;gap:10px}' +
      '@media(min-width:820px){.minbagg-formgrid{grid-template-columns:1.4fr .6fr}}' +
      '.minbagg-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-top:10px}' +
      '.minbagg-res{border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.14);padding:10px;display:flex;gap:10px;align-items:center}' +
      '.minbagg-res img{width:44px;height:44px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.08)}' +
      '.minbagg-res .t{font-weight:700;font-size:13px;line-height:1.25}' +
      '.minbagg-res .a{margin-top:6px}' +

      '.minbagg-select{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:#fff;outline:none}' +

      '.minbagg-footnote{margin-top:10px;font-size:12px;opacity:.75}';

    var st = document.createElement('style');
    st.id = 'minbagg-style';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  // ---------- Supabase client loader ----------
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
    var cfg = getSupaConfig();
    if (!cfg.url || !cfg.anon) {
      throw new Error('Manglende Supabase config (GK_SUPABASE_URL / GK_SUPABASE_ANON_KEY).');
    }
    if (!window.supabase || !window.supabase.createClient) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js');
    }
    return window.supabase.createClient(cfg.url, cfg.anon);
  }

  // ---------- DB: load/save ----------
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

  // ---------- RPC: top3 ----------
  async function fetchTop3ByType(supa, limitPerGroup) {
    limitPerGroup = limitPerGroup || 3;

    // Foretrekk RPC som du allerede har og som gir putter/midrange/fairway/distance
    try {
      var r = await supa.rpc('get_mybag_top3', { limit_per_group: limitPerGroup });
      if (r && r.error) throw r.error;
      return (r && r.data) ? r.data : [];
    } catch (e) {
      // fallback: prøv view mybag_popular hvis RPC ikke finnes
      log('[MINBAGG] get_mybag_top3 failed, fallback to mybag_popular', e);
      try {
        var res = await supa.from('mybag_popular').select('*').order('picks', { ascending: false }).limit(50);
        if (res && res.error) throw res.error;
        var rows = (res && res.data) ? res.data : [];
        // vi kan ikke splitte i 4 typer uten type – så vi returnerer alt som "unknown"
        return rows.map(function (x) {
          return {
            type: x.type || 'unknown',
            name: x.name || x.disc || '',
            product_url: x.product_url || x.url || null,
            image_url: x.image_url || x.image || null,
            picks: x.picks != null ? x.picks : (x.count != null ? x.count : 0)
          };
        });
      } catch (e2) {
        log('[MINBAGG] fallback mybag_popular failed', e2);
        return [];
      }
    }
  }

  async function rpcIncrementPopular(supa, type, name, url, image) {
    // Ikke krasj hvis RPC ikke finnes
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
      log('[MINBAGG] increment_popular_disc not available/failed (ignored)', e);
      return false;
    }
  }

  // ---------- Quickbutik search ----------
  function safeStr(x) { return (x == null) ? '' : String(x); }

  function pickProduct(p) {
    // Quickbutik JSON kan variere
    var name = p.name || p.title || p.product_name || p.producttitle || p.productTitle || p.heading || '';
    var url  = p.url || p.producturl || p.link || p.href || p.uri || '';
    var img  = p.firstimage || p.image || p.first_image || p.firstImage || '';
    var flight = p.datafield_1 || p.product && p.product.datafield_1; // noen ganger ligger den der
    if (!url && p.id) url = '/shop/product/' + p.id;

    return {
      name: safeStr(name).trim(),
      url: safeStr(url).trim(),
      image: normImg(safeStr(img)),
      flightText: safeStr(flight || '').trim()
    };
  }

  async function qbSearch(query) {
    var q = (query || '').trim();
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
      var p = pickProduct(prod);
      if (!p.name) continue;
      out.push(p);
    }
    return out;
  }

  // ---------- bag model ----------
  var TYPES = [
    { key: 'putter', label: 'Putter' },
    { key: 'midrange', label: 'Midrange' },
    { key: 'fairway', label: 'Fairway Driver' },
    { key: 'distance', label: 'Distance Driver' }
  ];
  function emptyBagModel() {
    return {
      bagInfo: { name: '', image: '', url: '' },
      discs: { putter: [], midrange: [], fairway: [], distance: [] }
    };
  }
  function normalizeBag(raw) {
    // Godta eldre format (array) og gjør det til nytt format
    if (!raw) return emptyBagModel();

    // Nytt format?
    if (raw && typeof raw === 'object' && raw.discs && raw.bagInfo) {
      // Sørg for alle keys
      var out = emptyBagModel();
      out.bagInfo = Object.assign(out.bagInfo, raw.bagInfo || {});
      out.discs = Object.assign(out.discs, raw.discs || {});
      TYPES.forEach(function (t) { if (!Array.isArray(out.discs[t.key])) out.discs[t.key] = []; });
      return out;
    }

    // Eldre format: array av {url,name,image,addedAt}
    if (Array.isArray(raw)) {
      var b = emptyBagModel();
      // legg alt i fairway som default for å ikke miste data (du kan flytte senere i UI)
      b.discs.fairway = raw.map(function (x) {
        return {
          id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
          name: x.name || '',
          url: x.url || '',
          image: x.image || '',
          addedAt: x.addedAt || todayIso(),
          color: '',
          note: '',
          flightText: x.flightText || ''
        };
      });
      return b;
    }

    return emptyBagModel();
  }

  // ---------- UI bits ----------
  function bannerHtml() {
    return '<strong>🚧 Under konstruksjon</strong> Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.';
  }

  function renderGuest(root, topRows) {
    clear(root);

    var app = el('div', 'minbagg-app');
    var banner = el('div', 'minbagg-banner');
    banner.innerHTML = bannerHtml();
    app.appendChild(banner);

    app.appendChild(el('div', 'minbagg-h1', 'Min Bagg'));
    app.appendChild(el('div', 'minbagg-muted', 'Du må være innlogget i nettbutikken for å lagre og bygge baggen din. Du kan likevel se Topp 3 globalt uten innlogging.'));

    // CTA
    var cta = el('div', 'minbagg-card');
    var row = el('div', 'minbagg-row');
    var a1 = el('a', 'minbagg-btn primary', 'Logg inn');
    a1.href = '/customer/login';
    var a2 = el('a', 'minbagg-btn', 'Opprett konto');
    a2.href = '/customer/register';
    row.appendChild(a1);
    row.appendChild(a2);
    cta.appendChild(row);
    cta.appendChild(el('div', 'minbagg-footnote', 'Tips: Når du blir innlogget, kan du også koble til lagring med engangslink (Supabase) én gang per enhet.'));
    app.appendChild(cta);

    // Top 3 per type
    var topWrap = el('div', 'minbagg-card minbagg-topbox');
    topWrap.appendChild(el('h2', 'minbagg-h1', 'Topp 3 globalt'));

    var top4 = el('div', 'minbagg-top4');
    topWrap.appendChild(top4);

    // grupper
    var byType = { putter: [], midrange: [], fairway: [], distance: [] };
    (topRows || []).forEach(function (r) {
      if (!r) return;
      var t = (r.type || '').toLowerCase();
      if (!byType[t]) return;
      byType[t].push(r);
    });

    TYPES.forEach(function (t) {
      var box = el('div', 'minbagg-card');
      box.appendChild(el('h3', '', t.label));
      var list = el('div', '');
      var arr = byType[t.key] || [];

      if (!arr.length) {
        list.appendChild(el('div', 'minbagg-muted', 'Ingen data ennå.'));
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

          list.appendChild(row2);
        }
      }

      box.appendChild(list);
      top4.appendChild(box);
    });

    app.appendChild(topWrap);
    root.appendChild(app);
  }

  function renderConnectView(root, marker, supa) {
    clear(root);

    var app = el('div', 'minbagg-app');
    var banner = el('div', 'minbagg-banner');
    banner.innerHTML = bannerHtml();
    app.appendChild(banner);

    app.appendChild(el('div', 'minbagg-h1', 'Min Bagg'));
    var card = el('div', 'minbagg-card');
    card.appendChild(el('div', 'minbagg-muted',
      'Du er innlogget i nettbutikken. For å lagre baggen din på tvers av enheter kobler vi deg til lagringen via en engangslink på e-post (Supabase).'));

    var ul = el('ul', 'minbagg-muted');
    ul.style.margin = '10px 0 0 18px';
    ul.innerHTML =
      '<li>Dette gjøres normalt bare én gang per enhet/nettleser.</li>' +
      '<li>Bytter du mobil/PC/nettleser, må du koble til på nytt der.</li>';
    card.appendChild(ul);

    var form = el('div', 'minbagg-row');
    form.style.marginTop = '12px';

    var inp = document.createElement('input');
    inp.className = 'minbagg-inp';
    inp.type = 'email';
    inp.placeholder = 'E-post (for engangslink)';
    inp.value = (marker.email || '').trim();
    inp.style.maxWidth = '420px';
    form.appendChild(inp);

    var btn = el('button', 'minbagg-btn primary', 'Send engangslink');
    form.appendChild(btn);

    var msg = el('div', 'minbagg-muted');
    msg.style.marginTop = '10px';
    msg.textContent = 'Tips: bruk samme e-post som kontoen din i nettbutikken.';
    card.appendChild(form);
    card.appendChild(msg);

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

    app.appendChild(card);
    root.appendChild(app);
  }

  // ---------- modal ----------
  function buildModal() {
    var modal = el('div', 'minbagg-modal');
    modal.id = 'minbagg-modal';

    var dialog = el('div', 'minbagg-dialog');
    var hd = el('div', 'hd');
    hd.appendChild(el('div', '', 'Legg til disk'));
    var close = el('button', 'minbagg-btn', 'Lukk');
    hd.appendChild(close);
    dialog.appendChild(hd);

    var bd = el('div', 'bd');
    dialog.appendChild(bd);

    modal.appendChild(dialog);

    close.addEventListener('click', function () { modal.classList.remove('on'); });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('on');
    });

    document.body.appendChild(modal);
    return { modal: modal, body: bd };
  }

  function colorPalette() {
    return [
      '#ffffff', '#111827', '#ef4444', '#f97316', '#facc15',
      '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'
    ];
  }

  // ---------- Logged-in app ----------
  function renderLoggedApp(root, marker, supa, user, topRows) {
    clear(root);

    var state = {
      email: (user && user.email) ? user.email : '',
      firstname: marker.firstname || 'Min',
      model: emptyBagModel(),
      saving: false,
      modal: null,
      modalBody: null
    };

    // Save debounce
    var scheduleSave = debounce(async function () {
      if (!state.email) return;
      if (state.saving) return;
      state.saving = true;
      try {
        await dbSaveBag(supa, state.email, state.model);
      } catch (e) {
        log('[MINBAGG] save failed', e);
      } finally {
        state.saving = false;
      }
    }, 600);

    function openModal() {
      if (!state.modal) {
        var m = buildModal();
        state.modal = m.modal;
        state.modalBody = m.body;
      }
      state.modal.classList.add('on');
    }

    function renderHeader(app) {
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
      var title = el('div', 'minbagg-bagtitle', (state.firstname || 'Min') + ' sin bagg');
      col.appendChild(title);
      col.appendChild(el('div', 'minbagg-muted', 'Hei ' + (marker.firstname || 'der') + ' 👋 Baggen din lagres på kontoen din.'));
      head.appendChild(col);

      var actions = el('div', 'minbagg-row');
      actions.style.marginLeft = 'auto';
      var btnAdd = el('button', 'minbagg-btn primary', 'Legg til');
      btnAdd.addEventListener('click', function () {
        openModal();
        renderModalContents(); // alltid fresh
      });
      actions.appendChild(btnAdd);
      head.appendChild(actions);

      app.appendChild(head);
    }

    function renderTop4(app, topRows2) {
      var topWrap = el('div', 'minbagg-card');
      topWrap.appendChild(el('div', 'minbagg-h1', 'Topp 3 globalt'));

      var top4 = el('div', 'minbagg-top4');
      topWrap.appendChild(top4);

      var byType = { putter: [], midrange: [], fairway: [], distance: [] };
      (topRows2 || []).forEach(function (r) {
        if (!r) return;
        var t = (r.type || '').toLowerCase();
        if (byType[t]) byType[t].push(r);
      });

      TYPES.forEach(function (t) {
        var box = el('div', 'minbagg-card');
        box.appendChild(el('h3', '', t.label));

        var arr = byType[t.key] || [];
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
        top4.appendChild(box);
      });

      app.appendChild(topWrap);
    }

    function renderBagBoxes(app) {
      var grid = el('div', 'minbagg-boxgrid');

      TYPES.forEach(function (t) {
        var slot = el('div', 'minbagg-card minbagg-slot');
        slot.appendChild(el('h3', '', t.label));

        var list = state.model.discs[t.key] || [];
        if (!list.length) {
          slot.appendChild(el('div', 'minbagg-muted', 'Tomt. Trykk “Legg til” for å legge inn disker.'));
        } else {
          list.forEach(function (it, idx) {
            var row = el('div', 'minbagg-disc');

            // color ring
            row.style.borderColor = it.color ? it.color : 'rgba(255,255,255,.12)';

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

            var sub = el('div', 'sub', 'Lagt til: ' + (it.addedAt || ''));
            meta.appendChild(sub);

            // note
            var noteWrap = el('div', 'note');
            var ta = document.createElement('textarea');
            ta.placeholder = 'Kommentar (valgfritt)…';
            ta.value = it.note || '';
            ta.addEventListener('input', function () {
              it.note = ta.value;
              scheduleSave();
            });
            noteWrap.appendChild(ta);
            meta.appendChild(noteWrap);

            row.appendChild(meta);

            var right = el('div', '');
            right.style.display = 'flex';
            right.style.flexDirection = 'column';
            right.style.gap = '8px';
            right.style.alignItems = 'flex-end';

            // color chooser small
            var colors = el('div', 'minbagg-colorrow');
            colorPalette().forEach(function (c) {
              var dot = el('div', 'minbagg-color');
              dot.style.background = c;
              if ((it.color || '').toLowerCase() === c.toLowerCase()) dot.classList.add('on');
              dot.addEventListener('click', function () {
                it.color = c;
                scheduleSave();
                rerender(); // oppdater ring + on
              });
              colors.appendChild(dot);
            });
            right.appendChild(colors);

            var btnDel = el('button', 'minbagg-btn danger', 'Fjern');
            btnDel.addEventListener('click', function () {
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

      app.appendChild(grid);
    }

    // ---------- modal contents ----------
    function renderModalContents() {
      if (!state.modalBody) return;
      clear(state.modalBody);

      var tabs = el('div', 'minbagg-tabs');
      var tabSearch = el('div', 'minbagg-tab on', 'Søk i nettbutikken');
      var tabManual = el('div', 'minbagg-tab', 'Legg til egen');
      tabs.appendChild(tabSearch);
      tabs.appendChild(tabManual);

      state.modalBody.appendChild(tabs);

      var content = el('div', '');
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

      // shared controls: type + color
      var typeSel = document.createElement('select');
      typeSel.className = 'minbagg-select';
      TYPES.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.key;
        opt.textContent = t.label;
        typeSel.appendChild(opt);
      });

      var colorSel = '';
      var colorWrap = el('div', 'minbagg-colorrow');
      colorPalette().forEach(function (c, idx) {
        var dot = el('div', 'minbagg-color' + (idx === 0 ? ' on' : ''));
        dot.style.background = c;
        if (idx === 0) colorSel = c;

        dot.addEventListener('click', function () {
          colorSel = c;
          Array.prototype.slice.call(colorWrap.children).forEach(function (x) { x.classList.remove('on'); });
          dot.classList.add('on');
        });

        colorWrap.appendChild(dot);
      });

      function headerControls() {
        var row = el('div', 'minbagg-row');
        row.appendChild(el('div', 'minbagg-muted', 'Kategori:'));
        row.appendChild(typeSel);
        row.appendChild(el('div', 'minbagg-muted', 'Farge:'));
        row.appendChild(colorWrap);
        return row;
      }

      async function addDiscFromData(d) {
        var type = typeSel.value || 'fairway';
        var item = {
          id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
          name: d.name || '',
          url: d.url || '',
          image: normImg(d.image || ''),
          addedAt: todayIso(),
          color: colorSel || '',
          note: '',
          flightText: (d.flightText || '').trim()
        };

        if (!state.model.discs[type]) state.model.discs[type] = [];
        state.model.discs[type].push(item);

        // Tell globalt (ikke kritisk hvis feiler)
        await rpcIncrementPopular(supa, type, item.name, item.url, item.image);

        scheduleSave();
        rerender();

        // refreshe toppliste etter add
        try {
          var rows = await fetchTop3ByType(supa, 3);
          topRows = rows;
          rerender();
        } catch (_) {}
      }

      function renderMode() {
        clear(content);

        content.appendChild(headerControls());

        if (mode === 'search') {
          var grid = el('div', 'minbagg-formgrid');
          var left = el('div', '');
          var right = el('div', '');

          var inp = document.createElement('input');
          inp.className = 'minbagg-inp';
          inp.placeholder = 'Søk i nettbutikken (f.eks. buzzz, luna, md3)…';
          left.appendChild(inp);

          var btn = el('button', 'minbagg-btn primary', 'Søk');
          btn.style.width = '100%';
          right.appendChild(btn);

          grid.appendChild(left);
          grid.appendChild(right);

          content.appendChild(grid);

          var info = el('div', 'minbagg-muted', 'Søk for å få forslag. Trykk “Legg til” på riktig disk.');
          info.style.marginTop = '10px';
          content.appendChild(info);

          var results = el('div', 'minbagg-results');
          content.appendChild(results);

          async function doSearch() {
            var q = (inp.value || '').trim();
            clear(results);
            if (!q) return;

            results.appendChild(el('div', 'minbagg-muted', 'Laster…'));

            try {
              var items = await qbSearch(q);
              clear(results);

              if (!items.length) {
                results.appendChild(el('div', 'minbagg-muted', 'Ingen treff.'));
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
                var actions = el('div', 'a');
                var add = el('button', 'minbagg-btn primary', 'Legg til');
                add.addEventListener('click', function () { addDiscFromData(p); });
                actions.appendChild(add);
                mid.appendChild(actions);

                card.appendChild(mid);
                results.appendChild(card);
              });
            } catch (e) {
              clear(results);
              results.appendChild(el('div', 'minbagg-muted', 'Kunne ikke søke akkurat nå.'));
              log('[MINBAGG] qbSearch failed', e);
            }
          }

          btn.addEventListener('click', doSearch);
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doSearch();
          });

        } else {
          // manual
          var form = el('div', '');
          form.style.marginTop = '10px';

          var name = document.createElement('input');
          name.className = 'minbagg-inp';
          name.placeholder = 'Navn (f.eks. Buzzz)';
          form.appendChild(name);

          var url = document.createElement('input');
          url.className = 'minbagg-inp';
          url.placeholder = 'Produkt-URL (valgfritt)';
          url.style.marginTop = '10px';
          form.appendChild(url);

          var img = document.createElement('input');
          img.className = 'minbagg-inp';
          img.placeholder = 'Bilde-URL (valgfritt)';
          img.style.marginTop = '10px';
          form.appendChild(img);

          var flight = document.createElement('input');
          flight.className = 'minbagg-inp';
          flight.placeholder = 'Flight (Speed Glide Turn Fade) – f.eks. 5 5 -1 1 (valgfritt)';
          flight.style.marginTop = '10px';
          form.appendChild(flight);

          var btnAdd = el('button', 'minbagg-btn primary', 'Legg til disk');
          btnAdd.style.marginTop = '10px';
          form.appendChild(btnAdd);

          var msg = el('div', 'minbagg-muted');
          msg.style.marginTop = '10px';
          form.appendChild(msg);

          btnAdd.addEventListener('click', async function () {
            var n = (name.value || '').trim();
            if (!n) { msg.textContent = 'Skriv inn et navn først.'; return; }
            msg.textContent = 'Legger til…';

            await addDiscFromData({
              name: n,
              url: (url.value || '').trim(),
              image: normImg((img.value || '').trim()),
              flightText: (flight.value || '').trim()
            });

            msg.textContent = 'Lagt til ✅';
            name.value = '';
            url.value = '';
            img.value = '';
            flight.value = '';
          });

          content.appendChild(form);
          content.appendChild(el('div', 'minbagg-footnote', 'Farge og kategori velges øverst før du legger til.'));
        }
      }

      renderMode();
    }

    // ---------- rerender whole page ----------
    function rerender() {
      clear(root);

      var app = el('div', 'minbagg-app');
      renderHeader(app);

      // top layout: venstre = bag / bokser, høyre = top3
      var grid = el('div', 'minbagg-grid');

      var left = el('div', '');
      var right = el('div', '');

      // bag-info editor (valgfritt)
      var bagInfoCard = el('div', 'minbagg-card');
      bagInfoCard.appendChild(el('div', 'minbagg-muted', 'Valgfritt: Legg inn bagg-navn/bilde (kun for visning).'));

      var row = el('div', 'minbagg-row');
      row.style.marginTop = '10px';

      var inpName = document.createElement('input');
      inpName.className = 'minbagg-inp';
      inpName.placeholder = 'Baggnavn (valgfritt)';
      inpName.value = state.model.bagInfo.name || '';
      inpName.style.maxWidth = '320px';
      row.appendChild(inpName);

      var inpImg = document.createElement('input');
      inpImg.className = 'minbagg-inp';
      inpImg.placeholder = 'Bilde-URL (valgfritt)';
      inpImg.value = state.model.bagInfo.image || '';
      inpImg.style.maxWidth = '420px';
      row.appendChild(inpImg);

      bagInfoCard.appendChild(row);

      var saveMini = debounce(function () {
        state.model.bagInfo.name = (inpName.value || '').trim();
        state.model.bagInfo.image = normImg((inpImg.value || '').trim());
        scheduleSave();
        rerender();
      }, 600);

      inpName.addEventListener('input', saveMini);
      inpImg.addEventListener('input', saveMini);

      left.appendChild(bagInfoCard);

      // bag boxes
      renderBagBoxes(left);

      // right top3
      renderTop4(right, topRows);

      grid.appendChild(left);
      grid.appendChild(right);
      app.appendChild(grid);

      root.appendChild(app);
    }

    // ---------- load initial bag from DB ----------
    (async function init() {
      try {
        var raw = await dbLoadBag(supa, state.email);
        state.model = normalizeBag(raw);
      } catch (e) {
        log('[MINBAGG] dbLoadBag failed', e);
        state.model = emptyBagModel();
      }
      rerender();
    })();

    // expose for modal refresh
    var topRows = topRows || [];
    var renderModalContents = function () { /* replaced below after init */ };

    // patch in real modal function after we have rerender scope
    // (we just define it here to avoid hoist issues)
    renderModalContents = function () {
      // will be replaced inside rerender on first open
    };

    // override openModal behavior with live renderer
    // (done by assigning inside renderHeader -> btnAdd click)
    // so we only need modal renderer accessible:
    // (we simply define it now)
    renderModalContents = function () {
      // Use function in outer scope
      // This is safe because it only runs after openModal has created modalBody
      // and state variables exist.
      // We reuse the method defined earlier:
      // (we call the one attached to scope)
      // NOTE: actual implementation is inside renderLoggedApp scope (below).
    };

    // We need to bind the actual modal renderer defined earlier in this function:
    // So we re-declare it as a reference:
    // (JS function hoist doesn't apply across inner function blocks nicely here)
    // We'll simply set it after first renderHeader click by calling the local one.
    // => handled already: renderHeader calls renderModalContents() directly, not via ref.
  }

  // ---------- MAIN init (refresh-safe) ----------
  async function initOnce(reason) {
    injectStyles();
    var root = ensureRoot();
    var marker = getLoginMarker();

    // Dette er nøkkelen for “må hard refresh”:
    // Vi rerunner init selv om __MINBAGG_APP_RUNNING__ allerede er true.
    // Vi bruker flagget kun for debugging.
    window.__MINBAGG_APP_RUNNING__ = true;

    try {
      var supa = await ensureSupabaseClient();

      // Guest? -> vis toppliste + CTA alltid
      if (!marker.loggedIn) {
        var topRows = await fetchTop3ByType(supa, 3);
        renderGuest(root, topRows);
        log('[MINBAGG] guest render OK (' + (reason || 'init') + ')', VERSION);
        return;
      }

      // Innlogget i butikk, men ikke Supabase session?
      var sess = await supa.auth.getSession();
      var session = (sess && sess.data) ? sess.data.session : null;

      if (!session || !session.user) {
        // Vis connect view + toppliste i bakgrunnen (valgfritt)
        renderConnectView(root, marker, supa);
        log('[MINBAGG] connect view (' + (reason || 'init') + ')', VERSION);
        return;
      }

      var gu = await supa.auth.getUser();
      var user = (gu && gu.data) ? (gu.data.user || session.user) : (session.user || null);
      if (!user) {
        renderConnectView(root, marker, supa);
        log('[MINBAGG] connect view (no user) (' + (reason || 'init') + ')', VERSION);
        return;
      }

      var topRows2 = await fetchTop3ByType(supa, 3);
      renderLoggedApp(root, marker, supa, user, topRows2);
      log('[MINBAGG] app render OK (' + (reason || 'init') + ')', VERSION);

    } catch (err) {
      clear(root);
      var box = el('div', 'minbagg-app');
      box.appendChild(el('div', 'minbagg-banner', 'Min Bagg kunne ikke starte.'));
      box.appendChild(el('div', 'minbagg-muted', String(err && err.message ? err.message : err)));
      root.appendChild(box);
      log('[MINBAGG] fatal', err);
    }
  }

  // Expose re-init for pageshow/visibilitychange
  window.__MINBAGG_REINIT__ = function (why) {
    try { initOnce(why || 'reinit'); } catch (e) { log('[MINBAGG] reinit failed', e); }
  };

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initOnce('DOMContentLoaded'); });
  } else {
    initOnce('readyState');
  }
})();
