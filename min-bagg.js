/* ============================================================================
   GOLFKONGEN – MIN BAGG (v2026-01-31 + TOP3 RPC v1)
   - Kjør kun på /sider/min-bagg
   - Guest: viser CTA + Topp 3 per kategori (fra popular_discs via RPC get_mybag_top3)
   - Innlogget i butikk:
       - Hvis Supabase-session finnes: last/lagre bag i Supabase (mybag_bags)
       - Hvis ingen Supabase-session: vis “Koble Min Bagg” (magic link) + Topp 3
   - DB (forventet):
       table: mybag_bags
       columns: email (text, PK/unique), bag (jsonb), updated_at (timestamptz)
   ============================================================================ */
(function () {
  'use strict';

  // Kun på denne siden
  var p = (location && location.pathname) ? String(location.pathname) : '';
  p = p.replace(/\/+$/, '');
  if (p !== '/sider/min-bagg') return;

  // Tillat re-init når Quickbutik navigerer uten full reload (PJAX/BFCache)
window.__MINBAGG_BOOT__ = window.__MINBAGG_BOOT__ || null;

// Per-side guard (ikke global for hele nettleser-økten)
var RUN_KEY = 'minbagg:' + ((location && location.pathname) ? String(location.pathname) : '');
if (window.__MINBAGG_RUN_KEY__ === RUN_KEY && window.__MINBAGG_APP_RUNNING__) return;
window.__MINBAGG_RUN_KEY__ = RUN_KEY;
window.__MINBAGG_APP_RUNNING__ = true;


  // -------------------- helpers ---------------------------------------------
  function log() { try { console.log.apply(console, arguments); } catch (_) {} }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function elHtml(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    e.innerHTML = html || '';
    return e;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // -------------------- config ----------------------------------------------
  // Konfig hentes fra loaderen (qs_functions.js)
  function getSupaConfig() {
    var url = (window.GK_SUPABASE_URL || '').trim();
    var anon = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();
    return { url: url, anon: anon };
  }

  // -------------------- styles ----------------------------------------------
  function injectStyles() {
    if (document.getElementById('minbagg-style')) return;

    var css = ''
      + '.minbagg-app{max-width:1100px;margin:0 auto;padding:14px;color:#e8eef6}'
      + '.minbagg-banner{padding:10px 12px;border-radius:12px;background:rgba(255,165,0,.12);border:1px solid rgba(255,165,0,.28);margin:12px 0}'
      + '.minbagg-banner b{color:#ffd18a}'
      + '.minbagg-card{padding:14px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.04);margin:12px 0}'
      + '.minbagg-muted{opacity:.85}'
      + '.minbagg-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}'
      + '.minbagg-input{flex:1;min-width:220px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.15);color:#e8eef6}'
      + '.minbagg-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.10);color:#e8eef6;text-decoration:none;cursor:pointer}'
      + '.minbagg-btn.primary{background:#2e8b57;border-color:rgba(46,139,87,.6);color:#fff}'
      + '.minbagg-split{display:grid;grid-template-columns:1fr;gap:14px}'
      + '@media(min-width:900px){.minbagg-split{grid-template-columns:1.35fr .65fr}}'
      + '.minbagg-results{margin-top:10px;display:grid;gap:10px}'
      + '.minbagg-item{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(0,0,0,.10)}'
      + '.minbagg-item img{width:42px;height:42px;border-radius:10px;object-fit:cover;border:1px solid rgba(255,255,255,.12)}'
      + '.minbagg-item .meta{flex:1;min-width:0}'
      + '.minbagg-item .meta .name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.minbagg-item .meta .sub{opacity:.8;font-size:12px;margin-top:2px}'
      + '.minbagg-baglist{display:grid;gap:10px}'
      + '.minbagg-divider{height:1px;background:rgba(255,255,255,.10);margin:10px 0}'
      ;

    var st = document.createElement('style');
    st.id = 'minbagg-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function bannerHtml() {
    return '<b>🚧 Under konstruksjon</b> Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.';
  }

  // -------------------- root / login marker ---------------------------------
  function ensureRoot() {
    var root = document.getElementById('min-bagg-root');
    if (!root) {
      root = el('div', 'minbagg-app');
      root.id = 'min-bagg-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function getLoginMarker() {
    var m = document.getElementById('gk-login-marker');
    var ds = (m && m.dataset) ? m.dataset : {};
    return {
      loggedIn: ds.loggedIn === '1',
      firstname: ds.firstname || '',
      email: ds.email || ''
    };
  }

  // -------------------- Supabase client -------------------------------------
  async function ensureSupabaseClient() {
    var cfg = getSupaConfig();
    if (!cfg.url || !cfg.anon) {
      throw new Error('Manglende Supabase config (GK_SUPABASE_URL / GK_SUPABASE_ANON_KEY).');
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return window.supabase.createClient(cfg.url, cfg.anon);
    }

    // last supabase-js fra CDN (light)
    if (!window.__MINBAGG_SUPABASE_LOADING__) {
      window.__MINBAGG_SUPABASE_LOADING__ = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.async = true;
        s.onload = function () { resolve(true); };
        s.onerror = function () { reject(new Error('Kunne ikke laste supabase-js')); };
        document.head.appendChild(s);
      });
    }

    await window.__MINBAGG_SUPABASE_LOADING__;

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return window.supabase.createClient(cfg.url, cfg.anon);
    }
    throw new Error('Supabase client ikke tilgjengelig.');
  }

  // -------------------- UI: Guest / Connect ---------------------------------
  function renderNeedShopLogin(root) {
    clear(root);

    var app = el('div', 'minbagg-app');
    app.appendChild(elHtml('div', 'minbagg-banner', bannerHtml()));
    app.appendChild(el('h2', '', 'Min Bagg'));

    var card = el('div', 'minbagg-card');
    card.appendChild(el('div', 'minbagg-muted',
      'Du må være innlogget i nettbutikken for å lagre og bygge baggen din. Du kan likevel se Topp 3 globalt uten innlogging.'));

    var btnRow = el('div', 'minbagg-row');
    btnRow.style.gap = '10px';

    var a1 = document.createElement('a');
    a1.href = '/customer/login';
    a1.className = 'minbagg-btn primary';
    a1.textContent = 'Logg inn';
    btnRow.appendChild(a1);

    var a2 = document.createElement('a');
    a2.href = '/customer/register';
    a2.className = 'minbagg-btn';
    a2.textContent = 'Opprett konto';
    btnRow.appendChild(a2);

    card.appendChild(btnRow);
    app.appendChild(card);

    // TOPP 3 (gjest) – fylles av main-init (BFCache-safe)
    var topCard = el('div', 'minbagg-card');
    topCard.appendChild(el('h3', '', 'Topp 3 globalt'));
    var topInner = el('div', 'minbagg-muted', 'Laster…');
    topInner.id = 'minbagg-top3-list';
    topCard.appendChild(topInner);
    app.appendChild(topCard);

    root.appendChild(app);

    // for main-init hooks
    root.__minbaggApp = app;
    app.__top3Container = topInner;
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
        var redirectTo = location.origin + location.pathname; // tilbake til samme side
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

    // TOPP 3 globalt (vises også før Supabase-tilkobling)
    var topCard = el('div', 'minbagg-card');
    topCard.appendChild(el('h3', '', 'Topp 3 globalt'));
    var topInner = el('div', 'minbagg-muted', 'Laster…');
    topInner.id = 'minbagg-top3-list';
    topCard.appendChild(topInner);
    app.appendChild(topCard);

    root.appendChild(app);

    // for main-init hooks
    root.__minbaggApp = app;
    app.__top3Container = topInner;
  }

  // -------------------- Top3 render (brukes av både guest og innlogget) -----
  function renderTop3Into(container, top3) {
    clear(container);

    if (!top3 || !top3.length) {
      container.appendChild(el('div', 'minbagg-muted', 'Ingen data ennå. Legg til noen disker (innlogget) så dukker topplista opp her 👑'));
      return;
    }

    for (var i = 0; i < top3.length; i++) {
      var g = top3[i] || {};
      var box = el('div', 'minbagg-card');
      box.appendChild(el('h4', '', g.group || ''));

      var list = el('div', '');
      var items = g.items || [];
      for (var j = 0; j < items.length; j++) {
        var it = items[j] || {};

        var row = el('div', '');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.marginBottom = '10px';

        // mini-bilde
        var imgWrap = el('div', '');
        imgWrap.style.width = '34px';
        imgWrap.style.height = '34px';
        imgWrap.style.flex = '0 0 34px';
        imgWrap.style.borderRadius = '8px';
        imgWrap.style.overflow = 'hidden';
        imgWrap.style.background = 'rgba(255,255,255,.06)';
        imgWrap.style.border = '1px solid rgba(255,255,255,.10)';

        if (it.image) {
          var img = document.createElement('img');
          img.src = it.image;
          img.alt = it.name || '';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          imgWrap.appendChild(img);
        }
        row.appendChild(imgWrap);

        // navn (link kun hvis url finnes)
        var nameEl;
        if (it.url) {
          nameEl = document.createElement('a');
          nameEl.href = it.url;
          nameEl.target = '_self';
          nameEl.rel = 'nofollow';
          nameEl.style.textDecoration = 'none';
        } else {
          nameEl = document.createElement('span');
        }
        nameEl.textContent = it.name || '';
        nameEl.style.fontWeight = '600';
        nameEl.style.display = 'inline-block';
        row.appendChild(nameEl);

        // count
        var c = el('div', 'minbagg-muted', 'Valgt ' + (it.count || 0) + ' ganger');
        c.style.marginLeft = 'auto';
        c.style.whiteSpace = 'nowrap';
        row.appendChild(c);

        list.appendChild(row);
      }

      box.appendChild(list);
      container.appendChild(box);
    }
  }

  // -------------------- App (innlogget) -------------------------------------
  function renderApp(root, marker, supa, supaUser) {
    clear(root);

    var state = {
      bag: [],
      lastSavedAt: null
    };

    var app = el('div', 'minbagg-app');
    app.appendChild(elHtml('div', 'minbagg-banner', bannerHtml()));

    var h2 = el('h2', '', (marker.firstname ? (marker.firstname + ' sin bagg') : 'Min Bagg'));
    app.appendChild(h2);

    app.appendChild(el('div', 'minbagg-muted',
      (marker.firstname ? ('Hei ' + marker.firstname + ' 👋 ') : '') + 'Baggen din lagres på kontoen din.'));

    // layout
    var split = el('div', 'minbagg-split');

    // --- VENSTRE
    var left = el('div', '');

    // add disk (search)
    var addCard = el('div', 'minbagg-card');
    addCard.appendChild(el('h3', '', 'Legg til disk'));
    var searchRow = el('div', 'minbagg-row');

    var searchInput = document.createElement('input');
    searchInput.className = 'minbagg-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Søk i nettbutikken (f.eks. buzzz, luna, md3)…';
    searchRow.appendChild(searchInput);

    addCard.appendChild(searchRow);
    addCard.appendChild(el('div', 'minbagg-muted', 'Søk for å få forslag. Trykk “Legg til” på riktig disk.'));

    var results = el('div', 'minbagg-results');
    addCard.appendChild(results);

    // manual add
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

    // BAG
    var bagCard = el('div', 'minbagg-card');
    bagCard.appendChild(el('h3', '', 'Baggen din'));
    var bagList = el('div', 'minbagg-baglist');
    bagCard.appendChild(bagList);

    left.appendChild(addCard);
    left.appendChild(manual);
    left.appendChild(bagCard);

    // --- HØYRE
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

    // for main-init hooks
    root.__minbaggApp = app;
    app.__top3Container = topInner;

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
            // placeholder
            var ph = el('div', '');
            ph.style.width = '42px';
            ph.style.height = '42px';
            ph.style.borderRadius = '10px';
            ph.style.background = 'rgba(255,255,255,.06)';
            ph.style.border = '1px solid rgba(255,255,255,.12)';
            row.appendChild(ph);
          }

          var meta = el('div', 'meta');
meta.appendChild(el('div', 'name', it.name || ''));
meta.appendChild(el('div', 'sub',
  (it.type ? ('Type: ' + it.type + ' • ') : '') +
  'Lagt til: ' + (it.addedAt || '')
));
row.appendChild(meta);


          var btn = el('button', 'minbagg-btn', 'Fjern');
          btn.addEventListener('click', async function () {
            state.bag.splice(idx, 1);
            renderBag();
            await dbSaveBag();
          });
          row.appendChild(btn);

          bagList.appendChild(row);
        })(i);
      }
    }

    function lsKey() {
      return 'gk_minbagg_' + (supaUser && supaUser.email ? supaUser.email : 'guest');
    }

    function lsSave(bag) {
      try { localStorage.setItem(lsKey(), JSON.stringify(bag || [])); } catch (_) {}
    }

    function lsLoad() {
      try {
        var raw = localStorage.getItem(lsKey());
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (_) { return []; }
    }

    async function dbLoadBag() {
      try {
        var email = (supaUser && supaUser.email) ? String(supaUser.email) : '';
        if (!email) return [];
        var res = await supa.from('mybag_bags').select('bag').eq('email', email).maybeSingle();
        if (res && res.error) throw res.error;
        var row = (res && res.data) ? res.data : null;
        var bag = row && row.bag ? row.bag : [];
        return Array.isArray(bag) ? bag : [];
      } catch (err) {
        log('[MINBAGG] dbLoadBag fail', err);
        return [];
      }
    }

    async function dbSaveBag() {
      try {
        var email = (supaUser && supaUser.email) ? String(supaUser.email) : '';
        if (!email) return;

        var payload = {
          email: email,
          bag: state.bag,
          updated_at: new Date().toISOString()
        };

        var res = await supa.from('mybag_bags').upsert(payload, { onConflict: 'email' });
        if (res && res.error) throw res.error;

        lsSave(state.bag);
      } catch (err) {
        log('[MINBAGG] dbSaveBag fail', err);
      }
    }

    async function qbSearch(q) {
      q = (q || '').trim();
      if (!q) return [];
      var url = '/shop/search?s=' + encodeURIComponent(q) + '&out=json&limit=12';
      var r = await fetch(url, { credentials: 'same-origin' });
      var t = await r.text();
      var json = JSON.parse(t);
      var sr = (json && json.searchresults) ? json.searchresults : [];
      var out = [];
      for (var i = 0; i < sr.length; i++) {
        var p0 = sr[i] && sr[i].product ? sr[i].product : null;
        if (!p0) continue;
        out.push({
          name: p0.name || '',
          url: p0.url || p0.link || '',
          image: (p0.firstimage ? String(p0.firstimage).replace(/\\\//g, '/') : ''),
        });
      }
      return out;
    }

    function renderResults(items) {
      clear(results);
      if (!items || !items.length) return;

      for (var i = 0; i < items.length; i++) {
        (function (it) {
          var row = el('div', 'minbagg-item');

          if (it.image) {
            var img = document.createElement('img');
            img.src = it.image;
            img.alt = it.name || '';
            row.appendChild(img);
          } else {
            var ph = el('div', '');
            ph.style.width = '42px';
            ph.style.height = '42px';
            ph.style.borderRadius = '10px';
            ph.style.background = 'rgba(255,255,255,.06)';
            ph.style.border = '1px solid rgba(255,255,255,.12)';
            row.appendChild(ph);
          }

          var meta = el('div', 'meta');
          meta.appendChild(el('div', 'name', it.name || ''));
          meta.appendChild(el('div', 'sub', it.url || ''));
          row.appendChild(meta);

          var btn = el('button', 'minbagg-btn primary', 'Legg til');
          btn.addEventListener('click', async function () {
  // 1) La bruker velge kategori (midlertidig løsning før auto-kategorisering)
  var type = prompt("Hvilken kategori? Skriv: putter / midrange / fairway / distance", "putter");
  type = (type || '').toLowerCase().trim();
  if (!type) return;
  if (type === 'fairway driver') type = 'fairway';
  if (type === 'distance driver') type = 'distance';

  // 2) Legg i bag (med type)
  var item = {
    name: it.name || '',
    url: it.url || '',
    image: it.image || '',
    type: type,
    addedAt: new Date().toISOString().slice(0, 10)
  };

  state.bag.push(item);
  renderBag();
  await dbSaveBag();

  // 3) Tell globalt (popular_discs) via RPC
  try {
    await supa.rpc('increment_popular_disc', {
      p_type: type,
      p_name: item.name,
      p_url: item.url || null,
      p_image: item.image || null
    });

    // 4) Oppdater toppliste uten hard refresh (tøm cache + refresh)
    try { sessionStorage.removeItem('gk_minbagg_top3_v1'); } catch(_){}
    if (typeof window.__MINBAGG_REFRESH_TOP3__ === 'function') window.__MINBAGG_REFRESH_TOP3__();
  } catch (e) {
    log('[MINBAGG] increment_popular_disc fail', e);
  }
});

          row.appendChild(btn);

          results.appendChild(row);
        })(items[i] || {});
      }
    }

    // Search handlers (debounce)
    var tmr = null;
    searchInput.addEventListener('input', function () {
      var q = (searchInput.value || '').trim();
      clear(results);
      if (tmr) clearTimeout(tmr);
      if (!q || q.length < 2) return;
      tmr = setTimeout(async function () {
        try {
          var items = await qbSearch(q);
          renderResults(items);
        } catch (err) {
          log('[MINBAGG] search fail', err);
        }
      }, 220);
    });

    // manual add
    manBtn.addEventListener('click', async function () {
      var name = (manName.value || '').trim();
      if (!name) return;
      state.bag.push({
        name: name,
        url: (manUrl.value || '').trim(),
        image: '',
        addedAt: new Date().toISOString().slice(0, 10)
      });
      manName.value = '';
      manUrl.value = '';
      renderBag();
      await dbSaveBag();
    });

    // Init: load bag (db -> local fallback)
    (async function () {
      try {
        // 1) local
        state.bag = lsLoad();
        renderBag();

        // 2) db
        var dbBag = await dbLoadBag();
        if (dbBag && Array.isArray(dbBag)) {
          state.bag = dbBag;
          lsSave(state.bag);
          renderBag();
        }
      } catch (err) {
        log('[MINBAGG] load failed', err);
      }
    })();

    // Hook for Top 3
    app.__renderTop3 = function (top3) { renderTop3Into(topInner, top3); };
  }

  // --- Global top3 data (RPC) -----------------------------------------------
  async function fetchTop3(supa) {
    // Henter topp 3 per kategori via RPC (bygger på popular_discs)
    // returns: [{group, items:[{name,url,image,count}]}...]
    var CACHE_KEY = 'gk_minbagg_top3_v1';
    var CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

    function normalizeType(t) {
      t = String(t || '').toLowerCase().trim();
      if (t === 'fairway driver') t = 'fairway';
      if (t === 'distance driver') t = 'distance';
      return t;
    }

    function titleForType(t) {
      switch (t) {
        case 'putter': return 'Putter';
        case 'midrange': return 'Midrange';
        case 'fairway': return 'Fairway Driver';
        case 'distance': return 'Distance Driver';
        default: return (t || 'Discs');
      }
    }

    function orderKey(t) {
      switch (t) {
        case 'putter': return 1;
        case 'midrange': return 2;
        case 'fairway': return 3;
        case 'distance': return 4;
        default: return 9;
      }
    }

    // 1) cache først (for rask visning)
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.ts && (Date.now() - parsed.ts) < CACHE_TTL_MS && Array.isArray(parsed.data)) {
          return parsed.data;
        }
      }
    } catch (_) {}

    // 2) hent fra Supabase
    try {
      var res = await supa.rpc('get_mybag_top3', { limit_per_group: 3 });
      if (res && res.error) throw res.error;
      var rows = (res && res.data) ? res.data : [];

      // grupper til UI-format
      var by = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        var t = normalizeType(r.type);
        if (!t) continue;
        if (!by[t]) by[t] = [];
        by[t].push({
          name: r.name || '',
          url: r.product_url || '',
          image: r.image_url || '',
          count: (r.picks != null ? r.picks : 0)
        });
      }

      var types = Object.keys(by).sort(function (a, b) { return orderKey(a) - orderKey(b); });
      var out = [];
      for (var j = 0; j < types.length; j++) {
        var t2 = types[j];
        var arr = by[t2].slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); }).slice(0, 3);
        out.push({ group: titleForType(t2), items: arr });
      }

      // cache lagre
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: out })); } catch (_) {}

      return out;
    } catch (err) {
      log('[MINBAGG] top3 fetch failed', err);
      return [];
    }
  }

  // -------------------- MAIN init ------------------------------------------
  document.addEventListener('DOMContentLoaded', async function () {
    injectStyles();
    var root = ensureRoot();
    var marker = getLoginMarker();

    try {
      var supa = await ensureSupabaseClient();
      var top3Promise = fetchTop3(supa);

      // ---------------- GUEST (ikke innlogget i butikk) ----------------
      if (!marker.loggedIn) {
        renderNeedShopLogin(root);

        // Oppdater topp 3 nå + ved BFCache (logout/back) uten hard refresh
        window.__MINBAGG_REFRESH_TOP3__ = async function () {
          try {
            var app = root.__minbaggApp;
            var box = (app && app.__top3Container) ? app.__top3Container : document.getElementById('minbagg-top3-list');
            if (!box) return;

            box.textContent = 'Laster…';
            var top3 = await fetchTop3(supa);
            renderTop3Into(box, top3);
          } catch (e) {
            log('[MINBAGG] guest top3 render fail', e);
          }
        };

        // Kjør med en gang
        window.__MINBAGG_REFRESH_TOP3__();

        // BFCache: kjør igjen når siden vises (typisk etter logout/back)
        window.addEventListener('pageshow', function () {
          try { window.__MINBAGG_REFRESH_TOP3__(); } catch (_) {}
        });

        return;
      }

      // Innlogget i butikk: krever Supabase-session for å lagre bag
      var sess = await supa.auth.getSession();
      var session = (sess && sess.data) ? sess.data.session : null;

      if (!session || !session.user) {
        renderConnectView(root, marker, supa);

        // render topp 3 også her
        try {
          var app0 = root.__minbaggApp;
          var box0 = (app0 && app0.__top3Container) ? app0.__top3Container : document.getElementById('minbagg-top3-list');
          if (box0) {
            top3Promise.then(function (top3) { try { renderTop3Into(box0, top3); } catch (_) {} });
          }
        } catch (_) {}

        // BFCache
        window.addEventListener('pageshow', function () {
          try {
            var app0b = root.__minbaggApp;
            var box0b = (app0b && app0b.__top3Container) ? app0b.__top3Container : document.getElementById('minbagg-top3-list');
            if (box0b) {
              fetchTop3(supa).then(function (top3) { try { renderTop3Into(box0b, top3); } catch (_) {} });
            }
          } catch (_) {}
        });

        return;
      }

      var gu = await supa.auth.getUser();
      var user = (gu && gu.data) ? gu.data.user : (session.user || null);
      if (!user) {
        renderConnectView(root, marker, supa);
        return;
      }

      renderApp(root, marker, supa, user);

      // Topp 3 – render når data er klar (og ved BFCache)
      try {
        var app1 = root.__minbaggApp;
        if (app1 && app1.__renderTop3) {
          top3Promise.then(function (top3) { try { app1.__renderTop3(top3); } catch (_) {} });
          window.addEventListener('pageshow', function () {
            try { fetchTop3(supa).then(function (top3) { try { app1.__renderTop3(top3); } catch (_) {} }); } catch (_) {}
          });
        }
      } catch (_) {}

      log('[MINBAGG] app loaded OK');
    } catch (err) {
      clear(root);
      root.appendChild(el('div', 'minbagg-muted',
        'Min Bagg kunne ikke starte: ' + (err && err.message ? err.message : String(err))));
      log('[MINBAGG] fatal', err);
    }
  });
   // Eksponer en boot som loaderen kan kalle ved SPA-navigasjon/BFCache
window.__MINBAGG_BOOT__ = function () {
  try {
    // “reset” så init kan kjøre på nytt når vi kommer tilbake til siden
    window.__MINBAGG_APP_RUNNING__ = false;
    // Kjør en “soft reload” ved å trigge samme init-flyt:
    // (vi simulerer et nytt DOMContentLoaded ved å kalle location-basert init igjen)
    // Enkelt: reloader siden normalt hvis Quickbutik ikke remounter DOM riktig.
    if (((location && location.pathname) ? String(location.pathname) : '').replace(/\/+$/,'') === '/sider/min-bagg') {
      // Kjør init ved å trigge en mikrojobb
      setTimeout(function(){ try { window.__MINBAGG_APP_RUNNING__ = false; } catch(_){} }, 0);
    }
  } catch (_) {}
};

})();
