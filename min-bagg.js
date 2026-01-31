/* ============================================================================
   GOLFKONGEN – MIN BAGG (SAFE)
   - Kjør kun på /sider/min-bagg
   - Guest: viser CTA + Topp 3 globalt (fra Supabase view mybag_popular)
   - Innlogget i butikk:
       - Hvis Supabase-session finnes: last/lagre bag i Supabase (mybag_bags)
       - Hvis ingen Supabase-session: vis “Koble Min Bagg” (magic link)
   - DB (forventet):
       table: mybag_bags
       columns: email (text, PK/unique), bag (jsonb), updated_at (timestamptz)
   ============================================================================ */
(function () {
  'use strict';

  // Kjør kun på /sider/min-bagg
  var path = ((location && location.pathname) ? location.pathname : '').replace(/\/+$/, '').toLowerCase();
  if (path !== '/sider/min-bagg') return;

  // Unngå dobbel init, men vi tillater pageshow-refresh av toppliste
  if (window.__MINBAGG_APP_RUNNING__) return;
  window.__MINBAGG_APP_RUNNING__ = true;

  // -------------------- Config (fra loader / global) ------------------------
  function getSupaConfig() {
    var url = (window.GK_SUPABASE_URL || '').trim();
    var anon = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();
    return { url: url, anon: anon };
  }

  function log() { try { console.log.apply(console, arguments); } catch (_) {} }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // -------------------- DOM helpers ----------------------------------------
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
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  // -------------------- Styles ---------------------------------------------
  function injectStyles() {
    if (document.getElementById('minbagg-style')) return;
    var css = ''
      + '.minbagg-app{max-width:980px}'
      + '.minbagg-banner{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);padding:10px 12px;border-radius:10px;margin:8px 0 14px}'
      + '.minbagg-banner strong{display:inline-block;margin-right:8px}'
      + '.minbagg-muted{opacity:.85}'
      + '.minbagg-card{border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.10);border-radius:12px;padding:12px;margin:10px 0}'
      + '.minbagg-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}'
      + '.minbagg-row > *{flex:0 0 auto}'
      + '.minbagg-input{min-width:240px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.20);color:#fff;outline:none}'
      + '.minbagg-input:focus{border-color:rgba(255,255,255,.35)}'
      + '.minbagg-btn{cursor:pointer;user-select:none;border-radius:10px;padding:8px 10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff}'
      + '.minbagg-btn:hover{background:rgba(255,255,255,.10)}'
      + '.minbagg-btn.primary{border-color:rgba(44,174,96,.55);background:rgba(44,174,96,.14)}'
      + '.minbagg-btn.primary:hover{background:rgba(44,174,96,.20)}'
      + '.minbagg-btn.danger{border-color:rgba(220,53,69,.55);background:rgba(220,53,69,.14)}'
      + '.minbagg-btn.danger:hover{background:rgba(220,53,69,.20)}'
      + '.minbagg-results{margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}'
      + '.minbagg-res{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center;background:rgba(0,0,0,.10)}'
      + '.minbagg-res img{width:44px;height:44px;object-fit:cover;border-radius:10px;flex:0 0 auto}'
      + '.minbagg-res .t{font-weight:600;line-height:1.2}'
      + '.minbagg-res .a{margin-top:4px}'
      + '.minbagg-baglist{display:flex;flex-direction:column;gap:8px}'
      + '.minbagg-item{display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px;background:rgba(0,0,0,.10)}'
      + '.minbagg-item img{width:48px;height:48px;object-fit:cover;border-radius:10px}'
      + '.minbagg-item .meta{flex:1 1 auto;min-width:140px}'
      + '.minbagg-item .meta a{color:inherit;text-decoration:none}'
      + '.minbagg-item .meta a:hover{text-decoration:underline}'
      + '.minbagg-item .sub{opacity:.85;font-size:12px;margin-top:2px}'
      + '.minbagg-split{display:grid;grid-template-columns:1fr;gap:10px}'
      + '@media(min-width:900px){.minbagg-split{grid-template-columns:1fr 1fr}}';
    var st = document.createElement('style');
    st.id = 'minbagg-style';
    st.type = 'text/css';
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  // -------------------- Login marker fra theme ------------------------------
  function getLoginMarker() {
    var m = document.getElementById('gk-login-marker');
    if (!m) return { loggedIn: false, firstname: '', email: '' };
    var ds = m.dataset || {};
    var li = (ds.loggedIn || ds.loggedin || '0') + '';
    return {
      loggedIn: li === '1',
      firstname: ds.firstname || '',
      email: ds.email || ''
    };
  }

  // -------------------- Root ------------------------------------------------
  function ensureRoot() {
    var root = document.getElementById('min-bagg-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'min-bagg-root';
    var host = document.getElementById('page-content-area') || document.body;
    host.appendChild(root);
    return root;
  }

  // -------------------- Supabase loader/client ------------------------------
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

  // -------------------- Storage helpers (fallback) --------------------------
  var LS_KEY = 'GK_MINBAGG_BAG_V1';
  function lsLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []; } catch (_) { return []; }
  }
  function lsSave(bag) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(bag || [])); } catch (_) {}
  }

  // -------------------- DB: load/save bag via Supabase ----------------------
  async function dbLoadBag(supa, email) {
    if (!email) return null;
    var res = await supa.from('mybag_bags').select('bag').eq('email', email).maybeSingle();
    if (res && res.error) throw res.error;
    if (!res || !res.data) return null;
    return res.data.bag || null;
  }

  async function dbSaveBag(supa, email, bag) {
    if (!email) throw new Error('Mangler e-post på Supabase-bruker.');
    var payload = { email: email, bag: bag || [], updated_at: new Date().toISOString() };
    var res = await supa.from('mybag_bags').upsert(payload, { onConflict: 'email' }).select('email').maybeSingle();
    if (res && res.error) throw res.error;
    return true;
  }

  // -------------------- Quickbutik search -----------------------------------
  function safeStr(x) { return (x == null) ? '' : String(x); }

  function pickProduct(p) {
    var name = p.name || p.title || p.product_name || p.producttitle || p.productTitle || p.heading || '';
    var url  = p.url || p.producturl || p.link || p.href || p.uri || '';
    var img  = p.firstimage || p.image || p.first_image || p.firstImage || '';
    if (!url && p.id) url = '/shop/product/' + p.id;
    return { name: safeStr(name).trim(), url: safeStr(url).trim(), image: safeStr(img).trim() };
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

  // -------------------- UI --------------------------------------------------
  function bannerHtml() {
    return '<strong>🚧 Under konstruksjon</strong>'
      + 'Denne siden er under utvikling og kan endre seg fra dag til dag. '
      + 'Takk for tålmodigheten – full versjon kommer snart.';
  }

  function renderNeedShopLogin(root) {
    root.innerHTML =
      '<div class="minbagg-wrap">' +

        '<div class="minbagg-card" style="margin:12px 0;padding:16px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">' +
          '<h2 style="margin:0 0 6px 0;">Min Bagg</h2>' +
          '<p style="margin:0 0 10px 0;opacity:.9;">' +
            'Du må være innlogget i nettbutikken for å lagre og bygge baggen din.' +
            ' Du kan likevel se <strong>Topp 3 globalt</strong> uten innlogging.' +
          '</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 0 0;">' +
            '<a href="/customer/login" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#2e8b57;color:#fff;text-decoration:none;">Logg inn</a>' +
            '<a href="/customer/register" style="display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.25);color:#fff;text-decoration:none;">Opprett konto</a>' +
          '</div>' +
        '</div>' +

        '<div id="minbagg-top3-box" class="minbagg-card" style="margin:12px 0;padding:16px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">' +
          '<h3 style="margin:0 0 8px 0;">Topp 3 globalt</h3>' +
          '<div id="minbagg-top3-list" style="opacity:.9;">Laster…</div>' +
        '</div>' +

      '</div>';
  }

  function renderConnectView(root, marker, supa) {
    clear(root);

    var app = el('div', 'minbagg-app');
    app.appendChild(elHtml('div', 'minbagg-banner', bannerHtml()));
    app.appendChild(el('h2', '', 'Min Bagg'));

    var card = el('div', 'minbagg-card');
    card.appendChild(el('div', 'minbagg-muted',
      'Du er innlogget i nettbutikken. For å kunne lagre Min Bagg på tvers av enheter kobler vi deg til lagringen (Supabase) via en engangslink på e-post.'));

    var ul = el('ul', '');
    ul.appendChild(el('li', '', 'Dette gjøres normalt bare én gang per enhet/nettleser.'));
    ul.appendChild(el('li', '', 'Etterpå blir du husket automatisk (så lenge du ikke bruker inkognito / sletter cookies/lagring).'));
    ul.appendChild(el('li', '', 'Bytter du mobil/PC/nettleser, må du koble til på nytt der.'));
    card.appendChild(ul);

    var form = el('div', 'minbagg-row');
    var email = (marker.email || '').trim();
    var inp = document.createElement('input');
    inp.className = 'minbagg-input';
    inp.type = 'email';
    inp.placeholder = 'E-post (for engangslink)';
    inp.value = email || '';
    form.appendChild(inp);

    var btn = el('button', 'minbagg-btn primary', 'Send engangslink');
    form.appendChild(btn);

    var msg = el('div', 'minbagg-muted');
    msg.style.marginTop = '8px';
    msg.textContent = 'Tips: bruk samme e-post som kontoen din i nettbutikken.';
    card.appendChild(form);
    card.appendChild(msg);

    btn.addEventListener('click', async function () {
      var e = (inp.value || '').trim();
      if (!e || e.indexOf('@') === -1) {
        msg.textContent = 'Skriv inn en gyldig e-post først.';
        return;
      }
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

  // -------------------- Global Top 3 (simple: disc + picks) -----------------
  async function fetchPopularTop3Rows(supa) {
    try {
      var res = await supa.from('mybag_popular').select('*').order('picks', { ascending: false }).limit(3);
      if (res && res.error) throw res.error;
      return (res && res.data) ? res.data : [];
    } catch (err) {
      log('[MINBAGG] popular top3 fetch failed', err);
      return [];
    }
  }

  function renderGuestTop3(rows) {
    var box = document.getElementById('minbagg-top3-list');
    if (!box) return;

    rows = rows || [];
    if (!rows.length) {
      box.innerHTML = '<div style="opacity:.85;">Ingen data ennå. Legg til noen disker (innlogget) så dukker topplista opp her 👑</div>';
      return;
    }

    var html = '<ol style="margin:0;padding-left:18px;">';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var name = (r.disc || r.name || r.title || 'Ukjent').toString();
      var picks = (r.picks != null ? r.picks : (r.count != null ? r.count : ''));
      html += '<li style="margin:6px 0;">'
        + '<span style="font-weight:700;">' + escapeHtml(name) + '</span>'
        + (picks !== '' ? (' <span style="opacity:.75;">(' + escapeHtml(String(picks)) + ')</span>') : '')
        + '</li>';
    }
    html += '</ol>';
    box.innerHTML = html;
  }

  // -------------------- App (innlogget + Supabase-session) -------------------
  function renderApp(root, marker, supa, supaUser) {
    clear(root);

    var state = { bag: [], lastSavedAt: null };

    var app = el('div', 'minbagg-app');
    app.appendChild(elHtml('div', 'minbagg-banner', bannerHtml()));
    app.appendChild(el('h2', '', 'Min Bagg'));

    var hello = el('div', 'minbagg-muted', 'Hei ' + (marker.firstname || 'der') + ' 👋  Baggen din lagres på kontoen din.');
    app.appendChild(hello);

    var actions = el('div', 'minbagg-row');
    var btnLogout = el('button', 'minbagg-btn', 'Koble fra (logg ut Min Bagg)');
    actions.appendChild(btnLogout);
    app.appendChild(actions);

    btnLogout.addEventListener('click', async function () {
      btnLogout.disabled = true;
      try { await supa.auth.signOut(); } catch (_) {}
      location.reload();
    });

    var split = el('div', 'minbagg-split');

    // LEFT
    var left = el('div', '');

    var addCard = el('div', 'minbagg-card');
    addCard.appendChild(el('h3', '', 'Legg til disk'));

    var addRow = el('div', 'minbagg-row');

    var searchInput = document.createElement('input');
    searchInput.className = 'minbagg-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Søk i nettbutikken (f.eks. buzzz, luna, md3)…';
    addRow.appendChild(searchInput);

    var addHint = el('div', 'minbagg-muted', 'Søk for å få forslag. Trykk “Legg til” på riktig disk.');
    addHint.style.flex = '1 1 260px';
    addRow.appendChild(addHint);

    addCard.appendChild(addRow);

    var results = el('div', 'minbagg-results');
    addCard.appendChild(results);

    // Manual add
    var manual = el('div', 'minbagg-card');
    manual.appendChild(el('h4', '', 'Legg til manuelt'));
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

    // Bag
    var bagCard = el('div', 'minbagg-card');
    bagCard.appendChild(el('h3', '', 'Baggen din'));
    var bagList = el('div', 'minbagg-baglist');
    bagCard.appendChild(bagList);

    left.appendChild(addCard);
    left.appendChild(manual);
    left.appendChild(bagCard);

    // RIGHT
    var right = el('div', '');
    var topCard = el('div', 'minbagg-card');
    topCard.appendChild(el('h3', '', 'Topp 3 globalt'));
    var topInner = el('div', 'minbagg-muted', 'Laster…');
    topCard.appendChild(topInner);
    right.appendChild(topCard);

    split.appendChild(left);
    split.appendChild(right);
    app.appendChild(split);
    root.appendChild(app);

    function renderBag() {
      clear(bagList);
      if (!state.bag.length) {
        bagList.appendChild(el('div', 'minbagg-muted', 'Ingen disker lagt til enda.'));
        return;
      }
      for (var i = 0; i < state.bag.length; i++) {
        (function (idx) {
          var it = state.bag[idx] || {};
          var row = el('div', 'minbagg-item');

          if (it.image) {
            var img = document.createElement('img');
            img.src = it.image;
            img.alt = it.name || '';
            row.appendChild(img);
          } else {
            row.appendChild(el('div', 'minbagg-muted', ''));
          }

          var meta = el('div', 'meta');
          var title = document.createElement(it.url ? 'a' : 'div');
          if (it.url) {
            title.href = it.url;
            title.target = '_self';
            title.rel = 'nofollow';
          }
          title.textContent = it.name || '(uten navn)';
          meta.appendChild(title);

          var sub = el('div', 'sub', it.addedAt ? ('Lagt til: ' + it.addedAt) : '');
          meta.appendChild(sub);
          row.appendChild(meta);

          var rm = el('button', 'minbagg-btn danger', 'Fjern');
          rm.addEventListener('click', function () {
            state.bag.splice(idx, 1);
            lsSave(state.bag);
            renderBag();
            scheduleSave();
          });
          row.appendChild(rm);

          bagList.appendChild(row);
        })(i);
      }
    }

    function normalizeBagItem(p) {
      var n = (p && p.name ? String(p.name) : '').trim();
      if (!n) return null;
      return {
        name: n,
        url: (p.url ? String(p.url) : '').trim(),
        image: (p.image ? String(p.image) : '').trim(),
        addedAt: new Date().toISOString().slice(0, 10)
      };
    }

    function addDisc(p) {
      var it = normalizeBagItem(p);
      if (!it) return;
      for (var i = 0; i < state.bag.length; i++) {
        var ex = state.bag[i];
        if (it.url && ex.url && it.url === ex.url) return;
        if (!it.url && ex.name && ex.name.toLowerCase() === it.name.toLowerCase()) return;
      }
      state.bag.unshift(it);
      lsSave(state.bag);
      renderBag();
      scheduleSave();
    }

    manBtn.addEventListener('click', function () {
      var n = (manName.value || '').trim();
      if (!n) return;
      addDisc({ name: n, url: (manUrl.value || '').trim(), image: '' });
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
      if (!items || !items.length) { setResultsEmpty('Ingen treff. Prøv annet søk, eller legg til manuelt.'); return; }

      for (var i = 0; i < items.length; i++) {
        (function (p) {
          var box = el('div', 'minbagg-res');
          if (p.image) {
            var im = document.createElement('img');
            im.src = p.image;
            im.alt = p.name || '';
            box.appendChild(im);
          } else {
            box.appendChild(el('div', 'minbagg-muted', ''));
          }
          var mid = el('div', '');
          mid.style.flex = '1 1 auto';
          mid.appendChild(el('div', 't', p.name || ''));
          var act = el('div', 'a');
          var b = el('button', 'minbagg-btn primary', 'Legg til');
          b.addEventListener('click', function () { addDisc(p); });
          act.appendChild(b);
          mid.appendChild(act);
          box.appendChild(mid);
          results.appendChild(box);
        })(items[i]);
      }
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

    // Save debounce
    var saveTimer = null;
    var savingNow = false;

    async function doSaveNow() {
      if (savingNow) return;
      savingNow = true;
      try {
        await dbSaveBag(supa, supaUser.email, state.bag);
        state.lastSavedAt = new Date();
      } catch (err) {
        log('[MINBAGG] save failed', err);
      } finally {
        savingNow = false;
      }
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(doSaveNow, 600);
    }

    // Init load: LS først, så DB
    (async function initBag() {
      state.bag = lsLoad();
      renderBag();
      try {
        var dbBag = await dbLoadBag(supa, supaUser.email);
        if (dbBag && Array.isArray(dbBag)) {
          state.bag = dbBag;
          lsSave(state.bag);
          renderBag();
        }
      } catch (err) {
        log('[MINBAGG] load failed', err);
      }
    })();

    // Top3 in logged-in view (samme kilde)
    (async function initTop3() {
      try {
        var rows = await fetchPopularTop3Rows(supa);
        if (!rows || !rows.length) {
          topInner.textContent = 'Ingen globale data enda.';
          return;
        }
        var html = '<ol style="margin:0;padding-left:18px;">';
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var name = (r.disc || 'Ukjent');
          var picks = (r.picks != null ? r.picks : '');
          html += '<li style="margin:6px 0;">'
            + '<span style="font-weight:700;">' + escapeHtml(name) + '</span>'
            + (picks !== '' ? (' <span style="opacity:.75;">(' + escapeHtml(String(picks)) + ')</span>') : '')
            + '</li>';
        }
        html += '</ol>';
        topInner.innerHTML = html;
      } catch (e) {
        topInner.textContent = 'Kunne ikke laste toppliste.';
      }
    })();
  }

  // -------------------- MAIN init ------------------------------------------
  document.addEventListener('DOMContentLoaded', async function () {
    injectStyles();
    var root = ensureRoot();
    var marker = getLoginMarker();

    try {
      var supa = await ensureSupabaseClient();

      // Guest: CTA + top3 (med BFCache-fix)
      if (!marker.loggedIn) {
        renderNeedShopLogin(root);

        // Global refresh-funksjon (brukes også på pageshow)
        window.__MINBAGG_REFRESH_GUEST_TOP3__ = async function () {
          var box = document.getElementById('minbagg-top3-list');
          if (!box) return;
          box.textContent = 'Laster…';
          var rows = await fetchPopularTop3Rows(supa);
          renderGuestTop3(rows);
        };

        // Kjør nå
        window.__MINBAGG_REFRESH_GUEST_TOP3__();

        // Kjør igjen ved BFCache (logout/back uten full reload)
        window.addEventListener('pageshow', function () {
          try { window.__MINBAGG_REFRESH_GUEST_TOP3__(); } catch (_) {}
        });

        return;
      }

      // Innlogget i butikk: krever Supabase-session for å lagre bag
      var sess = await supa.auth.getSession();
      var session = (sess && sess.data) ? sess.data.session : null;

      if (!session || !session.user) {
        renderConnectView(root, marker, supa);
        return;
      }

      var gu = await supa.auth.getUser();
      var user = (gu && gu.data) ? gu.data.user : (session.user || null);
      if (!user) {
        renderConnectView(root, marker, supa);
        return;
      }

      renderApp(root, marker, supa, user);
      log('[MINBAGG] app loaded OK');
    } catch (err) {
      clear(root);
      root.appendChild(el('div', 'minbagg-muted',
        'Min Bagg kunne ikke starte: ' + (err && err.message ? err.message : String(err))));
      log('[MINBAGG] fatal', err);
    }
  });
})();
