/* ============================================================================
   GOLFKONGEN – MIN BAG
   Build: v2026-02-21.6  (ES5 safe – no async/await)
   Mål i denne versjonen:
   - Få tilbake "bra versjon"-følelsen: tydelige GK-cards, seksjoner, mindre rot
   - Kun 2 bagger (default + bag2), slett Bag 2
   - Bag-navn + bag-bilde (URL)
   - Legg til disker via kategori-knapper (mobilvennlig)
   - Diskliste pr kategori + flight-liste
   - Enkel flight-visual (inline SVG) pr disk
   - "Anbefalt for deg" (på lager – best effort) + "Nei takk" gir nytt forslag
   - Topp 3 per type (putter/midrange/fairway/distance) fra popular_discs
   - Under bygging banner øverst
   MERK:
   - Flight-data hentes best-effort fra produktside (fallback: tomme felter + manuell edit)
   - Denne fila bygger videre på det som allerede fungerer i Supabase-oppsettet ditt.
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = 'v2026-02-24.7';
  console.log('[MINBAG] boot ' + VERSION);

  // Root
  var ROOT_ID = 'min-bag-root';
  var root = document.getElementById(ROOT_ID);
  if (!root) return;

  // Supabase config (fra loader)
  var SUPA_URL = window.GK_SUPABASE_URL;
  var SUPA_KEY = window.GK_SUPABASE_ANON_KEY;

  // ---------------------------
  // Helpers (ES5)
  // ---------------------------
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }
  function css(e, s) { e.style.cssText = s; return e; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function safeStr(v) { return (v === null || v === undefined) ? '' : String(v); }
  function nowIso() { return (new Date()).toISOString(); }
  function clampTxt(s, n) { s = safeStr(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function normEmail(s) { return safeStr(s).trim().toLowerCase(); }
  function uniqId(prefix) { return prefix + '_' + Math.random().toString(16).slice(2) + Date.now().toString(16); }
  function isAbsUrl(u) { return /^https?:\/\//i.test(u || ''); }
  function toAbs(u) {
    u = safeStr(u).trim();
    if (!u) return '';
    if (isAbsUrl(u)) return u;
    if (u.indexOf('//') === 0) return location.protocol + u;
    if (u[0] === '/') return location.origin + u;
    return u;
  }

  function toast(msg, kind) {
    if (!ui.toast) return;
    ui.toast.textContent = msg || '';
    ui.toast.style.display = msg ? 'block' : 'none';
    ui.toast.style.borderColor = (kind === 'err') ? 'rgba(255,100,100,.35)' : 'rgba(255,255,255,.14)';
    ui.toast.style.background = (kind === 'err') ? 'rgba(255,60,60,.09)' : 'rgba(255,255,255,.05)';
  }

  function card(title, subtitle) {
    var c = el('div', 'gk-card');
    css(c, 'border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.16);border-radius:16px;padding:14px 16px;box-shadow:0 10px 28px rgba(0,0,0,.22);');
    if (title) {
      var h = el('div', 'gk-h', title);
      css(h, 'font-weight:900;font-size:18px;letter-spacing:.2px;margin:0 0 4px 0;');
      c.appendChild(h);
    }
    if (subtitle) {
      var p = el('div', 'gk-sub', subtitle);
      css(p, 'opacity:.88;margin:0 0 12px 0;line-height:1.35;');
      c.appendChild(p);
    }
    return c;
  }

  function chip(txt) {
    var c = el('span', 'gk-chip', txt);
    css(c, 'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);font-size:12px;opacity:.9;');
    return c;
  }

  function btn(txt, kind) {
    var b = el('button', 'gk-btn', txt);
    var base = 'padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-weight:800;cursor:pointer;';
    if (kind === 'primary') base += 'background:#2e8b57;border-color:rgba(46,139,87,.55);';
    if (kind === 'danger') base += 'background:rgba(255,90,90,.14);border-color:rgba(255,90,90,.40);';
    css(b, base);
    return b;
  }

  function inputText(placeholder, value) {
    var i = el('input', 'gk-in');
    i.type = 'text';
    i.placeholder = placeholder || '';
    i.value = value || '';
    css(i, 'padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff;min-width:240px;');
    return i;
  }

  function selectBox() {
    var s = el('select', 'gk-sel');
    css(s, 'padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff;min-width:220px;');
    return s;
  }

  function modal(title) {
    var overlay = el('div', 'gk-modal-overlay');
    css(overlay, 'position:fixed;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;');
    var box = el('div', 'gk-modal');
    css(box, 'width:min(980px, 100%);max-height:85vh;overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,.14);background:rgba(18,18,18,.95);box-shadow:0 24px 70px rgba(0,0,0,.55);');
    var head = el('div','gk-modal-head');
    css(head,'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.10);');
    var h = el('div','', title || 'Dialog');
    css(h,'font-weight:900;font-size:16px;');
    var close = btn('Lukk','');
    close.onclick = function(){ document.body.removeChild(overlay); };
    head.appendChild(h); head.appendChild(close);
    var body = el('div','gk-modal-body');
    css(body,'padding:14px 16px;');
    box.appendChild(head); box.appendChild(body);
    overlay.appendChild(box);
    return { overlay: overlay, body: body, close: close };
  }

  
  // ---------------------------
  // Accordion + sorting helpers (ES5)
  // ---------------------------
  function accordion(title, subtitle) {
    var wrap = el('div','gk-acc');
    css(wrap,'border:2px solid #2e8b57;border-radius:18px;background:rgba(46,139,87,.10);margin:12px 0;');
    var head = el('div','');
    css(head,'display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;');
    var t = el('div','', title);
    css(t,'font-weight:900;font-size:16px;');
    var s = el('div','', subtitle||'Trykk for å åpne');
    css(s,'opacity:.8;font-size:12px;');
    var che = el('div','', '▸');
    css(che,'opacity:.9;font-size:16px;');
    head.appendChild(t); head.appendChild(s); head.appendChild(che);
    var body = el('div','');
    css(body,'display:none;padding:14px 16px;border-top:1px solid rgba(255,255,255,.18);');
    head.onclick = function(){
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      che.textContent = open ? '▸' : '▾';
    };
    wrap.appendChild(head); wrap.appendChild(body);
    return {wrap:wrap, body:body};
  }

  
  function sortByFlight(a,b){
    function num(x){ var n=parseFloat(x); return isNaN(n)?-999:n; }
    var fa=a.flight||{}, fb=b.flight||{};
    var keys=['speed','glide','turn','fade'];
    for (var i=0;i<keys.length;i++){
      var ka=num(fa[keys[i]]), kb=num(fb[keys[i]]);
      if (kb!==ka) return kb-ka;
    }
    var na=(a.name||'').toLowerCase(), nb=(b.name||'').toLowerCase();
    return na<nb?-1:na>nb?1:0;
  }


  // ---------------------------
  // Flight colors (global)
  // ---------------------------
  var FLIGHT_COLORS = {
    speed: '#7CFFB2',   // light green
    glide: '#FF9AA2',   // light pink
    turn:  '#8FD3FF',   // light blue
    fade:  '#FFE27A'    // light yellow
  };
  var TYPE_COLORS = {
    putter:'#5fd38d',
    midrange:'#6aa8ff',
    fairway:'#ffb86b',
    distance:'#c18cff'
  };

  // ---------------------------
  // Types / categories (fasit)
  // ---------------------------
  var TYPE_ORDER = ['putter','midrange','fairway','distance'];
  var TYPE_LABEL = { putter:'Puttere', midrange:'Midrange', fairway:'Fairway', distance:'Drivere' };

  var CAT = [
    { type:'putter',   label:'Puttere',  url:'/discgolf/disc-putter' },
    { type:'midrange', label:'Midrange', url:'/discgolf/midrange' },
    { type:'fairway',  label:'Fairway',  url:'/discgolf/fairway-driver' },
    { type:'distance', label:'Drivere',  url:'/discgolf/driver' }
  ];

  function inferTypeFromUrl(url) {
    url = safeStr(url).toLowerCase();
    if (url.indexOf('/discgolf/disc-putter') === 0) return 'putter';
    if (url.indexOf('/discgolf/midrange') === 0) return 'midrange';
    if (url.indexOf('/discgolf/fairway-driver') === 0) return 'fairway';
    if (url.indexOf('/discgolf/driver') === 0) return 'distance';
    return '';
  }

  // ---------------------------
  // State
  // ---------------------------
  var STATE = {
    version: VERSION,
    supa: null,
    user: null,
    email: null,

    bags: null,        // { default:{name,imageUrl,items:{discs,bagInfo,profile}}, bag2:{...} }
    activeBagId: 'default',

    discs: [],
    bagInfo: {},
    profile: null
  };
  window.__MINBAGG_STATE__ = STATE;

  function ensureBags() {
    if (!STATE.bags || typeof STATE.bags !== 'object') STATE.bags = {};

    if (!STATE.bags.default) {
      STATE.bags.default = {
        name: 'Min bag',
        imageUrl: '',
        createdAt: nowIso(),
        items: { discs: [], bagInfo: {}, profile: null }
      };
    }

    // Bag 2: finnes kun hvis laget
    if (STATE.bags.bag2) {
      if (!STATE.bags.bag2.name) STATE.bags.bag2.name = 'Bag 2';
      if (!STATE.bags.bag2.createdAt) STATE.bags.bag2.createdAt = nowIso();
      if (!STATE.bags.bag2.items || typeof STATE.bags.bag2.items !== 'object') STATE.bags.bag2.items = { discs: [], bagInfo: {}, profile: null };
      if (!Array.isArray(STATE.bags.bag2.items.discs)) STATE.bags.bag2.items.discs = [];
      if (!STATE.bags.bag2.items.bagInfo || typeof STATE.bags.bag2.items.bagInfo !== 'object') STATE.bags.bag2.items.bagInfo = {};
      if (STATE.bags.bag2.items.profile === undefined) STATE.bags.bag2.items.profile = null;
      if (!STATE.bags.bag2.imageUrl) STATE.bags.bag2.imageUrl = '';
    }

    if (!STATE.activeBagId || !STATE.bags[STATE.activeBagId]) STATE.activeBagId = 'default';
    syncActiveFromBags();
  }

  function syncActiveFromBags() {
    if (!STATE.bags || typeof STATE.bags !== 'object') STATE.bags = {};
    if (!STATE.activeBagId || !STATE.bags[STATE.activeBagId]) STATE.activeBagId = 'default';

    var b = STATE.bags[STATE.activeBagId];
    if (!b || typeof b !== 'object') b = STATE.bags.default;
    if (!b.items || typeof b.items !== 'object') b.items = {};
    if (!Array.isArray(b.items.discs)) b.items.discs = [];
    if (!b.items.bagInfo || typeof b.items.bagInfo !== 'object') b.items.bagInfo = {};
    if (b.items.profile === undefined) b.items.profile = null;

    STATE.discs = b.items.discs;
    STATE.bagInfo = b.items.bagInfo;
    STATE.profile = b.items.profile;
  }

  function writeActiveToBags() {
    if (!STATE.bags || typeof STATE.bags !== 'object') STATE.bags = {};
    if (!STATE.bags.default) {
      STATE.bags.default = {
        name: 'Min bag',
        imageUrl: '',
        createdAt: nowIso(),
        items: { discs: [], bagInfo: {}, profile: null }
      };
    }
    if (!STATE.activeBagId || !STATE.bags[STATE.activeBagId]) STATE.activeBagId = 'default';
    var b = STATE.bags[STATE.activeBagId];
    if (!b.items || typeof b.items !== 'object') b.items = {};
    b.items.discs = Array.isArray(STATE.discs) ? STATE.discs : [];
    b.items.bagInfo = STATE.bagInfo || {};
    b.items.profile = (STATE.profile === undefined) ? null : STATE.profile;
  }

  // ---------------------------
  // Supabase client / auth
  // ---------------------------
  function ensureSupabaseClient() {
    return new Promise(function (resolve, reject) {
      try {
        if (!SUPA_URL || !SUPA_KEY) return reject(new Error('Supabase URL/KEY mangler i loader'));
        if (!window.supabase || !window.supabase.createClient) return reject(new Error('Supabase SDK mangler'));
        if (!STATE.supa) STATE.supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);
        resolve(STATE.supa);
      } catch (e) { reject(e); }
    });
  }

  function supaGetUser() {
    return ensureSupabaseClient().then(function (supa) {
      return supa.auth.getUser().then(function (r) {
        if (r && r.error) throw r.error;
        return (r && r.data) ? r.data.user : null;
      });
    });
  }

  function supaSendMagicLink(email) {
    return ensureSupabaseClient().then(function (supa) {
      return supa.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: location.origin + '/sider/min-bag' }
      }).then(function (r) {
        if (r && r.error) throw r.error;
        return r;
      });
    });
  }

  // ---------------------------
  // DB: mybag_bags
  // ---------------------------
  function parseRow(row) {
    var out = { bags: {}, activeBagId: 'default' };
    if (row && row.bag_json && typeof row.bag_json === 'object' && row.bag_json.bags && typeof row.bag_json.bags === 'object') {
      out.bags = row.bag_json.bags;
    }
    out.activeBagId = (row && row.selected_bag) ? row.selected_bag : 'default';

    // UI støtter kun default+bag2 – behold andre i DB, men vi henter dem ikke inn i UI
    var keep = {};
    if (out.bags.default) keep.default = out.bags.default;
    if (out.bags.bag2) keep.bag2 = out.bags.bag2;
    // Hvis aktiv bag er en "annen" id – flytt den inn i bag2 så du ikke mister den
    if (out.activeBagId && out.activeBagId !== 'default' && out.activeBagId !== 'bag2' && out.bags[out.activeBagId]) {
      keep.bag2 = out.bags[out.activeBagId];
      out.activeBagId = 'bag2';
    }
    out.bags = keep;

    // Backfill default discs fra legacy bag array hvis tom
    if (!keep.default) keep.default = { name:'Min bag', imageUrl:'', createdAt: nowIso(), items:{discs:[],bagInfo:{},profile:null} };
    var legacy = [];
    if (row && row.bag) {
      if (Array.isArray(row.bag)) legacy = row.bag;
      else if (typeof row.bag === 'object' && Array.isArray(row.bag.discs)) legacy = row.bag.discs;
    }
    if (!keep.default.items) keep.default.items = { discs:[], bagInfo:{}, profile:null };
    if (!Array.isArray(keep.default.items.discs) || keep.default.items.discs.length === 0) {
      if (legacy && legacy.length) keep.default.items.discs = legacy;
    }

    return out;
  }

  function dbLoad(email) {
    return ensureSupabaseClient().then(function (supa) {
      return supa.from('mybag_bags')
        .select('email, selected_bag, bag, bag_json')
        .eq('email', email)
        .maybeSingle()
        .then(function (r) {
          if (r && r.error) throw r.error;
          return (r && r.data) ? r.data : null;
        });
    });
  }

  function dbSave(email) {
    writeActiveToBags();
    var bj = { bags: STATE.bags, profile: (STATE.profileExt || null) };
    var selected = STATE.activeBagId;
    var active = STATE.bags[selected] || STATE.bags.default;
    var legacyBagArray = (active && active.items && Array.isArray(active.items.discs)) ? active.items.discs : [];

    return ensureSupabaseClient().then(function (supa) {
      return supa.from('mybag_bags')
        .upsert({
          email: email,
          bag: legacyBagArray,
          bag_json: bj,
          selected_bag: selected,
          updated_at: nowIso()
        }, { onConflict: 'email' })
        .select('email, selected_bag, bag_json')
        .then(function (r) {
          if (r && r.error) throw r.error;
          return r;
        });
    });
  }

  // ---------------------------
  // Product parsing (category pages)
  // ---------------------------
  function fetchText(url) {
    return fetch(url, { credentials: 'include' }).then(function (r) { return r.text(); });
  }

  function parseProductsFromCategoryHtml(html, baseType) {
    // Best effort: find product cards with href under /discgolf/
    // Returns: [{url,name,image,type}]
    var out = [];
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var links = doc.querySelectorAll('a[href^="/discgolf/"]');
      var seen = {};

      function findImgUrl(a){
        var img = a.querySelector('img');
        if (img) return toAbs(img.getAttribute('src') || img.getAttribute('data-src') || '');
        var p = a;
        for (var k=0;k<4;k++){
          if (!p || !p.parentElement) break;
          p = p.parentElement;
          var im = p.querySelector ? p.querySelector('img') : null;
          if (im) return toAbs(im.getAttribute('src') || im.getAttribute('data-src') || '');
        }
        return '';
      }

      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (!href || href.indexOf('/discgolf/') !== 0) continue;
        // must look like /discgolf/<category>/<product-slug>
        if (!/^\/discgolf\/[^\/]+\/[^\/?#]+/.test(href)) continue;
        if (seen[href]) continue;

        var name = '';
        var t = links[i].getAttribute('title');
        if (t) name = t;
        if (!name) name = links[i].textContent;
        name = safeStr(name).replace(/\s+/g,' ').trim();

        var stop = {'åpne':1,'apne':1,'nytral':1,'nøytral':1,'understabil':1,'overstabil':1,'filtrer':1,'filter':1};
        if (stop[name.toLowerCase()]) continue;

        if (name.length < 3) continue;

        var imgUrl = findImgUrl(links[i]);

        var type = inferTypeFromUrl(href) || baseType || '';
        if (href.split('/').length < 4) continue;

        out.push({ url: href, name: name, image: imgUrl, type: type });
        seen[href] = true;
        if (out.length >= 60) break;
      }
    } catch (_) {}
    return out;
  }

  function searchGolfkongenProducts(q) {
    q = safeStr(q).trim();
    var qRaw = q;
    q = q.toLowerCase();
    if (q.length < 2) return Promise.resolve([]);

    // Direct product URL support
    if (qRaw.indexOf('/discgolf/') !== -1) {
      var path = qRaw.replace(/^https?:\/\/[^\/]+/,'').trim();
      if (/^\/discgolf\/[^\/]+\/[^\?#\/]+/.test(path)) {
        return getProductMeta(path).then(function(meta){
          return [meta];
        }).catch(function(){ return []; });
      }
    }

    return ensureAllProductsIndex().then(function(allUrls){
      var candidates = [];
      for (var i=0;i<allUrls.length;i++){
        var u = allUrls[i];
        var meta = getCachedMeta(u);
        if (meta && meta.name && meta.name.toLowerCase().indexOf(q) !== -1) {
          candidates.push(meta);
        } else if (!meta || !meta.name) {
          if (u.toLowerCase().indexOf(q) !== -1) candidates.push({url:u, name:'', image:'', type: inferTypeFromUrl(u)||''});
        }
        if (candidates.length >= 40) break;
      }

      var enrich = candidates.slice(0, 12);
      return seq(enrich, function(item){
        if (item.name) return Promise.resolve(item);
        return getProductMeta(item.url).catch(function(){ return item; });
      }).then(function(){
        var out = [];
        for (var j=0;j<candidates.length;j++){
          var mm = getCachedMeta(candidates[j].url) || candidates[j];
          if (mm.name && mm.name.toLowerCase().indexOf(q) !== -1) out.push(mm);
        }
        if (out.length < 8) {
          var more = candidates.slice(12, 24);
          return seq(more, function(item){
            if (item.name) return Promise.resolve(item);
            return getProductMeta(item.url).catch(function(){ return item; });
          }).then(function(){
            var out2 = [];
            for (var k=0;k<candidates.length;k++){
              var mm2 = getCachedMeta(candidates[k].url) || candidates[k];
              if (mm2.name && mm2.name.toLowerCase().indexOf(q) !== -1) out2.push(mm2);
            }
            return out2.filter(function(x){ return x && x.name && x.name.toLowerCase().indexOf(q)!==-1; }).slice(0,40);
          });
        }
        return out.filter(function(x){ return x && x.name && x.name.toLowerCase().indexOf(q)!==-1; }).slice(0,40);
      });
    });
  }

  var _ALL_PRODUCTS_CACHE = null;
  var _ALL_PRODUCTS_PROMISE = null;

  function ensureAllProductsIndex(){
    if (_ALL_PRODUCTS_CACHE) return Promise.resolve(_ALL_PRODUCTS_CACHE);
    if (_ALL_PRODUCTS_PROMISE) return _ALL_PRODUCTS_PROMISE;

    var cacheKey = 'MINBAG_ALL_URLS_V1';
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch(_){}
    if (cached && cached.urls && cached.urls.length && cached.ts && (Date.now()-cached.ts) < 1000*60*60*12) {
      _ALL_PRODUCTS_CACHE = cached.urls;
      return Promise.resolve(_ALL_PRODUCTS_CACHE);
    }

    _ALL_PRODUCTS_PROMISE = fetchText('/sitemap.xml').then(function(xml){
      var urls = [];
      var reLoc = /<loc>([^<]+)<\/loc>/g;
      var m;
      while ((m = reLoc.exec(xml))) {
        var full = safeStr(m[1]).trim();
        var path = full.replace(/^https?:\/\/[^\/]+/,'').trim();
        if (!/^\/discgolf\/[^\/]+\/[^\?#\/]+/.test(path)) continue;
        if (path.split('/').length < 4) continue;
        urls.push(path);
        if (urls.length > 6000) break;
      }
      if (!urls.length) throw new Error('Ingen urls i sitemap.xml');
      var seen = {};
      var uniq = [];
      for (var i=0;i<urls.length;i++){
        if (!seen[urls[i]]) { seen[urls[i]]=1; uniq.push(urls[i]); }
      }
      _ALL_PRODUCTS_CACHE = uniq;
      try { localStorage.setItem(cacheKey, JSON.stringify({ts:Date.now(), urls:uniq})); } catch(_){}
      _ALL_PRODUCTS_PROMISE = null;
      return uniq;
    }).catch(function(){
      return ensureAllProductsIndexFromCategories();
    });

    return _ALL_PRODUCTS_PROMISE;
  }

  function ensureAllProductsIndexFromCategories(){
    var cats = [
      {url:'/discgolf/disc-putter', type:'putter'},
      {url:'/discgolf/midrange', type:'midrange'},
      {url:'/discgolf/fairway-driver', type:'fairway'},
      {url:'/discgolf/driver', type:'distance'}
    ];
    var all = [];
    function loadOne(i){
      if (i>=cats.length) return all;
      return fetchText(cats[i].url).then(function(html){
        var items = parseProductsFromCategoryHtml(html, cats[i].type) || [];
        for (var j=0;j<items.length;j++){
          if (items[j].url) all.push(items[j].url);
        }
        return loadOne(i+1);
      }).catch(function(){ return loadOne(i+1); });
    }
    return loadOne(0).then(function(urls){
      var seen = {}, uniq = [];
      for (var k=0;k<urls.length;k++){ if (!seen[urls[k]]) { seen[urls[k]]=1; uniq.push(urls[k]); } }
      _ALL_PRODUCTS_CACHE = uniq;
      _ALL_PRODUCTS_PROMISE = null;
      return uniq;
    });
  }

  function seq(arr, fn){
    var p = Promise.resolve();
    arr.forEach(function(x){
      p = p.then(function(){ return fn(x); });
    });
    return p;
  }

  function getCachedMeta(url){
    try {
      var map = JSON.parse(localStorage.getItem('MINBAG_META_V2') || '{}');
      return map[url] || null;
    } catch(_) { return null; }
  }

  function setCachedMeta(url, meta){
    try {
      var map = JSON.parse(localStorage.getItem('MINBAG_META_V2') || '{}');
      map[url] = meta;
      localStorage.setItem('MINBAG_META_V2', JSON.stringify(map));
    } catch(_) {}
  }

  function getProductMeta(url){
    var cached = getCachedMeta(url);
    if (cached && cached.name && cached.image) return Promise.resolve(cached);

    function looksLikeLogo(u){
      u = (u||'').toLowerCase();
      return (u.indexOf('logo') !== -1) || (u.indexOf('/theme/') !== -1) || (u.indexOf('storage.quickbutik.com/stores/') !== -1);
    }
    function looksLikeProductImg(u){
      u = (u||'').toLowerCase();
      return (u.indexOf('/products/') !== -1) || (u.indexOf('products/') !== -1) || (u.indexOf('cdn.quickbutik.com/images/') !== -1 && u.indexOf('/products/') !== -1);
    }

    return fetchText(url).then(function(html){
      var doc = new DOMParser().parseFromString(html,'text/html');
      var title = '';
      var h1 = doc.querySelector('h1');
      if (h1) title = safeStr(h1.textContent).trim();
      if (!title) title = safeStr(doc.title).replace(/\s+\|\s+.*$/,'').trim();

      var imgUrl = '';

      // 1) Prefer product images in DOM
      var imgs = doc.querySelectorAll('img');
      for (var i=0;i<imgs.length;i++){
        var s = toAbs(imgs[i].getAttribute('src')||imgs[i].getAttribute('data-src')||'');
        if (!s) continue;
        if (looksLikeProductImg(s) && !looksLikeLogo(s)) { imgUrl = s; break; }
      }

      // 2) Meta tags as fallback (skip logo/theme)
      if (!imgUrl) {
        var metas = doc.querySelectorAll('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]');
        for (var j=0;j<metas.length;j++){
          var c = toAbs(metas[j].getAttribute('content')||'');
          if (!c) continue;
          if (looksLikeLogo(c)) continue;
          if (looksLikeProductImg(c)) { imgUrl = c; break; }
          if (!imgUrl) imgUrl = c;
        }
      }

      if (looksLikeLogo(imgUrl)) imgUrl = '';

      var meta = { url:url, name:title||url.split('/').pop(), image:imgUrl||'', type: inferTypeFromUrl(url)||'' };
      setCachedMeta(url, meta);
      return meta;
    });
  }

  function parseFlightFromProductHtml(html) {
    // Best effort: tries to detect four numbers in common patterns
    // Returns {speed, glide, turn, fade} as strings or null
    try {
      var txt = safeStr(html);

      // Pattern 1: "Speed 9 Glide 5 Turn -1 Fade 2" (any order)
      function pick(label) {
        var re = new RegExp(label + "\\s*[:]?\\s*(-?\\d+(?:[\\.,]\\d+)?)", "i");
        var m = txt.match(re);
        return m ? m[1].replace(',', '.') : null;
      }

      var speed = pick('speed');
      var glide = pick('glide');
      var turn = pick('turn');
      var fade = pick('fade');

      // Pattern 2: "9 | 5 | -1 | 2" near word "Flight"
      if (!speed || !glide || !turn || !fade) {
        var m2 = txt.match(/flight[^0-9-]{0,60}(-?\d+(?:[\.,]\d+)?)\D+(-?\d+(?:[\.,]\d+)?)\D+(-?\d+(?:[\.,]\d+)?)\D+(-?\d+(?:[\.,]\d+)?)/i);
        if (m2) {
          speed = speed || m2[1].replace(',', '.');
          glide = glide || m2[2].replace(',', '.');
          turn = turn || m2[3].replace(',', '.');
          fade = fade || m2[4].replace(',', '.');
        }
      }

      if (speed || glide || turn || fade) {
        return { speed: speed || '', glide: glide || '', turn: turn || '', fade: fade || '' };
      }
    } catch (_) {}
    return null;
  }

  // ---------------------------
  // Flight visuals (inline SVG)
  // ---------------------------
  function flightSvg(f) {
    // simple curve based on turn/fade (best effort)
    var s = parseFloat((f && f.speed) ? f.speed : '0') || 0;
    var t = parseFloat((f && f.turn) ? f.turn : '0') || 0;
    var d = parseFloat((f && f.fade) ? f.fade : '0') || 0;

    // normalize
    var maxX = 120;
    var maxY = 44;
    var startX = 6, startY = maxY - 6;
    var endX = maxX - 6, endY = 10;

    // Turn pulls right for RHBH (negative values -> more right)
    // Fade pulls left (positive -> left)
    var turnAmt = Math.max(-5, Math.min(5, t));
    var fadeAmt = Math.max(-5, Math.min(5, d));

    var midX = startX + (maxX - 12) * 0.55;
    var midY = startY - (maxY - 16) * 0.55;

    // right is +, left is -
    var ctrl1X = startX + (maxX - 12) * 0.35 + (turnAmt * 6);
    var ctrl1Y = startY - (maxY - 16) * 0.15;

    var ctrl2X = midX + (turnAmt * 8) - (fadeAmt * 7);
    var ctrl2Y = midY - (maxY - 16) * 0.30;

    var ctrl3X = endX - (fadeAmt * 8);
    var ctrl3Y = endY + 10;

    // longer for higher speed
    var scale = 1 + Math.min(0.25, s / 20);
    var w = Math.round(maxX * scale);

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' 54');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '54');
    svg.style.display = 'block';

    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(w)); bg.setAttribute('height', '54');
    bg.setAttribute('rx', '12');
    bg.setAttribute('fill', 'rgba(255,255,255,.04)');
    bg.setAttribute('stroke', 'rgba(255,255,255,.10)');
    svg.appendChild(bg);

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var p = 'M ' + startX + ' ' + startY +
            ' C ' + ctrl1X + ' ' + ctrl1Y + ', ' + ctrl2X + ' ' + ctrl2Y + ', ' + midX + ' ' + midY +
            ' S ' + ctrl3X + ' ' + ctrl3Y + ', ' + endX + ' ' + endY;
    path.setAttribute('d', p);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(180,255,220,.9)');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);

    return svg;
  }

  
  // ---------------------------
  // Recommendations (U4 enhanced)
  // ---------------------------
  var recoSeen = {};

  function pickNeededTypeAdvanced(discs, profile) {
    var c = countByType(discs);
    if (profile && profile.course === 'Skog') {
      if (c.fairway < 3) return 'fairway';
    }
    if (c.putter < 2) return 'putter';
    if (c.midrange < 3) return 'midrange';
    if (c.fairway < 3) return 'fairway';
    if (c.distance < 2) return 'distance';
    return 'midrange';
  }
// ---------------------------
  // Recommendations (simple)
  // ---------------------------
  function countByType(discs) {
    var c = { putter:0, midrange:0, fairway:0, distance:0 };
    for (var i=0;i<discs.length;i++) {
      var t = discs[i] && discs[i].type ? discs[i].type : '';
      if (c[t] !== undefined) c[t] += 1;
    }
    return c;
  }

  function pickNeededType(discs) {
    var c = countByType(discs);
    // super enkel logikk: sørg for minst 2 puttere, 3 mid, 3 fairway, 2 distance
    if (c.putter < 2) return 'putter';
    if (c.midrange < 3) return 'midrange';
    if (c.fairway < 3) return 'fairway';
    if (c.distance < 2) return 'distance';
    // ellers prøv å fylle "rett" midrange/fairway (turn ~0 fade ~1)
    return 'midrange';
  }

  function isApproxStraight(f) {
    if (!f) return false;
    var t = parseFloat(f.turn || '0') || 0;
    var d = parseFloat(f.fade || '0') || 0;
    return (Math.abs(t) <= 1.0 && d >= 0 && d <= 2.0);
  }

  // ---------------------------
  // UI nodes
  // ---------------------------
  var ui = {
    shell: null,
    toast: null,
    bagSel: null,
    delBagBtn: null,
    content: null,
    top3: null,
    reco: null
  };

  function buildShell() {
    clear(root);
    css(root, 'max-width:1100px;margin:0 auto;padding:10px 14px;');

    // Under construction banner
    var warn = el('div','gk-warn');
    css(warn, 'background:linear-gradient(90deg,#1e3c2f,#2e8b57);padding:12px 16px;margin:0 0 14px 0;border-radius:16px;border:1px solid rgba(255,255,255,.15);box-shadow:0 10px 28px rgba(0,0,0,.28);');
    warn.innerHTML =
      '<div style="font-weight:900;font-size:14px;">⚠ Min bag er under bygging</div>' +
      '<div style="opacity:.92;margin-top:4px;font-size:13px;">Design og funksjoner forbedres fortløpende. Full versjon kommer snart.</div>';
    root.appendChild(warn);

    // Header card
    var head = card('Min bag', 'Bygg og lagre discgolf-sekken din. Her kommer flight-liste, anbefalinger og statistikk.');
    var row = el('div','');
    css(row,'display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;');

    var left = el('div','');
    css(left,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;');

    var who = chip(STATE.email ? ('Innlogget: ' + STATE.email) : 'Ikke innlogget');
    left.appendChild(who);

    ui.bagSel = selectBox();
    function addOpt(val, label) {
      var o = document.createElement('option');
      o.value = val; o.textContent = label;
      ui.bagSel.appendChild(o);
    }
    ensureBags();
    addOpt('default', (STATE.bags.default && STATE.bags.default.name ? STATE.bags.default.name : 'Min bag'));
    if (STATE.bags.bag2 || STATE.activeBagId === 'bag2') addOpt('bag2', (STATE.bags.bag2 && STATE.bags.bag2.name ? STATE.bags.bag2.name : 'Bag 2'));
    ui.bagSel.value = STATE.activeBagId || 'default';

    ui.bagSel.onchange = function () {
      var id = ui.bagSel.value;
      if (id === 'bag2' && (!STATE.bags.bag2)) {
        STATE.bags.bag2 = { name:'Bag 2', imageUrl:'', createdAt: nowIso(), items:{ discs:[], bagInfo:{}, profile:null } };
      }
      STATE.activeBagId = id;
      syncActiveFromBags();
      toast('Bytter bag…');
      dbSave(STATE.email).then(function(){ toast(''); loadProfile().then(function(){ renderAll(); }); }).catch(function(e){ toast('Kunne ikke bytte: ' + (e&&e.message?e.message:e),'err'); });
    };
    left.appendChild(ui.bagSel);

    ui.delBagBtn = btn('Slett Bag 2','danger');
    ui.delBagBtn.onclick = function(){
      if (STATE.activeBagId !== 'bag2') return;
      if (!confirm('Slette Bag 2? Dette kan ikke angres.')) return;
      try { delete STATE.bags.bag2; } catch(_) {}
      STATE.activeBagId = 'default';
      syncActiveFromBags();
      toast('Sletter…');
      dbSave(STATE.email).then(function(){ toast(''); loadProfile().then(function(){ renderAll(); }); }).catch(function(e){ toast('Kunne ikke slette: ' + (e&&e.message?e.message:e),'err'); });
    };
    ui.delBagBtn.style.display = (STATE.activeBagId === 'bag2' && !!STATE.bags.bag2) ? 'inline-block' : 'none';
    left.appendChild(ui.delBagBtn);

    row.appendChild(left);

    var right = el('div','');
    css(right,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;');

    var addBtn = btn('Legg til disk','primary');
    addBtn.onclick = function(){ openAddDiscModal(); };
    right.appendChild(addBtn);

    var metaBtn = btn('Bag-innstillinger','');
    metaBtn.onclick = function(){ openBagMetaModal(); };
    right.appendChild(metaBtn);

    row.appendChild(right);
    head.appendChild(row);

    ui.toast = el('div','gk-toast','');
    css(ui.toast,'display:none;margin-top:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);');
    head.appendChild(ui.toast);

    root.appendChild(head);

    // Main grid
    ui.shell = el('div','');
    css(ui.shell,'display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-top:12px;');
    // responsive
    if (window.matchMedia && window.matchMedia('(max-width: 920px)').matches) {
      ui.shell.style.gridTemplateColumns = '1fr';
    }

    ui.content = el('div','');
    ui.reco = el('div','');
    ui.top3 = el('div','');

    ui.shell.appendChild(ui.content);
    ui.shell.appendChild(ui.reco);

    root.appendChild(ui.shell);

    // Footer mini
    var foot = el('div','');
    css(foot,'opacity:.55;font-size:12px;margin:14px 0 4px 0;text-align:right;');
    foot.textContent = VERSION;
    root.appendChild(foot);
  }

  // ---------------------------
  // Bag meta modal (name + image url)
  // ---------------------------
  function openBagMetaModal() {
    ensureBags();
    var b = STATE.bags[STATE.activeBagId];

    var m = modal('Bag-innstillinger');
    var wrap = el('div','');
    css(wrap,'display:grid;grid-template-columns:1fr;gap:12px;');

    var note = el('div','', 'Tips: Du kan lime inn bilde-URL fra GolfKongen (produkt-/kategori-bilder) eller andre steder.');
    css(note,'opacity:.85;');
    wrap.appendChild(note);

    var nameIn = inputText('Navn på bagen', b && b.name ? b.name : '');
    wrap.appendChild(nameIn);

    var imgIn = inputText('Bilde-URL (https://...)', b && b.imageUrl ? b.imageUrl : '');
    css(imgIn,'padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff;min-width:260px;width:100%;');
    wrap.appendChild(imgIn);

    if (b && b.imageUrl) {
      var prev = document.createElement('img');
      prev.src = b.imageUrl;
      css(prev,'width:140px;height:140px;border-radius:18px;object-fit:cover;border:1px solid rgba(255,255,255,.14);');
      wrap.appendChild(prev);
    }

    var save = btn('Lagre','primary');
    save.onclick = function(){
      var bb = STATE.bags[STATE.activeBagId];
      bb.name = safeStr(nameIn.value).trim() || (STATE.activeBagId === 'default' ? 'Min bag' : 'Bag 2');
      bb.imageUrl = safeStr(imgIn.value).trim();
      toast('Lagrer…');
      dbSave(STATE.email).then(function(){ toast('Lagret ✅'); document.body.removeChild(m.overlay); loadProfile().then(function(){ renderAll(); }); }).catch(function(e){ toast('Kunne ikke lagre: ' + (e&&e.message?e.message:e),'err'); });
    };

    m.body.appendChild(wrap);
    m.body.appendChild(el('div','', ''));
    m.body.appendChild(save);

    document.body.appendChild(m.overlay);
  }

  // ---------------------------
  // Add discs modal: category buttons + search + fetch
  // ---------------------------
  function openAddDiscModal() {
    var m = modal('Legg til disk');

    // Tabs
    var tabs = el('div','');
    css(tabs,'display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;');
    var tabSearch = btn('Søk i GolfKongen','');
    var tabManual = btn('Legg inn manuelt','');
    tabSearch.className += ' primary';
    tabs.appendChild(tabSearch);
    tabs.appendChild(tabManual);
    m.body.appendChild(tabs);

    var searchPane = el('div','');
    var manualPane = el('div','');
    manualPane.style.display = 'none';
    m.body.appendChild(searchPane);
    m.body.appendChild(manualPane);

    function setTab(which){
      if (which === 'manual') {
        tabSearch.className = tabSearch.className.replace(/\bprimary\b/g,'').trim();
        tabManual.className = (tabManual.className + ' primary').trim();
        searchPane.style.display = 'none';
        manualPane.style.display = '';
      } else {
        tabManual.className = tabManual.className.replace(/\bprimary\b/g,'').trim();
        tabSearch.className = (tabSearch.className + ' primary').trim();
        manualPane.style.display = 'none';
        searchPane.style.display = '';
      }
    }
    tabSearch.onclick = function(){ setTab('search'); };
    tabManual.onclick = function(){ setTab('manual'); };


    // Global search (all discs on GolfKongen)
    var searchWrap = el('div','');
    css(searchWrap,'display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;');
    var q = inputText('Søk i GolfKongen (alle disker)', '');
    var hint = el('div','', 'Tips: Første søk kan ta litt tid (vi bygger katalogen).');
    css(hint,'font-size:12px;opacity:.7;margin:-6px 0 10px;');
    searchPane.appendChild(hint);
    css(q,'flex:1;min-width:220px;');
    var clearBtn = btn('Tøm','');
    searchWrap.appendChild(q);
    searchWrap.appendChild(clearBtn);
    searchPane.appendChild(searchWrap);

    var top = el('div','');
    css(top,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;');

    // category buttons (valgfritt / mobilvennlig)
    CAT.forEach(function(c){
      var b = btn(c.label,'');
      b.onclick = function(){ loadCategory(c); };
      top.appendChild(b);
    });

    var hint = el('div','', 'Velg en kategori for å hente produkter. Klikk “Legg til” for å legge i aktiv bag.');
    css(hint,'opacity:.85;margin-bottom:10px;');
    searchPane.appendChild(top);
    searchPane.appendChild(hint);

    var list = el('div','');
    css(list,'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;');
    searchPane.appendChild(list);

    var _timer = null;
    function doSearch() {
      var term = safeStr(q.value).trim();
      if (term.length < 2) { return; }
      toast('Søker i GolfKongen-katalogen etter “' + term + '”…');
      searchGolfkongenProducts(term).then(function(items){
        toast('');
        renderProducts(items);
      }).catch(function(e){
        toast('Søk feilet: ' + (e&&e.message?e.message:e),'err');
      });
    }
    q.oninput = function(){
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(doSearch, 250);
    };
    clearBtn.onclick = function(){
      q.value = '';
      clear(list);
      toast('');
    };

    function renderProducts(items) {
      clear(list);
      if (!items || !items.length) {
        var e = el('div','', 'Fant ingen produkter (eller siden endret seg).');
        css(e,'opacity:.85;padding:12px;border:1px dashed rgba(255,255,255,.16);border-radius:14px;');
        list.appendChild(e);
        return;
      }
      items.forEach(function(p){
        var c = el('div','');
        css(c,'border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px;display:flex;gap:10px;align-items:flex-start;');
        var img = document.createElement('img');
        img.src = p.image || '';
        css(img,'width:54px;height:54px;border-radius:14px;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);');
        c.appendChild(img);

        var mid = el('div','');
        css(mid,'flex:1;min-width:0;');
        var n = el('div','', clampTxt(p.name, 52));
        css(n,'font-weight:900;line-height:1.15;');
        mid.appendChild(n);
        var t = el('div','', (p.type ? TYPE_LABEL[p.type] || p.type : ''));
        css(t,'opacity:.75;font-size:12px;margin-top:2px;');
        mid.appendChild(t);
        var l = el('a','', 'Åpne');
        l.href = p.url;
        l.target = '_blank';
        css(l,'display:inline-block;margin-top:6px;font-size:12px;color:#cfe;text-decoration:none;opacity:.9;');
        mid.appendChild(l);
        c.appendChild(mid);

        var add = btn('Legg til','primary');
        add.onclick = function(){
          addProductToBag(p).then(function(){
            toast('Lagt til ✅');
            loadProfile().then(function(){ renderAll(); });
          }).catch(function(e){
            toast('Kunne ikke legge til: ' + (e&&e.message?e.message:e),'err');
          });
        };
        c.appendChild(add);
        list.appendChild(c);
      });
    }

    function loadCategory(cat) {
      toast('Henter ' + cat.label + '…');
      fetchText(cat.url).then(function(html){
        var items = parseProductsFromCategoryHtml(html, cat.type);
        toast('');
        renderProducts(items);
      }).catch(function(e){
        toast('Kunne ikke hente kategori: ' + (e&&e.message?e.message:e),'err');
      });
    }

    document.body.appendChild(m.overlay);
  
    // ---- Manual add form ----
    var manCard = el('div','minbagg-card');
    css(manCard,'padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(0,0,0,.20);');
    var manTitle = el('div','');
    css(manTitle,'font-weight:900;margin-bottom:8px;');
    manTitle.textContent = 'Legg inn disk manuelt';
    manCard.appendChild(manTitle);

    var row1 = el('div','');
    css(row1,'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;');
    var manName = inputText('Navn på disk (påbudt)', '');
    var manBrand = inputText('Produsent (påbudt)', '');
    row1.appendChild(manName);
    row1.appendChild(manBrand);
    manCard.appendChild(row1);

    var row2 = el('div','');
    css(row2,'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;');
    var manType = el('select','');
    css(manType,'width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.25);color:#fff;');
    manType.innerHTML = ''
      + '<option value="putter">Putter</option>'
      + '<option value="midrange">Midrange</option>'
      + '<option value="fairway">Fairway</option>'
      + '<option value="distance">Driver</option>';
    var manImg = inputText('Bilde-URL (valgfritt)', '');
    row2.appendChild(manType);
    row2.appendChild(manImg);
    manCard.appendChild(row2);

    var row3 = el('div','');
    css(row3,'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;');
    function num(label){
      var i = inputText(label, '');
      i.type = 'number';
      i.step = '0.1';
      return i;
    }
    var fS = num('Speed (påbudt)');
    var fG = num('Glide (påbudt)');
    var fT = num('Turn (påbudt)');
    var fF = num('Fade (påbudt)');
    row3.appendChild(fS); row3.appendChild(fG); row3.appendChild(fT); row3.appendChild(fF);
    manCard.appendChild(row3);

    var manActions = el('div','');
    css(manActions,'display:flex;gap:10px;align-items:center;justify-content:flex-end;');
    var manAdd = btn('Legg til','');
    manAdd.className += ' primary';
    var manReset = btn('Nullstill','');
    manActions.appendChild(manReset);
    manActions.appendChild(manAdd);
    manCard.appendChild(manActions);

    function parseNum(v){
      var x = parseFloat((''+v).replace(',','.'));
      return isNaN(x) ? null : x;
    }

    manReset.onclick = function(){
      manName.value=''; manBrand.value=''; manImg.value='';
      fS.value=''; fG.value=''; fT.value=''; fF.value='';
      manType.value='putter';
    };

    manAdd.onclick = function(){
      var name = safeStr(manName.value).trim();
      var brand = safeStr(manBrand.value).trim();
      var img = safeStr(manImg.value).trim();
      var type = safeStr(manType.value).trim();

      var s = parseNum(fS.value);
      var g = parseNum(fG.value);
      var t = parseNum(fT.value);
      var f = parseNum(fF.value);

      if (!name) return toast('Mangler navn på disk','err');
      if (!brand) return toast('Mangler produsent','err');
      if (s===null || g===null || t===null || f===null) return toast('Flight (Speed/Glide/Turn/Fade) må fylles ut','err');

      var disc = {
        id: uniqId('d'),
        url: '',
        name: name,
        brand: brand,
        note: '',
        type: type || 'midrange',
        color: '',
        image: img || '',
        manual: true,
        flight: { speed: s, glide: g, turn: t, fade: f },
        addedAt: nowIso().slice(0,10)
      };

      STATE.discs = STATE.discs || [];
      STATE.discs.push(disc);

      toast('Lagrer…');
      dbSave(STATE.email).then(function(){
        toast('');
        // optional: count manual discs too
        incPopular(disc).catch(function(){});
        loadProfile().then(function(){ renderAll(); });
        m.close();
      }).catch(function(e){
        toast('Kunne ikke lagre: ' + (e&&e.message?e.message:e),'err');
      });
    };

    manualPane.appendChild(manCard);

}

  function addProductToBag(p) {
    // fetch product page to try extract flight
    return fetchText(p.url).then(function(html){
      var flight = parseFlightFromProductHtml(html);
      var disc = {
        id: uniqId('d'),
        url: p.url,
        name: p.name,
        note: '',
        type: p.type || inferTypeFromUrl(p.url) || '',
        color: '',
        image: p.image || '',
        flight: flight,
        addedAt: nowIso().slice(0,10)
      };
      if (!disc.type) disc.type = 'midrange';

      // push + save
      STATE.discs.push(disc);
      toast('Lagrer…');
      return dbSave(STATE.email).then(function(){
        toast('');
        // best-effort: increment popular
        incPopular(disc).catch(function(){});
      });
    });
  }

  function incPopular(disc) {
    // Use popular_discs table directly (public insert/update allowed in your RLS setup)
    return ensureSupabaseClient().then(function(supa){
      var t = disc.type || '';
      var name = disc.name || '';
      var url = disc.url || '';
      var img = disc.image || '';
      // upsert (type,name) if unique constraint exists; if not, simple insert
      return supa.from('popular_discs')
        .upsert({ type: t, name: name, count: 1, product_url: url, image_url: img }, { onConflict: 'type,name' })
        .select('type')
        .then(function(r){
          // if no unique constraint, error can happen – ignore
          return r;
        });
    });
  }

  
  function openCommentModal(disc){
    var m = modal('Kommentar for ' + (disc.name||'Disk'));
    var wrap = el('div','');
    css(wrap,'display:flex;flex-direction:column;gap:10px;');
    var ta = document.createElement('textarea');
    ta.maxLength = 140;
    ta.value = disc.note || '';
    css(ta,'min-height:100px;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.25);color:#fff;');
    wrap.appendChild(ta);
    var save = btn('Lagre','primary');
    save.onclick = function(){
      disc.note = ta.value;
      writeActiveToBags();
      dbSave(STATE.email).then(function(){
        document.body.removeChild(m.overlay);
        loadProfile().then(function(){ renderAll(); });
      });
    };
    var del = btn('Slett kommentar','danger');
    del.onclick = function(){
      disc.note = '';
      writeActiveToBags();
      dbSave(STATE.email).then(function(){
        document.body.removeChild(m.overlay);
        loadProfile().then(function(){ renderAll(); });
      });
    };
    wrap.appendChild(save);
    wrap.appendChild(del);
    m.body.appendChild(wrap);
    document.body.appendChild(m.overlay);
  }


  function ensureBag2Exists(){
    if (!STATE.bags) STATE.bags = {};
    if (!STATE.bags.bag2) {
      STATE.bags.bag2 = { name:'Bag 2', imageUrl:'', createdAt: nowIso(), items:{ discs:[], bagInfo:{}, profile:null } };
    }
    if (!STATE.bags.bag2.items || typeof STATE.bags.bag2.items !== 'object') STATE.bags.bag2.items = { discs:[], bagInfo:{}, profile:null };
    if (!Array.isArray(STATE.bags.bag2.items.discs)) STATE.bags.bag2.items.discs = [];
  }

  function moveDiscToBag(disc, targetBagId){
    if (!disc) return;
    if (!STATE.bags) STATE.bags = {};
    if (!STATE.bags.default) {
      STATE.bags.default = { name:'Min bag', imageUrl:'', createdAt: nowIso(), items:{ discs:[], bagInfo:{}, profile:null } };
    }
    if (targetBagId === 'bag2') ensureBag2Exists();
    if (!STATE.bags[targetBagId]) return;

    // Sync active discs to bags first
    writeActiveToBags();

    // Remove from active list
    var id = disc.id;
    STATE.discs = (STATE.discs||[]).filter(function(x){ return x && x.id !== id; });
    writeActiveToBags();

    // Add to target bag list (avoid id-collisions)
    var list = (STATE.bags[targetBagId].items && Array.isArray(STATE.bags[targetBagId].items.discs)) ? STATE.bags[targetBagId].items.discs : [];
    var exists = false;
    for (var i=0;i<list.length;i++){ if (list[i] && list[i].id === id) { exists = true; break; } }
    if (exists) disc.id = uniqId('d');
    list.push(disc);
    STATE.bags[targetBagId].items.discs = list;

    toast('Lagrer…');
    dbSave(STATE.email).then(function(){
      toast('');
      loadProfile().then(function(){ renderAll(); });
    }).catch(function(e){
      toast('Kunne ikke flytte: ' + (e&&e.message?e.message:e),'err');
    });
  }
// ---------------------------
  // Discs rendering
  // ---------------------------
  function groupDiscsByType(discs) {
    var g = { putter:[], midrange:[], fairway:[], distance:[] };
    for (var i=0;i<discs.length;i++) {
      var d = discs[i];
      var t = (d && d.type) ? d.type : '';
      if (!g[t]) t = inferTypeFromUrl(d && d.url ? d.url : '') || 'midrange';
      if (!g[t]) t = 'midrange';
      d.type = t;
      g[t].push(d);
    }
    return g;
  }

  
  function flightChip(label, val, color){
    var c = el('span','');
    css(c,'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid '+color+';background:rgba(255,255,255,.03);font-size:12px;font-weight:900;color:'+color+';');
    c.textContent = label + ' ' + (val||'?');
    return c;
  }

  function flightRow(d) {

    var f = d.flight || {};
    var sp = safeStr(f.speed), gl = safeStr(f.glide), tu = safeStr(f.turn), fa = safeStr(f.fade);
    if (!sp && !gl && !tu && !fa) return el('div','', 'Flight: (mangler)');
    var r = el('div','');
    css(r,'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;');
    r.appendChild(flightChip('S', sp, FLIGHT_COLORS.speed));
    r.appendChild(flightChip('G', gl, FLIGHT_COLORS.glide));
    r.appendChild(flightChip('T', tu, FLIGHT_COLORS.turn));
    r.appendChild(flightChip('F', fa, FLIGHT_COLORS.fade));
    return r;
  }

  function renderDiscs() {
    clear(ui.content);

    // Bag image preview + count + quick tips
    ensureBags();
    var b = STATE.bags[STATE.activeBagId];

    var top = card((b && b.name) ? b.name : 'Min bag', 'Diskene dine er lagret på aktiv bag. Legg til fra kategorier eller produktsider.');
    var metaRow = el('div','');
    css(metaRow,'display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;');

    var left = el('div','');
    css(left,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;');

    if (b && b.imageUrl) {
      var img = document.createElement('img');
      img.src = b.imageUrl;
      css(img,'width:68px;height:68px;border-radius:16px;object-fit:cover;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);');
      left.appendChild(img);
    }

    left.appendChild(chip('Disker: ' + (STATE.discs ? STATE.discs.length : 0)));
    var c = countByType(STATE.discs || []);
    left.appendChild(chip('Putter ' + c.putter + ' • M ' + c.midrange + ' • F ' + c.fairway + ' • D ' + c.distance));
    metaRow.appendChild(left);

    var right = el('div','');
    css(right,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;');
    var add = btn('Legg til disk','primary');
    add.onclick = function(){ openAddDiscModal(); };
    right.appendChild(add);
    metaRow.appendChild(right);

    top.appendChild(metaRow);
    ui.content.appendChild(top);
    // ===== FLIGHT OVERSIKT (NY) =====
    var acc1 = accordion('Flight-oversikt','Trykk for å åpne');
    var discsSorted = (STATE.discs||[]).slice().sort(sortByFlight);
    var dup = {};
    discsSorted.forEach(function(d){
      var f=d.flight||{};
      var k=[f.speed,f.glide,f.turn,f.fade].join('|');
      if (k && k!=='|||') dup[k]=(dup[k]||0)+1;
    });
    if (!discsSorted.length) {
      acc1.body.appendChild(el('div','', 'Ingen disker i bagen ennå.'));
    } else {
      discsSorted.forEach(function(d){
        var row = el('div','');
        css(row,'display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.12);');
        var nm = el('div','', d.name||'Disk');
        css(nm,'font-weight:900;flex:1;');
        row.appendChild(nm);
        var f=d.flight||{};
        var tag = el('div','', 'S '+(f.speed||'?')+' G '+(f.glide||'?')+' T '+(f.turn||'?')+' F '+(f.fade||'?'));
        css(tag,'font-size:12px;opacity:.9;');
        row.appendChild(tag);
        var k2=[f.speed,f.glide,f.turn,f.fade].join('|');
        if (dup[k2]>1) {
          var obs=el('div','', 'OBS – helt lik flight');
          css(obs,'color:#ff6b6b;font-weight:900;font-size:12px;margin-left:8px;');
          row.appendChild(obs);
        }
        acc1.body.appendChild(row);
      });
    }
    ui.content.appendChild(acc1.wrap);

    
    // ===== FLIGHT KART (REAL SVG) =====
    var acc2 = accordion('Flight-kart','Trykk for å åpne');
    // Forklaring
    var expl = el('div','');
    css(expl,'font-size:12px;opacity:.9;line-height:1.35;margin-bottom:10px;');
    expl.innerHTML = ''
      + '<div><b>X-akse:</b> Stabilitet (venstre = mer understabil, høyre = mer overstabil)</div>'
      + '<div><b>Y-akse:</b> Speed (høyere opp = høyere speed)</div>'
      + '<div style="opacity:.85;margin-top:4px;">Trykk på en prikk for å se hvilken disk det er.</div>';
    acc2.body.appendChild(expl);

    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 360 320');
    svg.style.width='100%';
    svg.style.height='320px';
    svg.style.background='rgba(0,0,0,.25)';
    svg.style.borderRadius='12px';
    svg.style.border='1px solid rgba(255,255,255,.12)';

    function sEl(name){ return document.createElementNS('http://www.w3.org/2000/svg', name); }
    function clamp(v,a,b){ return v<a?a:v>b?b:v; }

    // Background zones
    var zU = sEl('rect'); zU.setAttribute('x','0'); zU.setAttribute('y','0'); zU.setAttribute('width','120'); zU.setAttribute('height','320'); zU.setAttribute('fill','rgba(143,211,255,.06)'); svg.appendChild(zU);
    var zN = sEl('rect'); zN.setAttribute('x','120'); zN.setAttribute('y','0'); zN.setAttribute('width','120'); zN.setAttribute('height','320'); zN.setAttribute('fill','rgba(255,255,255,.03)'); svg.appendChild(zN);
    var zO = sEl('rect'); zO.setAttribute('x','240'); zO.setAttribute('y','0'); zO.setAttribute('width','120'); zO.setAttribute('height','320'); zO.setAttribute('fill','rgba(255,226,122,.05)'); svg.appendChild(zO);

    // Grid
    for (var gx=0; gx<=360; gx+=60){
      var gl = sEl('line'); gl.setAttribute('x1',gx); gl.setAttribute('y1','0'); gl.setAttribute('x2',gx); gl.setAttribute('y2','320');
      gl.setAttribute('stroke','rgba(255,255,255,.08)'); svg.appendChild(gl);
    }
    for (var gy=0; gy<=320; gy+=40){
      var gl2 = sEl('line'); gl2.setAttribute('x1','0'); gl2.setAttribute('y1',gy); gl2.setAttribute('x2','360'); gl2.setAttribute('y2',gy);
      gl2.setAttribute('stroke','rgba(255,255,255,.06)'); svg.appendChild(gl2);
    }

    // Axis labels
    function label(txt,x,y,anchor){
      var t = sEl('text');
      t.textContent = txt;
      t.setAttribute('x',x);
      t.setAttribute('y',y);
      t.setAttribute('fill','rgba(255,255,255,.7)');
      t.setAttribute('font-size','11');
      t.setAttribute('font-weight','800');
      if (anchor) t.setAttribute('text-anchor',anchor);
      svg.appendChild(t);
    }
    label('Understabil', 8, 16, 'start');
    label('Nøytral', 180, 16, 'middle');
    label('Overstabil', 352, 16, 'end');
    label('Speed ↑', 8, 310, 'start');

    // Tooltip
    var tip = el('div','');
    css(tip,'position:absolute;pointer-events:none;background:rgba(0,0,0,.75);color:#fff;padding:6px 8px;border-radius:8px;font-size:12px;font-weight:800;display:none;z-index:5;');
    acc2.wrap.style.position = 'relative';
    acc2.wrap.appendChild(tip);

    function showTip(text, x, y){
      tip.textContent = text;
      tip.style.left = (x+10)+'px';
      tip.style.top = (y+10)+'px';
      tip.style.display = 'block';
    }
    function hideTip(){ tip.style.display='none'; }

    // Mapping
    function stabIndex(turn, fade){ return (isNaN(fade)?0:fade) - (isNaN(turn)?0:turn); }
    function xFromStab(stab){ var s=clamp(stab,0,6); return (s/6)*360; }
    function yFromSpeed(speed){ var sp=clamp(speed,1,14); return 300 - ((sp-1)/13)*280; }

    // Avoid overlap
    var buckets = {};
    function keyFor(x,y){ return Math.round(x/14)*14 + '|' + Math.round(y/14)*14; }
    function offsetFor(i){ var r=8+(i*4), a=(i*57)*Math.PI/180; return {dx:Math.cos(a)*r, dy:Math.sin(a)*r}; }

    var plotted = 0;
    (STATE.discs||[]).forEach(function(d){
      if (!d.flight) return;
      var sp=parseFloat(d.flight.speed), tu=parseFloat(d.flight.turn), fa=parseFloat(d.flight.fade);
      if (isNaN(sp)||isNaN(tu)||isNaN(fa)) return;

      var x=xFromStab(stabIndex(tu,fa));
      var y=yFromSpeed(sp);
      var k=keyFor(x,y), idx=buckets[k]||0; buckets[k]=idx+1;
      var off=idx?offsetFor(idx):{dx:0,dy:0};
      var px=clamp(x+off.dx,8,352), py=clamp(y+off.dy,18,312);

      var c=sEl('circle');
      c.setAttribute('cx',px);
      c.setAttribute('cy',py);
      c.setAttribute('r','6');
      c.setAttribute('fill', TYPE_COLORS[d.type]||'#fff');
      c.setAttribute('stroke','rgba(0,0,0,.35)');
      c.setAttribute('stroke-width','1');
      c.style.cursor='pointer';
      c.addEventListener('mouseenter', function(e){
        showTip(d.name||'Disk', e.offsetX, e.offsetY);
      });
      c.addEventListener('mouseleave', hideTip);
      c.addEventListener('click', function(e){
        showTip(d.name||'Disk', e.offsetX, e.offsetY);
      });
      svg.appendChild(c);
      plotted++;
    });

    if (!plotted) {
      var warn = el('div','', 'Mangler flight-data (Speed/Turn/Fade) på diskene dine.');
      css(warn,'opacity:.85;font-size:12px;');
      acc2.body.appendChild(warn);
    } else {
      acc2.body.appendChild(svg);
    }

    ui.content.appendChild(acc2.wrap);



    // Sections per type
    var grouped = groupDiscsByType(STATE.discs || []);

    TYPE_ORDER.forEach(function(t){
      var arr = grouped[t] || [];
      var sec = card(TYPE_LABEL[t], arr.length ? ('Du har ' + arr.length + ' ' + (t==='distance'?'drivere':TYPE_LABEL[t].toLowerCase()) + '.') : ('Ingen ' + TYPE_LABEL[t].toLowerCase() + ' ennå.'));
      if (!arr.length) {
        var empty = el('div','', 'Tips: Trykk “Legg til disk” og velg ' + TYPE_LABEL[t] + '.');
        css(empty,'opacity:.85;padding:10px 0 0 0;');
        sec.appendChild(empty);
        ui.content.appendChild(sec);
        return;
      }

      var grid = el('div','');
      css(grid,'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;');

      arr.forEach(function(d, idx){
        var ccard = el('div','');        css(ccard,'border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px;');

        var topRow = el('div','');
        css(topRow,'display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;');

        var img = document.createElement('img');
        img.src = d.image || '';
        css(img,'width:56px;height:56px;border-radius:16px;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);');
        topRow.appendChild(img);

        var mid = el('div','');
        css(mid,'flex:1;min-width:0;');
        
        var name = el('div','', clampTxt(d.name, 56));
        if (d.note) {
          var noteBadge = el('div','', '📝 ' + clampTxt(d.note, 28));
          css(noteBadge,'font-size:11px;opacity:.8;margin-top:4px;');
          name.appendChild(noteBadge);
        }

        css(name,'font-weight:900;line-height:1.15;');
        mid.appendChild(name);

        var link = el('a','', 'Åpne produkt');
        link.href = d.url || '#';
        link.target = '_blank';
        css(link,'display:inline-block;margin-top:6px;font-size:12px;color:#cfe;text-decoration:none;opacity:.9;');
        mid.appendChild(link);

        mid.appendChild(flightRow(d));

        topRow.appendChild(mid);

        // Actions (Kommentar / Flytt / Fjern)
        var actions = el('div','');
        css(actions,'display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap;justify-content:flex-end;');

        var cm = btn((d.note ? 'Kommentar ✓' : 'Legg til kommentar'),''); 
        cm.onclick = function(e){ if(e&&e.stopPropagation)e.stopPropagation(); openCommentModal(d); };
        css(cm,'padding:7px 10px;border-radius:12px;font-size:12px;opacity:.95;white-space:nowrap;');
        actions.appendChild(cm);

        var target = (STATE.activeBagId === 'bag2') ? 'default' : 'bag2';
        var mvLabel = (target === 'bag2') ? 'Flytt til Bag 2' : 'Flytt til Hovedbag';
        var mv = btn(mvLabel,'');
        mv.onclick = function(e){ if(e&&e.stopPropagation)e.stopPropagation();
          if (target === 'bag2') ensureBag2Exists();
          moveDiscToBag(d, target);
        };
        css(mv,'padding:7px 10px;border-radius:12px;font-size:12px;opacity:.95;white-space:nowrap;');
        actions.appendChild(mv);

        var rm = btn('Fjern','');
        rm.onclick = function(e){ if(e&&e.stopPropagation)e.stopPropagation();
          var id = d.id;
          STATE.discs = (STATE.discs || []).filter(function(x){ return x && x.id !== id; });
          writeActiveToBags();
          toast('Lagrer…');
          dbSave(STATE.email).then(function(){ toast(''); loadProfile().then(function(){ renderAll(); }); }).catch(function(e){ toast('Kunne ikke fjerne: ' + (e&&e.message?e.message:e),'err'); });
        };
        css(rm,'padding:6px 8px;border-radius:10px;font-size:12px;opacity:.9;white-space:nowrap;');
        actions.appendChild(rm);

        topRow.appendChild(actions);

        ccard.appendChild(topRow);

        // Flight chart
        var fbox = el('div','');
        css(fbox,'margin-top:10px;');
        fbox.appendChild(flightSvg(d.flight || null));
        // flight chart removed in U2

        grid.appendChild(ccard);
      });

      sec.appendChild(grid);
      ui.content.appendChild(sec);
    });
  }

  
  // ---------------------------
  // Player profile (U3)
  // ---------------------------
  function loadProfile() {
    return ensureSupabaseClient().then(function(supa){
      return supa.from('mybag_profiles')
        .select('*')
        .eq('email', STATE.email)
        .maybeSingle()
        .then(function(r){
          if (r && r.data) STATE.profile = r.data;
        });
    });
  }

  function saveProfile(p) {
    // Persist basic fields to mybag_profiles (for reporting/SQL) and full profile in bag_json via dbSave.
    return ensureSupabaseClient().then(function(supa){
      return supa.from('mybag_profiles')
        .upsert({
          email: STATE.email,
          level: p.level || '',
          hand: p.hand || '',
          throw: p.throw || '',
          course: p.course || '',
          updated_at: nowIso()
        }, { onConflict: 'email' });
    });
  }

  function openProfileModal(){
    var m = modal('Spillerprofil');
    var wrap = el('div','');
    css(wrap,'display:grid;grid-template-columns:1fr;gap:12px;');

    // Helpers
    function mkRow(label, node){
      var r = el('div','');
      css(r,'display:grid;grid-template-columns:1fr;gap:6px;');
      var t = el('div','', label);
      css(t,'font-weight:800;opacity:.9;');
      r.appendChild(t);
      r.appendChild(node);
      return r;
    }
    function optSel(options){
      var s = selectBox();
      options.forEach(function(x){
        var o=document.createElement('option');o.value=x;o.textContent=x;s.appendChild(o);
      });
      return s;
    }

    var p0 = STATE.profileExt || STATE.profile || {};

    var level = optSel(['','Nybegynner','Litt øvet','Viderekommen','Konkurransespiller']);
    var hand = optSel(['','Høyrehendt','Venstrehendt']);
    var thr  = optSel(['','Backhand','Forehand','Begge']);
    var course = optSel(['','Skog','Åpent','Blandet']);

    var dist = optSel(['','0–80m','80–110m','110–140m','140m+']);
    var pref = optSel(['','Kontroll','Balansert','Lengde']);
    var wind = optSel(['','Lite vind','Litt vind','Mye vind']);
    var lines = optSel(['','Hyzer','Rett','Anhyzer','Blandet']);
    var putt = optSel(['','Spinn','Push','Blandet']);

    level.value = p0.level || '';
    hand.value  = p0.hand || '';
    thr.value   = p0.throw || '';
    course.value= p0.course || '';
    dist.value  = p0.distance || '';
    pref.value  = p0.preference || '';
    wind.value  = p0.wind || '';
    lines.value = p0.lines || '';
    putt.value  = p0.putt || '';

    // progress
    var progWrap = el('div','');
    css(progWrap,'padding:10px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.03);');
    var progTxt = el('div','');
    css(progTxt,'font-weight:900;margin-bottom:6px;');
    var progBar = el('div','');
    css(progBar,'height:10px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden;');
    var progFill = el('div','');
    css(progFill,'height:100%;width:0%;background:#2dd;opacity:.9;');
    progBar.appendChild(progFill);
    progWrap.appendChild(progTxt);
    progWrap.appendChild(progBar);

    function calcProgress(){
      var total = 8; // recommended questions
      var done = 0;
      if (level.value) done++;
      if (hand.value) done++;
      if (thr.value) done++;
      if (course.value) done++;
      if (dist.value) done++;
      if (pref.value) done++;
      if (wind.value) done++;
      if (lines.value) done++;
      // (putt is extra, not counted)
      var pct = Math.round((done/total)*100);
      progTxt.textContent = 'Profil fullført: ' + pct + '% (anbefalt)';
      progFill.style.width = pct + '%';
    }

    // Update progress on change
    [level,hand,thr,course,dist,pref,wind,lines,putt].forEach(function(x){
      x.onchange = calcProgress;
    });
    calcProgress();

    wrap.appendChild(progWrap);
    wrap.appendChild(mkRow('Nivå', level));
    wrap.appendChild(mkRow('Hånd', hand));
    wrap.appendChild(mkRow('Kastestil', thr));
    wrap.appendChild(mkRow('Banetype', course));
    wrap.appendChild(mkRow('Maks distanse', dist));
    wrap.appendChild(mkRow('Preferanse', pref));
    wrap.appendChild(mkRow('Vindforhold du spiller i', wind));
    wrap.appendChild(mkRow('Typiske linjer', lines));
    wrap.appendChild(mkRow('Putting-stil (valgfritt)', putt));

    var save = btn('Lagre profil','primary');
    save.onclick = function(){
      var p = {
        level: level.value || '',
        hand: hand.value || '',
        throw: thr.value || '',
        course: course.value || '',
        distance: dist.value || '',
        preference: pref.value || '',
        wind: wind.value || '',
        lines: lines.value || '',
        putt: putt.value || ''
      };
      STATE.profileExt = p;
      // Keep legacy STATE.profile for compact UI
      STATE.profile = { level:p.level, hand:p.hand, throw:p.throw, course:p.course };

      toast('Lagrer…');
      // Save basic to mybag_profiles + full to bag_json
      saveProfile(STATE.profile).then(function(){
        return dbSave(STATE.email);
      }).then(function(){
        toast('');
        document.body.removeChild(m.overlay);
        loadProfile().then(function(){ renderAll(); });
      }).catch(function(e){
        toast('Kunne ikke lagre: ' + (e&&e.message?e.message:e),'err');
      });
    };

    m.body.appendChild(wrap);
    m.body.appendChild(save);
    document.body.appendChild(m.overlay);
  }
// ---------------------------
  // Recommendations panel (right column)
  // ---------------------------
  var recoState = { lastType: null, lastPicked: null };

  function renderRecommendations() {
    clear(ui.reco);

    // -------- Profile card with progress --------
    var p = STATE.profileExt || STATE.profile || {};
    var pcard = card('Spillerprofil', 'Valgfritt, men anbefalt – gir bedre forslag.');
    var pct = (function(){
      var total = 8, done = 0;
      if (p.level) done++;
      if (p.hand) done++;
      if (p.throw) done++;
      if (p.course) done++;
      if (p.distance) done++;
      if (p.preference) done++;
      if (p.wind) done++;
      if (p.lines) done++;
      return Math.round((done/total)*100);
    })();

    var bar = el('div','');
    css(bar,'height:10px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden;margin-top:8px;');
    var fill = el('div','');
    css(fill,'height:100%;width:'+pct+'%;background:#2dd;opacity:.9;');
    bar.appendChild(fill);

    var ptxt = el('div','');
    css(ptxt,'opacity:.9;line-height:1.35;');
    ptxt.innerHTML =
      '<div style="font-weight:900;">Profil: '+pct+'%</div>' +
      '<div style="opacity:.85;margin-top:4px;">' +
      (p.level ? ('Nivå: '+p.level) : 'Nivå: –') + ' • ' +
      (p.hand ? ('Hånd: '+p.hand) : 'Hånd: –') + ' • ' +
      (p.throw ? ('Kast: '+p.throw) : 'Kast: –') + ' • ' +
      (p.course ? ('Bane: '+p.course) : 'Bane: –') +
      '</div>';
    pcard.appendChild(ptxt);
    pcard.appendChild(bar);

    var pbtn = btn('Rediger profil','');
    pbtn.onclick = function(){ openProfileModal(); };
    pcard.appendChild(pbtn);
    ui.reco.appendChild(pcard);

    // -------- Recommendation engine --------
    var c = card('Anbefalt for deg', 'To forslag om gangen – med konkrete begrunnelser.');
    ui.reco.appendChild(c);

    var box = el('div','');
    css(box,'margin-top:12px;');
    c.appendChild(box);

    var discList = STATE.discs || [];

    function normName(s){
      return safeStr(s).toLowerCase().replace(/[^a-z0-9æøå]+/g,' ').replace(/\s+/g,' ').trim();
    }

    function bucketFromFlight(f){
      if (!f) return 'unknown';
      var t = parseFloat(f.turn), fa = parseFloat(f.fade);
      if (isNaN(t) || isNaN(fa)) return 'unknown';
      var score = t + fa;
      if (score <= -1) return 'US';
      if (score >= 1) return 'OS';
      return 'N';
    }

    function countByType(discs){
      var out = { putter:0, midrange:0, fairway:0, distance:0 };
      for (var i=0;i<discs.length;i++){
        var d=discs[i]; if(!d) continue;
        var t = (d.type||inferTypeFromUrl(d.url)||'').toLowerCase();
        if (t==='driver') t='distance';
        if (out.hasOwnProperty(t)) out[t]++;
      }
      return out;
    }

    function stabilityByType(discs){
      var out = { putter:{US:0,N:0,OS:0,unknown:0}, midrange:{US:0,N:0,OS:0,unknown:0}, fairway:{US:0,N:0,OS:0,unknown:0}, distance:{US:0,N:0,OS:0,unknown:0} };
      for (var i=0;i<discs.length;i++){
        var d=discs[i]; if(!d) continue;
        var t=(d.type||inferTypeFromUrl(d.url)||'').toLowerCase();
        if (t==='driver') t='distance';
        if (!out[t]) continue;
        var b = bucketFromFlight(d.flight);
        if (!out[t][b]) b='unknown';
        out[t][b] += 1;
      }
      return out;
    }

    function gapLabel(g){
      var tl = TYPE_LABEL[g.type] || g.type;
      if (g.kind==='type_missing') return 'Du mangler: ' + tl;
      if (g.kind==='stability_missing') {
        var bl = (g.bucket==='US') ? 'Understabil' : (g.bucket==='OS') ? 'Overstabil' : 'Nøytral';
        return 'Du mangler: ' + bl + ' ' + tl;
      }
      return 'Neste steg';
    }

    function buildEvidence(g, cnt, stab){
      var tl = TYPE_LABEL[g.type] || g.type;
      if (g.kind==='type_missing'){
        return 'Du har 0 ' + tl.toLowerCase() + ' i bagen akkurat nå.';
      }
      if (g.kind==='stability_missing'){
        var s = stab[g.type];
        var bl = (g.bucket==='US') ? 'understabile' : (g.bucket==='OS') ? 'overstabile' : 'nøytrale';
        return 'Du har ' + cnt[g.type] + ' ' + tl.toLowerCase() + ' totalt: ' +
          (s.US||0) + ' understabile, ' + (s.N||0) + ' nøytrale, ' + (s.OS||0) + ' overstabile.';
      }
      return '';
    }

    // Banlist (30 days)
    function banKey(email){ return 'MINBAG_BANS_V1_' + (email||''); }
    function getBans(){
      try {
        var raw = localStorage.getItem(banKey(STATE.email));
        var obj = raw ? JSON.parse(raw) : {};
        var now = Date.now();
        Object.keys(obj).forEach(function(k){ if (obj[k] && obj[k] < now) delete obj[k]; });
        return obj;
      } catch(e){ return {}; }
    }
    function setBans(obj){
      try { localStorage.setItem(banKey(STATE.email), JSON.stringify(obj||{})); } catch(e){}
    }
    function banProduct(p){
      var b = getBans();
      var key = (p && (p.url||p.name)) ? (p.url||p.name) : '';
      if (!key) return;
      b[key] = Date.now() + (30*24*60*60*1000);
      setBans(b);
    }
    function isBanned(p){
      var b = getBans();
      var key = (p && (p.url||p.name)) ? (p.url||p.name) : '';
      return !!(key && b[key]);
    }

    // Flight cache (from product page parsing)
    function flightCacheKey(){ return 'MINBAG_FLIGHT_V1'; }
    function getFlightCache(){
      try { return JSON.parse(localStorage.getItem(flightCacheKey())||'{}'); } catch(e){ return {}; }
    }
    function setFlightCache(obj){
      try { localStorage.setItem(flightCacheKey(), JSON.stringify(obj||{})); } catch(e){}
    }
    function getFlightForUrl(url){
      var c = getFlightCache();
      if (c[url]) return Promise.resolve(c[url]);
      return fetchText(url).then(function(html){
        var f = parseFlightFromProductHtml(html);
        c[url] = f || null;
        setFlightCache(c);
        return f;
      }).catch(function(){ return null; });
    }

    function fetchPopular(type, limit){
      var urlBase = window.GK_SUPABASE_URL;
      var key = window.GK_SUPABASE_ANON_KEY;
      if (!urlBase || !key) return Promise.resolve([]);
      var url = urlBase.replace(/\/$/,'') + '/rest/v1/popular_discs?select=type,name,product_url,image_url,count&type=eq.' + encodeURIComponent(type) + '&order=count.desc&limit=' + (limit||50);
      return fetch(url, { headers:{ apikey:key, Authorization:'Bearer ' + key } })
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(rows){
          return (rows||[]).map(function(r){
            return { name:r.name, url:r.product_url||'', image:r.image_url||'', count:r.count||0, type:r.type||type };
          });
        }).catch(function(){ return []; });
    }

    function chooseTwoForGap(gap){
      var existingNames = {};
      discList.forEach(function(d){ if(d&&d.name) existingNames[normName(d.name)] = true; });

      return fetchPopular(gap.type, 60).then(function(rows){
        // filter bans + existing
        var cand = [];
        for (var i=0;i<rows.length;i++){
          var p = rows[i];
          if (!p || !p.url) continue;
          if (existingNames[normName(p.name)]) continue;
          if (isBanned(p)) continue;
          cand.push(p);
        }
        if (!cand.length) return [];

        // If this gap is stability-based, try to find matching bucket by reading flight from product pages (best effort).
        if (gap.kind === 'stability_missing') {
          var want = gap.bucket;
          var picked = [];
          var idx = 0;
          function step(){
            if (picked.length >= 2) return Promise.resolve(picked);
            if (idx >= cand.length || idx >= 12) return Promise.resolve(picked); // cap fetches
            var p = cand[idx++];
            return getFlightForUrl(p.url).then(function(f){
              p.flight = f;
              var b = bucketFromFlight(f);
              if (b === want) picked.push(p);
              return step();
            });
          }
          return step().then(function(picked){
            if (picked.length >= 2) return picked.slice(0,2);
            // fallback: top two even if bucket unknown
            var rest = [];
            for (var j=0;j<cand.length && rest.length<2;j++){
              var pp=cand[j];
              var already=false;
              for (var k=0;k<picked.length;k++) if (picked[k].url===pp.url) already=true;
              if (!already) rest.push(pp);
            }
            return picked.concat(rest).slice(0,2);
          });
        }

        // Type missing: just take top two
        return cand.slice(0,2);
      }).then(function(list){
        if (list.length >= 2) return list;
        // fallback to search (Q4=B)
        var q = (gap.kind==='stability_missing')
          ? ((gap.bucket==='OS'?'overstable ':gap.bucket==='US'?'understable ':'straight ') + (TYPE_LABEL[gap.type]||gap.type))
          : (TYPE_LABEL[gap.type]||gap.type);
        return searchGolfkongenProducts(q).then(function(items){
          // items already contain url/name/image
          var out = [];
          for (var i=0;i<items.length && out.length<2;i++){
            var it=items[i];
            if (!it || !it.url) continue;
            if (existingNames[normName(it.name)]) continue;
            if (isBanned(it)) continue;
            out.push(it);
          }
          return out;
        }).catch(function(){ return list; });
      });
    }

    // Build gaps (Q3=A)
    var counts = countByType(discList);
    var stab = stabilityByType(discList);
    var gaps = [];

    // First: missing types
    ['putter','midrange','fairway','distance'].forEach(function(t){
      if ((counts[t]||0) === 0) gaps.push({ kind:'type_missing', type:t });
    });

    // Then: missing stability per type (only if type exists)
    ['putter','midrange','fairway','distance'].forEach(function(t){
      if ((counts[t]||0) > 0) {
        if ((stab[t].US||0) === 0) gaps.push({ kind:'stability_missing', type:t, bucket:'US' });
        if ((stab[t].N||0) === 0) gaps.push({ kind:'stability_missing', type:t, bucket:'N' });
        if ((stab[t].OS||0) === 0) gaps.push({ kind:'stability_missing', type:t, bucket:'OS' });
      }
    });

    if (!gaps.length) {
      var ok = el('div','');
      css(ok,'opacity:.9;line-height:1.35;');
      ok.innerHTML = '<div style="font-weight:900;">Ser bra ut! 👌</div><div style="opacity:.85;margin-top:4px;">Jeg finner ingen åpenbare mangler akkurat nå. Neste steg blir “mer personlig” rolle-analyse.</div>';
      box.appendChild(ok);
      return;
    }

    // State for rounds
    if (!recoState) recoState = {};
    recoState.gapIndex = recoState.gapIndex || 0;
    recoState.altIndex = recoState.altIndex || 0;

    function clampIdx(){
      if (recoState.gapIndex >= gaps.length) recoState.gapIndex = 0;
      if (recoState.gapIndex < 0) recoState.gapIndex = 0;
      if (recoState.altIndex > 1) recoState.altIndex = 0;
      if (recoState.altIndex < 0) recoState.altIndex = 0;
    }
    clampIdx();

    function renderGap(gap, suggestions){
      clear(box);

      var title = el('div','');
      css(title,'font-weight:900;margin-bottom:6px;');
      title.textContent = gapLabel(gap);
      box.appendChild(title);

      var ev = el('div','');
      css(ev,'opacity:.85;line-height:1.35;margin-bottom:10px;');
      ev.textContent = buildEvidence(gap, counts, stab);
      box.appendChild(ev);

      var sugWrap = el('div','');
      css(sugWrap,'display:grid;grid-template-columns:1fr;gap:10px;');
      box.appendChild(sugWrap);

      function sugCard(p, idx){
        var w = el('div','');
        css(w,'border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px;display:flex;gap:10px;align-items:flex-start;');
        var img = document.createElement('img');
        img.src = p.image || '';
        css(img,'width:54px;height:54px;border-radius:16px;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);');
        w.appendChild(img);

        var mid = el('div','');
        css(mid,'flex:1;min-width:0;');
        var n = el('div','', clampTxt(p.name, 70));
        css(n,'font-weight:900;');
        mid.appendChild(n);

        var sub = el('div','');
        css(sub,'opacity:.85;font-size:12px;margin-top:4px;');
        var extra = '';
        if (p.flight && p.flight.speed != null) extra = ' • Flight: ' + p.flight.speed + '/' + p.flight.glide + '/' + p.flight.turn + '/' + p.flight.fade;
        sub.textContent = 'Forslag ' + (idx+1) + extra;
        mid.appendChild(sub);

        var a = el('a','', 'Åpne produkt');
        a.href = p.url || '#'; a.target='_blank';
        css(a,'display:inline-block;margin-top:6px;font-size:12px;color:#cfe;text-decoration:none;opacity:.9;');
        mid.appendChild(a);

        w.appendChild(mid);

        var btns = el('div','');
        css(btns,'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;');
        var add = btn('Legg til','primary');
        add.onclick = function(){
          addProductToBag(p).then(function(){
            toast('Lagt til ✅');
            loadProfile().then(function(){ renderAll(); });
          }).catch(function(e){
            toast('Kunne ikke legge til: ' + (e&&e.message?e.message:e),'err');
          });
        };
        var no = btn('Nei takk','');
        no.onclick = function(){
          banProduct(p);
          // if first suggestion rejected -> show second, else next gap
          if (idx === 0 && suggestions[1]) {
            recoState.altIndex = 1;
            renderGap(gap, suggestions);
          } else {
            recoState.gapIndex++;
            recoState.altIndex = 0;
            refresh();
          }
        };
        btns.appendChild(add);
        btns.appendChild(no);
        w.appendChild(btns);

        return w;
      }

      if (!suggestions || !suggestions.length) {
        var t = el('div','');
        css(t,'opacity:.85;');
        t.textContent = 'Fant ingen forslag akkurat nå. Prøv igjen om litt.';
        sugWrap.appendChild(t);
        var next = btn('Neste mangel','');
        next.onclick = function(){ recoState.gapIndex++; recoState.altIndex=0; refresh(); };
        box.appendChild(next);
        return;
      }

      // show one at a time (two total)
      var showIdx = recoState.altIndex || 0;
      sugWrap.appendChild(sugCard(suggestions[showIdx], showIdx));

      // small helper to switch between 1 and 2 if both exist
      if (suggestions.length > 1) {
        var switcher = el('div','');
        css(switcher,'display:flex;gap:8px;justify-content:flex-end;margin-top:6px;opacity:.9;');
        var s1 = btn('Vis 1','');
        var s2 = btn('Vis 2','');
        s1.onclick=function(){ recoState.altIndex=0; renderGap(gap, suggestions); };
        s2.onclick=function(){ recoState.altIndex=1; renderGap(gap, suggestions); };
        switcher.appendChild(s1); switcher.appendChild(s2);
        box.appendChild(switcher);
      }
    }

    function refresh(){
      clampIdx();
      var gap = gaps[recoState.gapIndex];
      toast('Henter forslag…');
      chooseTwoForGap(gap).then(function(list){
        toast('');
        renderGap(gap, list || []);
      }).catch(function(e){
        toast('');
        clear(box);
        var t = el('div','');
        css(t,'opacity:.85;');
        t.textContent = 'Kunne ikke hente forslag.';
        box.appendChild(t);
      });
    }

    refresh();
  }

  // ---------------------------
  // Top 3 per type (popular_discs)
  // ---------------------------
  // ---------------------------
  function renderTop3PerType() {
    // Top 3 lives under recommendations panel for now
    var c = card('Topp 3 globalt (per type)', 'Basert på hva folk legger i bag på GolfKongen.');
    ui.reco.appendChild(el('div','', ''));
    ui.reco.appendChild(c);

    var host = el('div','');
    css(host,'display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px;');
    c.appendChild(host);

    function section(t, rows) {
      var s = el('div','');
      css(s,'border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px;');
      var h = el('div','', TYPE_LABEL[t] || t);
      css(h,'font-weight:900;margin-bottom:8px;');
      s.appendChild(h);

      if (!rows || !rows.length) {
        var e = el('div','', 'Ingen data ennå.');
        css(e,'opacity:.85;');
        s.appendChild(e);
        return s;
      }

      rows.forEach(function(r){
        var row = el('div','');
        css(row,'display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);');
        var img = document.createElement('img');
        img.src = r.image_url || '';
        css(img,'width:34px;height:34px;border-radius:10px;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);');
        row.appendChild(img);

        var mid = el('div','');
        css(mid,'flex:1;min-width:0;');
        var nm = el('div','', clampTxt(r.name || 'Disk', 44));
        css(nm,'font-weight:800;');
        mid.appendChild(nm);
        if (r.product_url) {
          var l = el('a','', 'Se');
          l.href = r.product_url;
          l.target = '_blank';
          css(l,'display:inline-block;margin-top:3px;font-size:12px;color:#cfe;text-decoration:none;opacity:.9;');
          mid.appendChild(l);
        }
        row.appendChild(mid);

        var cnt = el('div','', String(r.count || 0));
        css(cnt,'font-weight:900;min-width:34px;text-align:right;opacity:.9;');
        row.appendChild(cnt);

        s.appendChild(row);
      });

      return s;
    }

    ensureSupabaseClient().then(function(supa){
      // Fetch all types in parallel (best effort)
      var ps = TYPE_ORDER.map(function(t){
        return supa.from('popular_discs')
          .select('type,name,count,product_url,image_url')
          .eq('type', t)
          .order('count', { ascending:false })
          .limit(3)
          .then(function(r){
            if (r && r.error) throw r.error;
            return { type:t, rows: (r && r.data) ? r.data : [] };
          });
      });

      return Promise.all(ps).then(function(all){
        clear(host);
        all.forEach(function(x){
          host.appendChild(section(x.type, x.rows));
        });
      });
    }).catch(function(){
      clear(host);
      host.appendChild(el('div','', 'Kunne ikke hente topplister akkurat nå.'));
    });
  }

  // ---------------------------
  // Connect view (magic link)
  // ---------------------------
  function renderConnectView() {
    buildShell();
    clear(ui.content);
    clear(ui.reco);

    var c = card('Koble til (magic link)', 'Skriv inn e-post. Du får en innloggingslenke fra Supabase (trygg).');
    var row = el('div','');
    css(row,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;');

    var input = el('input','gk-in');
    input.type = 'email';
    input.placeholder = 'din@epost.no';
    css(input,'padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff;min-width:260px;');
    row.appendChild(input);

    var send = btn('Send magic link','primary');
    send.onclick = function(){
      var email = normEmail(input.value);
      if (!email || email.indexOf('@') === -1) { toast('Skriv inn gyldig e-post.','err'); return; }
      toast('Sender…');
      supaSendMagicLink(email).then(function(){ toast('Sjekk innboksen og klikk lenken ✅'); }).catch(function(e){ toast('Kunne ikke sende: ' + (e&&e.message?e.message:e),'err'); });
    };
    row.appendChild(send);

    c.appendChild(row);
    ui.content.appendChild(c);

    var info = card('Topp 3 globalt', 'Du må koble til for å lagre bag, men statistikk kan vises for alle.');
    ui.reco.appendChild(info);
    // show per type anyway
    renderTop3PerType();
  }

  // ---------------------------
  // Render all
  // ---------------------------
  function renderAll() {
    buildShell();
    ensureBags();
    renderDiscs();
    renderRecommendations();
    renderTop3PerType();
  }

  // ---------------------------
  // Boot
  // ---------------------------
  
  // ===========================
  // Public Top 3 widget (for forsiden / public pages)
  // Place a div with id="gk-top3-widget" anywhere, and ensure GK_SUPABASE_URL + GK_SUPABASE_ANON_KEY are available on window.
  // ===========================
  function renderTop3WidgetIfPresent(){
    var root = document.getElementById('gk-top3-widget');
    if (!root) return;

    var urlBase = window.GK_SUPABASE_URL;
    var key = window.GK_SUPABASE_ANON_KEY;
    if (!urlBase || !key) {
      root.innerHTML = '<div style="opacity:.8">Toppliste utilgjengelig (mangler Supabase-nøkkel).</div>';
      return;
    }

    root.innerHTML = '';
    var wrap = el('div','');
    css(wrap,'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;');
    root.appendChild(wrap);

    function niceType(t){
      if (t==='putter') return 'Puttere';
      if (t==='midrange') return 'Midrange';
      if (t==='fairway') return 'Fairway';
      if (t==='distance') return 'Drivere';
      return t;
    }

    function fetchTop3(type){
      var url = urlBase.replace(/\/$/,'') + '/rest/v1/popular_discs?select=type,name,product_url,image_url,count&type=eq.' + encodeURIComponent(type) + '&order=count.desc&limit=3';
      return fetch(url, {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      }).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }

    var types = ['putter','midrange','fairway','distance'];
    var ps = [];
    for (var i=0;i<types.length;i++){
      (function(tt){
        ps.push(fetchTop3(tt).then(function(rows){
          var card = el('div','minbagg-card');
          css(card,'padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.20);');
          var h = el('div','');
          css(h,'font-weight:900;margin-bottom:8px;');
          h.textContent = 'Topp 3 – ' + niceType(tt);
          card.appendChild(h);

          if (!rows || !rows.length) {
            var empty = el('div','');
            empty.style.opacity = '.8';
            empty.textContent = 'Ingen data enda.';
            card.appendChild(empty);
            wrap.appendChild(card);
            return;
          }

          for (var j=0;j<rows.length;j++){
            var r = rows[j] || {};
            var a = el('a','');
            a.href = r.product_url || '#';
            a.style.textDecoration = 'none';
            a.style.color = 'inherit';
            a.style.display = 'flex';
            a.style.gap = '10px';
            a.style.alignItems = 'center';
            a.style.padding = '8px';
            a.style.borderRadius = '12px';
            a.style.border = '1px solid rgba(255,255,255,.10)';
            a.style.background = 'rgba(255,255,255,.03)';
            a.style.marginBottom = '8px';

            var img = el('img','');
            img.src = r.image_url || '';
            img.alt = r.name || '';
            css(img,'width:44px;height:44px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.2);');
            a.appendChild(img);

            var meta = el('div','');
            meta.style.flex = '1';
            var n = el('div','');
            n.style.fontWeight = '800';
            n.textContent = r.name || '(uten navn)';
            meta.appendChild(n);

            var sub = el('div','');
            sub.style.opacity = '.8';
            sub.style.fontSize = '12px';
            sub.textContent = 'Valgt ' + (r.count||0) + ' ganger';
            meta.appendChild(sub);

            a.appendChild(meta);
            card.appendChild(a);
          }

          wrap.appendChild(card);
        }).catch(function(){
          var card = el('div','minbagg-card');
          css(card,'padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.20);');
          var h = el('div','');
          css(h,'font-weight:900;margin-bottom:8px;');
          h.textContent = 'Topp 3 – ' + niceType(tt);
          card.appendChild(h);
          var err = el('div','');
          err.style.opacity = '.8';
          err.textContent = 'Kunne ikke laste toppliste.';
          card.appendChild(err);
          wrap.appendChild(card);
        }));
      })(types[i]);
    }

    // no need to wait; UI fills as it loads
  }

  function boot() {
    renderTop3WidgetIfPresent();
supaGetUser().then(function(user){
      if (!user || !user.email) {
        renderConnectView();
        return;
      }

      STATE.user = user;
      STATE.email = normEmail(user.email);

      dbLoad(STATE.email).then(function(row){
        var parsed = parseRow(row || {});
        STATE.bags = parsed.bags;
        STATE.activeBagId = parsed.activeBagId || 'default';
        ensureBags();
        syncActiveFromBags();
        loadProfile().then(function(){ renderAll(); });
      }).catch(function(e){
        buildShell();
        toast('Kunne ikke laste: ' + (e&&e.message?e.message:e), 'err');
      });
    }).catch(function(e){
      buildShell();
      toast('Kunne ikke starte: ' + (e&&e.message?e.message:e), 'err');
    });
  }

  window.__MINBAG_BOOT__ = boot;

  boot();

})();
