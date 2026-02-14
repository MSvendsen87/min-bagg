/* ============================================================================
   GOLFKONGEN – MIN BAGG (stable) – FULL FIL (REBUILD)
   Build: 2026-02-14 (A+B locked) + C (Profile + Recommendations)
   Side: /sider/min-bagg

   - A: Flight-kart (Turn/Fade)
   - B: UI-finpuss (hele kortet klikkbart, hint-tekst på collapsibles, tydelig dup-flight)
   - C: Profil + "Anbefalt for deg" (2 kort). Profil lagres trygt i mybag_bags.bag.profile
        (ingen nye tabeller / ingen SQL).

   Viktig:
   - Anbefalinger: Profil + mangler i baggen + fallback Top3 global.
   - Kun "på lager": vi er strenge og bruker kun kandidater der vi kan bekrefte stock === true
     via /shop/search?out=json. Hvis ikke bekreftet -> ikke anbefalt.
============================================================================ */
(function () {
  'use strict';

  // -------------------- Gatekeeper -----------------------------------------
  var p = (location && location.pathname) ? String(location.pathname) : '';
  p = p.replace(/\/+$/g, '');
  if (p !== '/sider/min-bagg') return;
  if (window.__DISABLE_MINBAGG__ === true) return;

  window.__MINBAGG_BUILD__ = '2026-02-14-REBUILD-A+B+C';

  if (!window.__MINBAGG_SOFT_LOCK__) window.__MINBAGG_SOFT_LOCK__ = { running: false, lastInitAt: 0 };

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
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function uniq(arr) {
    var m = {};
    var out = [];
    for (var i = 0; i < (arr || []).length; i++) {
      var k = String(arr[i] || '');
      if (!k) continue;
      if (m[k]) continue;
      m[k] = 1;
      out.push(arr[i]);
    }
    return out;
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
      .minbagg-wrap{max-width:1120px;margin:0 auto;padding:14px}
      .minbagg-card{background:rgba(20,24,32,.72);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px}
      .minbagg-title{font-size:22px;margin:0 0 6px 0}
      .minbagg-sub{opacity:.9;margin:0 0 10px 0;line-height:1.35}
      .minbagg-muted{opacity:.78}
      .minbagg-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .minbagg-btn{appearance:none;border:0;border-radius:12px;padding:10px 12px;font-weight:900;cursor:pointer;background:#2e8b57;color:#fff}
      .minbagg-btn.secondary{background:transparent;border:1px solid rgba(255,255,255,.18)}
      .minbagg-btn.small{padding:7px 10px;border-radius:10px;font-weight:900}
      .minbagg-hr{height:1px;background:rgba(255,255,255,.12);margin:12px 0}
      .minbagg-input,.minbagg-select,.minbagg-textarea{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:#e8eef6}
      .minbagg-textarea{resize:vertical}
      .minbagg-label{font-size:12px;opacity:.85;margin:0 0 6px 2px}
      .minbagg-list{display:flex;flex-direction:column;gap:8px}

      /* B) disk-kort */
      .minbagg-item{
        display:flex;gap:9px;align-items:center;
        padding:7px 8px;border-radius:12px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(0,0,0,.18)
      }
      .minbagg-item.is-clickable{cursor:pointer}
      .minbagg-item.is-clickable:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.18)}
      .minbagg-item.is-clickable:active{transform:translateY(1px)}
      .minbagg-thumb{width:40px;height:40px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}
      .minbagg-name{font-weight:900}
      .minbagg-meta{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
      .minbagg-meta .sub{opacity:.78;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.25}
      .minbagg-link{color:#cfe9ff;text-decoration:none}
      .minbagg-link:hover{text-decoration:underline}
      .minbagg-warn{color:#ff6b6b;opacity:1;font-weight:900}

      .minbagg-banner{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px 12px}
      .minbagg-banner b{white-space:nowrap}

      /* 4 bokser */
      .minbagg-boxgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:760px){.minbagg-boxgrid{grid-template-columns:1fr}}
      .minbagg-boxgrid .minbagg-card{padding:10px}
      .minbagg-boxgrid h3{margin:0 0 8px 0;font-size:16px}

      /* Topplister */
      .minbagg-top3-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:560px){.minbagg-top3-grid{grid-template-columns:1fr}}

      /* Modal */
      .minbagg-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
        align-items:flex-start;justify-content:center;z-index:99999;padding:12px;overflow:auto}
      .minbagg-modal{margin-top:24px;width:min(880px,100%);max-height:86vh;overflow:auto;
        background:rgba(18,22,30,.98);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px}
      .minbagg-modal-head{display:flex;justify-content:space-between;align-items:center;gap:10px}

      /* Collapsible */
      .minbagg-collapsible{border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden}
      .minbagg-collapsible button{width:100%;text-align:left;padding:10px 12px;background:rgba(255,255,255,.04);
        border:0;color:#e8eef6;font-weight:900;cursor:pointer}
      .minbagg-collapsible .body{padding:10px 12px;background:rgba(0,0,0,.12);display:none}
      .minbagg-collapsible.open .body{display:block}

      /* Flight-kart */
      .minbagg-chart{position:relative;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(0,0,0,.12);
        overflow:hidden;height:320px}
      .minbagg-chart-grid{position:absolute;inset:0;background-image:
        linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px);
        background-size: 20% 20%;
        opacity:.55}
      .minbagg-chart-axes{position:absolute;inset:0;pointer-events:none}
      .minbagg-chart-label{position:absolute;font-size:12px;opacity:.82;background:rgba(18,22,30,.85);
        border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:4px 8px}
      .minbagg-dot{position:absolute;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:999px;
        border:2px solid rgba(255,255,255,.85);background:#2e8b57;cursor:pointer;box-shadow:0 0 0 2px rgba(0,0,0,.25)}
      .minbagg-dot:hover{filter:brightness(1.08)}
      .minbagg-dot-badge{position:absolute;top:-9px;right:-9px;min-width:18px;height:18px;border-radius:999px;
        display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;
        background:rgba(255,255,255,.9);color:#111;border:1px solid rgba(0,0,0,.35)}
      .minbagg-chart-footer{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
      .minbagg-pills{display:flex;gap:8px;flex-wrap:wrap}
      .minbagg-pill{font-size:12px;opacity:.85;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);
        border-radius:999px;padding:4px 8px}

      /* C) Profil + anbefalinger */
      .minbagg-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:860px){.minbagg-split{grid-template-columns:1fr}}
      .minbagg-kv{display:flex;flex-wrap:wrap;gap:8px}
      .minbagg-kv .minbagg-pill{opacity:.95}
      .minbagg-reco-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:720px){.minbagg-reco-grid{grid-template-columns:1fr}}
      .minbagg-reco-card{border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.14);border-radius:14px;padding:10px}
      .minbagg-reco-head{display:flex;gap:10px;align-items:center}
      .minbagg-reco-card img{width:54px;height:54px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06)}
      .minbagg-reco-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .minbagg-reco-note{margin:8px 0 0 0;opacity:.9;line-height:1.35}
      .minbagg-score{display:flex;align-items:center;gap:10px;margin-top:8px}
      .minbagg-scorebar{flex:1;height:12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.20);overflow:hidden}
      .minbagg-scorefill{height:100%}
      .minbagg-scorepill{font-size:12px;font-weight:900;border-radius:999px;padding:4px 10px;border:1px solid rgba(255,255,255,.14)}
    `;
    var st = document.createElement('style');
    st.id = 'minbagg-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // -------------------- Supabase client ------------------------------------
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

  // -------------------- Flight parsing --------------------------------------
  function parseFlightText(flightText) {
    var raw = safeStr(flightText).trim();
    if (!raw) return null;
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

  // -------------------- Quickbutik search + stock strict --------------------
  function isProductInStock(prod) {
    // Quickbutik: has_stock, soldOut, stock, allow_minusqty, preorder ...
    // Returnerer: true / false / "unknown"
    if (!prod) return 'unknown';

    // 1) soldOut (høy prioritet)
    if (typeof prod.soldOut === 'boolean') return prod.soldOut ? false : true;
    // kan komme som 0/1 eller "0"/"1"
    if (prod.soldOut !== undefined && prod.soldOut !== null) {
      var so = toNum(prod.soldOut);
      if (!isNaN(so)) return so > 0 ? false : true; // 1 = sold out
      var sos = String(prod.soldOut).toLowerCase();
      if (sos === 'true' || sos === 'yes') return false;
      if (sos === 'false' || sos === 'no') return true;
    }

    // 2) has_stock / hasStock / has_stock flag
    var hs = (prod.has_stock !== undefined) ? prod.has_stock :
             (prod.hasStock !== undefined) ? prod.hasStock : undefined;
    if (typeof hs === 'boolean') return hs ? true : false;
    if (hs !== undefined && hs !== null) {
      var hsn = toNum(hs);
      if (!isNaN(hsn)) return hsn > 0;
      var hss = String(hs).toLowerCase();
      if (hss === 'true' || hss === 'yes') return true;
      if (hss === 'false' || hss === 'no') return false;
    }

    // 3) direkte bool-felt (fallback)
    var boolFields = ['in_stock','instock','inStock','available','is_available','isAvailable','buyable','is_buyable','isBuyable','canbuy','showbuybutton','has_stock','hasStock'];
    for (var i=0;i<boolFields.length;i++){
      var k = boolFields[i];
      if (typeof prod[k] === 'boolean') return prod[k] ? true : false;
      if (prod[k] !== undefined && prod[k] !== null) {
        var bn = toNum(prod[k]);
        if (!isNaN(bn)) return bn > 0;
        var bs = String(prod[k]).toLowerCase();
        if (bs === 'true' || bs === 'yes') return true;
        if (bs === 'false' || bs === 'no') return false;
      }
    }

    // 4) stock (antall)
    var stockVal = prod.stock;
    if (typeof stockVal === 'number') return stockVal > 0;
    var sn = toNum(stockVal);
    if (!isNaN(sn)) return sn > 0;

    // 5) tekststatus
    var s = safeStr(prod.stock_status || prod.stockStatus || prod.availability || '').toLowerCase();
    if (s) {
      if (s.indexOf('out') !== -1 || s.indexOf('sold') !== -1 || s.indexOf('0') !== -1) return false;
      if (s.indexOf('in') !== -1 || s.indexOf('avail') !== -1 || s.indexOf('på lager') !== -1) return true;
    }

    return 'unknown';
  }

  async function rawShopSearch(q) {
    q = safeStr(q).trim();
    if (!q) return null;
    var url = '/shop/search?s=' + encodeURIComponent(q) + '&out=json&limit=12';
    var r = await fetch(url, { credentials: 'same-origin' });
    var t = await r.text();
    try { return JSON.parse(t); } catch (_) { return null; }
  }

  async function shopSearch(q) {
    var j = await rawShopSearch(q);
    if (!j) return [];
    var arr = (j && j.searchresults) ? j.searchresults : [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var p2 = (arr[i] && arr[i].product) ? arr[i].product : null;
      if (!p2) continue;

      var name = safeStr(p2.title || p2.producttitle || p2.name).trim();
      var href = safeStr(p2.url || p2.producturl || p2.href).trim();
      var img = safeStr(p2.firstimage || p2.image).trim();
      var df1 = safeStr(p2.datafield_1 || '').trim();
      if (!name || !href) continue;

      out.push({ name: name, url: href, image: img, flightText: df1, stock: isProductInStock(p2) });
    }
    return out.slice(0, 12);
  }

  async function verifyInStockByName(name, desiredUrl) {
    var rows = await shopSearch(name);
    if (!rows.length) return null;

    var best = null;
    for (var i=0;i<rows.length;i++){
      if (desiredUrl && rows[i].url === desiredUrl) { best = rows[i]; break; }
    }
    if (!best) {
      var target = safeStr(name).trim().toLowerCase();
      for (var j=0;j<rows.length;j++){
        if (safeStr(rows[j].name).trim().toLowerCase() === target) { best = rows[j]; break; }
      }
    }
    if (!best) best = rows[0];

    // Streng: må være true.
    if (best.stock === true) return best;
    return null;
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

    if (Array.isArray(bag)) return { bagInfo: null, discs: bag, profile: null };

    if (bag && typeof bag === 'object') {
      return {
        bagInfo: bag.bagInfo || null,
        discs: Array.isArray(bag.discs) ? bag.discs : (Array.isArray(bag.bag) ? bag.bag : []),
        profile: bag.profile || null
      };
    }
    return { bagInfo: null, discs: [], profile: null };
  }
  async function dbSaveBag(supa, email, st) {
    var payload = {
      bagInfo: st.bagInfo || null,
      discs: st.discs || [],
      profile: st.profile || null
    };
    var up = await supa.from('mybag_bags').upsert({ email: email, bag: payload }, { onConflict: 'email' });
    if (up && up.error) throw up.error;
  }

  // -------------------- State ----------------------------------------------
  var state = { bagInfo: null, discs: [], profile: null };
  // C) Anbefalinger: hold oversikt over hva brukeren har sagt "Nei takk" til i denne økten
  var recoExclude = [];

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

  // -------------------- Profile (C) ----------------------------------------
  function defaultProfile() {
    return {
      level: 'Nybegynner',
      throwStyle: 'Backhand',
      hand: 'Høyre',
      goal: 'Kontroll',
      course: 'Blandet',
      updatedAt: todayISO()
    };
  }
  function profilePills(profile) {
    var p = profile || {};
    var pills = [];
    if (p.level) pills.push('Nivå: ' + p.level);
    if (p.throwStyle) pills.push('Kast: ' + p.throwStyle);
    if (p.hand) pills.push('Hånd: ' + p.hand);
    if (p.goal) pills.push('Mål: ' + p.goal);
    if (p.course) pills.push('Bane: ' + p.course);
    return pills;
  }

  function openProfileModal(current, onSave) {
    openModal('Profil – Anbefalt for deg', function (modal, close) {
      var p = current ? JSON.parse(JSON.stringify(current)) : defaultProfile();

      function makeSelect(label, values, currentValue) {
        modal.appendChild(el('div', 'minbagg-label', label));
        var s = el('select', 'minbagg-select');
        values.forEach(function (v) {
          var o = document.createElement('option');
          o.value = v; o.textContent = v;
          if (currentValue === v) o.selected = true;
          s.appendChild(o);
        });
        modal.appendChild(s);
        return s;
      }

      var selLevel = makeSelect('Nivå', ['Nybegynner','Litt øvet','Viderekommen'], p.level);
      var selThrow = makeSelect('Kast', ['Backhand','Forehand','Begge'], p.throwStyle);
      var selHand  = makeSelect('Hånd', ['Høyre','Venstre'], p.hand);
      var selGoal  = makeSelect('Mål', ['Lengde','Kontroll','Rett fram','Hyzer','Anhyzer'], p.goal);
      var selCourse= makeSelect('Banetype', ['Skog','Åpent','Blandet'], p.course);

      modal.appendChild(el('div', 'minbagg-hr'));
      var row = el('div', 'minbagg-row');

      var save = el('button', 'minbagg-btn', 'Lagre profil');
      var cancel = el('button', 'minbagg-btn secondary', 'Avbryt');
      cancel.addEventListener('click', close);

      save.addEventListener('click', function () {
        p.level = selLevel.value;
        p.throwStyle = selThrow.value;
        p.hand = selHand.value;
        p.goal = selGoal.value;
        p.course = selCourse.value;
        p.updatedAt = todayISO();
        onSave(p);
        close();
      });

      row.appendChild(save);
      row.appendChild(cancel);
      modal.appendChild(row);
    });
  }

  // -------------------- Reco engine (C) ------------------------------------
  
  function idealCounts() {
    // Praktisk standard for en allround “full” sekk (ca 18 disker)
    return { putter: 4, midrange: 4, fairway: 5, distance: 5 };
  }
  function calcBagScore(discs) {
    var ideal = idealCounts();
    var c = countByType(discs);

    // 0–60: antall pr kategori (nær ideal)
    var maxDelta = 0;
    ['putter','midrange','fairway','distance'].forEach(function(t){
      maxDelta += Math.abs((c[t]||0) - (ideal[t]||0));
    });
    var countScore = clamp(60 - maxDelta*6, 0, 60);

    // 0–40: coverage (under/straight/over) per type
    var cov = 0;
    ['putter','midrange','fairway','distance'].forEach(function(t){
      var items = (discs||[]).filter(function(d){ return d.type===t && d.flight; });
      if (!items.length) return;
      var hasUnder=false, hasStraight=false, hasOver=false;
      for (var i=0;i<items.length;i++){
        var tr = toNum(items[i].flight.turn);
        var fa = toNum(items[i].flight.fade);
        if (isNaN(tr) || isNaN(fa)) continue;
        if (tr <= -2 || (tr <= -1 && fa <= 1)) hasUnder = true;
        if (Math.abs(tr) <= 0.5 && fa <= 2) hasStraight = true;
        if (fa >= 3 || (tr >= 0 && fa >= 2.5)) hasOver = true;
      }
      var local = (hasUnder?1:0) + (hasStraight?1:0) + (hasOver?1:0);
      cov += local/3;
    });
    var covScore = clamp(Math.round(cov/4 * 40), 0, 40);
    return Math.round(countScore + covScore);
  }
  function scoreColor(score) {
    if (score >= 75) return { bg: 'rgba(46,139,87,.22)', fill:'#2e8b57' };
    if (score >= 45) return { bg: 'rgba(255,193,7,.18)', fill:'#ffc107' };
    return { bg: 'rgba(255,107,107,.18)', fill:'#ff6b6b' };
  }
  function flightVec(f) {
    if (!f) return null;
    var s = toNum(f.speed), g = toNum(f.glide), t = toNum(f.turn), fa = toNum(f.fade);
    if ([s,g,t,fa].some(function(x){return isNaN(x);} )) return null;
    return [s,g,t,fa];
  }
  function dist4(a,b){
    var d=0;
    for (var i=0;i<4;i++){ var x=a[i]-b[i]; d += x*x; }
    return Math.sqrt(d);
  }
  function isTooSimilar(candidateFlight, discsSameType) {
    var v = flightVec(candidateFlight);
    if (!v) return false;
    var best = Infinity;
    for (var i=0;i<discsSameType.length;i++){
      var vv = flightVec(discsSameType[i].flight);
      if (!vv) continue;
      var dd = dist4(v, vv);
      if (dd < best) best = dd;
    }
    // terskel: ~0.9 = veldig likt
    return best < 0.9;
  }
  function chooseTargetType(discs) {
    var ideal = idealCounts();
    var c = countByType(discs);
    var bestType = 'fairway';
    var bestDef = -999;
    ['putter','midrange','fairway','distance'].forEach(function(t){
      var def = (ideal[t]||0) - (c[t]||0);
      if (def > bestDef) { bestDef = def; bestType = t; }
    });
    return { type: bestType, deficit: bestDef };
  }
  function suggestWhy(profile, targetType, deficit, candFlight, existingSameType) {
    var p = profile || {};
    var parts = [p.level, p.throwStyle, p.goal, p.course].filter(Boolean);

    var miss = '';
    if (deficit > 0) miss = 'Du mangler ' + deficit + ' ' + typeLabel(targetType).toLowerCase() + ' for en mer balansert sekk. ';
    else miss = 'Du har allerede godt med ' + typeLabel(targetType).toLowerCase() + ', så her får du en variant som gir mer bredde. ';

    // Hva mangler du av roller i denne kategorien?
    var hasUnder=false, hasStraight=false, hasOver=false;
    for (var i=0;i<(existingSameType||[]).length;i++){
      var tr = toNum(existingSameType[i].flight && existingSameType[i].flight.turn);
      var fa = toNum(existingSameType[i].flight && existingSameType[i].flight.fade);
      if (isNaN(tr)||isNaN(fa)) continue;
      if (tr <= -2 || (tr <= -1 && fa <= 1)) hasUnder=true;
      if (Math.abs(tr) <= 0.5 && fa <= 2) hasStraight=true;
      if (fa >= 3 || (tr >= 0 && fa >= 2.5)) hasOver=true;
    }

    var role = '';
    if (candFlight) {
      var t = toNum(candFlight.turn), f = toNum(candFlight.fade);
      if (!isNaN(t) && !isNaN(f)) {
        if ((t <= -2 || (t <= -1 && f <= 1)) && !hasUnder) role = 'Du mangler en tydelig understabil variant i denne kategorien. ';
        else if (f >= 3 && !hasOver) role = 'Du mangler en mer overstabil variant i denne kategorien. ';
        else if (Math.abs(t) <= 0.5 && f <= 2 && !hasStraight) role = 'Du mangler en “rett” arbeidshest i denne kategorien. ';
        else role = 'Denne fyller et mellomrom mellom de du allerede har. ';
      }
    }

    var course = (p.course || '').toLowerCase();
    var courseTxt = '';
    if (course.indexOf('skog') !== -1) courseTxt = 'Fin til skogslinjer der kontroll og plassering er viktig.';
    else if (course.indexOf('åpent') !== -1) courseTxt = 'Fin i åpent landskap når du vil la disken jobbe i lufta.';
    else if (course.indexOf('blandet') !== -1) courseTxt = 'Et trygt allround-valg for blandede baner.';

    var prof = parts.length ? (' (' + parts.join(' • ') + ')') : '';
    return miss + role + courseTxt + prof;
  }

  function countByType(discs) {
    var c = { putter:0, midrange:0, fairway:0, distance:0 };
    for (var i=0;i<(discs||[]).length;i++){
      var t = discs[i] && discs[i].type;
      if (c[t] !== undefined) c[t] += 1;
    }
    return c;
  }
  function missingPriority(counts) {
    var types = ['putter','midrange','fairway','distance'];
    types.sort(function(a,b){ return (counts[a] - counts[b]); });
    return types;
  }
  function recoText(profile, missingType, candFlight, deficit, existingSameType){
    return suggestWhy(profile, missingType, deficit, candFlight, existingSameType || []);
  }

  async function pickRecoCandidates(supa, profile, stateDiscs, excludeNames) {
    var counts = countByType(stateDiscs);
    var prio = missingPriority(counts);
    var target = chooseTargetType(stateDiscs);
    var bagScore = calcBagScore(stateDiscs);
    prio = [target.type].concat(prio.filter(function(x){ return x!==target.type; }));

    var groups;
    try { groups = await fetchTop3Grouped(supa); }
    catch (_) { groups = { putter:[], midrange:[], fairway:[], distance:[] }; }

    var picked = [];
    var used = {};
    excludeNames = Array.isArray(excludeNames) ? excludeNames : [];
    var exclude = {};
    for (var ei=0; ei<excludeNames.length; ei++){ exclude[String(excludeNames[ei]).toLowerCase()] = 1; }

    function alreadyInBag(name) {
      var n = safeStr(name).trim().toLowerCase();
      for (var i=0;i<stateDiscs.length;i++){
        if (safeStr(stateDiscs[i].name).trim().toLowerCase() === n) return true;
      }
      return false;
    }

    // 1) Top3 fallback, styrt av mangler
    for (var pi=0; pi<prio.length && picked.length<2; pi++){
      var t = prio[pi];
      var rows = (groups && groups[t]) ? groups[t] : [];
      for (var ri=0; ri<rows.length && picked.length<2; ri++){
        var r = rows[ri] || {};
        var name = safeStr(r.name).trim();
        var url = safeStr(r.product_url || '').trim();
        if (!name) continue;
        if (used[name.toLowerCase()]) continue;
        if (exclude[name.toLowerCase()]) continue;
        if (alreadyInBag(name)) continue;

        var verified = await verifyInStockByName(name, url);
        if (!verified) continue;

        var existingSameType = stateDiscs.filter(function(d){ return d.type===t; });
        var candFlight = parseFlightText(verified.flightText || '');
        if (isTooSimilar(candFlight, existingSameType)) { continue; }
        used[name.toLowerCase()] = 1;
        picked.push({
          type: t,
          name: verified.name || name,
          url: verified.url || url,
          image: verified.image || r.image_url || '',
          flightText: verified.flightText || '',
          flight: parseFlightText(verified.flightText || ''),
          why: recoText(profile, t, parseFlightText(verified.flightText || ''))
        });
      }
    }

    // 2) Hvis fortsatt ikke 2: enkel profil-søk, men fortsatt strict stock===true
    if (picked.length < 2) {
      var keywords = [];
      var g = safeStr(profile && profile.goal).toLowerCase();
      var c = safeStr(profile && profile.course).toLowerCase();
      if (g) keywords.push(g);
      if (c) keywords.push(c);
      keywords = uniq(keywords).slice(0,2);

      for (var pi2=0; pi2<prio.length && picked.length<2; pi2++){
        var t2 = prio[pi2];
        var typeWord = (t2 === 'putter') ? 'putter' : (t2 === 'midrange' ? 'midrange' : (t2 === 'fairway' ? 'fairway' : 'driver'));
        var q = [typeWord].concat(keywords).join(' ');
        var results = await shopSearch(q);

        for (var k=0; k<results.length && picked.length<2; k++){
          var it = results[k];
          if (!it || it.stock !== true) continue; // strict
          var nm = safeStr(it.name).trim();
          if (!nm) continue;
          if (used[nm.toLowerCase()]) continue;
          if (exclude[nm.toLowerCase()]) continue;
          if (alreadyInBag(nm)) continue;

          used[nm.toLowerCase()] = 1;
          picked.push({
            type: inferTypeFromUrl(it.url) || t2,
            name: it.name,
            url: it.url,
            image: it.image,
            flightText: it.flightText || '',
            flight: parseFlightText(it.flightText || ''),
            why: recoText(profile, (inferTypeFromUrl(it.url) || t2), parseFlightText(it.flightText || ''))
          });
        }
      }
    }

    // 3) ALLTID forslag: hvis vi fortsatt ikke har 2, ta en “gøy/spesiell”-kandidat
    if (picked.length < 2) {
      var funQs = ['glow','eclipse','x-out','tour series','signature','halo','color glow','utility','roller','overstabil','understabil'];
      for (var fq=0; fq<funQs.length && picked.length<2; fq++){
        var res = await shopSearch(funQs[fq]);
        for (var ii=0; ii<res.length && picked.length<2; ii++){
          var it2 = res[ii];
          if (!it2 || it2.stock !== true) continue;
          var nm2 = safeStr(it2.name).trim();
          if (!nm2) continue;
          if (used[nm2.toLowerCase()] || exclude[nm2.toLowerCase()]) continue;
          if (alreadyInBag(nm2)) continue;

          var t3 = inferTypeFromUrl(it2.url) || target.type;
          var existingSameType3 = stateDiscs.filter(function(d){ return d.type===t3; });
          var cf3 = parseFlightText(it2.flightText || '');
          if (isTooSimilar(cf3, existingSameType3)) continue;

          used[nm2.toLowerCase()] = 1;
          picked.push({
            type: t3,
            name: it2.name,
            url: it2.url,
            image: it2.image,
            flightText: it2.flightText || '',
            flight: cf3,
            why: 'Sekken din ser veldig komplett ut – her er en litt “gøy” disk som kan gi nye linjer og mer variasjon.'
          });
        }
      }
    }

    return picked.slice(0,2);
  }

  // -------------------- Render base ----------------------------------------
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

  // B) Klikkbart kort (uten Endre-knapp)
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
          var row = el('div', 'minbagg-item is-clickable');
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          row.setAttribute('aria-label', 'Endre ' + (it.name || 'disk'));

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
          meta.appendChild(el('div', 'sub', it.flight ? formatFlightLabel(it.flight) : 'Flight mangler'));
          if (it.note) meta.appendChild(el('div', 'sub', '📝 ' + it.note));
          else meta.appendChild(el('div', 'sub', '📝 Legg til kommentar…'));
          row.appendChild(meta);

          function openEdit() { onEdit(it); }
          row.addEventListener('click', openEdit);
          row.addEventListener('keydown', function (e) {
            var k = e.key || e.code;
            if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); openEdit(); }
          });

          list.appendChild(row);
        });
        box.appendChild(list);
      }

      grid.appendChild(box);
    });

    wrap.appendChild(grid);
    wrap.appendChild(el('div', 'minbagg-hr'));
  }

  // -------------------- Flight list (B: dup highlight) ----------------------
  function renderFlightList(wrap) {
    var wrapC = el('div', 'minbagg-collapsible');
    var btn = el('button', '', 'Flight lista (trykk for å åpne/lukke)');
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
        if (d.flight && dup[key] >= 2) {
          meta.appendChild(el('div', 'sub minbagg-warn', '⚠ ' + dup[key] + ' disker har helt lik flight.'));
        }

        row.appendChild(meta);
        ul.appendChild(row);
      });
      body.appendChild(ul);
    }

    wrap.appendChild(wrapC);
    wrap.appendChild(el('div', 'minbagg-hr'));
  }

  // -------------------- Flight chart (A) -----------------------------------
  function renderFlightChart(wrap) {
    var wrapC = el('div', 'minbagg-collapsible');
    var btn = el('button', '', 'Flight-kart (Turn / Fade) (trykk for å åpne/lukke)');
    var body = el('div', 'body');
    wrapC.appendChild(btn);
    wrapC.appendChild(body);
    btn.addEventListener('click', function () { wrapC.classList.toggle('open'); });

    var withFlight = [];
    var withoutFlight = [];
    for (var i = 0; i < state.discs.length; i++) {
      var d = state.discs[i];
      var f = d && d.flight ? d.flight : null;
      var turn = f ? toNum(f.turn) : NaN;
      var fade = f ? toNum(f.fade) : NaN;
      if (isNaN(turn) || isNaN(fade)) withoutFlight.push(d);
      else withFlight.push({ disc: d, turn: turn, fade: fade });
    }

    if (!withFlight.length) {
      body.appendChild(el('div', 'minbagg-muted', 'Ingen disker med Turn/Fade ennå – legg til flight, så dukker kartet opp.'));
      wrap.appendChild(wrapC);
      wrap.appendChild(el('div', 'minbagg-hr'));
      return;
    }

    var minT = Infinity, maxT = -Infinity, minF = Infinity, maxF = -Infinity;
    withFlight.forEach(function (x) {
      if (x.turn < minT) minT = x.turn;
      if (x.turn > maxT) maxT = x.turn;
      if (x.fade < minF) minF = x.fade;
      if (x.fade > maxF) maxF = x.fade;
    });

    function padRange(minV, maxV) {
      if (minV === maxV) { minV = minV - 1; maxV = maxV + 1; }
      var span = maxV - minV;
      var pad = span * 0.08;
      return { min: minV - pad, max: maxV + pad };
    }
    var tr = padRange(minT, maxT);
    var fr = padRange(minF, maxF);

    var chart = el('div', 'minbagg-chart');
    chart.appendChild(el('div', 'minbagg-chart-grid'));

    var axes = el('div', 'minbagg-chart-axes');
    var labTL = el('div', 'minbagg-chart-label', 'Turn: ' + minT + ' → ' + maxT);
    labTL.style.left = '10px'; labTL.style.top = '10px';
    var labBR = el('div', 'minbagg-chart-label', 'Fade: ' + minF + ' → ' + maxF);
    labBR.style.right = '10px'; labBR.style.bottom = '10px';
    axes.appendChild(labTL); axes.appendChild(labBR);
    chart.appendChild(axes);

    var clusters = {};
    function keyFor(turn, fade) { return turn.toFixed(2) + '|' + fade.toFixed(2); }
    withFlight.forEach(function (x) {
      var k = keyFor(x.turn, x.fade);
      if (!clusters[k]) clusters[k] = { turn: x.turn, fade: x.fade, items: [] };
      clusters[k].items.push(x.disc);
    });

    function openClusterModal(items, turn, fade) {
      openModal('Disker på punktet (Turn ' + turn + ', Fade ' + fade + ')', function (modal) {
        var list = el('div', 'minbagg-list');
        items.forEach(function (d) {
          var row = el('div', 'minbagg-item');
          var img = el('img', 'minbagg-thumb');
          img.alt = ''; img.loading = 'lazy';
          img.src = d.image || '';
          if (!img.src) img.style.display = 'none';
          row.appendChild(img);

          var meta = el('div', 'minbagg-meta');
          meta.appendChild(el('div', 'minbagg-name', d.name || ''));
          meta.appendChild(el('div', 'sub', d.flight ? formatFlightLabel(d.flight) : 'Flight mangler'));
          row.appendChild(meta);

          list.appendChild(row);
        });
        modal.appendChild(list);
      });
    }

    Object.keys(clusters).forEach(function (k) {
      var c = clusters[k];
      var tx = (c.turn - tr.min) / (tr.max - tr.min);
      var fy = (c.fade - fr.min) / (fr.max - fr.min);

      var xPct = 6 + clamp(tx, 0, 1) * 88;
      var yPct = 94 - clamp(fy, 0, 1) * 88;

      var dot = el('div', 'minbagg-dot');
      dot.style.left = xPct + '%';
      dot.style.top = yPct + '%';

      var d0 = c.items && c.items[0] ? c.items[0] : null;
      if (d0 && d0.color) dot.style.background = d0.color;

      if (c.items.length >= 2) dot.appendChild(el('div', 'minbagg-dot-badge', String(c.items.length)));
      dot.addEventListener('click', function () { openClusterModal(c.items, c.turn, c.fade); });
      chart.appendChild(dot);
    });

    body.appendChild(chart);

    body.appendChild(el('div', 'minbagg-hr'));
    var footer = el('div', 'minbagg-chart-footer');
    var pills = el('div', 'minbagg-pills');
    pills.appendChild(el('div', 'minbagg-pill', 'Punkter: ' + Object.keys(clusters).length));
    pills.appendChild(el('div', 'minbagg-pill', 'Disker med flight: ' + withFlight.length));
    footer.appendChild(pills);
    footer.appendChild(el('div', 'minbagg-muted', 'Tips: Trykk på en prikk for å se diskene som ligger der.'));
    body.appendChild(footer);

    if (withoutFlight.length) {
      body.appendChild(el('div', 'minbagg-hr'));
      body.appendChild(el('div', 'minbagg-muted', 'Uten flight: ' + withoutFlight.length));
    }

    wrap.appendChild(wrapC);
    wrap.appendChild(el('div', 'minbagg-hr'));
  }

  // -------------------- Top3 section ---------------------------------------
  function renderTop3Section(wrap, groups) {
    var old = document.getElementById('minbagg-top3-section');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var card = el('div', 'minbagg-card');
    card.id = 'minbagg-top3-section';
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

  // -------------------- Connect view ---------------------------------------
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

  // -------------------- Add/Edit discs -------------------------------------
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
      meta.appendChild(el('div', 'sub', item.flight ? formatFlightLabel(item.flight) : 'Flight mangler'));
      preview.appendChild(meta);

      modal.appendChild(preview);
      modal.appendChild(el('div', 'minbagg-hr'));

      modal.appendChild(el('div', 'minbagg-label', 'Kommentar'));
      var com = el('textarea', 'minbagg-textarea');
      com.rows = 3;
      com.value = item.note || '';
      modal.appendChild(com);

      var row = el('div', 'minbagg-row');
      row.style.marginTop = '10px';

      var save = el('button', 'minbagg-btn', 'Lagre');
      save.addEventListener('click', function () {
        item.note = safeStr(com.value).trim();
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

  function openAddDiscModal(onAdd) {
    openModal('Legg til disk', function (modal, close) {
      modal.appendChild(el('div', 'minbagg-label', 'Søk i nettbutikken'));
      var q = el('input', 'minbagg-input');
      q.placeholder = 'Søk i nettbutikken (f.eks. buzzz, luna, md3)…';
      modal.appendChild(q);

      modal.appendChild(el('div', 'minbagg-label', 'Kategori'));
      var selType = el('select', 'minbagg-select');
      ['','putter','midrange','fairway','distance'].forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v ? typeLabel(v) : 'Velg kategori…';
        selType.appendChild(opt);
      });
      modal.appendChild(selType);

      var list = el('div', 'minbagg-list');
      list.style.marginTop = '10px';
      modal.appendChild(list);

      var selected = null;

      async function runSearch(v) {
        clear(list);
        v = safeStr(v).trim();
        if (!v) return;
        list.appendChild(el('div', 'minbagg-muted', 'Laster…'));
        var rows = await shopSearch(v);
        clear(list);
        if (!rows.length) { list.appendChild(el('div', 'minbagg-muted', 'Ingen treff.')); return; }

        rows.forEach(function (p3) {
          var row = el('div', 'minbagg-item is-clickable');

          var img = el('img', 'minbagg-thumb');
          img.alt = ''; img.loading = 'lazy';
          img.src = p3.image || '';
          if (!img.src) img.style.display = 'none';
          row.appendChild(img);

          var meta = el('div', 'minbagg-meta');
          meta.appendChild(el('div', 'minbagg-name', p3.name || ''));
          var fl = parseFlightText(p3.flightText);
          meta.appendChild(el('div', 'sub', fl ? formatFlightLabel(fl) : 'Flight mangler'));
          meta.appendChild(el('div', 'sub', 'Lager: ' + (p3.stock === true ? 'På lager' : p3.stock === false ? 'Ikke på lager' : 'Ukjent')));
          row.appendChild(meta);

          row.addEventListener('click', function () {
            selected = p3;
            var inf = inferTypeFromUrl(p3.url);
            if (inf) selType.value = inf;
            Array.prototype.forEach.call(list.children, function (ch) { ch.style.outline = ''; });
            row.style.outline = '2px solid rgba(46,139,87,.85)';
          });

          list.appendChild(row);
        });
      }

      q.addEventListener('input', debounce(function () { runSearch(q.value); }, 250));

      modal.appendChild(el('div', 'minbagg-label', 'Kommentar (valgfritt)'));
      var com = el('textarea', 'minbagg-textarea');
      com.rows = 3;
      com.placeholder = 'Skriv en kort kommentar…';
      modal.appendChild(com);

      var addBtn = el('button', 'minbagg-btn', 'Legg til');
      addBtn.style.marginTop = '10px';
      addBtn.addEventListener('click', function () {
        if (!selected) return;

        var tval = selType.value || inferTypeFromUrl(selected.url) || '';
        if (!tval) { alert('Velg kategori.'); return; }

        onAdd(normalizeDiscItem({
          name: selected.name,
          url: selected.url,
          image: selected.image,
          type: tval,
          note: safeStr(com.value).trim(),
          flight: parseFlightText(selected.flightText),
          flightText: selected.flightText,
          addedAt: todayISO()
        }));

        close();
      });
      modal.appendChild(addBtn);
    });
  }

  function openAddBagModal(onSave) {
    openModal('Legg til bagg', function (modal, close) {
      modal.appendChild(el('div', 'minbagg-label', 'Navn'));
      var nInp = el('input', 'minbagg-input'); nInp.placeholder = 'Navn på baggen';
      modal.appendChild(nInp);

      modal.appendChild(el('div', 'minbagg-label', 'Bilde-URL (valgfritt)'));
      var iInp = el('input', 'minbagg-input'); iInp.placeholder = 'https://...';
      modal.appendChild(iInp);

      var save = el('button', 'minbagg-btn', 'Lagre bagg');
      save.style.marginTop = '10px';
      save.addEventListener('click', function () {
        onSave({ name: safeStr(nInp.value).trim() || 'Bag', image: safeStr(iInp.value).trim(), url: '' });
        close();
      });
      modal.appendChild(save);
    });
  }

  // -------------------- C) Profil + anbefalinger render --------------------
  function renderProfileAndReco(wrap, supa, userEmail, onProfileChanged) {
    var container = el('div', 'minbagg-split');

    // Profilkort
    var cardP = el('div', 'minbagg-card');
    cardP.appendChild(el('h2', 'minbagg-title', 'Profil'));
    cardP.appendChild(el('p', 'minbagg-sub', 'Brukes til å gi deg anbefalinger. Du kan endre når som helst.'));

    if (!state.profile) state.profile = defaultProfile();

    var kv = el('div', 'minbagg-kv');
    profilePills(state.profile).forEach(function (t) { kv.appendChild(el('div', 'minbagg-pill', t)); });
    cardP.appendChild(kv);

    var row = el('div', 'minbagg-row');
    var btnEdit = el('button', 'minbagg-btn secondary', 'Rediger profil');
    btnEdit.addEventListener('click', function () {
      openProfileModal(state.profile, async function (newP) {
        state.profile = newP;
        try { await dbSaveBag(supa, userEmail, state); } catch (e) { log('[MINBAGG] save profile fail', e); }
        onProfileChanged();
      });
    });
    row.appendChild(btnEdit);
    cardP.appendChild(el('div', 'minbagg-hr'));
    cardP.appendChild(row);
    container.appendChild(cardP);

    // Anbefalinger
    var cardR = el('div', 'minbagg-card');
    cardR.appendChild(el('h2', 'minbagg-title', 'Anbefalt for deg'));
    cardR.appendChild(el('p', 'minbagg-sub', '2 forslag basert på profilen din og hva du mangler i baggen.'));

    var sc = calcBagScore(state.discs);
    var col = scoreColor(sc);
    var scoreWrap = el('div', 'minbagg-score');
    var pill = el('div', 'minbagg-scorepill', 'Bag score: ' + sc + '%');
    pill.style.background = col.bg;
    var bar = el('div', 'minbagg-scorebar');
    var fill = el('div', 'minbagg-scorefill');
    fill.style.width = clamp(sc,0,100) + '%';
    fill.style.background = col.fill;
    bar.appendChild(fill);
    scoreWrap.appendChild(pill);
    scoreWrap.appendChild(bar);
    cardR.appendChild(scoreWrap);


    var holder = el('div', 'minbagg-muted', 'Laster anbefalinger…');
    cardR.appendChild(holder);

    var recoGrid = el('div', 'minbagg-reco-grid');
    cardR.appendChild(recoGrid);

    async function refreshReco() {
      clear(recoGrid);
      holder.textContent = 'Laster anbefalinger…';
      holder.style.display = '';

      try {
        // ikke la excl. vokse uendelig
        if (recoExclude.length > 50) recoExclude = recoExclude.slice(-30);
        var recos = await pickRecoCandidates(supa, state.profile, state.discs, recoExclude);
        if (!recos.length) {
          holder.textContent = 'Fant ingen sikre anbefalinger på lager akkurat nå.';
          return;
        }

        holder.style.display = 'none';

        recos.forEach(function (r) {
          var c = el('div', 'minbagg-reco-card');

          var head = el('div', 'minbagg-reco-head');
          var img = el('img', '');
          img.alt = ''; img.loading = 'lazy';
          img.src = r.image || '';
          if (!img.src) img.style.display = 'none';
          head.appendChild(img);

          var meta = el('div', 'minbagg-meta');
          meta.appendChild(el('div', 'minbagg-name', (r.name || '')));
          meta.appendChild(el('div', 'sub', typeLabel(r.type)));
          if (r.flight) meta.appendChild(el('div', 'sub', formatFlightLabel(r.flight)));
          else meta.appendChild(el('div', 'sub', 'Flight: (ukjent)'));
          head.appendChild(meta);
          c.appendChild(head);

          c.appendChild(el('p', 'minbagg-reco-note', r.why || ''));

          var actions = el('div', 'minbagg-reco-actions');
          var a = el('a', 'minbagg-btn', 'Se produkt');
          a.href = r.url || '#';
          a.style.textDecoration = 'none';
          actions.appendChild(a);

          var no = el('button', 'minbagg-btn secondary', 'Nei takk');
          no.addEventListener('click', function () {
            if (r && r.name) recoExclude.push(r.name);
            refreshReco();
          });
          actions.appendChild(no);

          c.appendChild(actions);
          recoGrid.appendChild(c);
        });

      } catch (e) {
        holder.textContent = 'Kunne ikke laste anbefalinger.';
        log('[MINBAGG] reco fail', e);
      }
    }

    refreshReco();
    container.appendChild(cardR);

    wrap.appendChild(container);
    wrap.appendChild(el('div', 'minbagg-hr'));

    return { refreshReco: refreshReco };
  }

  // -------------------- MAIN init ------------------------------------------
  async function init(reason) {
    var now = Date.now();
    if (window.__MINBAGG_SOFT_LOCK__.running) return;
    if (now - window.__MINBAGG_SOFT_LOCK__.lastInitAt < 200) return;
    window.__MINBAGG_SOFT_LOCK__.running = true;
    window.__MINBAGG_SOFT_LOCK__.lastInitAt = now;

    try {
      injectStyles();
      var root = ensureRoot();
      var wrap = renderBase(root);

      var marker = getLoginMarker();
      var supa = await ensureSupabaseClient();

      async function renderTop3Bottom() {
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
      }

      if (!marker.loggedIn) {
        renderGuest(wrap);
        await renderTop3Bottom();
        window.__MINBAGG_SOFT_LOCK__.running = false;
        return;
      }

      var sess = await supa.auth.getSession();
      var session = (sess && sess.data) ? sess.data.session : null;
      if (!session || !session.user) {
        renderConnectView(wrap, marker, supa);
        await renderTop3Bottom();
        window.__MINBAGG_SOFT_LOCK__.running = false;
        return;
      }

      var gu = await supa.auth.getUser();
      var user = (gu && gu.data) ? gu.data.user : (session.user || null);
      if (!user || !user.email) {
        renderConnectView(wrap, marker, supa);
        await renderTop3Bottom();
        window.__MINBAGG_SOFT_LOCK__.running = false;
        return;
      }

      var loaded = await dbLoadBag(supa, user.email);
      state.bagInfo = loaded.bagInfo || null;
      state.profile = loaded.profile || null;
      state.discs = (loaded.discs || []).map(normalizeDiscItem);

      async function refreshTop3() {
        try {
          var groups = await fetchTop3Grouped(supa);
          renderTop3Section(wrap, groups);
        } catch (e) { log('[MINBAGG] top3 refresh failed', e); }
      }

      function renderAll() {
        clear(wrap);

        var banner = el('div', 'minbagg-banner');
        banner.appendChild(el('b', '', '🚧 Under konstruksjon'));
        banner.appendChild(el('div', 'minbagg-muted',
          'Denne siden er under utvikling og kan endre seg fra dag til dag. Takk for tålmodigheten – full versjon kommer snart.'));
        wrap.appendChild(banner);
        wrap.appendChild(el('div', 'minbagg-hr'));

        renderHeaderLoggedIn(
          wrap,
          marker,
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

              await incrementPopular(supa, disc);
              await refreshTop3();
            });
          }
        );

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

        // C) Mellom boksene og flight-lista
        var recoCtl = renderProfileAndReco(wrap, supa, user.email, function () {
          // refresh whole view to update pills + reco
          renderAll();
        });

        renderFlightList(wrap);
        renderFlightChart(wrap);

        // Top3 nederst
        renderTop3Section(wrap, { putter: [], midrange: [], fairway: [], distance: [] });
        refreshTop3();

        // keep linter happy
        if (recoCtl && recoCtl.refreshReco) {}
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
    log('[MINBAGG] boot', reason, 'build=', window.__MINBAGG_BUILD__);
    init(reason);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot('readyState');
  } else {
    document.addEventListener('DOMContentLoaded', function () { boot('DOMContentLoaded'); });
  }

  window.addEventListener('pageshow', function () {
    window.__MINBAGG_SOFT_LOCK__.running = false;
    boot('pageshow');
  });

})();
