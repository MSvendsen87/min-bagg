/* ============================================================================
   GOLFKONGEN – MIN BAG V3 APP
   Build: 2026-08-06.1

   V3-prinsipper:
   - Supabase Auth / magic link
   - Kun Min Bag-tabeller/RPC-er
   - Ingen service_role i frontend
   - Ingen user_id fra frontend ved opprettelse av discer
   - Skriving av discer går via sikre RPC-er
   - Støtter flere bager
   - "Legg til fra GolfKongen" via minbag_search_catalog + minbag_add_catalog_disc
   - "Legg inn egen disc" via minbag_add_manual_disc
   - Mobil-først, mørkt GolfKongen-design
   - Bag-cover: velg GolfKongen-sekk eller bruk eget bilde
   - Rediger/slett fysisk disc-eksemplar via sikre RPC-er
   - Gi bag nytt navn via sikker RPC
   - Flytt fysisk disc mellom egne bager via sikker RPC
   - Ny bag opprettes i eget sidepanel, ikke browser-prompt
   - Favoritt kan toggles direkte på disc-kortet
   - Favoritter sorteres først innen hver disctype
   - Ny disc kan legges direkte i valgfri egen bag
   - Egen bag kan søkes/filtreres lokalt
   - Kompakt bag-oppsummering med antall per disctype
   - Fysisk disc kan dupliseres via sikker RPC
   - Anbefalingsprofil med nivå, kastelengde, hånd, kastestil, bane og vind
   - Bag-analyse V1: hull i flight-dekning og tydelig overlapp

   Denne filen forutsetter at Quickbutik-loaderen har opprettet:
   <div id="min-bag-root"></div>

   Leveres som .txt fra ChatGPT. Når den senere legges i GitHub som kjørbar app,
   brukes innholdet som JavaScript.
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = '2026-08-08.14';

  var CONFIG = {
    ROOT_ID: 'min-bag-root',
    PAGE_PATH: '/sider/min-bag',
    SUPABASE_URL: 'https://fwztrnxhfvrlceicctlv.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3enRybnhoZnZybGNlaWNjdGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTgwMjYsImV4cCI6MjA5NTI5NDAyNn0.q4QthdBWEtUi_Fdz_Ge88E_5CpJMtUvjWhMAa0R0zmE',
    SUPABASE_SDK: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    MAGIC_LINK_REDIRECT: 'https://golfkongen.no/sider/min-bag',
    CATALOG_LIMIT: 30,
    BAG_IMAGE_BUCKET: 'minbag-bag-images',
    BAG_IMAGE_SIGNED_SECONDS: 86400,
    BAG_IMAGE_MAX_SOURCE_BYTES: 12 * 1024 * 1024,
    BAG_IMAGE_MAX_EDGE: 1200,
    BAG_IMAGE_WEBP_QUALITY: 0.82,
    WORKER_URL: 'https://sportskongen-quickbutik-sync.post-cd6.workers.dev',
    STORE_BAG_IMAGE_ENDPOINT: '/alt-text-product-check'
  };

  var root = null;
  var supabaseClient = null;
  var authSubscription = null;
  var booting = false;

  var STATE = {
    user: null,
    bags: [],
    activeBagId: null,
    discs: [],
    brands: [],
    catalogResults: [],
    catalogQuery: '',
    catalogType: '',
    top3: [],
    top3Loaded: false,
    bagImageUrls: {},
    bagImageBusy: false,
    storeBags: [],
    storeBagSelections: {},
    storeBagImageUrls: {},
    storeBagImageLoading: {},
    storeBagPickerOpen: false,
    storeBagBusy: false,
    newBagOpen: false,
    renameBagOpen: false,
    bagActionBusy: false,
    addTargetBagId: null,
    bagSearch: '',
    bagFilter: 'all',
    editDiscId: null,
    discBusy: false,
    recoProfile: null,
    recoProfileLoaded: false,
    recoProfileOpen: false,
    recoFindings: [],
    recoLoaded: false,
    recoProducts: [],
    recoProductsLoaded: false,
    recoProductsError: '',
    funRecommendations: [],
    funRecommendationsLoaded: false,
    funRecommendationsError: '',
    funRecommendationsPage: 0,
    funRecommendationsBusy: false,
    recoBusy: false,
    loading: false
  };

  function safe(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function trim(value) {
    return safe(value).trim();
  }

  function numOrNull(value) {
    var text = trim(value).replace(',', '.');
    if (!text) return null;
    var num = Number(text);
    return isFinite(num) ? num : null;
  }

  function escHtml(value) {
    return safe(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function currentPath() {
    return safe(location.pathname).replace(/\/+$/, '').toLowerCase();
  }

  function onMinBagPage() {
    return currentPath() === CONFIG.PAGE_PATH;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function activeBag() {
    for (var i = 0; i < STATE.bags.length; i += 1) {
      if (STATE.bags[i].id === STATE.activeBagId) {
        return STATE.bags[i];
      }
    }
    return null;
  }

  function bagById(bagId) {
    for (var i = 0; i < STATE.bags.length; i += 1) {
      if (STATE.bags[i].id === bagId) return STATE.bags[i];
    }
    return null;
  }

  function selectedAddBagId() {
    var wanted = STATE.addTargetBagId || STATE.activeBagId;
    return bagById(wanted) ? wanted : STATE.activeBagId;
  }

  function selectedAddBagName() {
    var bag = bagById(selectedAddBagId());
    return bag ? bag.name : 'aktiv bag';
  }

  function discTypeLabel(type) {
    if (type === 'putter') return 'Putter';
    if (type === 'midrange') return 'Midrange';
    if (type === 'fairway') return 'Fairway driver';
    if (type === 'distance') return 'Distance driver';
    return 'Disc';
  }

  function status(text, type) {
    var box = document.getElementById('gkmb3-status');
    if (!box) return;

    box.className = 'gkmb3-status';
    if (type) box.className += ' ' + type;
    box.textContent = text || '';
  }

  function setLoading(isLoading, text) {
    STATE.loading = !!isLoading;

    var buttons = document.querySelectorAll('#' + CONFIG.ROOT_ID + ' button');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].disabled = !!isLoading;
    }

    if (text) status(text, '');
  }

  function errorMessage(err) {
    if (!err) return 'Ukjent feil.';
    if (typeof err === 'string') return err;
    return err.message || err.error_description || err.details || JSON.stringify(err);
  }

  function injectCss() {
    if (document.getElementById('gk-minbag-v3-css')) return;

    var style = document.createElement('style');
    style.id = 'gk-minbag-v3-css';
    style.textContent =
      '#min-bag-root{width:100%;max-width:1180px;margin:18px 0 0;color:#f8fafc;font-family:inherit;}' +
      '#min-bag-root *{box-sizing:border-box;}' +

      '.gkmb3-shell{display:grid;gap:16px;}' +
      '.gkmb3-hero{position:relative;overflow:hidden;border-radius:26px;padding:22px;border:1px solid rgba(34,197,94,.28);background:radial-gradient(circle at 0 0,rgba(34,197,94,.24),transparent 38%),linear-gradient(135deg,#061109,#0e2417 56%,#07140d);box-shadow:0 22px 70px rgba(0,0,0,.32);}' +
      '.gkmb3-hero h2{margin:0 0 8px;font-size:clamp(28px,6vw,52px);line-height:1;font-weight:1000;letter-spacing:-.045em;color:#fff;}' +
      '.gkmb3-hero p{margin:0 0 14px;max-width:760px;color:rgba(255,255,255,.74);line-height:1.55;}' +
      '.gkmb3-eyebrow{display:inline-flex;padding:6px 10px;margin-bottom:11px;border-radius:999px;border:1px solid rgba(34,197,94,.38);background:rgba(34,197,94,.13);color:#b9fbcf;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}' +

      '.gkmb3-status{margin-top:14px;padding:11px 13px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:rgba(255,255,255,.82);font-size:13px;font-weight:800;}' +
      '.gkmb3-status.ok{border-color:rgba(34,197,94,.36);background:rgba(34,197,94,.12);color:#d1fae5;}' +
      '.gkmb3-status.err{border-color:rgba(239,68,68,.42);background:rgba(239,68,68,.12);color:#fee2e2;}' +

      '.gkmb3-pills{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}' +
      '.gkmb3-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);font-size:12px;font-weight:800;color:rgba(255,255,255,.82);}' +

      '.gkmb3-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}' +
      '.gkmb3-btn{display:inline-flex;align-items:center;justify-content:center;min-height:43px;padding:10px 13px;border:0;border-radius:13px;background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;font-weight:950;font-family:inherit;cursor:pointer;text-decoration:none;box-shadow:0 8px 24px rgba(21,128,61,.2);}' +
      '.gkmb3-btn:hover{filter:brightness(1.06);}' +
      '.gkmb3-btn.secondary{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);box-shadow:none;}' +
      '.gkmb3-btn.danger{background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.30);box-shadow:none;}' +
      '.gkmb3-btn:disabled{opacity:.48;cursor:not-allowed;filter:none;}' +

      '.gkmb3-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;}' +
      '.gkmb3-card{border:1px solid rgba(255,255,255,.11);background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.035));border-radius:22px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.17);}' +
      '.gkmb3-card h3{margin:0 0 7px;color:#fff;font-size:19px;font-weight:950;}' +
      '.gkmb3-card h4{margin:0 0 7px;color:#fff;font-size:15px;font-weight:950;}' +
      '.gkmb3-card p{margin:0 0 12px;color:rgba(255,255,255,.66);line-height:1.45;font-size:13px;}' +

      '.gkmb3-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;}' +
      '.gkmb3-tab{min-height:46px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:rgba(255,255,255,.72);font-weight:900;cursor:pointer;}' +
      '.gkmb3-tab.active{border-color:rgba(34,197,94,.52);background:rgba(34,197,94,.16);color:#dcfce7;}' +

      '.gkmb3-grid{display:grid;grid-template-columns:1fr;gap:10px;}' +
      '.gkmb3-grid2{display:grid;grid-template-columns:1fr;gap:10px;}' +
      '.gkmb3-grid4{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}' +

      '.gkmb3-field{display:grid;gap:5px;color:rgba(255,255,255,.72);font-size:12px;font-weight:850;}' +
      '.gkmb3-input,.gkmb3-select,.gkmb3-textarea{width:100%;min-height:44px;border-radius:13px;border:1px solid rgba(255,255,255,.14);background:#0a120d;color:#fff;padding:10px 12px;font:inherit;outline:none;}' +
      '.gkmb3-input::placeholder,.gkmb3-textarea::placeholder{color:rgba(255,255,255,.32);}' +
      '.gkmb3-input:focus,.gkmb3-select:focus,.gkmb3-textarea:focus{border-color:rgba(34,197,94,.72);box-shadow:0 0 0 3px rgba(34,197,94,.11);}' +
      '.gkmb3-textarea{min-height:88px;resize:vertical;}' +
      '.gkmb3-check{display:flex;align-items:center;gap:8px;min-height:44px;color:rgba(255,255,255,.78);font-size:13px;font-weight:800;}' +

      '.gkmb3-bags{display:flex;gap:8px;overflow-x:auto;padding-bottom:3px;margin-bottom:12px;scrollbar-width:thin;}' +
      '.gkmb3-bagbtn{flex:0 0 auto;min-height:42px;padding:9px 12px;border-radius:13px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:rgba(255,255,255,.75);font-weight:900;cursor:pointer;white-space:nowrap;}' +
      '.gkmb3-bagsummary{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 11px;}' +
      '.gkmb3-bagsummary span{display:inline-flex;align-items:center;min-height:29px;padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);color:rgba(255,255,255,.68);font-size:10px;font-weight:850;}' +
      '.gkmb3-bagsummary span:first-child{border-color:rgba(34,197,94,.26);background:rgba(34,197,94,.08);color:#dcfce7;}' +
      '.gkmb3-bagtools{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:0 0 12px;}' +
      '.gkmb3-bagtools .gkmb3-field{margin:0;}' +
      '.gkmb3-reco{margin-top:16px;}' +
      '.gkmb3-recohead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;}' +
      '.gkmb3-recopills{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 11px;}' +
      '.gkmb3-recopill{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;border:1px solid rgba(34,197,94,.20);background:rgba(34,197,94,.07);color:#dcfce7;font-size:10px;font-weight:850;}' +
      '.gkmb3-recoform{display:grid;gap:10px;margin-top:10px;}' +
      '.gkmb3-recogrid{display:grid;grid-template-columns:1fr;gap:9px;}' +
      '.gkmb3-recolist{display:grid;gap:8px;margin-top:10px;}' +
      '.gkmb3-recofinding{padding:11px;border-radius:15px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.14);}' +
      '.gkmb3-recofinding.gap{border-color:rgba(34,197,94,.22);background:linear-gradient(135deg,rgba(34,197,94,.07),rgba(0,0,0,.14));}' +
      '.gkmb3-recofinding.overlap{border-color:rgba(245,158,11,.24);background:linear-gradient(135deg,rgba(245,158,11,.06),rgba(0,0,0,.14));}' +
      '.gkmb3-recofinding-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}' +
      '.gkmb3-recofinding-title{font-size:12px;font-weight:950;color:#fff;line-height:1.25;}' +
      '.gkmb3-recofinding-priority{flex:0 0 auto;padding:4px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.055);color:rgba(255,255,255,.62);font-size:9px;font-weight:900;}' +
      '.gkmb3-recofinding-reason{margin-top:5px;font-size:10px;line-height:1.4;color:rgba(255,255,255,.53);}' +
      '.gkmb3-recofinding-meta{margin-top:6px;font-size:9px;font-weight:850;color:#bbf7d0;}' +
      '.gkmb3-recomatches{display:grid;gap:7px;margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.075);}' +
      '.gkmb3-recomatch{display:grid;grid-template-columns:48px minmax(0,1fr);gap:9px;padding:8px;border-radius:12px;border:1px solid rgba(34,197,94,.16);background:rgba(2,10,6,.42);}' +
      '.gkmb3-recomatch.best{border-color:rgba(34,197,94,.34);background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(2,10,6,.45));}' +
      '.gkmb3-recomatch-img{width:48px;height:48px;border-radius:10px;overflow:hidden;display:grid;place-items:center;background:#090d0a;border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.35);font-size:9px;font-weight:900;}' +
      '.gkmb3-recomatch-img img{width:100%;height:100%;object-fit:contain;display:block;}' +
      '.gkmb3-recomatch-top{display:flex;align-items:flex-start;justify-content:space-between;gap:7px;}' +
      '.gkmb3-recomatch-name{font-size:11px;font-weight:950;color:#fff;line-height:1.25;}' +
      '.gkmb3-recomatch-score{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:#16a34a;color:#fff;font-size:9px;font-weight:950;white-space:nowrap;}' +
      '.gkmb3-recomatch-sub{margin-top:2px;color:rgba(255,255,255,.55);font-size:9px;font-weight:750;}' +
      '.gkmb3-recomatch-reason{margin-top:5px;color:rgba(255,255,255,.64);font-size:9px;line-height:1.4;}' +
      '.gkmb3-recomatch-price{margin-top:5px;color:#bbf7d0;font-size:10px;font-weight:950;}' +
      '.gkmb3-recomatch .gkmb3-flight{margin-top:5px;}' +
      '.gkmb3-recomatch .gkmb3-toolbar{margin-top:6px;gap:5px;}' +
      '.gkmb3-recomatch .gkmb3-btn{min-height:31px;padding:7px 9px;font-size:9px;border-radius:10px;}' +
      '.gkmb3-fun{margin-top:12px;padding:12px;border-radius:16px;border:1px solid rgba(168,85,247,.28);background:linear-gradient(135deg,rgba(88,28,135,.13),rgba(2,10,6,.35));}' +
      '.gkmb3-funhead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;}' +
      '.gkmb3-funhead h4{margin:0;color:#fff;font-size:13px;line-height:1.2;}' +
      '.gkmb3-funhead p{margin:4px 0 0;color:rgba(255,255,255,.57);font-size:9px;line-height:1.45;max-width:620px;}' +
      '.gkmb3-funlist{display:grid;gap:7px;}' +
      '.gkmb3-fun .gkmb3-recomatch{border-color:rgba(168,85,247,.22);}' +
      '.gkmb3-fun .gkmb3-recomatch.best{border-color:rgba(168,85,247,.38);background:linear-gradient(135deg,rgba(126,34,206,.12),rgba(2,10,6,.45));}' +
      '.gkmb3-funbadge{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:linear-gradient(135deg,#7e22ce,#a855f7);color:#fff;font-size:9px;font-weight:950;white-space:nowrap;}' +
      '.gkmb3-funchallenge{padding:11px;border-radius:12px;border:1px dashed rgba(168,85,247,.35);background:rgba(88,28,135,.08);}' +
      '.gkmb3-funchallenge strong{display:block;color:#fff;font-size:11px;margin-bottom:4px;}' +
      '.gkmb3-funchallenge div{color:rgba(255,255,255,.62);font-size:9px;line-height:1.45;}' +
      '.gkmb3-bagbtn.active{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.48);color:#dcfce7;}' +
      '.gkmb3-bagform{margin-top:11px;padding:12px;border-radius:15px;border:1px solid rgba(34,197,94,.22);background:linear-gradient(135deg,rgba(34,197,94,.07),rgba(0,0,0,.16));}' +
      '.gkmb3-bagform-title{font-size:13px;font-weight:950;color:#fff;margin-bottom:3px;}' +
      '.gkmb3-bagform-note{font-size:10px;line-height:1.35;color:rgba(255,255,255,.48);margin-bottom:9px;}' +
      '.gkmb3-bagform-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-items:end;}' +
      '.gkmb3-bagform-actions{display:flex;gap:7px;flex-wrap:wrap;}' +
      '.gkmb3-bagform-actions .gkmb3-btn{min-height:38px;padding:8px 11px;font-size:11px;}' +

      '.gkmb3-category{margin-top:16px;}' +
      '.gkmb3-category-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px;}' +
      '.gkmb3-category-title strong{font-size:14px;color:#fff;}' +
      '.gkmb3-category-title span{font-size:11px;color:rgba(255,255,255,.48);}' +
      '.gkmb3-discgrid{display:grid;grid-template-columns:1fr;gap:10px;}' +

      '.gkmb3-disc{display:grid;grid-template-columns:82px minmax(0,1fr);gap:12px;padding:11px;border-radius:17px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.15);}' +
      '.gkmb3-discimg{width:82px;height:82px;border-radius:15px;overflow:hidden;border:1px solid rgba(255,255,255,.10);background:radial-gradient(circle at 25% 20%,rgba(34,197,94,.30),rgba(255,255,255,.04));display:flex;align-items:center;justify-content:center;color:#bbf7d0;font-weight:1000;}' +
      '.gkmb3-discimg img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.gkmb3-disctitle{font-size:15px;font-weight:950;color:#fff;line-height:1.15;margin-bottom:3px;}' +
      '.gkmb3-discsub{font-size:11px;color:rgba(255,255,255,.52);margin-bottom:7px;}' +
      '.gkmb3-flight{display:flex;gap:5px;flex-wrap:wrap;}' +
      '.gkmb3-flight span{display:inline-flex;gap:4px;padding:5px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.055);font-size:10px;color:rgba(255,255,255,.54);}' +
      '.gkmb3-flight b{color:#bbf7d0;}' +
      '.gkmb3-discmeta{margin-top:7px;font-size:11px;color:rgba(255,255,255,.55);line-height:1.35;}' +
      '.gkmb3-discactions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;}' +
      '.gkmb3-discactions .gkmb3-btn{min-height:34px;padding:6px 10px;font-size:10px;}' +
      '.gkmb3-discedit{grid-column:1/-1;margin-top:2px;padding:12px;border-radius:15px;border:1px solid rgba(34,197,94,.25);background:linear-gradient(135deg,rgba(34,197,94,.08),rgba(0,0,0,.18));}' +
      '.gkmb3-discedit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;}' +
      '.gkmb3-discedit-title{font-size:13px;font-weight:950;color:#fff;}' +
      '.gkmb3-discedit-note{margin-top:3px;font-size:10px;line-height:1.35;color:rgba(255,255,255,.48);}' +
      '.gkmb3-discedit-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px;}' +
      '.gkmb3-discedit-actions .gkmb3-btn{min-height:38px;padding:8px 11px;font-size:11px;}' +
      '.gkmb3-movebox{margin-top:11px;padding:11px;border-radius:13px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);}' +
      '.gkmb3-movebox-title{font-size:12px;font-weight:950;color:#fff;margin-bottom:3px;}' +
      '.gkmb3-movebox-note{font-size:10px;line-height:1.35;color:rgba(255,255,255,.46);margin-bottom:8px;}' +
      '.gkmb3-movebox-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-items:end;}' +
      '.gkmb3-movebox-row .gkmb3-btn{min-height:44px;}' +

      '.gkmb3-empty{padding:24px 16px;text-align:center;border:1px dashed rgba(255,255,255,.16);border-radius:17px;background:rgba(255,255,255,.025);color:rgba(255,255,255,.58);}' +
      '.gkmb3-empty strong{display:block;color:#fff;font-size:17px;margin-bottom:5px;}' +

      '.gkmb3-results{display:grid;gap:9px;margin-top:12px;}' +
      '.gkmb3-result{display:grid;grid-template-columns:66px minmax(0,1fr);gap:10px;padding:10px;border-radius:16px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.14);}' +
      '.gkmb3-resultimg{width:66px;height:66px;border-radius:13px;overflow:hidden;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;color:#bbf7d0;font-weight:950;}' +
      '.gkmb3-resultimg img{width:100%;height:100%;object-fit:cover;}' +
      '.gkmb3-resulttitle{font-weight:950;color:#fff;font-size:14px;line-height:1.2;margin-bottom:3px;}' +
      '.gkmb3-resultsub{font-size:11px;color:rgba(255,255,255,.52);margin-bottom:7px;}' +
      '.gkmb3-price{font-size:12px;font-weight:900;color:#bbf7d0;}' +

      '.gkmb3-login{max-width:620px;display:grid;gap:10px;}' +
      '.gkmb3-note{font-size:11px;color:rgba(255,255,255,.48);line-height:1.4;}' +

      '.gkmb3-top3grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px;}' +
      '.gkmb3-top3type{padding:12px;border-radius:17px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.14);}' +
      '.gkmb3-top3type h4{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 9px;font-size:14px;}' +
      '.gkmb3-top3type h4 span{font-size:10px;color:rgba(255,255,255,.42);font-weight:800;}' +
      '.gkmb3-top3list{display:grid;gap:7px;}' +
      '.gkmb3-top3item{display:grid;grid-template-columns:46px minmax(0,1fr);gap:9px;align-items:center;padding:8px;border-radius:13px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);text-decoration:none;color:inherit;transition:.15s ease;}' +
      '.gkmb3-top3item:hover{border-color:rgba(34,197,94,.38);background:rgba(34,197,94,.08);transform:translateY(-1px);}' +
      '.gkmb3-top3img{position:relative;width:46px;height:46px;border-radius:11px;overflow:hidden;background:radial-gradient(circle at 25% 20%,rgba(34,197,94,.28),rgba(255,255,255,.04));display:flex;align-items:center;justify-content:center;color:#bbf7d0;font-size:10px;font-weight:950;}' +
      '.gkmb3-top3img img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.gkmb3-rank{position:absolute;top:2px;left:2px;min-width:20px;height:20px;padding:0 4px;border-radius:999px;background:rgba(0,0,0,.78);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;color:#dcfce7;font-size:9px;font-weight:1000;}' +
      '.gkmb3-top3name{font-size:12px;font-weight:950;color:#fff;line-height:1.15;}' +
      '.gkmb3-top3meta{margin-top:3px;font-size:10px;color:rgba(255,255,255,.50);line-height:1.25;}' +
      '.gkmb3-top3empty{padding:12px 8px;text-align:center;border-radius:12px;border:1px dashed rgba(255,255,255,.10);color:rgba(255,255,255,.40);font-size:11px;}' +

      '.gkmb3-bagphoto{display:grid;grid-template-columns:82px minmax(0,1fr);gap:12px;align-items:center;margin:14px 0 4px;padding:12px;border-radius:17px;border:1px solid rgba(34,197,94,.18);background:linear-gradient(135deg,rgba(34,197,94,.07),rgba(255,255,255,.025));}' +
      '.gkmb3-bagphoto-img{width:82px;height:82px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.13);background:radial-gradient(circle at 25% 20%,rgba(34,197,94,.25),rgba(0,0,0,.25));display:flex;align-items:center;justify-content:center;font-size:34px;}' +
      '.gkmb3-bagphoto-img img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.gkmb3-bagphoto-info{min-width:0;}' +
      '.gkmb3-bagphoto-name{font-size:14px;font-weight:950;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.gkmb3-bagphoto-help{margin-top:4px;font-size:10px;line-height:1.35;color:rgba(255,255,255,.52);}' +
      '.gkmb3-bagphoto-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;}' +
      '.gkmb3-bagphoto-actions .gkmb3-btn{min-height:38px;padding:8px 11px;font-size:11px;}' +
      '.gkmb3-bagsource{display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:4px 7px;border-radius:999px;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.08);color:#bbf7d0;font-size:9px;font-weight:900;}' +
      '.gkmb3-storepicker{margin-top:12px;padding:12px;border-radius:17px;border:1px solid rgba(34,197,94,.22);background:rgba(0,0,0,.18);}' +
      '.gkmb3-storepicker-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;}' +
      '.gkmb3-storepicker-title{font-size:14px;font-weight:950;color:#fff;}' +
      '.gkmb3-storepicker-note{margin-top:3px;font-size:10px;line-height:1.35;color:rgba(255,255,255,.50);}' +
      '.gkmb3-storegrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;max-height:490px;overflow:auto;padding-right:2px;scrollbar-width:thin;}' +
      '.gkmb3-storebag{min-width:0;border-radius:15px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);overflow:hidden;}' +
      '.gkmb3-storebag.selected{border-color:rgba(34,197,94,.62);box-shadow:0 0 0 2px rgba(34,197,94,.10) inset;background:rgba(34,197,94,.07);}' +
      '.gkmb3-storebag-pick{display:grid;width:100%;grid-template-columns:62px minmax(0,1fr);gap:9px;align-items:center;padding:9px;border:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer;}' +
      '.gkmb3-storebag-pick:disabled{opacity:.50;cursor:not-allowed;}' +
      '.gkmb3-storebag-img{width:62px;height:62px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.10);background:radial-gradient(circle at 25% 20%,rgba(34,197,94,.22),rgba(255,255,255,.035));display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.45);font-size:9px;font-weight:900;text-align:center;padding:4px;}' +
      '.gkmb3-storebag-img img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.gkmb3-storebag-name{font-size:11px;font-weight:950;color:#fff;line-height:1.2;}' +
      '.gkmb3-storebag-meta{margin-top:4px;font-size:9px;line-height:1.3;color:rgba(255,255,255,.52);}' +
      '.gkmb3-storebag-link{display:block;padding:0 9px 9px;color:#86efac;font-size:9px;font-weight:900;text-decoration:none;}' +
      '.gkmb3-storebag-link:hover{text-decoration:underline;}' +

      '@media(min-width:620px){' +
        '.gkmb3-grid2{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '.gkmb3-bagtools{grid-template-columns:minmax(0,1fr) 190px;}' +
        '.gkmb3-recogrid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '.gkmb3-bagform-row{grid-template-columns:minmax(0,1fr) auto;}' +
        '.gkmb3-movebox-row{grid-template-columns:minmax(0,1fr) auto;}' +
        '.gkmb3-grid4{grid-template-columns:repeat(4,minmax(0,1fr));}' +
        '.gkmb3-discgrid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '.gkmb3-top3grid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '.gkmb3-storegrid{grid-template-columns:repeat(3,minmax(0,1fr));}' +
      '}' +
      '@media(min-width:960px){' +
        '.gkmb3-top3grid{grid-template-columns:repeat(4,minmax(0,1fr));}' +
        '.gkmb3-layout{grid-template-columns:minmax(0,1.35fr) minmax(330px,.65fr);align-items:start;}' +
        '.gkmb3-sticky{position:sticky;top:18px;}' +
      '}' +
      '@media(max-width:480px){' +
        '.gkmb3-hero{padding:17px;border-radius:21px;}' +
        '.gkmb3-card{padding:13px;border-radius:18px;}' +
        '.gkmb3-disc{grid-template-columns:70px minmax(0,1fr);}' +
        '.gkmb3-discimg{width:70px;height:70px;}' +
        '.gkmb3-storegrid{grid-template-columns:1fr;max-height:540px;}' +
      '}';

    document.head.appendChild(style);
  }

  function loadSupabaseSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) {
        resolve();
        return;
      }

      var existing = document.getElementById('gk-minbag-v3-supabase-sdk');
      if (existing) {
        var tries = 0;
        var timer = setInterval(function () {
          tries += 1;
          if (window.supabase && window.supabase.createClient) {
            clearInterval(timer);
            resolve();
          } else if (tries > 100) {
            clearInterval(timer);
            reject(new Error('Supabase SDK brukte for lang tid på å laste.'));
          }
        }, 100);
        return;
      }

      var script = document.createElement('script');
      script.id = 'gk-minbag-v3-supabase-sdk';
      script.src = CONFIG.SUPABASE_SDK;
      script.defer = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Kunne ikke laste Supabase SDK.')); };
      document.head.appendChild(script);
    });
  }

  function createClient() {
    if (supabaseClient) return;

    supabaseClient = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }

  function renderFlight(speed, glide, turn, fade) {
    var wrap = el('div', 'gkmb3-flight');

    var values = [
      ['S', speed],
      ['G', glide],
      ['T', turn],
      ['F', fade]
    ];

    for (var i = 0; i < values.length; i += 1) {
      var chip = el('span', '');
      chip.appendChild(el('b', '', values[i][0]));
      chip.appendChild(document.createTextNode(
        values[i][1] === null || values[i][1] === undefined || values[i][1] === ''
          ? '?'
          : String(values[i][1])
      ));
      wrap.appendChild(chip);
    }

    return wrap;
  }

  function top3RowsForType(type) {
    var rows = [];

    for (var i = 0; i < STATE.top3.length; i += 1) {
      if (STATE.top3[i].disc_type === type) rows.push(STATE.top3[i]);
    }

    return rows;
  }

  function renderTop3() {
    var card = el('section', 'gkmb3-card');
    card.appendChild(el('h3', '', 'Topp 3 i Min Bag'));
    card.appendChild(el(
      'p',
      '',
      'De mest brukte moldene blant Min Bag-brukerne. Hver bruker teller én gang per mold, og bare discer vi kan lenke til i GolfKongen vises.'
    ));

    var grid = el('div', 'gkmb3-top3grid');

    var types = [
      ['putter', 'Puttere'],
      ['midrange', 'Midrange'],
      ['fairway', 'Fairway'],
      ['distance', 'Distance']
    ];

    for (var i = 0; i < types.length; i += 1) {
      var type = types[i][0];
      var label = types[i][1];
      var rows = top3RowsForType(type);

      var box = el('div', 'gkmb3-top3type');
      var heading = el('h4', '');
      heading.appendChild(document.createTextNode(label));
      heading.appendChild(el('span', '', 'TOPP 3'));
      box.appendChild(heading);

      var list = el('div', 'gkmb3-top3list');

      if (!STATE.top3Loaded) {
        list.appendChild(el('div', 'gkmb3-top3empty', 'Laster statistikk…'));
      } else if (!rows.length) {
        list.appendChild(el('div', 'gkmb3-top3empty', 'Ingen data ennå.'));
      } else {
        for (var j = 0; j < rows.length; j += 1) {
          var row = rows[j];

          var link = el('a', 'gkmb3-top3item');
          link.href = row.product_url;
          link.target = '_blank';
          link.rel = 'noopener';

          var img = el('div', 'gkmb3-top3img');

          if (row.image_url) {
            var image = document.createElement('img');
            image.src = row.image_url;
            image.alt = safe(row.brand) + ' ' + safe(row.name);
            image.loading = 'lazy';
            img.appendChild(image);
          } else {
            img.appendChild(document.createTextNode('DISC'));
          }

          img.appendChild(el('span', 'gkmb3-rank', '#' + (j + 1)));

          var body = el('div', '');
          body.appendChild(el('div', 'gkmb3-top3name', safe(row.name)));

          var count = Number(row.count) || 0;
          var metaText = safe(row.brand);

          if (STATE.user) {
            metaText += ' · ' + count + (count === 1 ? ' bruker' : ' brukere');
          }

          metaText += ' · Se i nettbutikken';

          body.appendChild(el(
            'div',
            'gkmb3-top3meta',
            metaText
          ));

          link.appendChild(img);
          link.appendChild(body);
          list.appendChild(link);
        }
      }

      box.appendChild(list);
      grid.appendChild(box);
    }

    card.appendChild(grid);
    return card;
  }

  function render() {
    if (!root) return;

    clear(root);

    var shell = el('div', 'gkmb3-shell');
    var hero = el('section', 'gkmb3-hero');

    hero.appendChild(el('div', 'gkmb3-eyebrow', 'GolfKongen · Min Bag V3'));
    hero.appendChild(el('h2', '', 'Min bag'));

    if (!STATE.user) {
      hero.appendChild(el(
        'p',
        '',
        'Logg inn med e-post for å bygge og lagre discgolf-bagen din. Du får en sikker innloggingslenke på e-post.'
      ));
      hero.appendChild(renderLogin());
      var loggedOutStatus = el('div', 'gkmb3-status', 'Ikke innlogget.');
      loggedOutStatus.id = 'gkmb3-status';
      hero.appendChild(loggedOutStatus);

      shell.appendChild(hero);
      shell.appendChild(renderTop3());
      root.appendChild(shell);
      return;
    }

    hero.appendChild(el(
      'p',
      '',
      'Hold oversikt over discene dine, legg til fra GolfKongen-katalogen eller registrer discer vi aldri har solgt.'
    ));

    var pills = el('div', 'gkmb3-pills');
    pills.appendChild(el('span', 'gkmb3-pill', STATE.user.email || 'Innlogget'));

    var bag = activeBag();
    if (bag) pills.appendChild(el('span', 'gkmb3-pill', 'Bag: ' + bag.name));

    pills.appendChild(el('span', 'gkmb3-pill', 'Discer: ' + STATE.discs.length));
    hero.appendChild(pills);

    var heroActions = el('div', 'gkmb3-toolbar');
    heroActions.style.marginTop = '12px';

    var logoutBtn = el('button', 'gkmb3-btn secondary', 'Logg ut');
    logoutBtn.type = 'button';
    logoutBtn.onclick = logout;
    heroActions.appendChild(logoutBtn);

    hero.appendChild(heroActions);

    var heroStatus = el('div', 'gkmb3-status ok', 'Klar.');
    heroStatus.id = 'gkmb3-status';
    hero.appendChild(heroStatus);

    shell.appendChild(hero);
    shell.appendChild(renderTop3());

    var layout = el('div', 'gkmb3-layout');

    var left = el('div', '');
    left.appendChild(renderBagManager());
    left.appendChild(renderRecommendationPanel());
    left.appendChild(renderBagContents());

    var right = el('div', 'gkmb3-sticky');
    right.appendChild(renderAddPanel());

    layout.appendChild(left);
    layout.appendChild(right);
    shell.appendChild(layout);

    root.appendChild(shell);
  }

  function renderLogin() {
    var wrap = el('div', 'gkmb3-login');

    var input = el('input', 'gkmb3-input');
    input.id = 'gkmb3-email';
    input.type = 'email';
    input.autocomplete = 'email';
    input.placeholder = 'din@epost.no';

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendMagicLink();
    });

    var btn = el('button', 'gkmb3-btn', 'Send innloggingslenke');
    btn.type = 'button';
    btn.onclick = sendMagicLink;

    wrap.appendChild(input);
    wrap.appendChild(btn);
    wrap.appendChild(el(
      'div',
      'gkmb3-note',
      'Ingen passord nødvendig. Etter innlogging kommer du tilbake til golfkongen.no/sider/min-bag.'
    ));

    return wrap;
  }

  function currentStoreBagSelection(bagId) {
    return STATE.storeBagSelections[bagId] || null;
  }

  function renderBagPhotoManager(bag) {
    var wrap = el('div', 'gkmb3-bagphoto');

    var visual = el('div', 'gkmb3-bagphoto-img');
    var ownSignedUrl = STATE.bagImageUrls[bag.id] || '';
    var storeSelection = currentStoreBagSelection(bag.id);
    var storeProductId = storeSelection
      ? safe(storeSelection.quickbutik_product_id)
      : '';
    var storeImageUrl = storeProductId
      ? (STATE.storeBagImageUrls[storeProductId] || '')
      : '';
    var shownUrl = storeSelection ? storeImageUrl : ownSignedUrl;

    if (shownUrl) {
      var img = document.createElement('img');
      img.src = shownUrl;
      img.alt = storeSelection
        ? safe(storeSelection.product_name || bag.name)
        : 'Bilde av ' + safe(bag.name);
      img.loading = 'lazy';
      visual.appendChild(img);
    } else {
      visual.appendChild(document.createTextNode('🎒'));

      if (storeProductId) {
        setTimeout(function () {
          ensureStoreBagImage(storeProductId).then(function () {
            render();
          });
        }, 0);
      }
    }

    var info = el('div', 'gkmb3-bagphoto-info');
    info.appendChild(el('div', 'gkmb3-bagphoto-name', safe(bag.name)));

    if (storeSelection) {
      info.appendChild(el(
        'div',
        'gkmb3-bagsource',
        '🛍 GolfKongen-sekk · ' + safe(storeSelection.product_name || 'Valgt sekk')
      ));
    } else if (bag.image_url) {
      info.appendChild(el('div', 'gkmb3-bagsource', '📷 Eget bilde'));
    }

    info.appendChild(el(
      'div',
      'gkmb3-bagphoto-help',
      'Velg en sekk fra GolfKongen eller bruk ditt eget bilde. Valget gjelder bare denne bagen.'
    ));

    var actions = el('div', 'gkmb3-bagphoto-actions');

    var storeChoose = el(
      'button',
      'gkmb3-btn secondary',
      STATE.storeBagPickerOpen ? 'Lukk sekkvalg' : '🛍 Velg GolfKongen-sekk'
    );
    storeChoose.type = 'button';
    storeChoose.disabled = !!STATE.storeBagBusy || !!STATE.bagImageBusy;
    storeChoose.onclick = function () {
      if (STATE.storeBagBusy || STATE.bagImageBusy) return;
      STATE.storeBagPickerOpen = !STATE.storeBagPickerOpen;
      render();
    };
    actions.appendChild(storeChoose);

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.style.display = 'none';

    input.onchange = function () {
      var file = input.files && input.files[0] ? input.files[0] : null;
      if (!file) return;
      uploadBagImage(bag, file);
      input.value = '';
    };

    if (storeSelection && bag.image_url) {
      var useOwn = el('button', 'gkmb3-btn secondary', '📷 Bruk eget bilde');
      useOwn.type = 'button';
      useOwn.disabled = !!STATE.storeBagBusy || !!STATE.bagImageBusy;
      useOwn.onclick = function () {
        setGolfkongenBag(bag, null);
      };
      actions.appendChild(useOwn);
    }

    var chooseOwn = el(
      'button',
      'gkmb3-btn secondary',
      bag.image_url ? '📷 Last opp nytt bilde' : '📷 Last opp eget bilde'
    );
    chooseOwn.type = 'button';
    chooseOwn.disabled = !!STATE.bagImageBusy || !!STATE.storeBagBusy;
    chooseOwn.onclick = function () {
      if (!STATE.bagImageBusy && !STATE.storeBagBusy) input.click();
    };

    actions.appendChild(chooseOwn);
    actions.appendChild(input);

    if (!storeSelection && bag.image_url) {
      var remove = el('button', 'gkmb3-btn secondary', 'Fjern bilde');
      remove.type = 'button';
      remove.disabled = !!STATE.bagImageBusy || !!STATE.storeBagBusy;
      remove.onclick = function () {
        removeBagImage(bag);
      };
      actions.appendChild(remove);
    }

    info.appendChild(actions);
    wrap.appendChild(visual);
    wrap.appendChild(info);

    return wrap;
  }

  function renderStoreBagPicker(bag) {
    var picker = el('div', 'gkmb3-storepicker');
    var head = el('div', 'gkmb3-storepicker-head');
    var text = el('div', '');

    text.appendChild(el('div', 'gkmb3-storepicker-title', 'Velg sekken din fra GolfKongen'));
    text.appendChild(el(
      'div',
      'gkmb3-storepicker-note',
      'Produkter på lager vises først. Utsolgte modeller kan fortsatt velges hvis det er sekken du eier.'
    ));
    head.appendChild(text);

    var close = el('button', 'gkmb3-btn secondary', 'Lukk');
    close.type = 'button';
    close.style.minHeight = '34px';
    close.style.padding = '6px 9px';
    close.style.fontSize = '10px';
    close.onclick = function () {
      STATE.storeBagPickerOpen = false;
      render();
    };
    head.appendChild(close);
    picker.appendChild(head);

    if (!STATE.storeBags.length) {
      picker.appendChild(el('div', 'gkmb3-empty', 'Fant ingen GolfKongen-sekker akkurat nå.'));
      return picker;
    }

    var grid = el('div', 'gkmb3-storegrid');
    var selected = currentStoreBagSelection(bag.id);
    var selectedId = selected ? safe(selected.quickbutik_product_id) : '';

    for (var i = 0; i < STATE.storeBags.length; i += 1) {
      (function (product) {
        var productId = safe(product.quickbutik_product_id);
        var card = el('div', 'gkmb3-storebag' + (productId === selectedId ? ' selected' : ''));
        var pick = el('button', 'gkmb3-storebag-pick');
        pick.type = 'button';
        pick.disabled = !!STATE.storeBagBusy;
        pick.onclick = function () {
          setGolfkongenBag(bag, product);
        };

        var image = el('div', 'gkmb3-storebag-img', 'Henter bilde…');
        var cached = STATE.storeBagImageUrls[productId] || '';

        if (cached) {
          clear(image);
          var img = document.createElement('img');
          img.src = cached;
          img.alt = safe(product.name || 'GolfKongen-sekk');
          img.loading = 'lazy';
          image.appendChild(img);
        } else {
          setTimeout(function () {
            observeStoreBagImage(image, productId, product.name);
          }, 0);
        }

        pick.appendChild(image);

        var body = el('div', '');
        body.appendChild(el('div', 'gkmb3-storebag-name', safe(product.name)));

        var meta = [];
        if (product.price_nok !== null && product.price_nok !== undefined) {
          meta.push(Math.round(Number(product.price_nok)) + ' kr');
        }

        if (product.stock_quantity !== null && product.stock_quantity !== undefined) {
          var stock = Number(product.stock_quantity);
          meta.push(stock > 0 ? 'På lager' : 'Utsolgt');
        }

        if (productId === selectedId) meta.push('✓ Valgt');
        body.appendChild(el('div', 'gkmb3-storebag-meta', meta.join(' · ')));
        pick.appendChild(body);
        card.appendChild(pick);

        if (product.product_url) {
          var link = el('a', 'gkmb3-storebag-link', 'Se produkt ↗');
          link.href = product.product_url;
          link.target = '_blank';
          link.rel = 'noopener';
          card.appendChild(link);
        }

        grid.appendChild(card);
      })(STATE.storeBags[i]);
    }

    picker.appendChild(grid);
    return picker;
  }

  function nextBagDefaultName() {
    return 'Bag ' + (STATE.bags.length + 1);
  }

  function renderNewBagForm() {
    var panel = el('div', 'gkmb3-bagform');
    panel.appendChild(el('div', 'gkmb3-bagform-title', 'Opprett ny bag'));
    panel.appendChild(el(
      'div',
      'gkmb3-bagform-note',
      'Gi bagen et navn du kjenner igjen, for eksempel Turneringsbag, Glowbag eller Sommerbag.'
    ));

    var row = el('div', 'gkmb3-bagform-row');

    var field = el('label', 'gkmb3-field');
    field.appendChild(document.createTextNode('Navn på bag'));
    var input = el('input', 'gkmb3-input');
    input.id = 'gkmb3-new-bag-name';
    input.type = 'text';
    input.maxLength = 80;
    input.value = nextBagDefaultName();
    input.placeholder = 'F.eks. Turneringsbag';
    input.onkeydown = function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        createBagFromForm();
      }
    };
    field.appendChild(input);
    row.appendChild(field);

    var actions = el('div', 'gkmb3-bagform-actions');
    var save = el('button', 'gkmb3-btn', STATE.bagActionBusy ? 'Oppretter…' : 'Opprett bag');
    save.type = 'button';
    save.disabled = STATE.bagActionBusy;
    save.onclick = createBagFromForm;
    actions.appendChild(save);

    var cancel = el('button', 'gkmb3-btn secondary', 'Avbryt');
    cancel.type = 'button';
    cancel.disabled = STATE.bagActionBusy;
    cancel.onclick = function () {
      STATE.newBagOpen = false;
      render();
      status('Ny bag ble ikke opprettet.', '');
    };
    actions.appendChild(cancel);

    row.appendChild(actions);
    panel.appendChild(row);
    return panel;
  }

  function renderRenameBagForm(bag) {
    var panel = el('div', 'gkmb3-bagform');
    panel.appendChild(el('div', 'gkmb3-bagform-title', 'Endre navn på denne bagen'));
    panel.appendChild(el(
      'div',
      'gkmb3-bagform-note',
      'Dette endrer bare navnet. Discer, sekkvalg, bilde og hovedbag-status beholdes.'
    ));

    var row = el('div', 'gkmb3-bagform-row');

    var field = el('label', 'gkmb3-field');
    field.appendChild(document.createTextNode('Bag-navn'));
    var input = el('input', 'gkmb3-input');
    input.id = 'gkmb3-rename-bag-name';
    input.type = 'text';
    input.maxLength = 80;
    input.value = safe(bag.name);
    input.placeholder = 'F.eks. Turneringsbag';
    input.onkeydown = function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        renameBagFromForm(bag);
      }
    };
    field.appendChild(input);
    row.appendChild(field);

    var actions = el('div', 'gkmb3-bagform-actions');
    var save = el('button', 'gkmb3-btn', STATE.bagActionBusy ? 'Lagrer…' : 'Lagre navn');
    save.type = 'button';
    save.disabled = STATE.bagActionBusy;
    save.onclick = function () {
      renameBagFromForm(bag);
    };
    actions.appendChild(save);

    var cancel = el('button', 'gkmb3-btn secondary', 'Avbryt');
    cancel.type = 'button';
    cancel.disabled = STATE.bagActionBusy;
    cancel.onclick = function () {
      STATE.renameBagOpen = false;
      render();
      status('Navnet ble ikke endret.', '');
    };
    actions.appendChild(cancel);

    row.appendChild(actions);
    panel.appendChild(row);
    return panel;
  }

  function renderBagManager() {
    var card = el('section', 'gkmb3-card');
    card.appendChild(el('h3', '', 'Dine bager'));
    card.appendChild(el('p', '', 'Velg aktiv bag eller opprett en ny. Én bag er alltid satt som hovedbag.'));

    var bagsRow = el('div', 'gkmb3-bags');

    for (var i = 0; i < STATE.bags.length; i += 1) {
      (function (bag) {
        var label = bag.name;
        if (bag.is_default) label += ' ★';
        if (bag.disc_count !== undefined && bag.disc_count !== null) {
          label += ' · ' + bag.disc_count;
        }

        var btn = el(
          'button',
          'gkmb3-bagbtn' + (bag.id === STATE.activeBagId ? ' active' : ''),
          label
        );
        btn.type = 'button';
        btn.onclick = function () {
          selectBag(bag.id);
        };
        bagsRow.appendChild(btn);
      })(STATE.bags[i]);
    }

    card.appendChild(bagsRow);

    var current = activeBag();

    if (current) {
      card.appendChild(renderBagPhotoManager(current));

      if (STATE.storeBagPickerOpen) {
        card.appendChild(renderStoreBagPicker(current));
      }
    }

    var toolbar = el('div', 'gkmb3-toolbar');

    var newBag = el('button', 'gkmb3-btn secondary', STATE.newBagOpen ? 'Lukk ny bag' : '+ Ny bag');
    newBag.type = 'button';
    newBag.disabled = STATE.bagActionBusy;
    newBag.onclick = function () {
      STATE.newBagOpen = !STATE.newBagOpen;
      STATE.renameBagOpen = false;
      render();
      if (STATE.newBagOpen) {
        setTimeout(function () {
          var input = document.getElementById('gkmb3-new-bag-name');
          if (input) {
            input.focus();
            input.select();
          }
        }, 0);
      }
    };
    toolbar.appendChild(newBag);

    if (current) {
      var renameBtn = el('button', 'gkmb3-btn secondary', STATE.renameBagOpen ? 'Lukk navneendring' : '✏ Endre navn');
      renameBtn.type = 'button';
      renameBtn.disabled = STATE.bagActionBusy;
      renameBtn.onclick = function () {
        STATE.renameBagOpen = !STATE.renameBagOpen;
        STATE.newBagOpen = false;
        render();
        if (STATE.renameBagOpen) {
          setTimeout(function () {
            var input = document.getElementById('gkmb3-rename-bag-name');
            if (input) {
              input.focus();
              input.select();
            }
          }, 0);
        }
      };
      toolbar.appendChild(renameBtn);
    }

    if (current && !current.is_default) {
      var defaultBtn = el('button', 'gkmb3-btn secondary', 'Sett som hovedbag');
      defaultBtn.type = 'button';
      defaultBtn.disabled = STATE.bagActionBusy;
      defaultBtn.onclick = function () {
        setDefaultBag(current.id);
      };
      toolbar.appendChild(defaultBtn);

      var deleteBtn = el('button', 'gkmb3-btn danger', 'Slett bag');
      deleteBtn.type = 'button';
      deleteBtn.disabled = STATE.bagActionBusy;
      deleteBtn.onclick = function () {
        deleteBag(current);
      };
      toolbar.appendChild(deleteBtn);
    }

    card.appendChild(toolbar);

    if (current && STATE.renameBagOpen) {
      card.appendChild(renderRenameBagForm(current));
    }

    if (STATE.newBagOpen) {
      card.appendChild(renderNewBagForm());
    }

    return card;
  }


  function bagSummaryCounts() {
    var counts = {
      total: STATE.discs.length,
      putter: 0,
      midrange: 0,
      fairway: 0,
      distance: 0,
      favorites: 0
    };

    for (var i = 0; i < STATE.discs.length; i += 1) {
      var disc = STATE.discs[i];

      if (counts[disc.disc_type] !== undefined) {
        counts[disc.disc_type] += 1;
      }

      if (disc.is_favorite) counts.favorites += 1;
    }

    return counts;
  }

  function renderBagSummary() {
    var counts = bagSummaryCounts();
    var wrap = el('div', 'gkmb3-bagsummary');

    var rows = [
      'Totalt ' + counts.total,
      'Putter ' + counts.putter,
      'Midrange ' + counts.midrange,
      'Fairway ' + counts.fairway,
      'Distance ' + counts.distance,
      '★ ' + counts.favorites
    ];

    for (var i = 0; i < rows.length; i += 1) {
      wrap.appendChild(el('span', '', rows[i]));
    }

    return wrap;
  }

  function discMatchesBagView(disc) {
    if (!disc) return false;

    var filter = STATE.bagFilter || 'all';

    if (filter === 'favorites' && !disc.is_favorite) return false;

    if (
      filter !== 'all' &&
      filter !== 'favorites' &&
      disc.disc_type !== filter
    ) {
      return false;
    }

    var wanted = trim(STATE.bagSearch).toLowerCase();
    if (!wanted) return true;

    var haystack = [
      disc.name,
      disc.mold_name,
      disc.brand,
      disc.plastic,
      disc.color,
      disc.note,
      disc.disc_type
    ].map(safe).join(' ').toLowerCase();

    return haystack.indexOf(wanted) >= 0;
  }

  function renderBagTools() {
    var wrap = el('div', 'gkmb3-bagtools');

    var searchField = el('label', 'gkmb3-field');
    searchField.appendChild(document.createTextNode('Søk i bagen'));

    var search = el('input', 'gkmb3-input');
    search.type = 'search';
    search.placeholder = 'Navn, merke, plast, farge eller notat';
    search.value = STATE.bagSearch || '';
    search.oninput = function () {
      STATE.bagSearch = search.value || '';
      render();
      var next = document.querySelector('#' + CONFIG.ROOT_ID + ' .gkmb3-bagtools input[type="search"]');
      if (next) {
        next.focus();
        try {
          next.setSelectionRange(next.value.length, next.value.length);
        } catch (_) {}
      }
    };

    searchField.appendChild(search);
    wrap.appendChild(searchField);

    var filterField = el('label', 'gkmb3-field');
    filterField.appendChild(document.createTextNode('Vis'));

    var filter = el('select', 'gkmb3-select');

    var options = [
      ['all', 'Alle discer'],
      ['favorites', '★ Favoritter'],
      ['putter', 'Puttere'],
      ['midrange', 'Midrange'],
      ['fairway', 'Fairway'],
      ['distance', 'Distance']
    ];

    for (var i = 0; i < options.length; i += 1) {
      var option = document.createElement('option');
      option.value = options[i][0];
      option.textContent = options[i][1];
      if ((STATE.bagFilter || 'all') === options[i][0]) option.selected = true;
      filter.appendChild(option);
    }

    filter.onchange = function () {
      STATE.bagFilter = safe(filter.value) || 'all';
      render();
    };

    filterField.appendChild(filter);
    wrap.appendChild(filterField);

    return wrap;
  }


  function recoLabel(value, kind) {
    var maps = {
      skill: {
        beginner: 'Nybegynner',
        intermediate: 'Litt erfaren',
        advanced: 'Erfaren'
      },
      distance: {
        under_60: 'Under 60 m',
        '60_80': '60–80 m',
        '80_100': '80–100 m',
        '100_120': '100–120 m',
        '120_plus': '120+ m'
      },
      hand: {
        right: 'Høyrehendt',
        left: 'Venstrehendt'
      },
      throwStyle: {
        backhand: 'Mest backhand',
        forehand: 'Mest forehand',
        both: 'Backhand + forehand'
      },
      course: {
        technical: 'Teknisk / skog',
        open: 'Åpent / lengde',
        mixed: 'Blandet bane'
      },
      wind: {
        normal: 'Lite / normal vind',
        windy: 'Mye vind',
        mixed: 'Variert vind'
      }
    };

    return maps[kind] && maps[kind][value]
      ? maps[kind][value]
      : safe(value);
  }

  function createRecoSelect(id, options, currentValue) {
    var select = el('select', 'gkmb3-select');
    select.id = id;

    for (var i = 0; i < options.length; i += 1) {
      var option = document.createElement('option');
      option.value = options[i][0];
      option.textContent = options[i][1];
      if (safe(currentValue) === options[i][0]) option.selected = true;
      select.appendChild(option);
    }

    return select;
  }

  function renderRecoProfileForm() {
    var profile = STATE.recoProfile || {
      skill_level: 'intermediate',
      throw_distance_band: '60_80',
      handedness: 'right',
      throw_style: 'both',
      course_style: 'mixed',
      wind_style: 'mixed',
      include_putter_recommendations: false
    };

    var form = el('div', 'gkmb3-recoform');
    var grid = el('div', 'gkmb3-recogrid');

    grid.appendChild(field(
      'Nivå',
      createRecoSelect(
        'gkmb3-reco-skill',
        [
          ['beginner', 'Nybegynner'],
          ['intermediate', 'Litt erfaren'],
          ['advanced', 'Erfaren']
        ],
        profile.skill_level
      )
    ));

    grid.appendChild(field(
      'Kontrollert kastelengde',
      createRecoSelect(
        'gkmb3-reco-distance',
        [
          ['under_60', 'Under 60 m'],
          ['60_80', '60–80 m'],
          ['80_100', '80–100 m'],
          ['100_120', '100–120 m'],
          ['120_plus', '120+ m']
        ],
        profile.throw_distance_band
      )
    ));

    grid.appendChild(field(
      'Kastehånd',
      createRecoSelect(
        'gkmb3-reco-hand',
        [
          ['right', 'Høyrehendt'],
          ['left', 'Venstrehendt']
        ],
        profile.handedness
      )
    ));

    grid.appendChild(field(
      'Kastestil',
      createRecoSelect(
        'gkmb3-reco-throw-style',
        [
          ['backhand', 'Mest backhand'],
          ['forehand', 'Mest forehand'],
          ['both', 'Backhand + forehand']
        ],
        profile.throw_style
      )
    ));

    grid.appendChild(field(
      'Banetype',
      createRecoSelect(
        'gkmb3-reco-course',
        [
          ['technical', 'Teknisk / skog'],
          ['open', 'Åpent / lengde'],
          ['mixed', 'Blandet bane']
        ],
        profile.course_style
      )
    ));

    grid.appendChild(field(
      'Vind',
      createRecoSelect(
        'gkmb3-reco-wind',
        [
          ['normal', 'Lite / normal vind'],
          ['windy', 'Mye vind'],
          ['mixed', 'Variert vind']
        ],
        profile.wind_style
      )
    ));

    form.appendChild(grid);

    var putterLabel = el('label', 'gkmb3-check');
    var putter = document.createElement('input');
    putter.id = 'gkmb3-reco-putter';
    putter.type = 'checkbox';
    putter.checked = !!profile.include_putter_recommendations;
    putterLabel.appendChild(putter);
    putterLabel.appendChild(document.createTextNode('Ta med puttere i anbefalingene'));
    form.appendChild(putterLabel);

    var actions = el('div', 'gkmb3-toolbar');

    var save = el(
      'button',
      'gkmb3-btn',
      STATE.recoBusy ? 'Lagrer profil…' : 'Lagre spillerprofil'
    );
    save.type = 'button';
    save.disabled = !!STATE.recoBusy;
    save.onclick = saveRecoProfile;
    actions.appendChild(save);

    if (STATE.recoProfile) {
      var cancel = el('button', 'gkmb3-btn secondary', 'Avbryt');
      cancel.type = 'button';
      cancel.disabled = !!STATE.recoBusy;
      cancel.onclick = function () {
        STATE.recoProfileOpen = false;
        render();
      };
      actions.appendChild(cancel);
    }

    form.appendChild(actions);
    return form;
  }

  function recoPriorityLabel(priority) {
    priority = Number(priority) || 0;
    if (priority >= 90) return 'Høy prioritet';
    if (priority >= 75) return 'Viktig';
    if (priority >= 60) return 'Verdt å se på';
    return 'Lavere prioritet';
  }

  function recoTypeLabel(type) {
    if (type === 'putter') return 'Putter';
    if (type === 'midrange') return 'Midrange';
    if (type === 'fairway') return 'Fairway';
    if (type === 'distance') return 'Distance';
    return safe(type);
  }

  function recoStabilityLabel(stability) {
    if (stability === 'understable') return 'Understabil';
    if (stability === 'neutral') return 'Nøytral';
    if (stability === 'stable') return 'Stabil';
    if (stability === 'overstable') return 'Overstabil';
    return safe(stability);
  }

  function recommendationsForFinding(finding) {
    if (!finding || finding.finding_type !== 'gap') return [];

    var rows = [];

    for (var i = 0; i < STATE.recoProducts.length; i += 1) {
      var row = STATE.recoProducts[i];

      if (
        row.gap_disc_type === finding.disc_type &&
        row.gap_stability === finding.stability
      ) {
        rows.push(row);
      }
    }

    rows.sort(function (a, b) {
      return Number(a.match_rank || 999) - Number(b.match_rank || 999);
    });

    return rows;
  }

  function recommendationAsCatalogProduct(rec) {
    return {
      id: rec.catalog_id,
      product_name: rec.product_name,
      brand: rec.brand,
      mold_name: rec.mold_name,
      plastic: rec.plastic,
      disc_type: rec.disc_type,
      speed: rec.speed,
      glide: rec.glide,
      turn: rec.turn,
      fade: rec.fade,
      price_nok: rec.price_nok,
      image_url: rec.image_url,
      product_url: rec.product_url
    };
  }

  function renderRecommendationMatch(rec) {
    var row = el(
      'article',
      'gkmb3-recomatch' + (Number(rec.match_rank) === 1 ? ' best' : '')
    );

    var image = el('div', 'gkmb3-recomatch-img');

    if (rec.image_url) {
      var img = document.createElement('img');
      img.src = rec.image_url;
      img.alt = rec.product_name || 'Anbefalt disc';
      img.loading = 'lazy';
      image.appendChild(img);
    } else {
      image.textContent = 'DISC';
    }

    row.appendChild(image);

    var body = el('div', '');
    var top = el('div', 'gkmb3-recomatch-top');

    var nameText =
      (Number(rec.match_rank) ? '#' + Number(rec.match_rank) + ' ' : '') +
      safe(rec.product_name);

    top.appendChild(el('div', 'gkmb3-recomatch-name', nameText));
    top.appendChild(el(
      'div',
      'gkmb3-recomatch-score',
      Math.round(Number(rec.match_score) || 0) + ' % match'
    ));

    body.appendChild(top);

    var sub = [];
    if (rec.brand) sub.push(rec.brand);
    if (rec.plastic) sub.push(rec.plastic);
    sub.push(recoTypeLabel(rec.disc_type));

    body.appendChild(el('div', 'gkmb3-recomatch-sub', sub.join(' · ')));
    body.appendChild(renderFlight(rec.speed, rec.glide, rec.turn, rec.fade));

    if (rec.match_reason) {
      body.appendChild(el(
        'div',
        'gkmb3-recomatch-reason',
        safe(rec.match_reason)
      ));
    }

    if (rec.price_nok !== null && rec.price_nok !== undefined) {
      body.appendChild(el(
        'div',
        'gkmb3-recomatch-price',
        safe(rec.price_nok) + ' kr · På lager'
      ));
    } else {
      body.appendChild(el(
        'div',
        'gkmb3-recomatch-price',
        'På lager'
      ));
    }

    var toolbar = el('div', 'gkmb3-toolbar');

    var add = el('button', 'gkmb3-btn', 'Legg i denne bagen');
    add.type = 'button';
    add.onclick = function () {
      addRecommendedDisc(rec);
    };
    toolbar.appendChild(add);

    if (rec.product_url) {
      var open = el('a', 'gkmb3-btn secondary', 'Se produkt');
      open.href = rec.product_url;
      open.target = '_blank';
      open.rel = 'noopener';
      toolbar.appendChild(open);
    }

    body.appendChild(toolbar);
    row.appendChild(body);

    return row;
  }

  function localFunChallenge() {
    if (STATE.discs.length) {
      var index =
        Math.abs(Number(STATE.funRecommendationsPage) || 0) %
        STATE.discs.length;

      var disc = STATE.discs[index];
      var discName =
        safe(disc.mold_name || disc.name || 'en disc fra bagen');

      return {
        challenge_only: true,
        fun_label: 'Bag-utfordring',
        product_name: discName,
        fun_reason:
          'Spill de neste 3 hullene med bare ' +
          discName +
          '. Prøv minst én linje eller vinkel du vanligvis ikke ville valgt.'
      };
    }

    return {
      challenge_only: true,
      fun_label: 'Mini-bag challenge',
      product_name: '3 discer – 1 runde',
      fun_reason:
        'Velg én putter, én midrange og én driver og spill en runde uten andre discer. En enkel måte å lære flightene bedre på.'
    };
  }

  function renderFunRecommendation(rec, index) {
    if (rec.challenge_only) {
      var challenge = el('div', 'gkmb3-funchallenge');
      challenge.appendChild(el(
        'strong',
        '',
        '🎲 ' + safe(rec.fun_label) + ': ' + safe(rec.product_name)
      ));
      challenge.appendChild(el(
        'div',
        '',
        safe(rec.fun_reason)
      ));
      return challenge;
    }

    var row = el(
      'article',
      'gkmb3-recomatch' + (index === 0 ? ' best' : '')
    );

    var image = el('div', 'gkmb3-recomatch-img');

    if (rec.image_url) {
      var img = document.createElement('img');
      img.src = rec.image_url;
      img.alt = rec.product_name || 'Gøy disc å prøve';
      img.loading = 'lazy';
      image.appendChild(img);
    } else {
      image.textContent = 'DISC';
    }

    row.appendChild(image);

    var body = el('div', '');
    var top = el('div', 'gkmb3-recomatch-top');

    top.appendChild(el(
      'div',
      'gkmb3-recomatch-name',
      safe(rec.product_name)
    ));

    top.appendChild(el(
      'div',
      'gkmb3-funbadge',
      '🎲 ' + safe(rec.fun_label || 'Wildcard')
    ));

    body.appendChild(top);

    var sub = [];
    if (rec.brand) sub.push(rec.brand);
    if (rec.plastic) sub.push(rec.plastic);
    if (rec.disc_type) sub.push(recoTypeLabel(rec.disc_type));

    if (sub.length) {
      body.appendChild(el(
        'div',
        'gkmb3-recomatch-sub',
        sub.join(' · ')
      ));
    }

    body.appendChild(renderFlight(
      rec.speed,
      rec.glide,
      rec.turn,
      rec.fade
    ));

    if (rec.fun_reason) {
      body.appendChild(el(
        'div',
        'gkmb3-recomatch-reason',
        safe(rec.fun_reason)
      ));
    }

    body.appendChild(el(
      'div',
      'gkmb3-recomatch-price',
      rec.price_nok !== null && rec.price_nok !== undefined
        ? safe(rec.price_nok) + ' kr · På lager'
        : 'På lager'
    ));

    var toolbar = el('div', 'gkmb3-toolbar');

    var add = el('button', 'gkmb3-btn', 'Legg i denne bagen');
    add.type = 'button';
    add.onclick = function () {
      addFunRecommendedDisc(rec);
    };
    toolbar.appendChild(add);

    if (rec.product_url) {
      var open = el('a', 'gkmb3-btn secondary', 'Se produkt');
      open.href = rec.product_url;
      open.target = '_blank';
      open.rel = 'noopener';
      toolbar.appendChild(open);
    }

    body.appendChild(toolbar);
    row.appendChild(body);

    return row;
  }

  function renderFunRecommendations() {
    var wrap = el('section', 'gkmb3-fun');

    var head = el('div', 'gkmb3-funhead');
    var textWrap = el('div', '');

    textWrap.appendChild(el('h4', '', '🎲 Gøy å prøve'));
    textWrap.appendChild(el(
      'p',
      '',
      'Denne delen blir ikke ferdig selv om bagen blir komplett. Her får du nye molds, litt mer utfordrende flights og wildcards bare fordi discgolf skal være gøy.'
    ));
    head.appendChild(textWrap);

    var refresh = el(
      'button',
      'gkmb3-btn secondary',
      STATE.funRecommendationsBusy ? 'Finner nye…' : '🎲 Gi meg 3 nye'
    );
    refresh.type = 'button';
    refresh.disabled = !!STATE.funRecommendationsBusy;
    refresh.onclick = refreshFunRecommendations;
    head.appendChild(refresh);

    wrap.appendChild(head);

    if (!STATE.funRecommendationsLoaded) {
      wrap.appendChild(el(
        'div',
        'gkmb3-note',
        'Finner noen morsomme utfordringer…'
      ));
      return wrap;
    }

    var rows = STATE.funRecommendations.slice(0, 3);

    // Denne kategorien skal aldri stå tom.
    if (!rows.length) {
      rows = [localFunChallenge()];
    }

    var list = el('div', 'gkmb3-funlist');

    for (var i = 0; i < rows.length; i += 1) {
      list.appendChild(renderFunRecommendation(rows[i], i));
    }

    wrap.appendChild(list);
    return wrap;
  }

  function renderRecommendationPanel() {
    var card = el('section', 'gkmb3-card gkmb3-reco');
    var head = el('div', 'gkmb3-recohead');
    var headText = el('div', '');

    headText.appendChild(el('h3', '', '🎯 Mine anbefalinger'));
    headText.appendChild(el(
      'p',
      '',
      'Min Bag analyserer spilleren og akkurat denne bagen, finner hull og viser konkrete GolfKongen-discer som passer profilen din.'
    ));
    head.appendChild(headText);

    if (STATE.recoProfile) {
      var edit = el(
        'button',
        'gkmb3-btn secondary',
        STATE.recoProfileOpen ? 'Lukk profil' : '✏ Endre profil'
      );
      edit.type = 'button';
      edit.disabled = !!STATE.recoBusy;
      edit.onclick = function () {
        STATE.recoProfileOpen = !STATE.recoProfileOpen;
        render();
      };
      head.appendChild(edit);
    }

    card.appendChild(head);

    if (!STATE.recoProfileLoaded) {
      card.appendChild(el('div', 'gkmb3-empty', 'Laster spillerprofil…'));
      return card;
    }

    if (!STATE.recoProfile) {
      var intro = el('div', 'gkmb3-note');
      intro.textContent =
        'Svar på seks enkle spørsmål én gang. Profilen kan endres når som helst og brukes til å gjøre anbefalingene relevante for kastelengden og spillestilen din.';
      card.appendChild(intro);
      card.appendChild(renderRecoProfileForm());
      return card;
    }

    var pills = el('div', 'gkmb3-recopills');
    pills.appendChild(el('span', 'gkmb3-recopill', recoLabel(STATE.recoProfile.skill_level, 'skill')));
    pills.appendChild(el('span', 'gkmb3-recopill', recoLabel(STATE.recoProfile.throw_distance_band, 'distance')));
    pills.appendChild(el('span', 'gkmb3-recopill', recoLabel(STATE.recoProfile.handedness, 'hand')));
    pills.appendChild(el('span', 'gkmb3-recopill', recoLabel(STATE.recoProfile.throw_style, 'throwStyle')));
    pills.appendChild(el('span', 'gkmb3-recopill', recoLabel(STATE.recoProfile.course_style, 'course')));
    pills.appendChild(el('span', 'gkmb3-recopill', recoLabel(STATE.recoProfile.wind_style, 'wind')));

    if (STATE.recoProfile.include_putter_recommendations) {
      pills.appendChild(el('span', 'gkmb3-recopill', 'Puttere med'));
    }

    card.appendChild(pills);

    if (STATE.recoProfileOpen) {
      card.appendChild(renderRecoProfileForm());
      return card;
    }

    if (!STATE.discs.length) {
      var emptyBag = el('div', 'gkmb3-empty');
      emptyBag.appendChild(el('strong', '', 'Legg noen discer i bagen først'));
      emptyBag.appendChild(el(
        'div',
        '',
        'Når bagen har discer analyserer vi flight-dekning, speed-områder og mulig overlapp.'
      ));
      card.appendChild(emptyBag);
      card.appendChild(renderFunRecommendations());
      return card;
    }

    if (!STATE.recoLoaded) {
      card.appendChild(el('div', 'gkmb3-empty', 'Analyserer bagen…'));
      return card;
    }

    if (!STATE.recoFindings.length) {
      var clean = el('div', 'gkmb3-empty');
      clean.appendChild(el('strong', '', 'Ingen tydelige hull funnet'));
      clean.appendChild(el(
        'div',
        '',
        'Analysen finner ingen klare mangler eller kraftig overlapp i denne bagen akkurat nå.'
      ));
      card.appendChild(clean);
      card.appendChild(renderFunRecommendations());
      return card;
    }

    var list = el('div', 'gkmb3-recolist');
    var max = Math.min(6, STATE.recoFindings.length);

    for (var i = 0; i < max; i += 1) {
      var finding = STATE.recoFindings[i];
      var item = el(
        'div',
        'gkmb3-recofinding ' + (finding.finding_type === 'overlap' ? 'overlap' : 'gap')
      );

      var itemHead = el('div', 'gkmb3-recofinding-head');
      var title = (finding.finding_type === 'overlap' ? '♻️ ' : '🎯 ') + safe(finding.title);
      itemHead.appendChild(el('div', 'gkmb3-recofinding-title', title));
      itemHead.appendChild(el(
        'div',
        'gkmb3-recofinding-priority',
        recoPriorityLabel(finding.priority)
      ));
      item.appendChild(itemHead);

      item.appendChild(el(
        'div',
        'gkmb3-recofinding-reason',
        safe(finding.reason)
      ));

      var meta = [];
      if (finding.disc_type) meta.push(recoTypeLabel(finding.disc_type));
      if (finding.stability) meta.push(recoStabilityLabel(finding.stability));

      if (
        finding.target_speed_min !== null &&
        finding.target_speed_min !== undefined &&
        finding.target_speed_max !== null &&
        finding.target_speed_max !== undefined
      ) {
        var minSpeed = Number(finding.target_speed_min);
        var maxSpeed = Number(finding.target_speed_max);
        meta.push(
          minSpeed === maxSpeed
            ? 'Speed ' + minSpeed
            : 'Speed ' + minSpeed + '–' + maxSpeed
        );
      }

      if (finding.finding_type === 'overlap' && Number(finding.disc_count) > 0) {
        meta.push(Number(finding.disc_count) + ' discer');
      }

      if (meta.length) {
        item.appendChild(el('div', 'gkmb3-recofinding-meta', meta.join(' · ')));
      }

      if (finding.finding_type === 'gap') {
        if (!STATE.recoProductsLoaded) {
          item.appendChild(el(
            'div',
            'gkmb3-note',
            'Finner de beste GolfKongen-matchene…'
          ));
        } else {
          var matches = recommendationsForFinding(finding);

          if (matches.length) {
            var matchList = el('div', 'gkmb3-recomatches');

            for (var j = 0; j < matches.length; j += 1) {
              matchList.appendChild(renderRecommendationMatch(matches[j]));
            }

            item.appendChild(matchList);
          } else {
            item.appendChild(el(
              'div',
              'gkmb3-note',
              'Ingen god lagerført GolfKongen-match for akkurat dette gapet nå.'
            ));
          }
        }
      }

      list.appendChild(item);
    }

    card.appendChild(list);
    card.appendChild(renderFunRecommendations());
    return card;
  }

  function renderBagContents() {
    var card = el('section', 'gkmb3-card');

    var bag = activeBag();
    card.appendChild(el('h3', '', bag ? bag.name : 'Min bag'));

    if (!bag) {
      card.appendChild(el(
        'div',
        'gkmb3-empty',
        'Fant ingen aktiv bag. Prøv å laste siden på nytt.'
      ));
      return card;
    }

    if (STATE.discs.length) {
      card.appendChild(renderBagSummary());
      card.appendChild(renderBagTools());
    }

    if (!STATE.discs.length) {
      var empty = el('div', 'gkmb3-empty');
      empty.appendChild(el('strong', '', 'Bagen er tom'));
      empty.appendChild(el(
        'div',
        '',
        'Bruk panelet for å legge til en disc fra GolfKongen eller registrere din egen.'
      ));
      card.appendChild(empty);
      return card;
    }

    var matchedCount = 0;

    var groups = [
      ['putter', 'Puttere'],
      ['midrange', 'Midrange'],
      ['fairway', 'Fairway'],
      ['distance', 'Drivere / Distance']
    ];

    for (var i = 0; i < groups.length; i += 1) {
      var type = groups[i][0];
      var label = groups[i][1];
      var items = [];

      for (var j = 0; j < STATE.discs.length; j += 1) {
        if (
          STATE.discs[j].disc_type === type &&
          discMatchesBagView(STATE.discs[j])
        ) {
          items.push(STATE.discs[j]);
        }
      }

      if (!items.length) continue;

      matchedCount += items.length;

      items.sort(function (a, b) {
        if (!!a.is_favorite !== !!b.is_favorite) {
          return a.is_favorite ? -1 : 1;
        }

        var aName = safe(a.mold_name || a.name).toLowerCase();
        var bName = safe(b.mold_name || b.name).toLowerCase();
        var nameCompare = aName.localeCompare(bName, 'nb');
        if (nameCompare !== 0) return nameCompare;

        return safe(a.created_at).localeCompare(safe(b.created_at));
      });

      var section = el('div', 'gkmb3-category');
      var head = el('div', 'gkmb3-category-title');
      head.appendChild(el('strong', '', label));
      head.appendChild(el('span', '', items.length + (items.length === 1 ? ' disc' : ' discer')));
      section.appendChild(head);

      var grid = el('div', 'gkmb3-discgrid');

      for (var k = 0; k < items.length; k += 1) {
        grid.appendChild(renderDisc(items[k]));
      }

      section.appendChild(grid);
      card.appendChild(section);
    }

    if (!matchedCount) {
      var noMatch = el('div', 'gkmb3-empty');
      noMatch.appendChild(el('strong', '', 'Ingen treff'));
      noMatch.appendChild(el(
        'div',
        '',
        'Ingen discer matcher søket eller filteret. Prøv et annet søk eller velg Alle discer.'
      ));
      card.appendChild(noMatch);
    }

    return card;
  }

  function renderDisc(disc) {
    var card = el('article', 'gkmb3-disc');

    var image = el('div', 'gkmb3-discimg');

    if (disc.image_url) {
      var img = document.createElement('img');
      img.src = disc.image_url;
      img.alt = disc.name || disc.mold_name || 'Disc';
      img.loading = 'lazy';
      image.appendChild(img);
    } else {
      image.textContent = disc.is_favorite ? '★' : 'GK';
    }

    card.appendChild(image);

    var body = el('div', '');

    body.appendChild(el(
      'div',
      'gkmb3-disctitle',
      disc.name || disc.mold_name || 'Ukjent disc'
    ));

    var sub = [];
    if (disc.brand) sub.push(disc.brand);
    if (disc.plastic) sub.push(disc.plastic);
    sub.push(discTypeLabel(disc.disc_type));

    body.appendChild(el('div', 'gkmb3-discsub', sub.join(' · ')));
    body.appendChild(renderFlight(disc.speed, disc.glide, disc.turn, disc.fade));

    var meta = [];
    if (disc.weight_grams !== null && disc.weight_grams !== undefined) {
      meta.push(disc.weight_grams + ' g');
    }
    if (disc.color) meta.push(disc.color);
    if (disc.is_favorite) meta.push('★ Favoritt');

    if (meta.length) {
      body.appendChild(el('div', 'gkmb3-discmeta', meta.join(' · ')));
    }

    if (disc.note) {
      body.appendChild(el('div', 'gkmb3-discmeta', disc.note));
    }

    var actions = el('div', 'gkmb3-discactions');

    if (disc.product_url) {
      var link = el('a', 'gkmb3-btn secondary', 'Se hos GolfKongen');
      link.href = disc.product_url;
      link.target = '_blank';
      link.rel = 'noopener';
      actions.appendChild(link);
    }

    var favoriteBtn = el(
      'button',
      disc.is_favorite ? 'gkmb3-btn' : 'gkmb3-btn secondary',
      disc.is_favorite ? '★ Favoritt' : '☆ Favoritt'
    );
    favoriteBtn.type = 'button';
    favoriteBtn.disabled = STATE.discBusy;
    favoriteBtn.title = disc.is_favorite ? 'Fjern som favoritt' : 'Sett som favoritt / go-to disc';
    favoriteBtn.onclick = function () {
      toggleDiscFavorite(disc);
    };
    actions.appendChild(favoriteBtn);

    var duplicateBtn = el('button', 'gkmb3-btn secondary', '⧉ Dupliser');
    duplicateBtn.type = 'button';
    duplicateBtn.disabled = STATE.discBusy;
    duplicateBtn.title = 'Lag et nytt fysisk eksemplar med de samme opplysningene';
    duplicateBtn.onclick = function () {
      duplicateDisc(disc);
    };
    actions.appendChild(duplicateBtn);

    var editBtn = el(
      'button',
      'gkmb3-btn secondary',
      STATE.editDiscId === disc.id ? 'Lukk redigering' : '✏ Rediger'
    );
    editBtn.type = 'button';
    editBtn.disabled = STATE.discBusy;
    editBtn.onclick = function () {
      STATE.editDiscId = STATE.editDiscId === disc.id ? null : disc.id;
      render();
      if (STATE.editDiscId) status('Redigerer ' + (disc.name || disc.mold_name || 'disc') + '.', '');
    };
    actions.appendChild(editBtn);

    body.appendChild(actions);
    card.appendChild(body);

    if (STATE.editDiscId === disc.id) {
      card.appendChild(renderDiscEditPanel(disc));
    }

    return card;
  }

  function renderDiscEditPanel(disc) {
    var panel = el('div', 'gkmb3-discedit');

    var head = el('div', 'gkmb3-discedit-head');
    var headText = el('div', '');
    headText.appendChild(el('div', 'gkmb3-discedit-title', 'Rediger dette eksemplaret'));
    headText.appendChild(el(
      'div',
      'gkmb3-discedit-note',
      'Endrer bare discen i din bag – ikke produktdata, flight-tall eller GolfKongen-katalogen.'
    ));
    head.appendChild(headText);
    panel.appendChild(head);

    var grid = el('div', 'gkmb3-grid2');

    var plasticField = el('label', 'gkmb3-field');
    plasticField.appendChild(document.createTextNode('Plast'));
    var plastic = el('input', 'gkmb3-input');
    plastic.id = 'gkmb3-edit-plastic-' + disc.id;
    plastic.type = 'text';
    plastic.placeholder = 'F.eks. Champion';
    plastic.value = safe(disc.plastic);
    plasticField.appendChild(plastic);
    grid.appendChild(plasticField);

    var weightField = el('label', 'gkmb3-field');
    weightField.appendChild(document.createTextNode('Vekt (gram)'));
    var weight = el('input', 'gkmb3-input');
    weight.id = 'gkmb3-edit-weight-' + disc.id;
    weight.type = 'number';
    weight.min = '1';
    weight.max = '300';
    weight.step = '0.1';
    weight.placeholder = 'F.eks. 175';
    weight.value = disc.weight_grams === null || disc.weight_grams === undefined
      ? ''
      : safe(disc.weight_grams);
    weightField.appendChild(weight);
    grid.appendChild(weightField);

    var colorField = el('label', 'gkmb3-field');
    colorField.appendChild(document.createTextNode('Farge'));
    var color = el('input', 'gkmb3-input');
    color.id = 'gkmb3-edit-color-' + disc.id;
    color.type = 'text';
    color.placeholder = 'F.eks. rød';
    color.value = safe(disc.color);
    colorField.appendChild(color);
    grid.appendChild(colorField);

    var favoriteField = el('label', 'gkmb3-check');
    var favorite = document.createElement('input');
    favorite.id = 'gkmb3-edit-favorite-' + disc.id;
    favorite.type = 'checkbox';
    favorite.checked = !!disc.is_favorite;
    favoriteField.appendChild(favorite);
    favoriteField.appendChild(document.createTextNode('★ Favoritt / go-to disc'));
    grid.appendChild(favoriteField);

    panel.appendChild(grid);

    var noteField = el('label', 'gkmb3-field');
    noteField.style.marginTop = '10px';
    noteField.appendChild(document.createTextNode('Notat'));
    var note = el('textarea', 'gkmb3-textarea');
    note.id = 'gkmb3-edit-note-' + disc.id;
    note.placeholder = 'F.eks. mest brukt i motvind';
    note.value = safe(disc.note);
    noteField.appendChild(note);
    panel.appendChild(noteField);

    var otherBags = [];
    for (var i = 0; i < STATE.bags.length; i += 1) {
      if (STATE.bags[i].id !== disc.bag_id) otherBags.push(STATE.bags[i]);
    }

    if (otherBags.length) {
      var moveBox = el('div', 'gkmb3-movebox');
      moveBox.appendChild(el('div', 'gkmb3-movebox-title', 'Flytt denne discen til en annen bag'));
      moveBox.appendChild(el(
        'div',
        'gkmb3-movebox-note',
        'Flytter bare dette fysiske eksemplaret. All vekt, farge, notat og favoritt-status følger med.'
      ));

      var moveRow = el('div', 'gkmb3-movebox-row');
      var moveField = el('label', 'gkmb3-field');
      moveField.appendChild(document.createTextNode('Flytt til'));

      var moveSelect = el('select', 'gkmb3-select');
      moveSelect.id = 'gkmb3-move-target-' + disc.id;

      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Velg en annen bag…';
      placeholder.selected = true;
      moveSelect.appendChild(placeholder);

      for (var j = 0; j < otherBags.length; j += 1) {
        var option = document.createElement('option');
        option.value = otherBags[j].id;
        option.textContent = otherBags[j].name + (otherBags[j].is_default ? ' ★' : '');
        moveSelect.appendChild(option);
      }

      moveField.appendChild(moveSelect);
      moveRow.appendChild(moveField);

      var moveBtn = el('button', 'gkmb3-btn secondary', STATE.discBusy ? 'Flytter…' : 'Flytt disc');
      moveBtn.type = 'button';
      moveBtn.disabled = STATE.discBusy;
      moveBtn.onclick = function () {
        moveDisc(disc);
      };
      moveRow.appendChild(moveBtn);

      moveBox.appendChild(moveRow);
      panel.appendChild(moveBox);
    }

    var buttons = el('div', 'gkmb3-discedit-actions');

    var saveBtn = el('button', 'gkmb3-btn', STATE.discBusy ? 'Lagrer…' : 'Lagre endringer');
    saveBtn.type = 'button';
    saveBtn.disabled = STATE.discBusy;
    saveBtn.onclick = function () {
      updateDisc(disc);
    };
    buttons.appendChild(saveBtn);

    var cancelBtn = el('button', 'gkmb3-btn secondary', 'Avbryt');
    cancelBtn.type = 'button';
    cancelBtn.disabled = STATE.discBusy;
    cancelBtn.onclick = function () {
      STATE.editDiscId = null;
      render();
      status('Ingen endringer lagret.', '');
    };
    buttons.appendChild(cancelBtn);

    var deleteBtn = el('button', 'gkmb3-btn danger', 'Slett disc');
    deleteBtn.type = 'button';
    deleteBtn.disabled = STATE.discBusy;
    deleteBtn.onclick = function () {
      deleteDisc(disc);
    };
    buttons.appendChild(deleteBtn);

    panel.appendChild(buttons);
    return panel;
  }

  function renderAddPanel() {
    var card = el('section', 'gkmb3-card');
    card.appendChild(el('h3', '', 'Legg til disc'));
    card.appendChild(el(
      'p',
      '',
      'Velg en GolfKongen-disc eller registrer en disc manuelt.'
    ));

    if (STATE.bags.length > 1) {
      var targetField = el('label', 'gkmb3-field');
      targetField.style.marginBottom = '12px';
      targetField.appendChild(document.createTextNode('Legg discen i'));

      var targetSelect = el('select', 'gkmb3-select');
      targetSelect.id = 'gkmb3-add-target-bag';

      var selectedTarget = selectedAddBagId();

      for (var b = 0; b < STATE.bags.length; b += 1) {
        var targetOption = document.createElement('option');
        targetOption.value = STATE.bags[b].id;
        targetOption.textContent = STATE.bags[b].name + (STATE.bags[b].is_default ? ' ★' : '');
        if (STATE.bags[b].id === selectedTarget) targetOption.selected = true;
        targetSelect.appendChild(targetOption);
      }

      targetSelect.onchange = function () {
        STATE.addTargetBagId = safe(targetSelect.value);
        status('Nye discer legges i ' + selectedAddBagName() + '.', '');
      };

      targetField.appendChild(targetSelect);
      card.appendChild(targetField);
    }

    var tabs = el('div', 'gkmb3-tabs');

    var catalogTab = el('button', 'gkmb3-tab active', 'Fra GolfKongen');
    catalogTab.type = 'button';
    catalogTab.dataset.target = 'catalog';

    var manualTab = el('button', 'gkmb3-tab', 'Egen disc');
    manualTab.type = 'button';
    manualTab.dataset.target = 'manual';

    tabs.appendChild(catalogTab);
    tabs.appendChild(manualTab);

    card.appendChild(tabs);

    var catalog = renderCatalogPanel();
    catalog.id = 'gkmb3-tab-catalog';

    var manual = renderManualPanel();
    manual.id = 'gkmb3-tab-manual';
    manual.style.display = 'none';

    catalogTab.onclick = function () {
      catalogTab.className = 'gkmb3-tab active';
      manualTab.className = 'gkmb3-tab';
      catalog.style.display = '';
      manual.style.display = 'none';
    };

    manualTab.onclick = function () {
      manualTab.className = 'gkmb3-tab active';
      catalogTab.className = 'gkmb3-tab';
      manual.style.display = '';
      catalog.style.display = 'none';
    };

    card.appendChild(catalog);
    card.appendChild(manual);

    return card;
  }

  function renderCatalogPanel() {
    var wrap = el('div', '');

    var query = el('input', 'gkmb3-input');
    query.id = 'gkmb3-catalog-query';
    query.type = 'search';
    query.placeholder = 'F.eks. Firebird, Buzzz, P2…';
    query.value = STATE.catalogQuery || '';

    var type = createTypeSelect('gkmb3-catalog-type', true);
    type.value = STATE.catalogType || '';

    var grid = el('div', 'gkmb3-grid2');

    grid.appendChild(field('Søk', query));
    grid.appendChild(field('Type', type));

    wrap.appendChild(grid);

    var searchBtn = el('button', 'gkmb3-btn', 'Søk i GolfKongen');
    searchBtn.type = 'button';
    searchBtn.style.marginTop = '10px';
    searchBtn.onclick = searchCatalog;

    query.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') searchCatalog();
    });

    wrap.appendChild(searchBtn);

    var results = el('div', 'gkmb3-results');

    if (STATE.catalogResults.length) {
      for (var i = 0; i < STATE.catalogResults.length; i += 1) {
        results.appendChild(renderCatalogResult(STATE.catalogResults[i]));
      }
    } else if (STATE.catalogQuery) {
      results.appendChild(el('div', 'gkmb3-note', 'Ingen treff på siste søk.'));
    } else {
      results.appendChild(el(
        'div',
        'gkmb3-note',
        'Søk i Min Bag-katalogen. Resultatene kommer direkte fra GolfKongens synkede disc-katalog.'
      ));
    }

    wrap.appendChild(results);

    return wrap;
  }

  function renderCatalogResult(product) {
    var row = el('article', 'gkmb3-result');

    var image = el('div', 'gkmb3-resultimg');

    if (product.image_url) {
      var img = document.createElement('img');
      img.src = product.image_url;
      img.alt = product.product_name || 'Disc';
      img.loading = 'lazy';
      image.appendChild(img);
    } else {
      image.textContent = 'GK';
    }

    row.appendChild(image);

    var body = el('div', '');

    body.appendChild(el(
      'div',
      'gkmb3-resulttitle',
      product.product_name || 'Ukjent disc'
    ));

    var sub = [];
    if (product.brand) sub.push(product.brand);
    if (product.plastic) sub.push(product.plastic);
    sub.push(discTypeLabel(product.disc_type));

    body.appendChild(el('div', 'gkmb3-resultsub', sub.join(' · ')));
    body.appendChild(renderFlight(product.speed, product.glide, product.turn, product.fade));

    if (product.price_nok !== null && product.price_nok !== undefined) {
      body.appendChild(el('div', 'gkmb3-price', product.price_nok + ' kr'));
    }

    var toolbar = el('div', 'gkmb3-toolbar');
    toolbar.style.marginTop = '8px';

    var add = el('button', 'gkmb3-btn', 'Legg i bag');
    add.type = 'button';
    add.onclick = function () {
      addCatalogDisc(product);
    };
    toolbar.appendChild(add);

    if (product.product_url) {
      var open = el('a', 'gkmb3-btn secondary', 'Se produkt');
      open.href = product.product_url;
      open.target = '_blank';
      open.rel = 'noopener';
      toolbar.appendChild(open);
    }

    body.appendChild(toolbar);
    row.appendChild(body);

    return row;
  }

  function renderManualPanel() {
    var wrap = el('div', '');

    var name = el('input', 'gkmb3-input');
    name.id = 'gkmb3-manual-name';
    name.placeholder = 'F.eks. Champion Firebird';

    var mold = el('input', 'gkmb3-input');
    mold.id = 'gkmb3-manual-mold';
    mold.placeholder = 'F.eks. Firebird';

    var brand = el('select', 'gkmb3-select');
    brand.id = 'gkmb3-manual-brand';

    for (var i = 0; i < STATE.brands.length; i += 1) {
      var option = document.createElement('option');
      option.value = STATE.brands[i].id;
      option.textContent = STATE.brands[i].name;
      option.dataset.custom = STATE.brands[i].is_custom ? '1' : '0';
      brand.appendChild(option);
    }

    var customBrand = el('input', 'gkmb3-input');
    customBrand.id = 'gkmb3-manual-custom-brand';
    customBrand.placeholder = 'Skriv merkenavn';
    customBrand.style.display = 'none';

    brand.onchange = function () {
      var selected = brand.options[brand.selectedIndex];
      customBrand.style.display =
        selected && selected.dataset.custom === '1' ? '' : 'none';
    };

    var plastic = el('input', 'gkmb3-input');
    plastic.id = 'gkmb3-manual-plastic';
    plastic.placeholder = 'F.eks. Champion, ESP, K1';

    var type = createTypeSelect('gkmb3-manual-type', false);

    var grid1 = el('div', 'gkmb3-grid2');
    grid1.appendChild(field('Discnavn *', name));
    grid1.appendChild(field('Mold / modell *', mold));
    wrap.appendChild(grid1);

    var grid2 = el('div', 'gkmb3-grid2');
    grid2.appendChild(field('Merke *', brand));
    grid2.appendChild(field('Eget merkenavn', customBrand));
    wrap.appendChild(grid2);

    var grid3 = el('div', 'gkmb3-grid2');
    grid3.appendChild(field('Plast', plastic));
    grid3.appendChild(field('Type *', type));
    wrap.appendChild(grid3);

    var speed = numericInput('gkmb3-manual-speed', 'Speed');
    var glide = numericInput('gkmb3-manual-glide', 'Glide');
    var turn = numericInput('gkmb3-manual-turn', 'Turn');
    var fade = numericInput('gkmb3-manual-fade', 'Fade');

    var flightGrid = el('div', 'gkmb3-grid4');
    flightGrid.appendChild(field('Speed', speed));
    flightGrid.appendChild(field('Glide', glide));
    flightGrid.appendChild(field('Turn', turn));
    flightGrid.appendChild(field('Fade', fade));
    wrap.appendChild(flightGrid);

    var weight = numericInput('gkmb3-manual-weight', 'Gram');
    weight.min = '0';

    var color = el('input', 'gkmb3-input');
    color.id = 'gkmb3-manual-color';
    color.placeholder = 'F.eks. grønn';

    var extraGrid = el('div', 'gkmb3-grid2');
    extraGrid.appendChild(field('Vekt (g)', weight));
    extraGrid.appendChild(field('Farge', color));
    wrap.appendChild(extraGrid);

    var note = el('textarea', 'gkmb3-textarea');
    note.id = 'gkmb3-manual-note';
    note.placeholder = 'Valgfritt notat om akkurat denne fysiske discen.';
    wrap.appendChild(field('Notat', note));

    var favoriteLabel = el('label', 'gkmb3-check');
    var favorite = document.createElement('input');
    favorite.type = 'checkbox';
    favorite.id = 'gkmb3-manual-favorite';
    favoriteLabel.appendChild(favorite);
    favoriteLabel.appendChild(document.createTextNode('Marker som favoritt'));
    wrap.appendChild(favoriteLabel);

    var save = el('button', 'gkmb3-btn', 'Lagre egen disc');
    save.type = 'button';
    save.onclick = addManualDisc;
    wrap.appendChild(save);

    wrap.appendChild(el(
      'div',
      'gkmb3-note',
      'Merke, disc og eierskap valideres på serveren. Frontend sender aldri user_id som sannhetskilde.'
    ));

    return wrap;
  }

  function field(labelText, control) {
    var label = el('label', 'gkmb3-field');
    label.appendChild(el('span', '', labelText));
    label.appendChild(control);
    return label;
  }

  function numericInput(id, placeholder) {
    var input = el('input', 'gkmb3-input');
    input.id = id;
    input.type = 'number';
    input.step = '0.1';
    input.inputMode = 'decimal';
    input.placeholder = placeholder || '';
    return input;
  }

  function createTypeSelect(id, allowAll) {
    var select = el('select', 'gkmb3-select');
    select.id = id;

    var options = [];

    if (allowAll) options.push(['', 'Alle typer']);

    options.push(
      ['putter', 'Putter'],
      ['midrange', 'Midrange'],
      ['fairway', 'Fairway driver'],
      ['distance', 'Distance driver']
    );

    for (var i = 0; i < options.length; i += 1) {
      var opt = document.createElement('option');
      opt.value = options[i][0];
      opt.textContent = options[i][1];
      select.appendChild(opt);
    }

    return select;
  }

  function getInputValue(id) {
    var node = document.getElementById(id);
    return node ? trim(node.value) : '';
  }

  function getChecked(id) {
    var node = document.getElementById(id);
    return !!(node && node.checked);
  }

  function sendMagicLink() {
    var email = getInputValue('gkmb3-email').toLowerCase();

    if (!email || email.indexOf('@') === -1) {
      status('Skriv inn en gyldig e-postadresse.', 'err');
      return;
    }

    setLoading(true, 'Sender innloggingslenke…');

    supabaseClient.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: CONFIG.MAGIC_LINK_REDIRECT
      }
    }).then(function (res) {
      setLoading(false);

      if (res.error) {
        status('Kunne ikke sende innloggingslenke: ' + errorMessage(res.error), 'err');
        return;
      }

      status('Innloggingslenke sendt. Sjekk e-posten din.', 'ok');
    }).catch(function (err) {
      setLoading(false);
      status('Kunne ikke sende innloggingslenke: ' + errorMessage(err), 'err');
    });
  }

  function logout() {
    setLoading(true, 'Logger ut…');

    supabaseClient.auth.signOut().then(function (res) {
      setLoading(false);

      if (res.error) {
        status('Kunne ikke logge ut: ' + errorMessage(res.error), 'err');
        return;
      }

      resetUserState();
      render();
    }).catch(function (err) {
      setLoading(false);
      status('Kunne ikke logge ut: ' + errorMessage(err), 'err');
    });
  }

  function resetUserState() {
    STATE.user = null;
    STATE.bags = [];
    STATE.activeBagId = null;
    STATE.discs = [];
    STATE.catalogResults = [];
    STATE.catalogQuery = '';
    STATE.catalogType = '';
    STATE.bagImageUrls = {};
    STATE.bagImageBusy = false;
    STATE.storeBags = [];
    STATE.storeBagSelections = {};
    STATE.storeBagImageUrls = {};
    STATE.storeBagImageLoading = {};
    STATE.storeBagPickerOpen = false;
    STATE.storeBagBusy = false;
    STATE.newBagOpen = false;
    STATE.renameBagOpen = false;
    STATE.bagActionBusy = false;
    STATE.addTargetBagId = null;
    STATE.editDiscId = null;
    STATE.discBusy = false;
    STATE.recoProfile = null;
    STATE.recoProfileLoaded = false;
    STATE.recoProfileOpen = false;
    STATE.recoFindings = [];
    STATE.recoLoaded = false;
    STATE.recoProducts = [];
    STATE.recoProductsLoaded = false;
    STATE.recoProductsError = '';
    STATE.funRecommendations = [];
    STATE.funRecommendationsLoaded = false;
    STATE.funRecommendationsError = '';
    STATE.funRecommendationsPage = 0;
    STATE.funRecommendationsBusy = false;
    STATE.recoBusy = false;
  }

  function loadPublicTop3() {
    return supabaseClient.rpc('minbag_get_top3')
      .then(function (res) {
        if (res.error) throw res.error;
        STATE.top3 = res.data || [];
        STATE.top3Loaded = true;
      });
  }

  function refreshAuthState() {
    return supabaseClient.auth.getSession().then(function (res) {
      if (res.error) throw res.error;

      var session =
        res.data && res.data.session
          ? res.data.session
          : null;

      STATE.user =
        session && session.user
          ? session.user
          : null;

      if (!STATE.user) {
        STATE.bags = [];
        STATE.activeBagId = null;
        STATE.discs = [];
        STATE.bagImageUrls = {};
        STATE.storeBags = [];
        STATE.storeBagSelections = {};
        STATE.storeBagImageUrls = {};
        STATE.storeBagImageLoading = {};
        STATE.storeBagPickerOpen = false;
        STATE.storeBagBusy = false;
        STATE.newBagOpen = false;
        STATE.renameBagOpen = false;
        STATE.bagActionBusy = false;
        STATE.addTargetBagId = null;
        STATE.editDiscId = null;
        STATE.discBusy = false;
        STATE.recoProfile = null;
        STATE.recoProfileLoaded = false;
        STATE.recoProfileOpen = false;
        STATE.recoFindings = [];
        STATE.recoLoaded = false;
        STATE.recoBusy = false;
        render();
        return;
      }

      render();
      status('Laster Min Bag…');

      return ensureAndLoad();
    }).catch(function (err) {
      resetUserState();
      render();
      status('Auth-feil: ' + errorMessage(err), 'err');
    });
  }

  function ensureAndLoad() {
    return supabaseClient.rpc('minbag_ensure_user')
      .then(function (res) {
        if (res.error) throw res.error;
        return loadBrands();
      })
      .then(function () {
        return Promise.all([
          loadStoreBagCatalog(),
          loadBags()
        ]);
      })
      .then(function () {
        return loadRecoProfile();
      })
      .then(function () {
        return loadActiveBagDiscs();
      })
      .then(function () {
        render();
        status('Min Bag er lastet.', 'ok');
      });
  }


  function loadRecoProfile() {
    if (!STATE.user) {
      STATE.recoProfile = null;
      STATE.recoProfileLoaded = true;
      STATE.recoProfileOpen = false;
      return Promise.resolve();
    }

    return supabaseClient.rpc('minbag_get_reco_profile')
      .then(function (res) {
        if (res.error) throw res.error;

        var rows = res.data || [];
        STATE.recoProfile = rows.length ? rows[0] : null;
        STATE.recoProfileLoaded = true;

        if (!STATE.recoProfile) {
          STATE.recoProfileOpen = true;
        }
      });
  }

  function loadFunRecommendations() {
    STATE.funRecommendations = [];
    STATE.funRecommendationsLoaded = false;
    STATE.funRecommendationsError = '';

    if (!STATE.user || !STATE.activeBagId || !STATE.recoProfile) {
      STATE.funRecommendationsLoaded = true;
      return Promise.resolve();
    }

    return supabaseClient.rpc(
      'minbag_get_fun_recommendations',
      {
        p_bag_id: STATE.activeBagId,
        p_page: Math.max(
          0,
          Number(STATE.funRecommendationsPage) || 0
        )
      }
    ).then(function (res) {
      if (res.error) throw res.error;

      STATE.funRecommendations = res.data || [];
      STATE.funRecommendationsLoaded = true;
    }).catch(function (err) {
      // Frontend lager lokal bag-utfordring hvis RPC/katalog noen gang er tom.
      STATE.funRecommendations = [];
      STATE.funRecommendationsLoaded = true;
      STATE.funRecommendationsError = errorMessage(err);

      console.warn(
        '[GK MIN BAG V3] Gøy-anbefalinger feilet',
        err
      );
    });
  }

  function refreshFunRecommendations() {
    if (STATE.funRecommendationsBusy) return;

    STATE.funRecommendationsBusy = true;
    STATE.funRecommendationsPage =
      Math.max(0, Number(STATE.funRecommendationsPage) || 0) + 1;

    render();
    status('Finner tre nye utfordringer…');

    loadFunRecommendations()
      .then(function () {
        STATE.funRecommendationsBusy = false;
        render();
        status('Tre nye gøy-forslag er klare.', 'ok');
      })
      .catch(function (err) {
        STATE.funRecommendationsBusy = false;
        render();
        status(
          'Kunne ikke hente nye gøy-forslag: ' + errorMessage(err),
          'err'
        );
      });
  }

  function loadGapAnalysis() {
    STATE.recoFindings = [];
    STATE.recoLoaded = false;
    STATE.recoProducts = [];
    STATE.recoProductsLoaded = false;
    STATE.recoProductsError = '';
    STATE.funRecommendations = [];
    STATE.funRecommendationsLoaded = false;
    STATE.funRecommendationsError = '';

    if (!STATE.user || !STATE.activeBagId || !STATE.recoProfile) {
      STATE.recoLoaded = true;
      STATE.recoProductsLoaded = true;
      STATE.funRecommendationsLoaded = true;
      return Promise.resolve();
    }

    var bagId = STATE.activeBagId;

    var gapPromise = supabaseClient.rpc(
      'minbag_get_gap_analysis',
      {
        p_bag_id: bagId
      }
    ).then(function (res) {
      if (res.error) throw res.error;
      STATE.recoFindings = res.data || [];
      STATE.recoLoaded = true;
    }).catch(function (err) {
      STATE.recoFindings = [];
      STATE.recoLoaded = true;
      console.warn('[GK MIN BAG V3] Gap-analyse feilet', err);
    });

    var productPromise = supabaseClient.rpc(
      'minbag_get_product_recommendations',
      {
        p_bag_id: bagId,
        p_limit_per_gap: 3
      }
    ).then(function (res) {
      if (res.error) throw res.error;
      STATE.recoProducts = res.data || [];
      STATE.recoProductsLoaded = true;
    }).catch(function (err) {
      STATE.recoProducts = [];
      STATE.recoProductsLoaded = true;
      STATE.recoProductsError = errorMessage(err);
      console.warn(
        '[GK MIN BAG V3] Produktanbefalinger feilet',
        err
      );
    });

    var funPromise = loadFunRecommendations();

    return Promise.all([
      gapPromise,
      productPromise,
      funPromise
    ]);
  }

  function saveRecoProfile() {
    if (!STATE.user || STATE.recoBusy) return;

    // Les svarene FØR render(), ellers blir skjemaet bygget opp på nytt
    // og brukerens valgte verdier kan falle tilbake til profil/default.
    var payload = {
      p_skill_level: getInputValue('gkmb3-reco-skill'),
      p_throw_distance_band: getInputValue('gkmb3-reco-distance'),
      p_handedness: getInputValue('gkmb3-reco-hand'),
      p_throw_style: getInputValue('gkmb3-reco-throw-style'),
      p_course_style: getInputValue('gkmb3-reco-course'),
      p_wind_style: getInputValue('gkmb3-reco-wind'),
      p_include_putter_recommendations: getChecked('gkmb3-reco-putter')
    };

    STATE.recoBusy = true;
    render();
    status('Lagrer spillerprofil…');

    supabaseClient.rpc('minbag_set_reco_profile', payload)
      .then(function (res) {
        if (res.error) throw res.error;

        return loadRecoProfile();
      })
      .then(function () {
        STATE.recoProfileOpen = false;
        return loadGapAnalysis();
      })
      .then(function () {
        STATE.recoBusy = false;
        render();
        status('Spillerprofil lagret og bagen analysert.', 'ok');
      })
      .catch(function (err) {
        STATE.recoBusy = false;
        render();
        status('Kunne ikke lagre spillerprofil: ' + errorMessage(err), 'err');
      });
  }

  function loadBrands() {
    return supabaseClient
      .from('minbag_brands')
      .select('id,name,is_active,is_featured,is_custom,sort_order')
      .eq('is_active', true)
      .order('is_custom', { ascending: true })
      .order('is_featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        STATE.brands = res.data || [];
      });
  }

  function loadStoreBagCatalog() {
    if (!STATE.user) {
      STATE.storeBags = [];
      return Promise.resolve();
    }

    return supabaseClient.rpc('minbag_get_golfkongen_bags')
      .then(function (res) {
        if (res.error) throw res.error;
        STATE.storeBags = res.data || [];
      });
  }

  function loadStoreBagSelections() {
    STATE.storeBagSelections = {};

    if (!STATE.user || !STATE.bags.length) {
      return Promise.resolve();
    }

    return supabaseClient.rpc('minbag_get_my_bag_store_selections')
      .then(function (res) {
        if (res.error) throw res.error;

        var rows = res.data || [];
        var preloads = [];

        for (var i = 0; i < rows.length; i += 1) {
          var row = rows[i];
          if (!row.quickbutik_product_id) continue;

          STATE.storeBagSelections[row.bag_id] = row;
          preloads.push(
            ensureStoreBagImage(row.quickbutik_product_id)
              .catch(function () {})
          );
        }

        return Promise.all(preloads);
      });
  }

  function ensureStoreBagImage(productId) {
    var id = trim(productId);
    if (!id) return Promise.resolve('');

    if (Object.prototype.hasOwnProperty.call(STATE.storeBagImageUrls, id)) {
      return Promise.resolve(STATE.storeBagImageUrls[id] || '');
    }

    if (STATE.storeBagImageLoading[id]) {
      return STATE.storeBagImageLoading[id];
    }

    var url = CONFIG.WORKER_URL + CONFIG.STORE_BAG_IMAGE_ENDPOINT +
      '?product_id=' + encodeURIComponent(id);

    STATE.storeBagImageLoading[id] = fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'force-cache'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Bildeoppslag feilet (' + res.status + ').');
        return res.json();
      })
      .then(function (data) {
        var images = data && Array.isArray(data.images) ? data.images : [];
        var imageUrl = images.length && images[0].image_url
          ? safe(images[0].image_url)
          : '';
        STATE.storeBagImageUrls[id] = imageUrl;
        return imageUrl;
      })
      .catch(function (err) {
        STATE.storeBagImageUrls[id] = '';
        console.warn('[GK MIN BAG V3] Kunne ikke hente butikksekk-bilde', id, err);
        return '';
      })
      .finally(function () {
        delete STATE.storeBagImageLoading[id];
      });

    return STATE.storeBagImageLoading[id];
  }

  function observeStoreBagImage(holder, productId, name) {
    if (!holder || !holder.isConnected) return;

    function load() {
      ensureStoreBagImage(productId).then(function (imageUrl) {
        if (!holder || !holder.isConnected) return;
        clear(holder);

        if (imageUrl) {
          var img = document.createElement('img');
          img.src = imageUrl;
          img.alt = safe(name || 'GolfKongen-sekk');
          img.loading = 'lazy';
          holder.appendChild(img);
        } else {
          holder.textContent = '🎒';
          holder.style.fontSize = '24px';
        }
      });
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          if (entries[i].isIntersecting) {
            observer.disconnect();
            load();
            break;
          }
        }
      }, { rootMargin: '120px' });
      observer.observe(holder);
    } else {
      load();
    }
  }

  function setGolfkongenBag(bag, product) {
    if (!STATE.user || !bag || !bag.id || STATE.storeBagBusy || STATE.bagImageBusy) return;

    var productId = product ? safe(product.quickbutik_product_id) : null;
    var label = product ? safe(product.name) : 'eget bilde';

    STATE.storeBagBusy = true;
    render();
    status(product ? 'Velger GolfKongen-sekk…' : 'Bytter til eget bilde…');

    supabaseClient.rpc('minbag_set_golfkongen_bag', {
      p_bag_id: bag.id,
      p_quickbutik_product_id: productId
    })
      .then(function (res) {
        if (res.error) throw res.error;
        if (productId) return ensureStoreBagImage(productId);
      })
      .then(function () {
        return loadBags(bag.id);
      })
      .then(function () {
        STATE.storeBagBusy = false;
        STATE.storeBagPickerOpen = false;
        render();
        status(product ? ('Sekken er satt til ' + label + '.') : 'Eget bilde er aktivt igjen.', 'ok');
      })
      .catch(function (err) {
        STATE.storeBagBusy = false;
        render();
        status('Kunne ikke endre sekkvalg: ' + errorMessage(err), 'err');
      });
  }

  function loadBagImages() {
    STATE.bagImageUrls = {};

    if (!STATE.user || !STATE.bags.length) {
      return Promise.resolve();
    }

    return supabaseClient.rpc('minbag_get_my_bag_images')
      .then(function (res) {
        if (res.error) throw res.error;

        var rows = res.data || [];
        var byId = {};

        for (var i = 0; i < rows.length; i += 1) {
          byId[rows[i].bag_id] = rows[i].image_path || null;
        }

        var signing = [];

        for (var j = 0; j < STATE.bags.length; j += 1) {
          (function (bag) {
            bag.image_url = byId[bag.id] || null;

            if (!bag.image_url) return;

            signing.push(
              supabaseClient.storage
                .from(CONFIG.BAG_IMAGE_BUCKET)
                .createSignedUrl(
                  bag.image_url,
                  CONFIG.BAG_IMAGE_SIGNED_SECONDS
                )
                .then(function (signed) {
                  if (signed.error) throw signed.error;

                  if (
                    signed.data &&
                    signed.data.signedUrl
                  ) {
                    STATE.bagImageUrls[bag.id] = signed.data.signedUrl;
                  }
                })
                .catch(function (err) {
                  console.warn(
                    '[GK MIN BAG V3] Kunne ikke lage signert bag-bilde',
                    err
                  );
                })
            );
          })(STATE.bags[j]);
        }

        return Promise.all(signing);
      });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('Kunne ikke behandle bildet.'));
          return;
        }

        resolve(blob);
      }, type, quality);
    });
  }

  function prepareBagImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('Fant ikke bildefilen.'));
        return;
      }

      if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) {
        reject(new Error('Bruk JPG, PNG eller WEBP.'));
        return;
      }

      if (file.size > CONFIG.BAG_IMAGE_MAX_SOURCE_BYTES) {
        reject(new Error('Bildet er for stort. Maks 12 MB før komprimering.'));
        return;
      }

      var objectUrl = URL.createObjectURL(file);
      var image = new Image();

      image.onload = function () {
        try {
          var width = image.naturalWidth || image.width;
          var height = image.naturalHeight || image.height;

          if (!width || !height) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Kunne ikke lese bildestørrelsen.'));
            return;
          }

          var maxEdge = CONFIG.BAG_IMAGE_MAX_EDGE;
          var scale = Math.min(1, maxEdge / Math.max(width, height));
          var targetWidth = Math.max(1, Math.round(width * scale));
          var targetHeight = Math.max(1, Math.round(height * scale));

          var canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          var ctx = canvas.getContext('2d', { alpha: false });
          ctx.fillStyle = '#111111';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

          URL.revokeObjectURL(objectUrl);

          canvasBlob(
            canvas,
            'image/webp',
            CONFIG.BAG_IMAGE_WEBP_QUALITY
          ).then(resolve).catch(reject);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };

      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Kunne ikke åpne bildet.'));
      };

      image.src = objectUrl;
    });
  }

  function uploadBagImage(bag, file) {
    if (!STATE.user || !bag || !bag.id || STATE.bagImageBusy) return;

    STATE.bagImageBusy = true;
    render();
    status('Behandler bag-bildet…');

    var oldPath = bag.image_url || null;
    var newPath = null;

    prepareBagImage(file)
      .then(function (blob) {
        newPath =
          STATE.user.id +
          '/' +
          bag.id +
          '/' +
          Date.now() +
          '-' +
          Math.random().toString(36).slice(2, 9) +
          '.webp';

        status('Laster opp bag-bildet…');

        return supabaseClient.storage
          .from(CONFIG.BAG_IMAGE_BUCKET)
          .upload(newPath, blob, {
            contentType: 'image/webp',
            cacheControl: '3600',
            upsert: false
          });
      })
      .then(function (uploadRes) {
        if (uploadRes.error) throw uploadRes.error;

        return supabaseClient.rpc('minbag_set_bag_image', {
          p_bag_id: bag.id,
          p_image_path: newPath
        });
      })
      .then(function (saveRes) {
        if (saveRes.error) throw saveRes.error;

        if (oldPath && oldPath !== newPath) {
          return supabaseClient.storage
            .from(CONFIG.BAG_IMAGE_BUCKET)
            .remove([oldPath])
            .catch(function () {});
        }
      })
      .then(function () {
        return loadBags(bag.id);
      })
      .then(function () {
        STATE.bagImageBusy = false;
        render();
        status('Bag-bildet er lagret.', 'ok');
      })
      .catch(function (err) {
        var cleanup = Promise.resolve();

        if (newPath) {
          cleanup = supabaseClient.storage
            .from(CONFIG.BAG_IMAGE_BUCKET)
            .remove([newPath])
            .catch(function () {});
        }

        cleanup.finally(function () {
          STATE.bagImageBusy = false;
          render();
          status('Kunne ikke lagre bag-bildet: ' + errorMessage(err), 'err');
        });
      });
  }

  function removeBagImage(bag) {
    if (!STATE.user || !bag || !bag.id || !bag.image_url || STATE.bagImageBusy) {
      return;
    }

    if (!confirm('Vil du fjerne bildet fra "' + bag.name + '"?')) {
      return;
    }

    STATE.bagImageBusy = true;
    render();
    status('Fjerner bag-bildet…');

    var oldPath = bag.image_url;

    supabaseClient.rpc('minbag_set_bag_image', {
      p_bag_id: bag.id,
      p_image_path: null
    })
      .then(function (res) {
        if (res.error) throw res.error;

        return supabaseClient.storage
          .from(CONFIG.BAG_IMAGE_BUCKET)
          .remove([oldPath])
          .catch(function () {});
      })
      .then(function () {
        return loadBags(bag.id);
      })
      .then(function () {
        STATE.bagImageBusy = false;
        render();
        status('Bag-bildet er fjernet.', 'ok');
      })
      .catch(function (err) {
        STATE.bagImageBusy = false;
        render();
        status('Kunne ikke fjerne bag-bildet: ' + errorMessage(err), 'err');
      });
  }

  function loadBags(preferredBagId) {
    return supabaseClient.rpc('minbag_get_my_bags')
      .then(function (res) {
        if (res.error) throw res.error;

        STATE.bags = res.data || [];

        var nextId = null;

        if (preferredBagId) {
          for (var i = 0; i < STATE.bags.length; i += 1) {
            if (STATE.bags[i].id === preferredBagId) {
              nextId = preferredBagId;
              break;
            }
          }
        }

        if (!nextId && STATE.activeBagId) {
          for (var j = 0; j < STATE.bags.length; j += 1) {
            if (STATE.bags[j].id === STATE.activeBagId) {
              nextId = STATE.activeBagId;
              break;
            }
          }
        }

        if (!nextId) {
          for (var k = 0; k < STATE.bags.length; k += 1) {
            if (STATE.bags[k].is_default) {
              nextId = STATE.bags[k].id;
              break;
            }
          }
        }

        if (!nextId && STATE.bags.length) {
          nextId = STATE.bags[0].id;
        }

        STATE.activeBagId = nextId;

        if (!bagById(STATE.addTargetBagId)) {
          STATE.addTargetBagId = STATE.activeBagId;
        }

        STATE.storeBagPickerOpen = false;

        return Promise.all([
          loadBagImages(),
          loadStoreBagSelections()
        ]);
      });
  }

  function loadActiveBagDiscs() {
    if (!STATE.activeBagId) {
      STATE.discs = [];
      STATE.recoFindings = [];
      STATE.recoLoaded = true;
      STATE.recoProducts = [];
      STATE.recoProductsLoaded = true;
      STATE.recoProductsError = '';
      STATE.funRecommendations = [];
      STATE.funRecommendationsLoaded = true;
      STATE.funRecommendationsError = '';
      STATE.funRecommendationsPage = 0;
      STATE.funRecommendationsBusy = false;
      return Promise.resolve();
    }

    return supabaseClient
      .from('minbag_discs')
      .select(
        'id,bag_id,catalog_id,source,name,brand,mold_name,plastic,disc_type,' +
        'product_url,image_url,speed,glide,turn,fade,weight_grams,color,note,' +
        'is_favorite,created_at,updated_at,mold_key'
      )
      .eq('bag_id', STATE.activeBagId)
      .order('disc_type', { ascending: true })
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        STATE.discs = res.data || [];
        return loadGapAnalysis();
      });
  }

  function selectBag(bagId) {
    if (!bagId || bagId === STATE.activeBagId) return;

    STATE.activeBagId = bagId;
    STATE.addTargetBagId = bagId;
    STATE.catalogResults = [];
    STATE.catalogQuery = '';
    STATE.catalogType = '';
    STATE.bagSearch = '';
    STATE.bagFilter = 'all';
    STATE.editDiscId = null;
    STATE.recoFindings = [];
    STATE.recoLoaded = false;
    STATE.recoProducts = [];
    STATE.recoProductsLoaded = false;
    STATE.recoProductsError = '';
    STATE.funRecommendations = [];
    STATE.funRecommendationsLoaded = false;
    STATE.funRecommendationsError = '';
    STATE.funRecommendationsPage = 0;
    STATE.funRecommendationsBusy = false;
    STATE.newBagOpen = false;
    STATE.renameBagOpen = false;

    render();
    status('Laster bag…');

    loadActiveBagDiscs()
      .then(function () {
        render();
        status('Bag lastet.', 'ok');
      })
      .catch(function (err) {
        status('Kunne ikke laste bag: ' + errorMessage(err), 'err');
      });
  }

  function createBagFromForm() {
    if (!STATE.user || STATE.bagActionBusy) return;

    var name = trim(getInputValue('gkmb3-new-bag-name'));

    if (!name) {
      status('Bag-navn kan ikke være tomt.', 'err');
      return;
    }

    if (name.length > 80) {
      status('Bag-navnet kan ikke være lengre enn 80 tegn.', 'err');
      return;
    }

    STATE.bagActionBusy = true;
    setLoading(true, 'Oppretter bag…');

    supabaseClient.rpc('minbag_create_bag', {
      p_name: name
    }).then(function (res) {
      if (res.error) throw res.error;

      var newBagId = res.data;
      STATE.addTargetBagId = newBagId;

      return loadBags(newBagId).then(function () {
        return loadActiveBagDiscs();
      });
    }).then(function () {
      STATE.bagActionBusy = false;
      STATE.newBagOpen = false;
      setLoading(false);
      render();
      status('Ny bag opprettet: ' + name + '.', 'ok');
    }).catch(function (err) {
      STATE.bagActionBusy = false;
      setLoading(false);
      render();
      status('Kunne ikke opprette bag: ' + errorMessage(err), 'err');
    });
  }

  function renameBagFromForm(bag) {
    if (!STATE.user || !bag || !bag.id || STATE.bagActionBusy) return;

    var name = trim(getInputValue('gkmb3-rename-bag-name'));

    if (!name) {
      status('Bag-navn kan ikke være tomt.', 'err');
      return;
    }

    if (name.length > 80) {
      status('Bag-navnet kan ikke være lengre enn 80 tegn.', 'err');
      return;
    }

    if (name === trim(bag.name)) {
      STATE.renameBagOpen = false;
      render();
      status('Bag-navnet er uendret.', '');
      return;
    }

    STATE.bagActionBusy = true;
    setLoading(true, 'Lagrer bag-navn…');

    supabaseClient.rpc('minbag_rename_bag', {
      p_bag_id: bag.id,
      p_name: name
    }).then(function (res) {
      if (res.error) throw res.error;
      return loadBags(bag.id).then(function () {
        return loadActiveBagDiscs();
      });
    }).then(function () {
      STATE.bagActionBusy = false;
      STATE.renameBagOpen = false;
      setLoading(false);
      render();
      status('Bag-navnet er endret til ' + name + '.', 'ok');
    }).catch(function (err) {
      STATE.bagActionBusy = false;
      setLoading(false);
      render();
      status('Kunne ikke endre bag-navn: ' + errorMessage(err), 'err');
    });
  }

  function setDefaultBag(bagId) {
    if (!bagId) return;

    setLoading(true, 'Setter hovedbag…');

    supabaseClient.rpc('minbag_set_default_bag', {
      p_bag_id: bagId
    }).then(function (res) {
      if (res.error) throw res.error;

      return loadBags(bagId).then(function () {
        return loadActiveBagDiscs();
      });
    }).then(function () {
      setLoading(false);
      render();
      status('Hovedbag oppdatert.', 'ok');
    }).catch(function (err) {
      setLoading(false);
      status('Kunne ikke sette hovedbag: ' + errorMessage(err), 'err');
    });
  }

  function deleteBag(bag) {
    if (!bag || !bag.id || bag.is_default) return;

    if (!confirm(
      'Vil du slette "' + bag.name + '"? Discene i denne baggen slettes også.'
    )) {
      return;
    }

    setLoading(true, 'Sletter bag…');

    supabaseClient.rpc('minbag_delete_bag', {
      p_bag_id: bag.id
    }).then(function (res) {
      if (res.error) throw res.error;

      STATE.activeBagId = null;
      STATE.newBagOpen = false;
      STATE.renameBagOpen = false;

      return loadBags().then(function () {
        return loadActiveBagDiscs();
      });
    }).then(function () {
      setLoading(false);
      render();
      status('Bag slettet.', 'ok');
    }).catch(function (err) {
      setLoading(false);
      status('Kunne ikke slette bag: ' + errorMessage(err), 'err');
    });
  }


  function toggleDiscFavorite(disc) {
    if (!STATE.user || !disc || !disc.id || STATE.discBusy) return;

    var nextFavorite = !disc.is_favorite;
    var label = disc.name || disc.mold_name || 'Discen';

    STATE.discBusy = true;
    render();
    status(nextFavorite ? 'Setter favoritt…' : 'Fjerner favoritt…');

    supabaseClient.rpc('minbag_update_disc', {
      p_disc_id: disc.id,
      p_plastic: disc.plastic || null,
      p_weight_grams: disc.weight_grams === null || disc.weight_grams === undefined ? null : disc.weight_grams,
      p_color: disc.color || null,
      p_note: disc.note || null,
      p_is_favorite: nextFavorite
    }).then(function (res) {
      if (res.error) throw res.error;
      return loadActiveBagDiscs();
    }).then(function () {
      STATE.discBusy = false;
      render();
      status(
        nextFavorite
          ? label + ' er satt som favoritt / go-to disc.'
          : label + ' er fjernet som favoritt.',
        'ok'
      );
    }).catch(function (err) {
      STATE.discBusy = false;
      render();
      status('Kunne ikke endre favoritt: ' + errorMessage(err), 'err');
    });
  }


  function duplicateDisc(disc) {
    if (!STATE.user || !disc || !disc.id || STATE.discBusy) return;

    var label = disc.name || disc.mold_name || 'denne discen';

    if (!confirm(
      'Vil du lage et nytt fysisk eksemplar av "' + label + '" i samme bag?\n\n' +
      'Plast, vekt, farge, notat og favorittstatus kopieres. Du kan redigere kopien etterpå.'
    )) {
      return;
    }

    STATE.discBusy = true;
    render();
    status('Dupliserer disc…');

    var newDiscId = null;

    supabaseClient.rpc('minbag_duplicate_disc', {
      p_disc_id: disc.id
    }).then(function (res) {
      if (res.error) throw res.error;

      if (res.data && res.data.id) {
        newDiscId = res.data.id;
      }

      return Promise.all([
        loadBags(STATE.activeBagId),
        loadActiveBagDiscs()
      ]);
    }).then(function () {
      STATE.discBusy = false;
      STATE.editDiscId = newDiscId;
      render();
      status(
        label + ' er duplisert. Kopien er klar til å få egen vekt, farge eller notat.',
        'ok'
      );
    }).catch(function (err) {
      STATE.discBusy = false;
      render();
      status('Kunne ikke duplisere disc: ' + errorMessage(err), 'err');
    });
  }

  function updateDisc(disc) {
    if (!STATE.user || !disc || !disc.id || STATE.discBusy) return;

    var plastic = getInputValue('gkmb3-edit-plastic-' + disc.id) || null;
    var weightText = getInputValue('gkmb3-edit-weight-' + disc.id);
    var weight = numOrNull(weightText);
    var color = getInputValue('gkmb3-edit-color-' + disc.id) || null;
    var note = getInputValue('gkmb3-edit-note-' + disc.id) || null;
    var isFavorite = getChecked('gkmb3-edit-favorite-' + disc.id);

    if (trim(weightText) && weight === null) {
      status('Vekten må være et gyldig tall.', 'err');
      return;
    }

    if (weight !== null && (weight <= 0 || weight > 300)) {
      status('Vekten må være mellom 0 og 300 gram.', 'err');
      return;
    }

    STATE.discBusy = true;
    render();
    status('Lagrer endringer…');

    supabaseClient.rpc('minbag_update_disc', {
      p_disc_id: disc.id,
      p_plastic: plastic,
      p_weight_grams: weight,
      p_color: color,
      p_note: note,
      p_is_favorite: isFavorite
    }).then(function (res) {
      if (res.error) throw res.error;
      return loadActiveBagDiscs();
    }).then(function () {
      STATE.discBusy = false;
      STATE.editDiscId = null;
      render();
      status('Disc oppdatert.', 'ok');
    }).catch(function (err) {
      STATE.discBusy = false;
      render();
      status('Kunne ikke oppdatere disc: ' + errorMessage(err), 'err');
    });
  }

  function moveDisc(disc) {
    if (!STATE.user || !disc || !disc.id || STATE.discBusy) return;

    var select = document.getElementById('gkmb3-move-target-' + disc.id);
    var targetBagId = select ? safe(select.value) : '';

    if (!targetBagId) {
      status('Velg hvilken bag discen skal flyttes til.', 'err');
      return;
    }

    var targetName = 'valgt bag';
    for (var i = 0; i < STATE.bags.length; i += 1) {
      if (STATE.bags[i].id === targetBagId) {
        targetName = STATE.bags[i].name;
        break;
      }
    }

    var label = disc.name || disc.mold_name || 'Discen';

    STATE.discBusy = true;
    render();
    status('Flytter disc…');

    supabaseClient.rpc('minbag_move_disc', {
      p_disc_id: disc.id,
      p_target_bag_id: targetBagId
    }).then(function (res) {
      if (res.error) throw res.error;

      STATE.editDiscId = null;

      return Promise.all([
        loadBags(STATE.activeBagId),
        loadActiveBagDiscs()
      ]);
    }).then(function () {
      STATE.discBusy = false;
      render();
      status(label + ' er flyttet til ' + targetName + '.', 'ok');
    }).catch(function (err) {
      STATE.discBusy = false;
      render();
      status('Kunne ikke flytte disc: ' + errorMessage(err), 'err');
    });
  }

  function deleteDisc(disc) {
    if (!STATE.user || !disc || !disc.id || STATE.discBusy) return;

    var label = disc.name || disc.mold_name || 'denne discen';

    if (!confirm(
      'Vil du slette "' + label + '" fra denne bagen?\n\nDette sletter bare dette fysiske eksemplaret fra Min Bag.'
    )) {
      return;
    }

    STATE.discBusy = true;
    render();
    status('Sletter disc…');

    supabaseClient.rpc('minbag_delete_disc', {
      p_disc_id: disc.id
    }).then(function (res) {
      if (res.error) throw res.error;

      STATE.editDiscId = null;

      return Promise.all([
        loadBags(STATE.activeBagId),
        loadActiveBagDiscs(),
        loadPublicTop3()
      ]);
    }).then(function () {
      STATE.discBusy = false;
      render();
      status('Disc slettet fra bagen.', 'ok');
    }).catch(function (err) {
      STATE.discBusy = false;
      render();
      status('Kunne ikke slette disc: ' + errorMessage(err), 'err');
    });
  }

  function searchCatalog() {
    if (!STATE.activeBagId) {
      status('Mangler aktiv bag.', 'err');
      return;
    }

    var query = getInputValue('gkmb3-catalog-query');
    var type = getInputValue('gkmb3-catalog-type');

    STATE.catalogQuery = query;
    STATE.catalogType = type;

    setLoading(true, 'Søker i GolfKongen-katalogen…');

    supabaseClient.rpc('minbag_search_catalog', {
      p_query: query || null,
      p_disc_type: type || null,
      p_limit: CONFIG.CATALOG_LIMIT
    }).then(function (res) {
      setLoading(false);

      if (res.error) {
        status('Katalogsøk feilet: ' + errorMessage(res.error), 'err');
        return;
      }

      STATE.catalogResults = res.data || [];
      render();

      if (STATE.catalogResults.length) {
        status('Fant ' + STATE.catalogResults.length + ' katalogtreff.', 'ok');
      } else {
        status('Fant ingen katalogtreff.', '');
      }
    }).catch(function (err) {
      setLoading(false);
      status('Katalogsøk feilet: ' + errorMessage(err), 'err');
    });
  }

  function addCatalogDisc(product) {
    var targetBagId = selectedAddBagId();
    var targetName = selectedAddBagName();

    addCatalogDiscToBag(product, targetBagId, targetName);
  }

  function addRecommendedDisc(rec) {
    var bag = activeBag();

    if (!bag || !rec || !rec.catalog_id) {
      status('Mangler aktiv bag eller anbefalt katalog-ID.', 'err');
      return;
    }

    addCatalogDiscToBag(
      recommendationAsCatalogProduct(rec),
      bag.id,
      bag.name
    );
  }

  function addFunRecommendedDisc(rec) {
    var bag = activeBag();

    if (!bag || !rec || !rec.catalog_id) {
      status('Mangler aktiv bag eller katalog-ID.', 'err');
      return;
    }

    addCatalogDiscToBag(
      recommendationAsCatalogProduct(rec),
      bag.id,
      bag.name
    );
  }

  function addCatalogDiscToBag(product, targetBagId, targetName) {
    if (!targetBagId || !product || !product.id) {
      status('Mangler målbag eller katalog-ID.', 'err');
      return;
    }

    targetName = targetName || 'aktiv bag';

    setLoading(true, 'Kontrollerer ' + targetName + '…');

    getDiscsForDuplicateCheck(targetBagId)
      .then(function (targetDiscs) {
        var duplicate = findCatalogDuplicate(product, targetDiscs);

        if (duplicate) {
          var proceed = confirm(
            'Du har allerede en ' +
            (duplicate.brand ? duplicate.brand + ' ' : '') +
            (duplicate.mold_name || duplicate.name) +
            ' i "' + targetName + '".\n\nVil du legge til enda ett eksemplar?'
          );

          if (!proceed) return null;
        }

        status('Legger disc i ' + targetName + '…');

        return supabaseClient.rpc('minbag_add_catalog_disc', {
          p_bag_id: targetBagId,
          p_catalog_id: product.id,
          p_weight_grams: null,
          p_color: null,
          p_note: null
        });
      })
      .then(function (res) {
        if (!res) {
          setLoading(false);
          status('Discen ble ikke lagt til.', '');
          return null;
        }

        if (res.error) throw res.error;

        return Promise.all([
          loadBags(STATE.activeBagId),
          loadActiveBagDiscs(),
          loadPublicTop3()
        ]);
      })
      .then(function (result) {
        if (result === null) return;
        setLoading(false);
        render();
        status('Disc lagt til fra GolfKongen i ' + targetName + '.', 'ok');
      })
      .catch(function (err) {
        setLoading(false);
        status('Kunne ikke legge til disc: ' + errorMessage(err), 'err');
      });
  }

  function addManualDisc() {
    var targetBagId = selectedAddBagId();

    if (!targetBagId) {
      status('Mangler målbag.', 'err');
      return;
    }

    var targetName = selectedAddBagName();
    var brandNode = document.getElementById('gkmb3-manual-brand');
    var selected = brandNode && brandNode.options.length
      ? brandNode.options[brandNode.selectedIndex]
      : null;

    var brandId = selected ? Number(selected.value) : null;
    var isCustom = !!(selected && selected.dataset.custom === '1');

    var name = getInputValue('gkmb3-manual-name');
    var mold = getInputValue('gkmb3-manual-mold');
    var customBrand = getInputValue('gkmb3-manual-custom-brand');
    var plastic = getInputValue('gkmb3-manual-plastic');
    var type = getInputValue('gkmb3-manual-type');

    if (!name) {
      status('Discnavn er obligatorisk.', 'err');
      return;
    }

    if (!mold) {
      status('Mold / modell er obligatorisk.', 'err');
      return;
    }

    if (!brandId) {
      status('Velg merke.', 'err');
      return;
    }

    if (isCustom && !customBrand) {
      status('Skriv merkenavn når du velger Annet merke.', 'err');
      return;
    }

    if (!type) {
      status('Velg disc-type.', 'err');
      return;
    }

    var selectedBrand = manualBrandName(brandId, customBrand);

    setLoading(true, 'Kontrollerer ' + targetName + '…');

    getDiscsForDuplicateCheck(targetBagId)
      .then(function (targetDiscs) {
        var duplicate = findDuplicateByMold(selectedBrand, mold, targetDiscs);

        if (duplicate) {
          var proceed = confirm(
            'Du har allerede en ' +
            (duplicate.brand ? duplicate.brand + ' ' : '') +
            (duplicate.mold_name || duplicate.name) +
            ' i "' + targetName + '".\n\nVil du legge til enda ett eksemplar?'
          );

          if (!proceed) return null;
        }

        status('Lagrer egen disc i ' + targetName + '…');

        return supabaseClient.rpc('minbag_add_manual_disc', {
          p_bag_id: targetBagId,
          p_brand_id: brandId,
          p_name: name,
          p_mold_name: mold,
          p_disc_type: type,
          p_custom_brand: isCustom ? customBrand : null,
          p_plastic: plastic || null,
          p_speed: numOrNull(getInputValue('gkmb3-manual-speed')),
          p_glide: numOrNull(getInputValue('gkmb3-manual-glide')),
          p_turn: numOrNull(getInputValue('gkmb3-manual-turn')),
          p_fade: numOrNull(getInputValue('gkmb3-manual-fade')),
          p_weight_grams: numOrNull(getInputValue('gkmb3-manual-weight')),
          p_color: getInputValue('gkmb3-manual-color') || null,
          p_note: getInputValue('gkmb3-manual-note') || null,
          p_is_favorite: getChecked('gkmb3-manual-favorite')
        });
      })
      .then(function (res) {
        if (!res) {
          setLoading(false);
          status('Discen ble ikke lagt til.', '');
          return null;
        }

        if (res.error) throw res.error;

        return Promise.all([
          loadBags(STATE.activeBagId),
          loadActiveBagDiscs(),
          loadPublicTop3()
        ]);
      })
      .then(function (result) {
        if (result === null) return;
        setLoading(false);
        render();
        status('Egen disc lagret i ' + targetName + '.', 'ok');
      })
      .catch(function (err) {
        setLoading(false);
        status('Kunne ikke lagre disc: ' + errorMessage(err), 'err');
      });
  }

  function normalizeLocalKey(value) {
    return trim(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function findDuplicateByMold(brandName, moldName, discs) {
    var wanted = normalizeLocalKey(
      safe(brandName) + ' ' + safe(moldName)
    );

    if (!wanted) return null;

    var rows = discs || STATE.discs;

    for (var i = 0; i < rows.length; i += 1) {
      var disc = rows[i];

      if (disc.mold_key && normalizeLocalKey(disc.mold_key) === wanted) {
        return disc;
      }

      var fallback = normalizeLocalKey(
        safe(disc.brand) + ' ' + safe(disc.mold_name)
      );

      if (fallback && fallback === wanted) {
        return disc;
      }
    }

    return null;
  }

  function getDiscsForDuplicateCheck(bagId) {
    if (bagId === STATE.activeBagId) {
      return Promise.resolve(STATE.discs.slice());
    }

    return supabaseClient
      .from('minbag_discs')
      .select('id,brand,mold_name,name,mold_key')
      .eq('bag_id', bagId)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });
  }

  function findCatalogDuplicate(product, discs) {
    if (!product) return null;

    return findDuplicateByMold(
      product.brand,
      product.mold_name || product.product_name,
      discs
    );
  }

  function manualBrandName(brandId, customBrand) {
    for (var i = 0; i < STATE.brands.length; i += 1) {
      if (Number(STATE.brands[i].id) === Number(brandId)) {
        return STATE.brands[i].is_custom
          ? customBrand
          : STATE.brands[i].name;
      }
    }

    return customBrand || '';
  }

  function findManualDuplicate(moldName, brandId, customBrand, discs) {
    return findDuplicateByMold(
      manualBrandName(brandId, customBrand),
      moldName,
      discs
    );
  }

  function boot() {
    if (booting || !onMinBagPage()) return;
    booting = true;

    root = document.getElementById(CONFIG.ROOT_ID);

    if (!root) {
      booting = false;
      console.warn('[GK MIN BAG V3] Fant ikke #' + CONFIG.ROOT_ID);
      return;
    }

    injectCss();

    clear(root);

    var loading = el('div', 'gkmb3-status', 'Laster Min Bag V3…');
    loading.id = 'gkmb3-status';
    root.appendChild(loading);

    loadSupabaseSdk()
      .then(function () {
        createClient();

        if (authSubscription && authSubscription.unsubscribe) {
          try { authSubscription.unsubscribe(); } catch (_) {}
        }

        var authResult = supabaseClient.auth.onAuthStateChange(function () {
          setTimeout(function () {
            refreshAuthState();
          }, 0);
        });

        authSubscription =
          authResult &&
          authResult.data &&
          authResult.data.subscription
            ? authResult.data.subscription
            : null;

        return loadPublicTop3()
          .catch(function (err) {
            STATE.top3 = [];
            STATE.top3Loaded = true;
            console.warn('[GK MIN BAG V3] Kunne ikke laste offentlig Top 3', err);
          })
          .then(function () {
            return refreshAuthState();
          });
      })
      .catch(function (err) {
        clear(root);
        var box = el(
          'div',
          'gkmb3-status err',
          'Kunne ikke starte Min Bag: ' + errorMessage(err)
        );
        box.id = 'gkmb3-status';
        root.appendChild(box);
      })
      .finally(function () {
        booting = false;
      });
  }

  window.GK_MINBAG_V3 = {
    version: VERSION,
    state: STATE,
    boot: boot
  };

  window.__MINBAG_BOOT__ = boot;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('pageshow', function () {
    if (onMinBagPage()) {
      setTimeout(boot, 0);
    }
  });
})();
