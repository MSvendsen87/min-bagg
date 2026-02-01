/* ============================================================================
   GOLFKONGEN – MIN BAGG (v2026-02-01 NEW)
   - Kjør kun på /sider/min-bagg
   - Guest: viser topp 3 per kategori (RPC get_mybag_top3)
   - Innlogget:
       - Krever shop-login marker (Quickbutik) + Supabase session (magic link 1 gang)
       - Lagrer bag i mybag_bags (email PK, bag jsonb)
       - Legg til bagg (søk eller egen) -> vis navn+bilde øverst
       - Legg til disk (søk live / egen disk) -> kategori + farge + kommentar + flight
       - Oppdaterer popular_discs via RPC increment_popular_disc
   - Fikser BFCache / “må hard refresh”: init på DOMContentLoaded + pageshow
============================================================================ */
(function () {
  'use strict';

  // -------------------- Gatekeeper -----------------------------------------
  var path = (location && location.pathname) ? String(location.pathname) : '';
  path = path.replace(/\/+$/, '');
  if (path !== '/sider/min-bagg') return;
  if (window.__DISABLE_MINBAGG__ === true) return;

  // Hard single-run guard (men tillat re-init på pageshow)
  if (!window.__MINBAGG_BOOT__) window.__MINBAGG_BOOT__ = 0;
  window.__MINBAGG_BOOT__++;

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
  function toNum(x) {
    if (x === null || x === undefined) return NaN;
    var s = String(x).trim().replace(',', '.');
    if (!s) return NaN;
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
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

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  // -------------------- Config + Supabase -----------------------------------
  function getSupaConfig() {
    var url = (window.GK_SUPABASE_URL || '').trim();
    var anon = (window.GK_SUPABASE_ANON_KEY || window.GK_SUPABASE_ANON || window.GK_SUPABASE_KEY || '').trim();
    return { url: url, anon: anon };
  }

  async function ensureSupabaseClient() {
    if (window.__MINBAGG_SUPA__) return window.__MINBAGG_SUPA__;

    var cfg = getSupaConfig();
    if (!cfg.url || !cfg.anon) {
      throw new Error('Manglende Supabase config (GK_SUPABASE_URL / GK_SUPABASE_ANON_KEY).');
    }

    if (!window.supabase || !window.supabase.createClient) {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js');
    }

    // Én client per tab (unngå “Multiple GoTrueClient instances…”)
    window.__MINBAGG_SUPA__ = window.supabase.createClient(cfg.url, cfg.anon, {
      auth: { persistSession: true, storageKey: 'gk_minbagg_auth_v1' }
    });
    return window.__MINBAGG_SUPA__;
  }

  // -------------------- Login marker (Quickbutik) ---------------------------
  function getLoginMarker() {
    var m = document.getElementById('gk-login-marker');
    var ds = (m && m.dataset) ? m.dataset : {};
    return {
      loggedIn: ds.loggedIn === '1',
      firstname: ds.firstname || '',
      email: ds.email || ''
    };
  }

  // -------------------- Root + base styles ----------------------------------
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
      .minbagg-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:12px}
      @media (max-width:940px){.minbagg-grid{grid-template-columns:1fr}}
      .minbagg-title{font-size:22px;margin:0 0 6px 0}
      .minbagg-sub{opacity:.9;margin:0 0 10px 0;line-height:1.35}
      .minbagg-muted{opacity:.78}
      .minbagg-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .minbagg-btn{appearance:none;border:0;border-radius:12px;padding:10px 12px;font-weight:700;cursor:pointer;background:#2e8b57;color:#fff}
      .minbagg-btn.secondary{background:transparent;border:1px solid rgba(255,255,255,.18)}
      .minbagg-btn.small{padding:7px 10px;border-radius:10px;font-weight:700}
      .minbagg-hr{height:1px;background:rgba(255,255,255,.12);margin:12px 0}
      .minbagg-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04)}
      .minbagg-input,.minbagg-select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:#e8eef6}
      .minbagg-label{font-size:12px;opacity:.85;margin:0 0 6px 2px}
      .minbagg-list{display:flex;flex-direction:column;gap:8px}
      .minbagg-item{display:flex;gap:10px;align-items:center;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18)}
      .minbagg-thumb{width:44px;height:44px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}
      .minbagg-name{font-weight:800}
      .minbagg-meta{display:flex;flex-direction:column;gap:2px;min-width:0}
      .minbagg-meta .sub{opacity:.78;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .minbagg-link{color:#cfe9ff;text-decoration:none}
      .minbagg-link:hover{text-decoration:underline}
      .minbagg-badge{font-size:12px;opacity:.9;border:1px solid rgba(255,255,255,.14);padding:2px 8px;border-radius:999px}
      .minbagg-top3-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:560px){.minbagg-top3-grid{grid-template-columns:1fr}}
      .minbagg-kat-title{margin:0 0 8px 0;font-size:14px;letter-spacing:.2px}
      .minbagg-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;z-index:99999;padding:12px}
      .minbagg-modal{width:min(860px,100%);max-height:86vh;overflow:auto;background:rgba(18,22,30,.98);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px}
      .minbagg-modal-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .minbagg-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .minbagg-tab{cursor:pointer;padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);font-weight:800}
      .minbagg-tab.active{background:#2e8b57;border-color:#2e8b57}
      .minbagg-swatches{display:flex;gap:8px;flex-wrap:wrap}
      .minbagg-swatch{width:24px;height:24px;border-radius:999px;border:2px solid rgba(255,255,255,.20);cursor:pointer;box-sizing:border-box}
      .minbagg-swatch.active{border-color:#fff;outline:2px solid rgba(46,139,87,.9);outline-offset:2px}
      .minbagg-color-dot{width:12px;height:12px;border-radius:999px;display:inline-block;border:1px solid rgba(255,255,255,.25)}
      .minbagg-cat{display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.95}
      .minbagg-collapsible{border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden}
      .minbagg-collapsible button{width:100%;text-align:left;padding:10px 12px;background:rgba(255,255,255,.04);border:0;color:#e8eef6;font-weight:800;cursor:pointer}
      .minbagg-collapsible .body{padding:10px 12px;background:rgba(0,0,0,.12);display:none}
      .minbagg-collapsible.open .body{display:block}
      .minbagg-banner{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px 12px}
      .minbagg-banner b{white-space:nowrap}
    `;
    var st = document.createElement('style');
    st.id = 'minbagg-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // -------------------- Quickbutik search (live) ----------------------------
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
      var it = arr[i] || {};
      var p = it.product || it;
      var name = p.producttitle || p.title || p.name || p.heading || '';
      var href = p.url || p.producturl || p.href || '';
      var img = p.firstimage || p.image || '';
      out.push({
        name: safeStr(name).trim(),
        url: safeStr(href).trim(),
        image: safeStr(img).trim()
      });
    }
    // Filter out empties
    out = out.filter(function (x) { return x && x.name; });
    return out;
  }

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
    return 'Ukjent';
  }

  // -------------------- Supabase RPC: top3 + popular inc --------------------
  async function fetchTop3Grouped(supa) {
    var r = await supa.rpc('get_mybag_top3', { limit_per_group: 3 });
    if (r && r.error) throw r.error;
    var rows = (r && r.data) ? r.data : [];
    // rows: [{type,name,product_url,image_url,picks}, ...]
    var groups = { putter: [], midrange: [], fairway: [], distance: [] };
    for (var i = 0; i < rows.length; i++) {
      var x = rows[i] || {};
      var tp = (x.type || '').toLowerCase();
      if (!groups[tp]) continue;
      groups[tp].push(x);
    }
    return groups;
  }

  async function incrementPopular(supa, item) {
    try {
      // forventer RPC increment_popular_disc(p_type,p_name,p_url,p_image)
      var r = await supa.rpc('increment_popular_disc', {
        p_type: item.type,
        p_name: item.name,
        p_url: item.url || null,
        p_image: item.image || null
      });
      // status 204 -> ok
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

    // Backward compat: hvis bag er array -> pakk inn
    if (Array.isArray(bag)) {
      return { bagInfo: null, discs: bag };
    }
    if (bag && typeof bag === 'object') {
      return {
        bagInfo: bag.bagInfo || null,
        discs: Array.isArray(bag.discs) ? bag.discs : (Array.isArray(bag.bag) ? bag.bag : [])
      };
    }
    return { bagInfo: null, discs: [] };
  }

  async function dbSaveBag(supa, email, state) {
    var payload = {
      bagInfo: state.bagInfo || null,
      discs: state.discs || []
    };
    var up = await supa.from('mybag_bags').upsert({ email: email, bag: payload }, { onConflict: 'email' });
    if (up && up.error) throw up.error;
  }

  // -------------------- Render blocks --------------------------------------
  function renderShell(root) {
    clear(root);
    var wrap = el('div', 'minbagg-wrap');
    root.appendChild(wrap);

    // banner
    var banner = el('div', 'minbagg-banner');
    banner.appendChild(el('b', '', '🚧 Under konstruksjon'));
    banner.appendChild(el('div', 'minbagg-muted', 'Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.'));
    wrap.appendChild(banner);

    wrap.appendChild(el('div', 'minbagg-hr'));

    var grid = el('div', 'minbagg-grid');
    wrap.appendChild(grid);

    var left = el('div', 'minbagg-card');
    var right = el('div', 'minbagg-card');

    grid.appendChild(left);
    grid.appendChild(right);

    return { wrap: wrap, left: left, right: right };
  }

  function renderGuestCTA(container) {
    clear(container);

    container.appendChild(el('h2', 'minbagg-title', 'Min Bagg'));
    container.appendChild(el('p', 'minbagg-sub',
      'Du må være innlogget i nettbutikken for å lagre og bygge baggen din. Du kan likevel se Topp 3 globalt uten innlogging.'));

    var row = el('div', 'minbagg-row');
    var a1 = el('a', 'minbagg-btn', 'Logg inn');
    a1.href = '/customer/login';
    a1.style.textDecoration = 'none';
    var a2 = el('a', 'minbagg-btn secondary', 'Opprett konto');
    a2.href = '/customer/register';
    a2.style.textDecoration = 'none';
    row.appendChild(a1); row.appendChild(a2);
    container.appendChild(row);

    container.appendChild(el('div', 'minbagg-hr'));
    container.appendChild(el('h3', 'minbagg-title', 'Topp 3 globalt'));
    container.appendChild(el('div', 'minbagg-muted', 'Basert på hva folk legger i baggen sin.'));

    var box = el('div', 'minbagg-top3-grid');
    box.id = 'minbagg-top3-grid';
    container.appendChild(box);

    return box;
  }

  function renderTop3Grid(box, groups) {
    clear(box);

    var types = ['putter', 'midrange', 'fairway', 'distance'];
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var card = el('div', 'minbagg-card');
      card.style.padding = '12px';
      card.appendChild(el('div', 'minbagg-kat-title', typeLabel(t)));

      var list = el('div', 'minbagg-list');
      var rows = (groups && groups[t]) ? groups[t] : [];
      if (!rows.length) {
        list.appendChild(el('div', 'minbagg-muted', 'Ingen data ennå.'));
      } else {
        for (var k = 0; k < rows.length; k++) {
          var r = rows[k] || {};
          var item = el('div', 'minbagg-item');
          var img = el('img', 'minbagg-thumb');
          img.alt = '';
          img.loading = 'lazy';
          img.src = r.image_url || '';
          if (!img.src) img.style.display = 'none';
          item.appendChild(img);

          var meta = el('div', 'minbagg-meta');
          var nameWrap;
          if (r.product_url) {
            nameWrap = el('a', 'minbagg-name minbagg-link', r.name || '');
            nameWrap.href = r.product_url;
          } else {
            nameWrap = el('div', 'minbagg-name', r.name || '');
          }
          meta.appendChild(nameWrap);
          meta.appendChild(el('div', 'sub', 'Valgt ' + (r.picks || 0) + ' ganger'));
          item.appendChild(meta);

          list.appendChild(item);
        }
      }

      card.appendChild(list);
      box.appendChild(card);
    }
  }

  function renderLoggedInHeader(container, marker, state, onAddBag, onAddDisc) {
    clear(container);

    var title = el('h2', 'minbagg-title', (marker.firstname ? (marker.firstname + ' SIN BAGG') : 'Min Bagg'));
    container.appendChild(title);

    container.appendChild(el('p', 'minbagg-sub',
      (marker.firstname ? ('Hei ' + marker.firstname + ' 👋 ') : '') + 'Baggen din lagres på kontoen din.'));

    // bag header (name + image only)
    var bagInfo = state.bagInfo;
    if (bagInfo && (bagInfo.name || bagInfo.image)) {
      var row = el('div', 'minbagg-item');
      if (bagInfo.image) {
        var im = el('img', 'minbagg-thumb');
        im.src = bagInfo.image;
        im.alt = '';
        im.loading = 'lazy';
        row.appendChild(im);
      }
      var meta = el('div', 'minbagg-meta');
      meta.appendChild(el('div', 'minbagg-name', bagInfo.name || 'Bag'));
      if (bagInfo.url) {
        var l = el('a', 'sub minbagg-link', bagInfo.url);
        l.href = bagInfo.url;
        meta.appendChild(l);
      }
      row.appendChild(meta);
      container.appendChild(row);
    }

    var btnRow = el('div', 'minbagg-row');
    var bBag = el('button', 'minbagg-btn secondary', 'Legg til bagg');
    bBag.addEventListener('click', onAddBag);
    var bDisc = el('button', 'minbagg-btn', 'Legg til disk');
    bDisc.addEventListener('click', onAddDisc);

    btnRow.appendChild(bBag);
    btnRow.appendChild(bDisc);
    container.appendChild(btnRow);
  }

  function renderDiscSections(container, state, onEditDisc) {
    container.appendChild(el('div', 'minbagg-hr'));

    var types = ['putter', 'midrange', 'fairway', 'distance'];

    for (var i = 0; i < types.length; i++) {
      var t = types[i];

      var card = el('div', 'minbagg-card');
      card.style.padding = '12px';
      card.appendChild(el('div', 'minbagg-kat-title', typeLabel(t)));

      var list = el('div', 'minbagg-list');
      var items = (state.discs || []).filter(function (d) { return (d.type || '') === t; });

      if (!items.length) {
        list.appendChild(el('div', 'minbagg-muted', 'Tomt ennå – legg til en disk.'));
      } else {
        items.forEach(function (it, idx) {
          var row = el('div', 'minbagg-item');

          var img = el('img', 'minbagg-thumb');
          img.alt = '';
          img.loading = 'lazy';
          img.src = it.image || '';
          if (!img.src) img.style.display = 'none';
          row.appendChild(img);

          var meta = el('div', 'minbagg-meta');
          meta.appendChild(el('div', 'minbagg-name', it.name || ''));
          var sub = el('div', 'sub');
          sub.textContent = (it.flight && it.flight.speed !== undefined)
            ? ('Flight: Speed: ' + safeStr(it.flight.speed) + ' | Glide: ' + safeStr(it.flight.glide) + ' | Turn: ' + safeStr(it.flight.turn) + ' | Fade: ' + safeStr(it.flight.fade))
            : ('Lagt til: ' + (it.addedAt || ''));
          meta.appendChild(sub);

          // little chips
          var chips = el('div', 'minbagg-row');
          chips.style.gap = '8px';
          chips.style.marginTop = '6px';
          var c1 = el('span', 'minbagg-cat');
          var dot = el('span', 'minbagg-color-dot');
          dot.style.background = it.color || 'transparent';
          c1.appendChild(dot);
          c1.appendChild(el('span', 'minbagg-muted', it.color ? '' : 'Ingen farge'));
          chips.appendChild(c1);

          if (it.url) {
            var a = el('a', 'minbagg-badge minbagg-link', 'Åpne produkt');
            a.href = it.url;
            chips.appendChild(a);
          }

          meta.appendChild(chips);
          row.appendChild(meta);

          var btn = el('button', 'minbagg-btn small secondary', 'Endre / fjern');
          btn.addEventListener('click', function () { onEditDisc(it); });
          row.appendChild(btn);

          list.appendChild(row);
        });
      }

      card.appendChild(list);
      container.appendChild(card);
    }
  }

  function renderFlightList(container, state) {
    container.appendChild(el('div', 'minbagg-hr'));
    container.appendChild(el('h3', 'minbagg-title', 'Flight lista'));

    var list = (state.discs || []).slice();

    // sorter: høyeste speed først
    list.sort(function (a, b) {
      var sa = (a.flight && a.flight.speed !== undefined) ? toNum(a.flight.speed) : NaN;
      var sb = (b.flight && b.flight.speed !== undefined) ? toNum(b.flight.speed) : NaN;
      if (isNaN(sa)) sa = -9999;
      if (isNaN(sb)) sb = -9999;
      return sb - sa;
    });

    // duplikater (lik flight)
    var map = {};
    list.forEach(function (d) {
      var f = d.flight || {};
      var key = [safeStr(f.speed), safeStr(f.glide), safeStr(f.turn), safeStr(f.fade)].join('|');
      map[key] = (map[key] || 0) + 1;
    });

    var wrap = el('div', 'minbagg-card');
    wrap.style.padding = '12px';

    if (!list.length) {
      wrap.appendChild(el('div', 'minbagg-muted', 'Ingen disker i baggen ennå.'));
      container.appendChild(wrap);
      return;
    }

    var ul = el('div', 'minbagg-list');
    list.forEach(function (d) {
      var f = d.flight || {};
      var key = [safeStr(f.speed), safeStr(f.glide), safeStr(f.turn), safeStr(f.fade)].join('|');

      var row = el('div', 'minbagg-item');
      row.style.padding = '10px';

      var meta = el('div', 'minbagg-meta');
      meta.appendChild(el('div', 'minbagg-name', d.name || ''));

      var line = 'Flight: Speed: ' + safeStr(f.speed) +
        ' | Glide: ' + safeStr(f.glide) +
        ' | Turn: ' + safeStr(f.turn) +
        ' | Fade: ' + safeStr(f.fade);
      meta.appendChild(el('div', 'sub', line));

      if (map[key] >= 2) {
        meta.appendChild(el('div', 'sub', 'OBS: ' + map[key] + ' disker har helt lik flight.'));
      }

      row.appendChild(meta);
      ul.appendChild(row);
    });

    wrap.appendChild(ul);
    container.appendChild(wrap);
  }

  // -------------------- Modal helpers --------------------------------------
  function openModal(title, buildFn) {
    var bd = el('div', 'minbagg-modal-backdrop');
    var modal = el('div', 'minbagg-modal');

    var head = el('div', 'minbagg-modal-head');
    head.appendChild(el('div', 'minbagg-title', title));

    var closeBtn = el('button', 'minbagg-btn secondary', 'Lukk');
    closeBtn.addEventListener('click', function () { document.body.removeChild(bd); });
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
    var colors = ['#ffffff', '#000000', '#2e8b57', '#2aa1ff', '#ff4d4d', '#ffb020', '#b06cff', '#00d3a7', '#ffd1dc', '#c0c0c0'];
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

  // -------------------- “Connect” view (magic link 1 gang) ------------------
  function renderConnectView(container, marker, supa) {
    clear(container);
    container.appendChild(el('h2', 'minbagg-title', 'Koble Min Bagg'));
    container.appendChild(el('p', 'minbagg-sub',
      'For å lagre baggen din må du koble kontoen én gang via magic link.'));

    var email = marker.email || '';
    var lab = el('div', 'minbagg-label', 'E-post');
    var inp = el('input', 'minbagg-input');
    inp.type = 'email';
    inp.placeholder = 'din@epost.no';
    inp.value = email;

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

    container.appendChild(lab);
    container.appendChild(inp);
    container.appendChild(el('div', '', ''));
    container.appendChild(btn);
    container.appendChild(el('div', '', ''));
    container.appendChild(msg);
  }

  // -------------------- App state + flows -----------------------------------
  var state = {
    bagInfo: null,  // {name,image,url}
    discs: []       // disc items
  };

  function normalizeDiscItem(it) {
    it = it || {};
    var out = {
      id: it.id || ('d_' + Math.random().toString(16).slice(2)),
      name: safeStr(it.name).trim(),
      url: safeStr(it.url).trim(),
      image: safeStr(it.image).trim(),
      type: safeStr(it.type).trim(),
      color: safeStr(it.color).trim(),
      note: safeStr(it.note).trim(),
      flight: it.flight && typeof it.flight === 'object' ? {
        speed: safeStr(it.flight.speed).trim(),
        glide: safeStr(it.flight.glide).trim(),
        turn: safeStr(it.flight.turn).trim(),
        fade: safeStr(it.flight.fade).trim()
      } : null,
      addedAt: it.addedAt || todayISO()
    };
    return out;
  }

  function defaultFlight() {
    return { speed: '', glide: '', turn: '', fade: '' };
  }

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
          // search
          var q = el('input', 'minbagg-input');
          q.placeholder = 'Søk etter bagg i butikken…';
          body.appendChild(el('div', 'minbagg-label', 'Søk'));
          body.appendChild(q);

          var list = el('div', 'minbagg-list');
          list.style.marginTop = '10px';
          body.appendChild(list);

          var selected = null;

          async function runSearch(v) {
            clear(list);
            if (!safeStr(v).trim()) return;
            list.appendChild(el('div', 'minbagg-muted', 'Laster…'));
            var rows = await shopSearch(v);
            clear(list);
            if (!rows.length) {
              list.appendChild(el('div', 'minbagg-muted', 'Ingen treff.'));
              return;
            }
            rows.forEach(function (p) {
              var row = el('div', 'minbagg-item');
              var img = el('img', 'minbagg-thumb');
              img.src = p.image || '';
              img.alt = '';
              if (!img.src) img.style.display = 'none';
              row.appendChild(img);

              var meta = el('div', 'minbagg-meta');
              meta.appendChild(el('div', 'minbagg-name', p.name || ''));
              meta.appendChild(el('div', 'sub', p.url || ''));
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

          q.addEventListener('input', debounce(function () {
            runSearch(q.value);
          }, 250));

          var saveBtn = el('button', 'minbagg-btn', 'Bruk valgt bagg');
          saveBtn.style.marginTop = '10px';
          saveBtn.addEventListener('click', function () {
            if (!selected) return;
            onSave({
              name: selected.name || 'Bag',
              image: selected.image || '',
              url: selected.url || ''
            });
            close();
          });
          body.appendChild(saveBtn);

        } else {
          // manual
          body.appendChild(el('div', 'minbagg-label', 'Navn'));
          var nInp = el('input', 'minbagg-input');
          nInp.placeholder = 'Navn på baggen';
          body.appendChild(nInp);

          body.appendChild(el('div', 'minbagg-label', 'Bilde-URL (valgfritt)'));
          var iInp = el('input', 'minbagg-input');
          iInp.placeholder = 'https://...';
          body.appendChild(iInp);

          body.appendChild(el('div', 'minbagg-label', 'URL (valgfritt)'));
          var uInp = el('input', 'minbagg-input');
          uInp.placeholder = 'https://...';
          body.appendChild(uInp);

          var saveBtn2 = el('button', 'minbagg-btn', 'Lagre bagg');
          saveBtn2.style.marginTop = '10px';
          saveBtn2.addEventListener('click', function () {
            var bi = {
              name: safeStr(nInp.value).trim() || 'Bag',
              image: safeStr(iInp.value).trim(),
              url: safeStr(uInp.value).trim()
            };
            onSave(bi);
            close();
          });
          body.appendChild(saveBtn2);
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

      // Common controls (kategori + farge øverst, som du ønsket)
      var common = el('div', '');
      modal.appendChild(el('div', 'minbagg-hr'));
      modal.appendChild(common);

      var selType = el('select', 'minbagg-select');
      ['','putter','midrange','fairway','distance'].forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v ? typeLabel(v) : 'Velg kategori…';
        selType.appendChild(opt);
      });

      common.appendChild(el('div', 'minbagg-label', 'Kategori'));
      common.appendChild(selType);

      common.appendChild(el('div', 'minbagg-label', 'Farge'));
      var pickedColor = '';
      var sw = swatchPicker('', function (c) { pickedColor = c; });
      common.appendChild(sw);

      // Body
      modal.appendChild(el('div', 'minbagg-hr'));
      var body = el('div', '');
      modal.appendChild(body);

      function setTab(n) {
        t1.classList.toggle('active', n === 1);
        t2.classList.toggle('active', n === 2);
        clear(body);

        if (n === 1) {
          var q = el('input', 'minbagg-input');
          q.placeholder = 'Søk i nettbutikken (f.eks. buzzz, luna, md3)…';
          body.appendChild(el('div', 'minbagg-label', 'Søk'));
          body.appendChild(q);

          var hint = el('div', 'minbagg-muted', 'Forslag kommer mens du skriver. Velg riktig disk og trykk “Legg til”.');
          hint.style.marginTop = '8px';
          body.appendChild(hint);

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

            if (!rows.length) {
              list.appendChild(el('div', 'minbagg-muted', 'Ingen treff.'));
              return;
            }

            rows.forEach(function (p) {
              var row = el('div', 'minbagg-item');

              var img = el('img', 'minbagg-thumb');
              img.src = p.image || '';
              img.alt = '';
              if (!img.src) img.style.display = 'none';
              row.appendChild(img);

              var meta = el('div', 'minbagg-meta');
              meta.appendChild(el('div', 'minbagg-name', p.name || ''));
              meta.appendChild(el('div', 'sub', p.url || ''));
              row.appendChild(meta);

              row.style.cursor = 'pointer';
              row.addEventListener('click', function () {
                selected = p;
                // auto kategori fra URL
                var inferred = inferTypeFromUrl(p.url);
                if (inferred) selType.value = inferred;

                Array.prototype.forEach.call(list.children, function (ch) { ch.style.outline = ''; });
                row.style.outline = '2px solid rgba(46,139,87,.85)';
              });

              list.appendChild(row);
            });
          }

          q.addEventListener('input', debounce(function () {
            runSearch(q.value);
          }, 250));

          // Kommentar – minimert som default
          var comWrap = el('div', 'minbagg-collapsible');
          var comBtn = el('button', '', 'Kommentar (valgfritt)');
          var comBody = el('div', 'body');
          var comInp = el('textarea', 'minbagg-input');
          comInp.rows = 3;
          comInp.placeholder = 'Skriv en kort kommentar…';
          comBody.appendChild(comInp);
          comWrap.appendChild(comBtn);
          comWrap.appendChild(comBody);
          comBtn.addEventListener('click', function () {
            comWrap.classList.toggle('open');
          });
          comWrap.style.marginTop = '10px';
          body.appendChild(comWrap);

          var addBtn = el('button', 'minbagg-btn', 'Legg til');
          addBtn.style.marginTop = '10px';
          addBtn.addEventListener('click', function () {
            if (!selected) return;
            var inferred2 = inferTypeFromUrl(selected.url);
            var tval = selType.value || inferred2 || '';
            if (!tval) {
              alert('Velg kategori (putter/midrange/fairway/distance).');
              return;
            }

            onAdd(normalizeDiscItem({
              name: selected.name,
              url: selected.url,
              image: selected.image,
              type: tval,
              color: pickedColor,
              note: safeStr(comInp.value).trim(),
              flight: null,
              addedAt: todayISO()
            }));

            close();
          });
          body.appendChild(addBtn);

        } else {
          // Manual disc
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

          // Flight inputs (4 ruter)
          body.appendChild(el('div', 'minbagg-label', 'Flight (Speed / Glide / Turn / Fade)'));
          var fGrid = el('div', 'minbagg-row');
          fGrid.style.alignItems = 'stretch';
          fGrid.style.gap = '8px';

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
          fGrid.appendChild(fS); fGrid.appendChild(fG); fGrid.appendChild(fT); fGrid.appendChild(fF);
          body.appendChild(fGrid);

          // Kommentar – minimert
          var comWrap2 = el('div', 'minbagg-collapsible');
          var comBtn2 = el('button', '', 'Kommentar (valgfritt)');
          var comBody2 = el('div', 'body');
          var comInp2 = el('textarea', 'minbagg-input');
          comInp2.rows = 3;
          comInp2.placeholder = 'Skriv en kort kommentar…';
          comBody2.appendChild(comInp2);
          comWrap2.appendChild(comBtn2);
          comWrap2.appendChild(comBody2);
          comBtn2.addEventListener('click', function () {
            comWrap2.classList.toggle('open');
          });
          comWrap2.style.marginTop = '10px';
          body.appendChild(comWrap2);

          var addBtn2 = el('button', 'minbagg-btn', 'Legg til egen disk');
          addBtn2.style.marginTop = '10px';
          addBtn2.addEventListener('click', function () {
            var tval = selType.value || '';
            if (!tval) {
              alert('Velg kategori (putter/midrange/fairway/distance).');
              return;
            }

            var item = normalizeDiscItem({
              name: safeStr(nInp.value).trim(),
              url: safeStr(uInp.value).trim(),
              image: safeStr(iInp.value).trim(),
              type: tval,
              color: pickedColor,
              note: safeStr(comInp2.value).trim(),
              flight: {
                speed: safeStr(fS.value).trim(),
                glide: safeStr(fG.value).trim(),
                turn: safeStr(fT.value).trim(),
                fade: safeStr(fF.value).trim()
              },
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
      img.src = item.image || '';
      img.alt = '';
      if (!img.src) img.style.display = 'none';
      preview.appendChild(img);

      var meta = el('div', 'minbagg-meta');
      meta.appendChild(el('div', 'minbagg-name', item.name || ''));
      meta.appendChild(el('div', 'sub', typeLabel(item.type)));
      preview.appendChild(meta);
      modal.appendChild(preview);

      modal.appendChild(el('div', 'minbagg-hr'));

      // color
      modal.appendChild(el('div', 'minbagg-label', 'Farge'));
      var picked = item.color || '';
      var sw = swatchPicker(picked, function (c) { picked = c; });
      modal.appendChild(sw);

      // comment collapsible (default lukket)
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
    try {
      injectStyles();
      var root = ensureRoot();
      var marker = getLoginMarker();

      // Prevent concurrent init collisions
      if (window.__MINBAGG_INIT_RUNNING__) return;
      window.__MINBAGG_INIT_RUNNING__ = true;

      // Always render shell quickly (avoid blank)
      var shell = renderShell(root);

      var supa = await ensureSupabaseClient();

      // Always show Top3 on right
      var topTitle = el('h2', 'minbagg-title', 'Topp 3 globalt');
      shell.right.appendChild(topTitle);
      var topHint = el('p', 'minbagg-sub', 'Putter • Midrange • Fairway • Distance');
      shell.right.appendChild(topHint);

      var topBox = el('div', 'minbagg-top3-grid');
      shell.right.appendChild(topBox);
      topBox.appendChild(el('div', 'minbagg-muted', 'Laster…'));

      async function refreshTop3() {
        try {
          clear(topBox);
          topBox.appendChild(el('div', 'minbagg-muted', 'Laster…'));
          var groups = await fetchTop3Grouped(supa);
          clear(topBox);
          renderTop3Grid(topBox, groups);
        } catch (e) {
          clear(topBox);
          topBox.appendChild(el('div', 'minbagg-muted', 'Kunne ikke laste toppliste.'));
          log('[MINBAGG] top3 fail', e);
        }
      }

      // Guest mode
      if (!marker.loggedIn) {
        var guestBox = renderGuestCTA(shell.left);
        // top3 already on right; also refresh it
        await refreshTop3();
        window.__MINBAGG_INIT_RUNNING__ = false;
        return;
      }

      // Logged in (shop): need Supabase session
      var sess = await supa.auth.getSession();
      var session = (sess && sess.data) ? sess.data.session : null;

      if (!session || !session.user) {
        renderConnectView(shell.left, marker, supa);
        await refreshTop3();
        window.__MINBAGG_INIT_RUNNING__ = false;
        return;
      }

      // user
      var gu = await supa.auth.getUser();
      var user = (gu && gu.data) ? gu.data.user : (session.user || null);
      if (!user || !user.email) {
        renderConnectView(shell.left, marker, supa);
        await refreshTop3();
        window.__MINBAGG_INIT_RUNNING__ = false;
        return;
      }

      // load state
      var loaded = await dbLoadBag(supa, user.email);
      state.bagInfo = loaded.bagInfo || null;
      state.discs = (loaded.discs || []).map(normalizeDiscItem);

      function rerenderLeft() {
        clear(shell.left);

        renderLoggedInHeader(shell.left, marker, state,
          function onAddBag() {
            openAddBagModal(async function (bagInfo) {
              state.bagInfo = bagInfo;
              rerenderLeft();
              await dbSaveBag(supa, user.email, state);
            });
          },
          function onAddDisc() {
            openAddDiscModal(async function (disc) {
              // Auto kategori fra URL hvis mangler
              if (!disc.type) {
                var inferred = inferTypeFromUrl(disc.url);
                if (inferred) disc.type = inferred;
              }
              if (!disc.type) {
                alert('Velg kategori.');
                return;
              }

              // push + save
              state.discs.push(disc);
              rerenderLeft();
              await dbSaveBag(supa, user.email, state);

              // popular inc
              await incrementPopular(supa, disc);

              // refresh top3
              refreshTop3();
            });
          }
        );

        renderDiscSections(shell.left, state, function onEditDisc(item) {
          openEditDiscModal(item,
            async function save(it) {
              // update in state
              for (var i = 0; i < state.discs.length; i++) {
                if (state.discs[i].id === it.id) { state.discs[i] = it; break; }
              }
              rerenderLeft();
              await dbSaveBag(supa, user.email, state);
            },
            async function del(it) {
              state.discs = state.discs.filter(function (x) { return x.id !== it.id; });
              rerenderLeft();
              await dbSaveBag(supa, user.email, state);
            }
          );
        });

        // Flight list (sorted)
        renderFlightList(shell.left, state);
      }

      rerenderLeft();
      await refreshTop3();

      window.__MINBAGG_INIT_RUNNING__ = false;
    } catch (err) {
      window.__MINBAGG_INIT_RUNNING__ = false;
      var root = ensureRoot();
      clear(root);
      injectStyles();
      var wrap = el('div', 'minbagg-wrap');
      var card = el('div', 'minbagg-card');
      card.appendChild(el('div', 'minbagg-muted', 'Min Bagg kunne ikke starte: ' + (err && err.message ? err.message : String(err))));
      wrap.appendChild(card);
      root.appendChild(wrap);
      log('[MINBAGG] fatal', err);
    }
  }

  // Run: DOMContentLoaded + pageshow (BFCache/back/logout)
  function boot(reason) {
    // allow reinit on pageshow; prevent parallel
    init(reason);
  }

  // If DOM already ready, boot now (avoid blank on cached navigation)
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot('readyState');
  } else {
    document.addEventListener('DOMContentLoaded', function () { boot('DOMContentLoaded'); });
  }

  window.addEventListener('pageshow', function (e) {
    // BFCache/back: re-init to avoid needing hard refresh
    boot('pageshow');
  });

})();
