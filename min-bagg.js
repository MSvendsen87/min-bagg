/* ============================================================================
   GOLFKONGEN – MIN BAGG (v2026-01-27 10:22)
   - Kjør kun på /sider/min-bagg
   - Guest: viser CTA + Topp 3 globalt (fra Supabase)
   - Innlogget i butikk:
     - Hvis Supabase-session finnes: last/lagre bag i Supabase (mybag_bags)
     - Hvis ingen Supabase-session: vis "Koble Min Bagg" (magic link)

   DB (forventet):
     table: mybag_bags
     columns: email (text, PK/unique), bag (jsonb), updated_at (timestamptz)
============================================================================ */

(function () {
  'use strict';

  // Kjør kun på /sider/min-bagg
  var path = ((location && location.pathname) ? location.pathname : '').replace(/\/+$/, '').toLowerCase();
  if (path !== '/sider/min-bagg') return;
  if (window.__MINBAGG_APP_RUNNING__) return;
  window.__MINBAGG_APP_RUNNING__ = true;

  // Konfig (fra loader / global)
  var SUPA_URL = (window.GK_SUPABASE_URL || '').trim();
  var SUPA_ANON = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();

  function log() { try { console.log.apply(console, arguments); } catch (_) { } }

  // --- DOM helpers -----------------------------------------------------------
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

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function btn(label, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls || 'minbagg-btn';
    b.textContent = label;
    return b;
  }

  function linkBtn(label, href, cls) {
    var a = document.createElement('a');
    a.className = cls || 'minbagg-btn';
    a.href = href;
    a.textContent = label;
    return a;
  }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch (_) { return fallback; }
  }

  // --- Styles (lite, så vi matcher GolfKongen uten å kræsje tema) ------------
  function injectCss() {
    if (document.getElementById('minbagg-css')) return;
    var css = `
      .minbagg-wrap{max-width:1100px;margin:0 auto;padding:8px 0 24px;}
      .minbagg-banner{display:flex;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.06);border-radius:10px;padding:10px 12px;margin:10px 0 14px;}
      .minbagg-banner strong{font-weight:700}
      .minbagg-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;}
      @media(max-width:900px){.minbagg-grid{grid-template-columns:1fr;}}
      .minbagg-card{border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.15);
        border-radius:12px;padding:14px;}
      .minbagg-card h3{margin:0 0 10px;font-size:18px}
      .minbagg-muted{opacity:.75;font-size:13px;line-height:1.35}
      .minbagg-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .minbagg-input{flex:1;min-width:180px;border-radius:10px;border:1px solid rgba(255,255,255,.14);
        background:rgba(0,0,0,.25);padding:9px 10px;color:inherit}
      .minbagg-btn{border-radius:10px;border:1px solid rgba(255,255,255,.18);
        background:rgba(255,255,255,.08);padding:9px 12px;color:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
      .minbagg-btn.primary{background:rgba(40,180,80,.18);border-color:rgba(40,180,80,.35)}
      .minbagg-btn.danger{background:rgba(220,60,60,.14);border-color:rgba(220,60,60,.30)}
      .minbagg-list{display:flex;flex-direction:column;gap:10px}
      .minbagg-item{display:flex;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);border-radius:12px;padding:10px}
      .minbagg-item img{width:54px;height:54px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.10)}
      .minbagg-item .t{font-weight:700}
      .minbagg-item .s{opacity:.8;font-size:12px}
      .minbagg-right{display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-left:auto}
      .minbagg-pill{font-size:12px;padding:6px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);opacity:.9}
      .minbagg-top{display:flex;flex-direction:column;gap:10px}
      .minbagg-topgroup{border:1px solid rgba(255,255,255,.10);border-radius:12px;overflow:hidden}
      .minbagg-topgroup .hd{padding:10px 12px;background:rgba(255,255,255,.05);font-weight:700}
      .minbagg-topgroup .bd{padding:10px 12px;display:flex;flex-direction:column;gap:10px}
      .minbagg-topitem{display:flex;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;background:rgba(0,0,0,.10)}
      .minbagg-topitem .count{margin-left:auto;opacity:.8;font-size:12px}
      .minbagg-cta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px}
    `;
    var style = document.createElement('style');
    style.id = 'minbagg-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --- Supabase loader -------------------------------------------------------
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function (e) { reject(e || new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function getSupabaseClient() {
    if (!SUPA_URL || !SUPA_ANON) throw new Error('Missing Supabase config (GK_SUPABASE_URL / GK_SUPABASE_ANON_KEY)');
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return window.supabase.createClient(SUPA_URL, SUPA_ANON);
    }
    // Try load supabase-js UMD
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase client not available after load');
    }
    return window.supabase.createClient(SUPA_URL, SUPA_ANON);
  }

  // --- Quickbutik login marker ----------------------------------------------
  function readQuickbutikLoginState() {
    // Robust: prøv flere "kilder"
    var st = {
      loggedIn: false,
      firstName: '',
      emailHint: ''
    };

    // 1) Shopify-lignende? Quickbutik kan ha "customer" object i window et sted
    try {
      if (window.customer && window.customer.email) {
        st.loggedIn = true;
        st.emailHint = window.customer.email;
      }
    } catch (_) { }

    // 2) Se på DOM: "Logg inn" bytter ofte til "Kontoen din" eller navn
    try {
      var hdr = document.querySelector('header, .header, .site-header, #header');
      var txt = (hdr ? hdr.textContent : document.body.textContent) || '';
      // Enkel heuristikk: Hvis "Logg inn" finnes og "Kontoen din" ikke finnes -> guest
      var hasLogin = /logg inn/i.test(txt);
      var hasAccount = /kontoen din|konto|min side|logg ut/i.test(txt);
      if (hasAccount && !hasLogin) st.loggedIn = true;
    } catch (_) { }

    // 3) Globalt flagg fra loader (du har hatt dette i qs_functions)
    try {
      if (window.__GK_LOGGED_IN__ === true) st.loggedIn = true;
      if (typeof window.__GK_FIRSTNAME__ === 'string') st.firstName = window.__GK_FIRSTNAME__;
    } catch (_) { }

    return st;
  }

  // --- Data model ------------------------------------------------------------
  var state = {
    bag: [],              // [{name,url,image,addedAt}]
    email: '',            // from supa jwt email (innlogget) / or hint
    supa: null,           // supabase client
    supaSession: null,    // session
    readOnly: false,      // guest mode -> only show top3 + CTA
    root: null,           // mount
    top3: null            // cached top3
  };

  // --- Storage fallback (guest) ---------------------------------------------
  function lsKey() { return 'gk_minbagg_guest_bag_v1'; }
  function loadGuestBag() {
    var raw = localStorage.getItem(lsKey());
    var arr = safeJsonParse(raw, []);
    if (!Array.isArray(arr)) arr = [];
    return arr;
  }
  function saveGuestBag(arr) {
    try { localStorage.setItem(lsKey(), JSON.stringify(arr || [])); } catch (_) { }
  }

  // --- Supabase persistence --------------------------------------------------
  async function loadUserBag() {
    // mybag_bags: PK = email, bag jsonb
    var email = (state.supaSession && state.supaSession.user && state.supaSession.user.email) ? state.supaSession.user.email : '';
    state.email = email || state.email || '';
    if (!email) return [];
    var res = await state.supa.from('mybag_bags').select('bag').eq('email', email).maybeSingle();
    if (res && res.error) throw res.error;
    var bag = (res && res.data && res.data.bag) ? res.data.bag : [];
    if (!Array.isArray(bag)) bag = [];
    return bag;
  }

  async function saveUserBag(arr) {
    var email = (state.supaSession && state.supaSession.user && state.supaSession.user.email) ? state.supaSession.user.email : '';
    state.email = email || state.email || '';
    if (!email) throw new Error('Missing email in session');
    var payload = { email: email, bag: (arr || []) };
    var res = await state.supa.from('mybag_bags').upsert(payload, { onConflict: 'email' });
    if (res && res.error) throw res.error;
    return true;
  }

  // --- Popular discs (best-effort) ------------------------------------------
  async function incrementPopular(type, name, url, image) {
    // RPC: increment_popular_disc(p_type,p_name,p_url,p_image)
    // Denne er SECURITY DEFINER hos deg og kan fungere for anon/auth (avhengig av policy)
    if (!state.supa) return;
    if (!name) return;
    try {
      await state.supa.rpc('increment_popular_disc', {
        p_type: type || 'global',
        p_name: name || '',
        p_url: url || null,
        p_image: image || null
      });
    } catch (e) {
      // Ikke hard-feil – bare logg
      log('[MINBAGG] popular update failed', e);
    }
  }

  // --- UI --------------------------------------------------------------------
  function mountPoint() {
    // Finn et trygt sted å montere inni innholdet
    // Quickbutik: ofte <main> eller .content / .page-content
    var c = document.querySelector('.page-content, .content, main, #content, .container');
    if (!c) c = document.body;
    return c;
  }

  function findOrCreateRoot() {
    var id = 'minbagg-root';
    var old = document.getElementById(id);
    if (old) return old;

    var h1 = document.querySelector('h1');
    var root = document.createElement('div');
    root.id = id;
    root.className = 'minbagg-wrap';

    // Sett root rett etter H1 hvis mulig (så vi ikke havner helt nede i footer)
    if (h1 && h1.parentNode) {
      // Finn en fornuftig container: ofte h1 ligger i innholdet
      h1.parentNode.insertBefore(root, h1.nextSibling);
    } else {
      mountPoint().appendChild(root);
    }
    return root;
  }

  function renderBanner(root) {
    var b = el('div', 'minbagg-banner');
    b.appendChild(el('div', '', '🚧'));
    var t = el('div', '');
    t.appendChild(elHtml('div', '', '<strong>Under konstruksjon</strong>  Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.'));
    b.appendChild(t);
    root.appendChild(b);
  }

  function renderGuestCTA(root) {
    var card = el('div', 'minbagg-card');
    card.appendChild(el('h3', '', 'Min Bagg'));
    card.appendChild(el('div', 'minbagg-muted', 'Du må være innlogget i nettbutikken for å lagre og bygge baggen din.'));
    var cta = el('div', 'minbagg-cta');
    // Quickbutik login url – juster om du har egen
    cta.appendChild(linkBtn('Logg inn', '/login', 'minbagg-btn primary'));
    cta.appendChild(linkBtn('Opprett konto', '/customer/account/create', 'minbagg-btn'));
    card.appendChild(cta);
    root.appendChild(card);
  }

  function renderBagList(listNode) {
    clear(listNode);
    if (!state.bag || !state.bag.length) {
      listNode.appendChild(el('div', 'minbagg-muted', 'Baggen din er tom ennå.'));
      return;
    }

    var wrap = el('div', 'minbagg-list');
    state.bag.forEach(function (it, idx) {
      var row = el('div', 'minbagg-item');
      var img = document.createElement('img');
      img.alt = it.name || '';
      img.src = it.image || 'https://cdn.quickbutik.com/images/52923d/theme/placeholder.png';
      row.appendChild(img);

      var mid = el('div', '');
      mid.appendChild(el('div', 't', it.name || ''));
      mid.appendChild(el('div', 's', it.url || ''));
      row.appendChild(mid);

      var right = el('div', 'minbagg-right');
      right.appendChild(el('span', 'minbagg-pill', (it.addedAt || '')));
      if (!state.readOnly) {
        var rm = btn('Fjern', 'minbagg-btn danger');
        rm.addEventListener('click', function () {
          state.bag.splice(idx, 1);
          persistBag();
          renderBag();
        });
        right.appendChild(rm);
      }
      row.appendChild(right);

      wrap.appendChild(row);
    });
    listNode.appendChild(wrap);
  }

  function renderTop3Into(node, top3) {
    clear(node);
    if (!top3 || !top3.length) {
      node.appendChild(el('div', 'minbagg-muted', 'Ingen data ennå.'));
      return;
    }

    var container = el('div', 'minbagg-top');

    top3.forEach(function (g) {
      var group = el('div', 'minbagg-topgroup');
      var hd = el('div', 'hd', g.group || 'Discs');
      var bd = el('div', 'bd');

      (g.items || []).slice(0, 3).forEach(function (it) {
        var row = el('div', 'minbagg-topitem');
        row.appendChild(el('div', '', it.name || ''));

        var cnt = el('div', 'count', 'Valgt ' + (it.count || 0) + ' ganger');
        row.appendChild(cnt);
        bd.appendChild(row);
      });

      group.appendChild(hd);
      group.appendChild(bd);
      container.appendChild(group);
    });

    node.appendChild(container);
  }

  // --- Search (Quickbutik JSON search) --------------------------------------
  async function qbSearch(query) {
    // Quickbutik JSON endpoint (du testet dette med fetch('/shop/search?s=buzzz&out=json&limit=12')
    var url = '/shop/search?s=' + encodeURIComponent(query) + '&out=json&limit=12';
    var r = await fetch(url, { credentials: 'same-origin' });
    var t = await r.text();
    var j = safeJsonParse(t, null);
    if (!j || !j.searchresults) return [];
    var out = [];
    for (var i = 0; i < j.searchresults.length; i++) {
      var sr = j.searchresults[i];
      if (!sr || !sr.product) continue;
      var p = sr.product;
      out.push({
        name: (p.title || p.name || ''),
        url: (p.url || p.producturl || p.link || ''),
        image: (p.firstimage || p.image || p.image1 || ''),
      });
    }
    return out.filter(function (x) { return x.name; });
  }

  // --- Bag persistence debounce ---------------------------------------------
  var saveTimer = null;
  function scheduleSave() {
    if (state.readOnly) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      persistBag().catch(function (e) { log('[MINBAGG] save failed', e); });
    }, 700);
  }

  async function persistBag() {
    if (state.readOnly) {
      saveGuestBag(state.bag);
      return true;
    }
    await saveUserBag(state.bag);
    return true;
  }

  // --- Render main app -------------------------------------------------------
  function renderApp(root) {
    clear(root);
    renderBanner(root);

    var grid = el('div', 'minbagg-grid');
    var left = el('div', '');
    var right = el('div', '');

    // --- Right: Top 3 global
    var topCard = el('div', 'minbagg-card');
    topCard.appendChild(el('h3', '', 'Topp 3 globalt'));
    var topInner = el('div', 'minbagg-muted', 'Laster…');
    topCard.appendChild(topInner);
    right.appendChild(topCard);

    // Guest mode: CTA on left, top3 only
    if (state.readOnly) {
      renderGuestCTA(left);
      grid.appendChild(left);
      grid.appendChild(right);
      root.appendChild(grid);
      // Top3 is loaded async by init
      return;
    }

    // Logged in: full UI on left + top3 on right
    var addCard = el('div', 'minbagg-card');
    addCard.appendChild(el('h3', '', 'Legg til disk'));

    var searchRow = el('div', 'minbagg-row');
    var searchInput = document.createElement('input');
    searchInput.className = 'minbagg-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Søk i nettbutikken (f.eks. Buzzz)…';

    searchRow.appendChild(searchInput);
    addCard.appendChild(searchRow);

    var results = el('div', '');
    addCard.appendChild(results);

    // Manual add
    var manual = el('div', 'minbagg-card');
    manual.appendChild(el('h3', '', 'Legg til manuelt'));
    var manRow = el('div', 'minbagg-row');

    var manName = document.createElement('input');
    manName.className = 'minbagg-input';
    manName.type = 'text';
    manName.placeholder = 'Navn (f.eks. Buzzz)';
    manRow.appendChild(manName);

    var manUrl = document.createElement('input');
    manUrl.className = 'minbagg-input';
    manUrl.type = 'text';
    manUrl.placeholder = 'URL (valgfritt)';
    manRow.appendChild(manUrl);

    var manBtn = el('button', 'minbagg-btn primary', 'Legg til');
    manRow.appendChild(manBtn);
    manual.appendChild(manRow);

    // Bag list
    var bagCard = el('div', 'minbagg-card');
    bagCard.appendChild(el('h3', '', 'Baggen din'));
    var bagList = el('div', '');
    bagCard.appendChild(bagList);

    left.appendChild(addCard);
    left.appendChild(manual);
    left.appendChild(bagCard);

    grid.appendChild(left);
    grid.appendChild(right);
    root.appendChild(grid);

    // local helpers inside render
    function addDisc(item) {
      if (!item || !item.name) return;
      var it = {
        name: item.name,
        url: item.url || '',
        image: item.image || '',
        addedAt: new Date().toISOString().slice(0, 10)
      };

      // Unngå duplikater (case-insensitiv)
      var key = (it.name || '').trim().toLowerCase();
      var exists = (state.bag || []).some(function (x) {
        return ((x.name || '').trim().toLowerCase() === key);
      });
      if (exists) return;

      // Best-effort: tell global popular (type brukes senere)
      incrementPopular('global', it.name, it.url || null, it.image || null).then(function () {
        // Refresh top3 after increment
        return fetchTop3(state.supa);
      }).then(function (top3) {
        state.top3 = top3;
        if (app && app.__renderTop3) app.__renderTop3(top3);
      }).catch(function (e) {
        log('[MINBAGG] popular update failed', e);
      });

      state.bag.unshift(it);
      renderBag();
      scheduleSave();
    }

    function renderBag() {
      renderBagList(bagList);
    }

    // Expose render hook for top3
    var app = window.__MINBAGG_APP__ || (window.__MINBAGG_APP__ = {});
    app.__renderTop3 = function (top3) { renderTop3Into(topInner, top3); };

    // Manual add button
    manBtn.addEventListener('click', function () {
      var n = (manName.value || '').trim();
      if (!n) return;
      addDisc({
        name: n,
        url: (manUrl.value || '').trim(),
        image: ''
      });
      manName.value = '';
      manUrl.value = '';
    });

    // Search UX
    var searchTimer = null;

    function setResultsLoading() {
      clear(results);
      results.appendChild(el('div', 'minbagg-muted', 'Søker…'));
    }

    function setResultsEmpty(msg) {
      clear(results);
      results.appendChild(el('div', 'minbagg-muted', msg || 'Ingen treff.'));
    }

    function renderResults(items) {
      clear(results);
      if (!items || !items.length) {
        setResultsEmpty('Ingen treff. Prøv annet søk, eller legg til manuelt.');
        return;
      }
      var wrap = el('div', 'minbagg-list');
      for (var i = 0; i < items.length; i++) {
        (function (p) {
          var box = el('div', 'minbagg-item');

          var img = document.createElement('img');
          img.src = p.image || 'https://cdn.quickbutik.com/images/52923d/theme/placeholder.png';
          img.alt = p.name || '';
          box.appendChild(img);

          var mid = el('div', '');
          mid.style.flex = '1 1 auto';
          mid.appendChild(el('div', 't', p.name || ''));
          var ar = el('div', 's', p.url || '');
          mid.appendChild(ar);
          box.appendChild(mid);

          var act = el('div', 'minbagg-right');
          var b = el('button', 'minbagg-btn primary', 'Legg til');
          b.addEventListener('click', function () {
            addDisc(p);
          });
          act.appendChild(b);
          box.appendChild(act);

          wrap.appendChild(box);
        })(items[i]);
      }
      results.appendChild(wrap);
    }

    searchInput.addEventListener('input', function () {
      var q = (searchInput.value || '').trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (!q) { clear(results); return; }
      searchTimer = setTimeout(async function () {
        setResultsLoading();
        try {
          var items = await qbSearch(q);
          renderResults(items);
        } catch (err) {
          setResultsEmpty('Kunne ikke søke akkurat nå.');
          log('[MINBAGG] search error', err);
        }
      }, 250);
    });

    // Initial render bag
    renderBag();
  }

} // <-- VIKTIG: dette var den manglende klammen som ga "Unexpected token" på slutten

  // --- Global top3 data ------------------------------------------------------
  async function fetchTop3(supa) {
    // Forventet view/table: mybag_popular
    try {
      var res = await supa.from('mybag_popular').select('*').limit(200);
      if (res && res.error) throw res.error;
      var rows = (res && res.data) ? res.data : [];

      var by = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        var g = r.group || r.disc_group || r.category || 'Discs';
        if (!by[g]) by[g] = [];
        by[g].push({
          name: r.name || r.disc_name || r.disc || '',
          url: r.url || r.product_url || r.link || '',
          count: r.count || r.total || 0
        });
      }

      var out = [];
      var groups = Object.keys(by);
      for (var j = 0; j < groups.length; j++) {
        var gk = groups[j];
        var arr = by[gk].slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); }).slice(0, 3);
        out.push({ group: gk, items: arr });
      }
      out.sort(function (a, b) { return (a.group || '').localeCompare(b.group || ''); });
      return out;
    } catch (err) {
      log('[MINBAGG] top3 fetch failed', err);
      return [];
    }
  }

  // --- Main init -------------------------------------------------------------
  async function __minbaggInit() {
    injectCss();

    state.root = findOrCreateRoot();

    // Read login state (Quickbutik)
    var st = readQuickbutikLoginState();

    log('[MINBAGG] login marker:', st.loggedIn ? 'LOGGED IN' : 'GUEST', st.firstName ? '(' + st.firstName + ')' : '');

    // Guest: still show page, but only read-only (top3 + CTA)
    if (!st.loggedIn) {
      log('[MINBAGG] guest detected - loading read-only app');
      state.readOnly = true;

      try {
        state.supa = await getSupabaseClient();
        state.top3 = await fetchTop3(state.supa);
      } catch (e) {
        log('[MINBAGG] could not init supa in guest', e);
        state.top3 = [];
      }

      renderApp(state.root);

      // Render top3 in app (right column)
      try {
        var app = window.__MINBAGG_APP__ || (window.__MINBAGG_APP__ = {});
        var root = state.root;
        // Find top3 container (first .minbagg-card on right)
        var topCard = root.querySelector('.minbagg-card:nth-of-type(1) .minbagg-muted') || root.querySelector('.minbagg-card .minbagg-muted');
        if (topCard) {
          // Attempt to render into the closest card's inner element
          var card = topCard.parentNode;
          var inner = card && card.querySelector('.minbagg-muted');
          if (inner) renderTop3Into(inner, state.top3 || []);
        }
      } catch (e2) {
        log('[MINBAGG] top3 render failed', e2);
      }

      log('[MINBAGG] app loaded OK');
      return;
    }

    // Logged in: full init with Supabase auth session
    state.readOnly = false;

    try {
      state.supa = await getSupabaseClient();
      var sessRes = await state.supa.auth.getSession();
      state.supaSession = (sessRes && sessRes.data) ? sessRes.data.session : null;

      if (!state.supaSession) {
        // No Supabase session even though Quickbutik says logged in -> show connect CTA
        state.readOnly = true;
        renderApp(state.root);
        log('[MINBAGG] no supa session - switched to readOnly');
        return;
      }

      // Load bag from Supabase
      state.bag = await loadUserBag();
      if (!Array.isArray(state.bag)) state.bag = [];
      // Load top3
      state.top3 = await fetchTop3(state.supa);

      // Render full app
      renderApp(state.root);

      // Hook for Top3
      var app = window.__MINBAGG_APP__ || (window.__MINBAGG_APP__ = {});
      if (app && app.__renderTop3) app.__renderTop3(state.top3 || []);

      log('[MINBAGG] app loaded OK');

    } catch (err) {
      clear(state.root);
      state.root.appendChild(el('div', 'minbagg-muted', 'Min Bagg kunne ikke starte: ' + (err && err.message ? err.message : String(err))));
      log('[MINBAGG] fatal', err);
    }
  }

  // Kjør init både før/etter DOMContentLoaded (så den aldri “mister” eventen)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __minbaggInit);
  } else {
    setTimeout(__minbaggInit, 0);
  }
})();
