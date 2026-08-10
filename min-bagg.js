/* ============================================================================
   GOLFKONGEN – MIN BAG V3 APP
   Build: 2026-08-09.20.5

   V3-prinsipper:
   - Supabase Auth / magic link
   - Kun Min Bag-tabeller/RPC-er
   - Ingen service_role i frontend
   - Ingen user_id fra frontend ved opprettelse av discer
   - Skriving av discer går via sikre RPC-er
   - Støtter flere bager
   - "Legg til fra GolfKongen" søker også historiske/skjulte katalogdiscer
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
   - v19.6: desktop-nav i innholdskolonnen + stor fast mobil bunnnavigasjon
   - v19.3: Baner vises først etter søk; totalantall aktive vises fortsatt
   - v19.4: Sikker brukeridentitet/session-reset ved Supabase-brukerbytte
   - v19.5: Sticky seksjonsnavigasjon med smooth-scroll og aktiv markering
   - v20.4: Personlige anbefalinger, Bag-score V2 og historisk GolfKongen-katalog
   - v20.5: Tilbakemelding lagres i Supabase og varsles server-side via Resend

   Denne filen forutsetter at Quickbutik-loaderen har opprettet:
   <div id="min-bag-root"></div>

   Leveres som .txt fra ChatGPT. Når den senere legges i GitHub som kjørbar app,
   brukes innholdet som JavaScript.
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = '2026-08-10.20.6';

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
  var authEpoch = 0;
  var booting = false;
  var sectionNavBound = false;
  var sectionNavTicking = false;

  var STATE = {
    user: null,
    activeView: 'home',
    appMenuOpen: false,
    addDiscOpen: false,
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
    recoInsights: null,
    recoInsightsLoaded: false,
    reward: null,
    rewardLoaded: false,
    rewardBusy: false,
    rewardError: '',
    funRecommendations: [],
    funRecommendationsLoaded: false,
    funRecommendationsError: '',
    funRecommendationsPage: 0,
    funRecommendationsBusy: false,
    bagScore: null,
    bagScoreLoaded: false,
    bagScoreError: '',
    throwDistance: '',
    throwWind: 'calm',
    throwLine: 'straight',
    throwType: '',
    throwResults: [],
    throwHasSearched: false,
    throwBusy: false,
    throwError: '',
    roundBagCount: '8',
    roundBagCourseStyle: '',
    roundBagWindStyle: '',
    roundBagFocus: '',
    roundBagResults: [],
    roundBagHasBuilt: false,
    roundBagBusy: false,
    roundBagError: '',
    roundBagSourceName: '',
    expandedOverlapKey: '',
    courses: [],
    coursesLoaded: false,
    courseTotalCount: 0,
    courseQuery: '',
    courseSearchBusy: false,
    courseProgress: {},
    courseProgressLoaded: false,
    courseProgressBusyId: null,
    coursePlayedCount: 0,
    courseSubmitOpen: false,
    courseSubmitBusy: false,
    myCourses: [],
    myCoursesLoaded: false,
    courseAdmin: false,
    courseAdminLoaded: false,
    pendingCourses: [],
    pendingCoursesLoaded: false,
    courseModerationBusy: false,
    recoBusy: false,
    loading: false
  };

  function safe(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function trim(value) {
    return safe(value).trim();
  }

  function currentUserId() {
    return STATE.user && STATE.user.id
      ? safe(STATE.user.id)
      : '';
  }

  function captureUserContext() {
    return {
      userId: currentUserId(),
      epoch: authEpoch
    };
  }

  function isCurrentUserContext(context) {
    return !!(
      context &&
      context.epoch === authEpoch &&
      context.userId === currentUserId()
    );
  }

  function applySessionUser(nextUser) {
    var previousId = currentUserId();
    var nextId = nextUser && nextUser.id
      ? safe(nextUser.id)
      : '';

    if (previousId !== nextId) {
      authEpoch += 1;
      resetUserState();
    }

    STATE.user = nextUser || null;
    return captureUserContext();
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

    var raw = typeof err === 'string'
      ? err
      : (err.message || err.error_description || err.details || '');

    raw = safe(raw);

    if (!raw) return 'Noe gikk galt. Prøv igjen.';

    var lower = raw.toLowerCase();
    var technical = [
      'supabase', 'postgres', 'postgrest', 'sqlstate', 'pgrst',
      'rpc', 'row-level', 'rls', 'jwt', 'auth.uid', 'schema',
      'relation ', 'column ', 'function ', 'permission denied',
      'violates', 'uuid', 'failed to fetch', 'networkerror'
    ];

    for (var i = 0; i < technical.length; i += 1) {
      if (lower.indexOf(technical[i]) !== -1) {
        return 'Noe gikk galt. Prøv igjen.';
      }
    }

    if (/\(\d{3}\)/.test(raw)) {
      return 'Noe gikk galt. Prøv igjen.';
    }

    return raw;
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
      '.gkmb3-recohelp{padding:10px 11px;border-radius:13px;border:1px solid rgba(59,130,246,.20);background:rgba(59,130,246,.07);color:rgba(255,255,255,.67);font-size:10px;line-height:1.45;}' +
      '.gkmb3-recochoice{padding:10px 11px;border-radius:13px;border:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.14);}' +
      '.gkmb3-recochoice-title{font-size:10px;font-weight:950;color:#fff;margin-bottom:7px;}' +
      '.gkmb3-recochecks{display:flex;gap:7px;flex-wrap:wrap;}' +
      '.gkmb3-recocheck{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);font-size:10px;font-weight:800;color:rgba(255,255,255,.72);}' +
      '.gkmb3-recocheck input{accent-color:#22c55e;}' +
      '.gkmb3-recocheck.disabled{opacity:.42;}' +
      '.gkmb3-insights{margin:10px 0 12px;padding:12px;border-radius:16px;border:1px solid rgba(59,130,246,.22);background:linear-gradient(135deg,rgba(59,130,246,.09),rgba(0,0,0,.15));}' +
      '.gkmb3-insights h4{margin:0 0 7px;font-size:12px;color:#fff;}' +
      '.gkmb3-insightgrid{display:grid;grid-template-columns:1fr;gap:6px;}' +
      '.gkmb3-insight{padding:7px 8px;border-radius:10px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.66);font-size:10px;line-height:1.4;}' +
      '.gkmb3-insight strong{color:#dbeafe;}' +
      '.gkmb3-recolist{display:grid;gap:8px;margin-top:10px;}' +
      '.gkmb3-recofinding{padding:11px;border-radius:15px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.14);}' +
      '.gkmb3-recofinding.gap{border-color:rgba(34,197,94,.22);background:linear-gradient(135deg,rgba(34,197,94,.07),rgba(0,0,0,.14));}' +
      '.gkmb3-recofinding.overlap{border-color:rgba(245,158,11,.24);background:linear-gradient(135deg,rgba(245,158,11,.06),rgba(0,0,0,.14));}' +
      '.gkmb3-recofinding.overlap.clickable{cursor:pointer;transition:.15s ease;}' +
      '.gkmb3-recofinding.overlap.clickable:hover{border-color:rgba(245,158,11,.48);background:linear-gradient(135deg,rgba(245,158,11,.11),rgba(0,0,0,.18));}' +
      '.gkmb3-overlap-toggle{margin-top:8px;display:inline-flex;align-items:center;gap:5px;color:#fde68a;font-size:9px;font-weight:950;}' +
      '.gkmb3-overlap-list{display:grid;gap:7px;margin-top:9px;padding-top:9px;border-top:1px solid rgba(245,158,11,.18);}' +
      '.gkmb3-overlap-disc{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:11px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.20);}' +
      '.gkmb3-overlap-disc.review{border-color:rgba(249,115,22,.34);background:rgba(124,45,18,.15);}' +
      '.gkmb3-overlap-disc-name{color:#fff;font-size:10px;font-weight:950;}' +
      '.gkmb3-overlap-disc-meta{margin-top:3px;color:rgba(255,255,255,.56);font-size:9px;line-height:1.35;}' +
      '.gkmb3-overlap-badge{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:950;white-space:nowrap;background:rgba(34,197,94,.13);color:#bbf7d0;border:1px solid rgba(34,197,94,.22);}' +
      '.gkmb3-overlap-disc.review .gkmb3-overlap-badge{background:rgba(249,115,22,.15);color:#fed7aa;border-color:rgba(249,115,22,.30);}' +
      '.gkmb3-disc.gkmb3-disc-focus{outline:3px solid rgba(249,115,22,.88);box-shadow:0 0 0 6px rgba(249,115,22,.16),0 14px 36px rgba(0,0,0,.35);}' +
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
      '.gkmb3-bagscore{margin-top:12px;padding:12px;border-radius:16px;border:1px solid rgba(34,197,94,.24);background:linear-gradient(135deg,rgba(20,83,45,.14),rgba(2,10,6,.34));}' +
      '.gkmb3-bagscore-top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;}' +
      '.gkmb3-bagscore-number{min-width:92px;padding:12px 14px;border-radius:14px;text-align:center;background:rgba(0,0,0,.26);border:1px solid rgba(34,197,94,.24);}' +
      '.gkmb3-bagscore-number strong{display:block;color:#fff;font-size:28px;line-height:1;font-weight:1000;}' +
      '.gkmb3-bagscore-number span{display:block;margin-top:5px;color:#86efac;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.03em;}' +
      '.gkmb3-bagscore-copy h4{margin:0;color:#fff;font-size:13px;}' +
      '.gkmb3-bagscore-copy p{margin:5px 0 0;color:rgba(255,255,255,.62);font-size:9px;line-height:1.45;}' +
      '.gkmb3-bagscore-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px;}' +
      '.gkmb3-scoremetric{padding:8px;border-radius:12px;background:rgba(0,0,0,.20);border:1px solid rgba(255,255,255,.07);}' +
      '.gkmb3-scoremetric-top{display:flex;justify-content:space-between;gap:6px;color:rgba(255,255,255,.78);font-size:9px;font-weight:900;}' +
      '.gkmb3-scoremetric-top b{color:#fff;}' +
      '.gkmb3-scorebar{height:5px;margin-top:6px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.08);}' +
      '.gkmb3-scorebar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#16a34a,#4ade80);}' +
      '.gkmb3-bagscore-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;}' +
      '.gkmb3-bagscore-meta span{padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.72);font-size:9px;font-weight:850;}' +
      '.gkmb3-bagscore-next{margin-top:9px;padding:8px 10px;border-radius:11px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.17);color:#bbf7d0;font-size:9px;font-weight:800;line-height:1.45;}' +
      '@media(max-width:700px){.gkmb3-bagscore-top{grid-template-columns:1fr;}.gkmb3-bagscore-number{min-width:0;}.gkmb3-bagscore-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
      '.gkmb3-throwadvisor{margin-top:12px;padding:12px;border-radius:16px;border:1px solid rgba(59,130,246,.24);background:linear-gradient(135deg,rgba(30,64,175,.12),rgba(2,10,6,.34));}' +
      '.gkmb3-throwadvisor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:9px;}' +
      '.gkmb3-throwadvisor-head h4{margin:0;color:#fff;font-size:13px;}' +
      '.gkmb3-throwadvisor-head p{margin:4px 0 0;color:rgba(255,255,255,.58);font-size:9px;line-height:1.45;max-width:650px;}' +
      '.gkmb3-throwgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}' +
      '.gkmb3-throwactions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px;}' +
      '.gkmb3-throwresults{display:grid;gap:8px;margin-top:11px;padding-top:10px;border-top:1px solid rgba(59,130,246,.18);}' +
      '.gkmb3-throwresult{display:grid;grid-template-columns:58px minmax(0,1fr);gap:10px;padding:10px;border-radius:13px;border:1px solid rgba(59,130,246,.18);background:rgba(2,10,20,.34);}' +
      '.gkmb3-throwresult.best{border-color:rgba(34,197,94,.40);background:linear-gradient(135deg,rgba(20,83,45,.18),rgba(2,10,20,.38));}' +
      '.gkmb3-throwimg{width:58px;height:58px;border-radius:11px;overflow:hidden;display:grid;place-items:center;background:#080d0a;border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.35);font-size:9px;font-weight:900;}' +
      '.gkmb3-throwimg img{width:100%;height:100%;object-fit:contain;display:block;}' +
      '.gkmb3-throwtop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}' +
      '.gkmb3-throwname{font-size:12px;font-weight:950;color:#fff;line-height:1.25;}' +
      '.gkmb3-throwscore{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:#2563eb;color:#fff;font-size:9px;font-weight:950;white-space:nowrap;}' +
      '.gkmb3-throwresult.best .gkmb3-throwscore{background:#16a34a;}' +
      '.gkmb3-throwlabel{margin-top:2px;color:#93c5fd;font-size:9px;font-weight:950;}' +
      '.gkmb3-throwmeta{margin-top:3px;color:rgba(255,255,255,.55);font-size:9px;font-weight:750;}' +
      '.gkmb3-throwreason{margin-top:6px;color:rgba(255,255,255,.66);font-size:9px;line-height:1.45;}' +
      '@media(max-width:850px){.gkmb3-throwgrid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
      '@media(max-width:520px){.gkmb3-throwgrid{grid-template-columns:1fr;}.gkmb3-throwresult{grid-template-columns:48px minmax(0,1fr);}.gkmb3-throwimg{width:48px;height:48px;}}' +
      '.gkmb3-roundbag{margin-top:12px;padding:12px;border-radius:16px;border:1px solid rgba(245,158,11,.26);background:linear-gradient(135deg,rgba(120,53,15,.12),rgba(2,10,6,.34));scroll-margin-top:18px;}' +
      '.gkmb3-roundbag-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:9px;}' +
      '.gkmb3-roundbag-head h4{margin:0;color:#fff;font-size:13px;}' +
      '.gkmb3-roundbag-head p{margin:4px 0 0;color:rgba(255,255,255,.58);font-size:9px;line-height:1.45;max-width:680px;}' +
      '.gkmb3-roundbag-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}' +
      '.gkmb3-roundbag-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px;}' +
      '.gkmb3-roundbag-summary{margin-top:10px;padding:8px 10px;border-radius:11px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.18);color:#fde68a;font-size:9px;font-weight:850;line-height:1.45;}' +
      '.gkmb3-roundbag-list{display:grid;gap:8px;margin-top:10px;}' +
      '.gkmb3-roundbag-item{display:grid;grid-template-columns:56px minmax(0,1fr);gap:10px;padding:10px;border-radius:13px;border:1px solid rgba(245,158,11,.17);background:rgba(18,10,2,.31);}' +
      '.gkmb3-roundbag-img{width:56px;height:56px;border-radius:11px;overflow:hidden;display:grid;place-items:center;background:#0b0b08;border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.35);font-size:9px;font-weight:900;}' +
      '.gkmb3-roundbag-img img{width:100%;height:100%;object-fit:contain;display:block;}' +
      '.gkmb3-roundbag-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}' +
      '.gkmb3-roundbag-name{font-size:12px;font-weight:950;color:#fff;line-height:1.25;}' +
      '.gkmb3-roundbag-role{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:#b45309;color:#fff;font-size:9px;font-weight:950;white-space:nowrap;}' +
      '.gkmb3-roundbag-meta{margin-top:3px;color:rgba(255,255,255,.55);font-size:9px;font-weight:750;}' +
      '.gkmb3-roundbag-reason{margin-top:6px;color:rgba(255,255,255,.66);font-size:9px;line-height:1.45;}' +
      '.gkmb3-roundbag-score{margin-top:5px;color:#fde68a;font-size:9px;font-weight:900;}' +
      '@media(max-width:850px){.gkmb3-roundbag-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
      '@media(max-width:520px){.gkmb3-roundbag-grid{grid-template-columns:1fr;}.gkmb3-roundbag-item{grid-template-columns:48px minmax(0,1fr);}.gkmb3-roundbag-img{width:48px;height:48px;}}' +
      '.gkmb3-sectionnav{position:sticky;top:12px;z-index:45;display:flex;gap:7px;align-items:center;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;margin:0 0 14px;padding:8px;border-radius:16px;border:1px solid rgba(34,197,94,.18);background:linear-gradient(135deg,rgba(8,18,12,.96),rgba(3,9,6,.96));box-shadow:0 9px 24px rgba(0,0,0,.22);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}' +
      '.gkmb3-sectionnav::-webkit-scrollbar{display:none;}' +
      '.gkmb3-sectionnav button{appearance:none;min-height:40px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);color:rgba(255,255,255,.78);padding:9px 12px;border-radius:12px;font:inherit;font-size:11px;font-weight:900;line-height:1.05;white-space:nowrap;cursor:pointer;flex:0 0 auto;transition:.15s ease;touch-action:manipulation;}' +
      '.gkmb3-sectionnav button:hover{border-color:rgba(34,197,94,.32);background:rgba(34,197,94,.09);color:#fff;}' +
      '.gkmb3-sectionnav button.active{border-color:rgba(34,197,94,.62);background:linear-gradient(135deg,rgba(22,163,74,.40),rgba(34,197,94,.18));color:#ecfdf5;box-shadow:inset 0 0 0 1px rgba(34,197,94,.12);}' +
      '.gkmb3-section-anchor{scroll-margin-top:86px;}' +
      '@media(max-width:650px){.gkmb3-shell{padding-bottom:88px;}.gkmb3-sectionnav{position:fixed;top:auto;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));z-index:9999;margin:0;padding:8px;gap:7px;border-radius:18px;border-color:rgba(34,197,94,.30);background:rgba(4,12,8,.97);box-shadow:0 -8px 28px rgba(0,0,0,.48),0 0 0 1px rgba(255,255,255,.03);}.gkmb3-sectionnav button{min-height:46px;padding:9px 13px;border-radius:13px;font-size:11px;line-height:1.12;}.gkmb3-section-anchor{scroll-margin-top:76px;}}' +
      '.gkmb3-courses{margin-top:0;}' +
      '.gkmb3-course-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin-top:10px;}' +
      '.gkmb3-course-list{display:grid;gap:9px;margin-top:11px;}' +
      '.gkmb3-course{padding:12px;border-radius:15px;border:1px solid rgba(59,130,246,.17);background:rgba(4,12,18,.30);}' +
      '.gkmb3-course.own{border-color:rgba(245,158,11,.20);background:rgba(40,24,4,.18);}' +
      '.gkmb3-course.pending{border-color:rgba(168,85,247,.26);background:rgba(52,16,78,.14);}' +
      '.gkmb3-course-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}' +
      '.gkmb3-course-name{font-size:13px;font-weight:1000;color:#fff;line-height:1.25;}' +
      '.gkmb3-course-location{margin-top:3px;color:rgba(255,255,255,.56);font-size:9px;font-weight:760;}' +
      '.gkmb3-course-status{flex:0 0 auto;padding:4px 7px;border-radius:999px;background:rgba(59,130,246,.18);border:1px solid rgba(59,130,246,.22);color:#bfdbfe;font-size:9px;font-weight:950;white-space:nowrap;}' +
      '.gkmb3-course-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}' +
      '.gkmb3-course-badges span{padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.075);color:rgba(255,255,255,.72);font-size:9px;font-weight:850;}' +
      '.gkmb3-course-desc{margin-top:8px;color:rgba(255,255,255,.64);font-size:9px;line-height:1.48;}' +
      '.gkmb3-course-record{margin-top:8px;padding:7px 9px;border-radius:10px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.16);color:#bbf7d0;font-size:9px;font-weight:850;}' +
      '.gkmb3-course-progress{margin-top:9px;padding:9px;border-radius:11px;background:rgba(34,197,94,.055);border:1px solid rgba(34,197,94,.14);}' +
      '.gkmb3-course-progress.played{background:linear-gradient(135deg,rgba(22,163,74,.09),rgba(4,12,18,.18));border-color:rgba(34,197,94,.25);}' +
      '.gkmb3-course-progress .gkmb3-check{cursor:pointer;user-select:none;}' +
      '.gkmb3-course-progress .gkmb3-check input{width:16px;height:16px;accent-color:#22c55e;cursor:pointer;}' +
      '.gkmb3-course-progress-grid{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px;margin-top:8px;align-items:end;}' +
      '.gkmb3-course-progress-grid textarea{min-height:58px;resize:vertical;}' +
      '.gkmb3-course-progress-summary{margin-top:6px;color:#bbf7d0;font-size:9px;font-weight:850;line-height:1.4;}' +
      '.gkmb3-course-form{margin-top:10px;padding:12px;border-radius:15px;border:1px solid rgba(245,158,11,.20);background:rgba(40,24,4,.16);}' +
      '.gkmb3-course-formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}' +
      '.gkmb3-course-formgrid .wide{grid-column:1/-1;}' +
      '.gkmb3-course-form textarea{min-height:92px;resize:vertical;}' +
      '.gkmb3-course-sectiontitle{margin:14px 0 0;color:#fff;font-size:12px;font-weight:1000;}' +
      '.gkmb3-adminqueue{margin-top:14px;padding:12px;border-radius:15px;border:1px solid rgba(168,85,247,.25);background:rgba(52,16,78,.13);}' +
      '.gkmb3-adminqueue h4{margin:0;color:#fff;font-size:12px;}' +
      '.gkmb3-adminqueue p{margin:4px 0 0;color:rgba(255,255,255,.57);font-size:9px;line-height:1.45;}' +
      '@media(max-width:650px){.gkmb3-course-search{grid-template-columns:1fr;}.gkmb3-course-formgrid{grid-template-columns:1fr;}.gkmb3-course-formgrid .wide{grid-column:auto;}.gkmb3-course-progress-grid{grid-template-columns:1fr;}.gkmb3-course-head{display:block;}.gkmb3-course-status{display:inline-block;margin-top:7px;}}' +
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
      '.gkmb3-availability{display:inline-flex;margin:0 0 7px;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:900;border:1px solid rgba(255,255,255,.10);}' +
      '.gkmb3-availability.available{color:#bbf7d0;border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.08);}' +
      '.gkmb3-availability.soldout{color:#fde68a;border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.08);}' +
      '.gkmb3-availability.historical{color:#cbd5e1;border-color:rgba(148,163,184,.24);background:rgba(148,163,184,.08);}' +
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
        '.gkmb3-insightgrid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
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
      '}' +

      /* =======================================================================
         V20 – APP/DASHBOARD LAYOUT
         ======================================================================= */ +
      '#min-bag-root{max-width:1280px;margin:18px auto 0;}' +
      '.gkmb3-shell.gkmb3-appshell{gap:0;}' +
      '.gkmb3-appframe{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px;align-items:start;}' +
      '.gkmb3-appmain{min-width:0;display:grid;gap:14px;}' +
      '.gkmb3-sidebar{position:sticky;top:18px;display:grid;gap:12px;padding:14px;border-radius:22px;border:1px solid rgba(34,197,94,.18);background:linear-gradient(180deg,rgba(10,27,17,.97),rgba(4,12,8,.97));box-shadow:0 18px 54px rgba(0,0,0,.24);}' +
      '.gkmb3-sidebrand{padding:4px 4px 10px;border-bottom:1px solid rgba(255,255,255,.08);}' +
      '.gkmb3-sidebrand strong{display:block;color:#fff;font-size:17px;font-weight:1000;letter-spacing:-.02em;}' +
      '.gkmb3-sidebrand span{display:block;margin-top:4px;color:rgba(255,255,255,.48);font-size:10px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.gkmb3-sidenav{display:grid;gap:5px;}' +
      '.gkmb3-sidenav button{width:100%;min-height:44px;display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:13px;border:1px solid transparent;background:transparent;color:rgba(255,255,255,.70);font:inherit;font-size:11px;font-weight:900;text-align:left;cursor:pointer;transition:.15s ease;}' +
      '.gkmb3-sidenav button:hover{background:rgba(255,255,255,.055);color:#fff;}' +
      '.gkmb3-sidenav button.active{border-color:rgba(34,197,94,.28);background:linear-gradient(135deg,rgba(22,163,74,.24),rgba(34,197,94,.09));color:#dcfce7;}' +
      '.gkmb3-sidenav-icon{width:26px;height:26px;display:grid;place-items:center;border-radius:9px;background:rgba(255,255,255,.06);font-size:14px;flex:0 0 auto;}' +
      '.gkmb3-sidefooter{display:grid;gap:7px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);}' +
      '.gkmb3-sidefooter .gkmb3-btn{width:100%;min-height:39px;font-size:10px;}' +

      '.gkmb3-appbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:17px;border:1px solid rgba(255,255,255,.09);background:rgba(4,12,8,.82);box-shadow:0 10px 28px rgba(0,0,0,.15);}' +
      '.gkmb3-appbar-copy{min-width:0;}' +
      '.gkmb3-appbar-title{color:#fff;font-size:15px;font-weight:1000;line-height:1.15;}' +
      '.gkmb3-appbar-sub{margin-top:3px;color:rgba(255,255,255,.46);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.gkmb3-appbar-actions{display:flex;gap:7px;flex:0 0 auto;}' +
      '.gkmb3-appbar-actions .gkmb3-btn{min-height:36px;padding:7px 10px;font-size:10px;}' +
      '.gkmb3-appstatus{margin:0;padding:8px 11px;border-radius:12px;font-size:10px;}' +

      '.gkmb3-home{display:grid;gap:16px;}' +
      '.gkmb3-homehero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 235px;gap:18px;align-items:stretch;padding:22px;border-radius:26px;border:1px solid rgba(34,197,94,.25);background:radial-gradient(circle at 85% 10%,rgba(34,197,94,.20),transparent 34%),radial-gradient(circle at 0 100%,rgba(59,130,246,.11),transparent 42%),linear-gradient(135deg,#07130c,#0c2115 60%,#06110b);box-shadow:0 22px 70px rgba(0,0,0,.28);}' +
      '.gkmb3-homeeyebrow{display:inline-flex;width:max-content;padding:6px 9px;border-radius:999px;border:1px solid rgba(34,197,94,.30);background:rgba(34,197,94,.10);color:#bbf7d0;font-size:9px;font-weight:1000;letter-spacing:.07em;text-transform:uppercase;}' +
      '.gkmb3-homehero h2{margin:10px 0 6px;color:#fff;font-size:clamp(30px,5vw,48px);line-height:.98;font-weight:1000;letter-spacing:-.045em;}' +
      '.gkmb3-homelead{max-width:700px;color:rgba(255,255,255,.65);font-size:12px;line-height:1.5;}' +
      '.gkmb3-homeinsight{margin-top:13px;padding:10px 12px;border-radius:14px;border:1px solid rgba(245,158,11,.18);background:rgba(245,158,11,.07);color:#fde68a;font-size:10px;font-weight:850;line-height:1.45;}' +
      '.gkmb3-homebagvisual{position:relative;min-height:225px;display:grid;place-items:center;border-radius:20px;border:1px solid rgba(255,255,255,.10);background:radial-gradient(circle at 50% 25%,rgba(34,197,94,.22),rgba(0,0,0,.18) 58%);overflow:hidden;}' +
      '.gkmb3-homebagvisual img{width:100%;height:100%;object-fit:contain;display:block;padding:12px;}' +
      '.gkmb3-homebagfallback{font-size:82px;filter:drop-shadow(0 12px 20px rgba(0,0,0,.32));}' +
      '.gkmb3-home-score{position:absolute;right:10px;bottom:10px;min-width:76px;padding:9px 10px;border-radius:14px;border:1px solid rgba(34,197,94,.28);background:rgba(2,10,6,.88);text-align:center;backdrop-filter:blur(10px);}' +
      '.gkmb3-home-score strong{display:block;color:#fff;font-size:20px;line-height:1;font-weight:1000;}' +
      '.gkmb3-home-score span{display:block;margin-top:4px;color:#86efac;font-size:8px;font-weight:950;text-transform:uppercase;}' +

      '.gkmb3-homestats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:15px;}' +
      '.gkmb3-homestat{padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.045);}' +
      '.gkmb3-homestat strong{display:block;color:#fff;font-size:19px;line-height:1;font-weight:1000;}' +
      '.gkmb3-homestat span{display:block;margin-top:5px;color:rgba(255,255,255,.48);font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.03em;}' +
      '.gkmb3-homeflight{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}' +
      '.gkmb3-homeflight span{padding:5px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:rgba(255,255,255,.58);font-size:9px;font-weight:850;}' +

      '.gkmb3-reward{position:relative;overflow:hidden;padding:18px;border-radius:22px;border:1px solid rgba(245,158,11,.34);background:radial-gradient(circle at 88% 12%,rgba(250,204,21,.20),transparent 32%),linear-gradient(135deg,rgba(24,17,3,.98),rgba(22,33,12,.97));box-shadow:0 18px 50px rgba(0,0,0,.22);}' +
      '.gkmb3-reward:after{content:"";position:absolute;right:-55px;bottom:-80px;width:190px;height:190px;border-radius:50%;background:rgba(34,197,94,.12);}' +
      '.gkmb3-reward-head{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;}' +
      '.gkmb3-reward-kicker{color:#fde68a;font-size:9px;font-weight:1000;letter-spacing:.08em;text-transform:uppercase;}' +
      '.gkmb3-reward h3{margin:5px 0 3px;color:#fff;font-size:22px;font-weight:1000;letter-spacing:-.02em;}' +
      '.gkmb3-reward p{margin:0;color:rgba(255,255,255,.62);font-size:10px;line-height:1.5;}' +
      '.gkmb3-reward-close{position:relative;z-index:2;min-width:34px;height:34px;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.05);color:rgba(255,255,255,.70);font:inherit;font-size:17px;font-weight:900;cursor:pointer;}' +
      '.gkmb3-reward-codewrap{position:relative;z-index:1;display:flex;align-items:stretch;gap:8px;margin-top:14px;}' +
      '.gkmb3-reward-code{min-width:0;flex:1;display:flex;align-items:center;padding:12px 14px;border-radius:14px;border:1px dashed rgba(250,204,21,.42);background:rgba(0,0,0,.27);color:#fef3c7;font-size:clamp(16px,3vw,23px);font-weight:1000;letter-spacing:.055em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.gkmb3-reward-actions{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}' +
      '.gkmb3-reward-terms{position:relative;z-index:1;margin-top:11px;color:rgba(255,255,255,.46);font-size:8.5px;line-height:1.45;}' +
      '.gkmb3-reward-progress{position:relative;z-index:1;margin-top:12px;height:7px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;}' +
      '.gkmb3-reward-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#22c55e,#facc15);}' +
      '.gkmb3-reward-compact{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-radius:16px;border:1px solid rgba(245,158,11,.20);background:rgba(245,158,11,.055);}' +
      '.gkmb3-reward-compact span{color:#fde68a;font-size:10px;font-weight:900;}' +

      '.gkmb3-launch-head{display:flex;align-items:end;justify-content:space-between;gap:12px;}' +
      '.gkmb3-launch-head h3{margin:0;color:#fff;font-size:19px;font-weight:1000;}' +
      '.gkmb3-launch-head p{margin:4px 0 0;color:rgba(255,255,255,.48);font-size:10px;}' +
      '.gkmb3-launch-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}' +
      '.gkmb3-launch{position:relative;min-height:132px;display:grid;align-content:space-between;gap:12px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.09);background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.025));color:inherit;text-align:left;font:inherit;cursor:pointer;transition:.16s ease;overflow:hidden;}' +
      '.gkmb3-launch:before{content:"";position:absolute;inset:auto -28px -34px auto;width:100px;height:100px;border-radius:50%;background:var(--gk-accent,rgba(34,197,94,.16));filter:blur(2px);}' +
      '.gkmb3-launch:hover{transform:translateY(-2px);border-color:rgba(34,197,94,.28);background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(34,197,94,.035));}' +
      '.gkmb3-launch-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;position:relative;z-index:1;}' +
      '.gkmb3-launch-icon{width:39px;height:39px;display:grid;place-items:center;border-radius:12px;background:rgba(0,0,0,.20);border:1px solid rgba(255,255,255,.08);font-size:20px;}' +
      '.gkmb3-launch-stat{padding:5px 7px;border-radius:999px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.62);font-size:8px;font-weight:950;white-space:nowrap;}' +
      '.gkmb3-launch-body{position:relative;z-index:1;}' +
      '.gkmb3-launch-title{color:#fff;font-size:13px;font-weight:1000;}' +
      '.gkmb3-launch-desc{margin-top:4px;color:rgba(255,255,255,.50);font-size:9px;line-height:1.35;}' +

      '.gkmb3-pagehead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:4px 2px 2px;}' +
      '.gkmb3-pagehead h2{margin:0;color:#fff;font-size:27px;line-height:1;font-weight:1000;letter-spacing:-.035em;}' +
      '.gkmb3-pagehead p{margin:6px 0 0;max-width:720px;color:rgba(255,255,255,.52);font-size:11px;line-height:1.45;}' +
      '.gkmb3-pagehead .gkmb3-btn{min-height:37px;padding:7px 10px;font-size:10px;}' +
      '.gkmb3-featureview{display:grid;gap:13px;}' +
      '.gkmb3-featurecard{border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.025));border-radius:22px;padding:15px;}' +
      '.gkmb3-featurecard>.gkmb3-bagscore,.gkmb3-featurecard>.gkmb3-throwadvisor,.gkmb3-featurecard>.gkmb3-roundbag{margin-top:0;}' +
      '.gkmb3-featurelinks{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0 3px;}' +
      '.gkmb3-featurelinks .gkmb3-btn{min-height:35px;padding:7px 9px;font-size:9px;}' +
      '.gkmb3-discworkspace{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start;}' +
      '.gkmb3-addpanel{padding:0;overflow:hidden;}' +
      '.gkmb3-addpanel-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;}' +
      '.gkmb3-addpanel-head h3{margin:0 0 3px;}' +
      '.gkmb3-addpanel-head p{margin:0;font-size:11px;}' +
      '.gkmb3-addpanel-body{padding:0 16px 16px;border-top:1px solid rgba(255,255,255,.08);}' +
      '.gkmb3-addpanel-body>.gkmb3-field:first-child{margin-top:14px;}' +
      '@media(min-width:761px){.gkmb3-addpanel.open .gkmb3-results{grid-template-columns:repeat(2,minmax(0,1fr));max-height:520px;overflow-y:auto;padding-right:4px;}}' +

      '.gkmb3-mobilebar{display:none;}' +
      '.gkmb3-moresheet{display:none;}' +

      '@media(max-width:1050px){.gkmb3-appframe{grid-template-columns:205px minmax(0,1fr);}.gkmb3-launch-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
      '@media(max-width:760px){' +
        '#min-bag-root{margin-top:8px;}' +
        '.gkmb3-shell.gkmb3-appshell{padding-bottom:88px;}' +
        '.gkmb3-appframe{display:block;}' +
        '.gkmb3-sidebar{display:none;}' +
        '.gkmb3-appmain{gap:11px;}' +
        '.gkmb3-appbar{padding:9px 10px;border-radius:14px;}' +
        '.gkmb3-appbar-actions .gkmb3-btn{min-width:42px;}' +
        '.gkmb3-homehero{grid-template-columns:1fr;padding:16px;border-radius:21px;}' +
        '.gkmb3-homebagvisual{min-height:180px;max-height:220px;}' +
        '.gkmb3-homehero h2{font-size:34px;}' +
        '.gkmb3-reward{padding:14px;border-radius:18px;}' +
        '.gkmb3-reward h3{font-size:18px;}' +
        '.gkmb3-reward-codewrap{display:grid;grid-template-columns:1fr;}' +
        '.gkmb3-reward-code{font-size:17px;}' +
        '.gkmb3-homestats{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '.gkmb3-launch-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}' +
        '.gkmb3-launch{min-height:124px;padding:12px;border-radius:16px;}' +
        '.gkmb3-launch-title{font-size:12px;}' +
        '.gkmb3-pagehead h2{font-size:24px;}' +
        '.gkmb3-pagehead p{font-size:10px;}' +
        '.gkmb3-sectionnav{display:none!important;}' +
        '.gkmb3-mobilebar{position:fixed;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));z-index:9998;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:6px;border-radius:18px;border:1px solid rgba(34,197,94,.26);background:rgba(3,11,7,.97);box-shadow:0 -8px 30px rgba(0,0,0,.48);backdrop-filter:blur(14px);}' +
        '.gkmb3-mobilebar button{min-width:0;min-height:52px;display:grid;place-items:center;align-content:center;gap:2px;padding:5px 2px;border:1px solid transparent;border-radius:13px;background:transparent;color:rgba(255,255,255,.58);font:inherit;cursor:pointer;}' +
        '.gkmb3-mobilebar button.active{border-color:rgba(34,197,94,.27);background:rgba(34,197,94,.13);color:#dcfce7;}' +
        '.gkmb3-mobilebar b{font-size:18px;line-height:1;}' +
        '.gkmb3-mobilebar span{max-width:100%;font-size:8px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.gkmb3-moresheet{position:fixed;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));bottom:78px;z-index:9997;display:grid;gap:10px;padding:13px;border-radius:20px;border:1px solid rgba(34,197,94,.24);background:rgba(5,16,10,.985);box-shadow:0 -16px 48px rgba(0,0,0,.52);}' +
        '.gkmb3-moresheet-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#fff;font-size:13px;font-weight:1000;}' +
        '.gkmb3-moresheet-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}' +
        '.gkmb3-moresheet-grid button{min-height:58px;display:flex;align-items:center;gap:9px;padding:9px;border-radius:13px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);color:#fff;font:inherit;font-size:10px;font-weight:900;text-align:left;}' +
      '}' +
      '@media(max-width:420px){.gkmb3-launch-grid{grid-template-columns:1fr 1fr;}.gkmb3-launch{min-height:116px;}.gkmb3-homebagvisual{min-height:160px;}.gkmb3-mobilebar span{font-size:7.5px;}}';

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
            reject(new Error('Innloggingstjenesten brukte for lang tid på å laste.'));
          }
        }, 100);
        return;
      }

      var script = document.createElement('script');
      script.id = 'gk-minbag-v3-supabase-sdk';
      script.src = CONFIG.SUPABASE_SDK;
      script.defer = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Kunne ikke laste innloggingstjenesten.')); };
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
      'De mest brukte discmodellene blant Min Bag-brukerne. Hver bruker teller én gang per modell, og bare modeller som finnes i GolfKongen-nettbutikken vises.'
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


  function appViewMeta(view) {
    var map = {
      home: {
        icon: '⌂',
        title: 'Hjem',
        short: 'Hjem',
        description: 'Oversikt over den aktive bagen og snarveier til hele Min Bag.'
      },
      bag: {
        icon: '🎒',
        title: 'Bagen min',
        short: 'Bag',
        description: 'Bytt bag, endre navn og velg hvordan bagen skal se ut.'
      },
      recommendations: {
        icon: '🎯',
        title: 'Anbefalinger',
        short: 'Tips',
        description: 'Personlige forslag basert på spillestil, hva bagen dekker og hvilke discer som overlapper.'
      },
      score: {
        icon: '🏆',
        title: 'Bag-score',
        short: 'Score',
        description: 'Se hvor komplett og balansert den aktive bagen er.'
      },
      throw: {
        icon: '🥏',
        title: 'Hva bør jeg kaste?',
        short: 'Kast',
        description: 'La Min Bag velge blant discene du faktisk har til kastet du står foran.'
      },
      roundbag: {
        icon: '🧳',
        title: 'Rundebag',
        short: 'Rundebag',
        description: 'Bygg en kompakt bag for banen eller runden du skal spille.'
      },
      discs: {
        icon: '💿',
        title: 'Discer',
        short: 'Discer',
        description: 'Se, filtrer, rediger og legg til discer i den aktive bagen.'
      },
      courses: {
        icon: '🗺',
        title: 'Baner',
        short: 'Baner',
        description: 'Søk etter bane, registrer spilte baner og bygg Rundebag for valgt bane.'
      },
      popular: {
        icon: '🔥',
        title: 'Topp 3',
        short: 'Toppliste',
        description: 'Se hvilke discmodeller som er mest brukt blant Min Bag-brukerne.'
      },
      feedback: {
        icon: '💬',
        title: 'Tilbakemelding',
        short: 'Tilbakemelding',
        description: 'Send forslag, meld fra om noe som mangler eller fortell oss hvis noe ikke fungerer.'
      }
    };

    return map[view] || map.home;
  }

  function allAppViews() {
    return [
      'home',
      'bag',
      'recommendations',
      'score',
      'throw',
      'roundbag',
      'discs',
      'courses',
      'popular',
      'feedback'
    ];
  }

  function openAppView(view) {
    var allowed = allAppViews();
    STATE.activeView = allowed.indexOf(view) >= 0 ? view : 'home';
    STATE.appMenuOpen = false;
    render();

    window.setTimeout(function () {
      if (!root) return;

      var y = root.getBoundingClientRect().top +
        (window.pageYOffset || document.documentElement.scrollTop || 0) -
        10;

      window.scrollTo({
        top: Math.max(0, y),
        behavior: 'smooth'
      });
    }, 0);
  }

  function appMenuItems() {
    var counts = bagSummaryCounts();
    var scoreText =
      STATE.bagScore && STATE.bagScoreLoaded
        ? Math.round(Number(STATE.bagScore.overall_score) || 0) + '/100'
        : 'Bag-score';

    return [
      {
        view: 'bag',
        icon: '🎒',
        title: 'Bagen min',
        desc: 'Bytt bag, bilde og navn.',
        stat: STATE.bags.length + (STATE.bags.length === 1 ? ' bag' : ' bager'),
        accent: 'rgba(34,197,94,.18)'
      },
      {
        view: 'recommendations',
        icon: '🎯',
        title: 'Anbefalinger',
        desc: 'Se hva som mangler, hva som overlapper og få personlige forslag.',
        stat: STATE.recoProfile
          ? Number(STATE.recoFindings.length || 0) + ' funn'
          : 'Lag profil',
        accent: 'rgba(59,130,246,.18)'
      },
      {
        view: 'score',
        icon: '🏆',
        title: 'Bag-score',
        desc: 'Hvor komplett er bagen din?',
        stat: scoreText,
        accent: 'rgba(245,158,11,.19)'
      },
      {
        view: 'throw',
        icon: '🥏',
        title: 'Hva bør jeg kaste?',
        desc: 'Din digitale caddie til neste kast.',
        stat: STATE.discs.length ? 'Klar' : 'Trenger discer',
        accent: 'rgba(14,165,233,.18)'
      },
      {
        view: 'roundbag',
        icon: '🧳',
        title: 'Rundebag',
        desc: 'Plukk 5, 8 eller 12 discer til runden.',
        stat: '5 · 8 · 12',
        accent: 'rgba(249,115,22,.18)'
      },
      {
        view: 'discs',
        icon: '💿',
        title: 'Discer',
        desc: 'Se, rediger og legg til discer.',
        stat: counts.total + ' · ★ ' + counts.favorites,
        accent: 'rgba(168,85,247,.18)'
      },
      {
        view: 'courses',
        icon: '🗺',
        title: 'Baner',
        desc: 'Finn bane og hold styr på hvor du har spilt.',
        stat: Number(STATE.coursePlayedCount || 0) + ' spilt',
        accent: 'rgba(20,184,166,.18)'
      },
      {
        view: 'popular',
        icon: '🔥',
        title: 'Topp 3',
        desc: 'Populære discmodeller blant Min Bag-brukere.',
        stat: STATE.top3Loaded ? STATE.top3.length + ' på lista' : 'Laster',
        accent: 'rgba(244,63,94,.16)'
      }
    ];
  }

  function renderLaunchButton(item) {
    var button = el('button', 'gkmb3-launch');
    button.type = 'button';
    button.style.setProperty('--gk-accent', item.accent || 'rgba(34,197,94,.16)');

    var top = el('div', 'gkmb3-launch-top');
    top.appendChild(el('div', 'gkmb3-launch-icon', item.icon));
    top.appendChild(el('div', 'gkmb3-launch-stat', item.stat || 'Åpne'));
    button.appendChild(top);

    var body = el('div', 'gkmb3-launch-body');
    body.appendChild(el('div', 'gkmb3-launch-title', item.title));
    body.appendChild(el('div', 'gkmb3-launch-desc', item.desc));
    button.appendChild(body);

    button.onclick = function () {
      openAppView(item.view);
    };

    return button;
  }

  function dashboardBagImageUrl(bag) {
    if (!bag) return '';

    // Hjem-siden skal bruke nøyaktig samme bildeprioritet som "Bagen min":
    // Har bagen en valgt GolfKongen-sekk, er det DEN som representerer bagen.
    // Eget opplastet bilde brukes bare når ingen GolfKongen-sekk er valgt.
    var selection = currentStoreBagSelection(bag.id);

    if (selection && selection.quickbutik_product_id) {
      var productId = safe(selection.quickbutik_product_id);
      var storeUrl = STATE.storeBagImageUrls[productId] || '';

      if (storeUrl) return storeUrl;

      // Normalt er bildet allerede prelastet av loadStoreBagSelections().
      // Denne fallbacken gjør dashboardet robust dersom bildet kommer litt senere.
      if (!STATE.storeBagImageLoading[productId]) {
        window.setTimeout(function () {
          ensureStoreBagImage(productId)
            .then(function () {
              render();
            })
            .catch(function () {});
        }, 0);
      }

      return '';
    }

    return STATE.bagImageUrls[bag.id] || '';
  }

  function uniqueMoldCount() {
    var seen = {};

    for (var i = 0; i < STATE.discs.length; i += 1) {
      var disc = STATE.discs[i] || {};
      var key = trim(disc.mold_key);

      if (!key) {
        key = [
          trim(disc.brand).toLowerCase(),
          trim(disc.mold_name || disc.name).toLowerCase()
        ].join('|');
      }

      if (key && key !== '|') seen[key] = true;
    }

    return Object.keys(seen).length;
  }

  function dashboardInsight() {
    if (!STATE.discs.length) {
      return '🎒 Bagen er klar – nå mangler bare den første discen.';
    }

    if (!STATE.recoProfile) {
      return '🎯 Lag spillerprofilen din, så kan Min Bag begynne å jobbe som digital caddie.';
    }

    if (STATE.bagScoreLoaded && STATE.bagScore) {
      var score = Math.round(Number(STATE.bagScore.overall_score) || 0);

      if (score >= 88) {
        return '👑 Denne bagen ser svært komplett ut. Bruk caddien og Rundebag til å få mer ut av den.';
      }

      if (score >= 70) {
        return '⚡ Solid utgangspunkt. Anbefalingene kan vise hvilke roller som fortsatt er verdt å fylle.';
      }

      return '🛠 Det er fortsatt noen tydelige muligheter i bagen – sjekk anbefalingene for de viktigste.';
    }

    return '🥏 ' + STATE.discs.length + ' discer er klare i den aktive bagen.';
  }

  function rewardTermsText() {
    return 'Én gangs bruk. Gyldig til 31.12.2026. Gjelder ikke permanente kurver eller Custom Print-discer og kan ikke kombineres med andre rabattkoder.';
  }

  function copyRewardCode(code) {
    code = trim(code);
    if (!code) return;

    function done() {
      status('Rabattkoden er kopiert.', 'ok');
    }

    function fallback() {
      var area = document.createElement('textarea');
      area.value = code;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();

      try {
        document.execCommand('copy');
        done();
      } catch (err) {
        status('Kunne ikke kopiere automatisk. Marker koden og kopier den manuelt.', 'err');
      }

      document.body.removeChild(area);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code)
        .then(done)
        .catch(fallback);
      return;
    }

    fallback();
  }

  function renderRewardCard() {
    if (!STATE.rewardLoaded) return null;

    if (STATE.rewardError) {
      var errorCard = el('section', 'gkmb3-reward-compact');
      errorCard.appendChild(el(
        'span',
        '',
        '🎁 Min Bag-rabatten kunne ikke lastes akkurat nå.'
      ));
      return errorCard;
    }

    var reward = STATE.reward || {};
    var code = trim(reward.reward_code);
    var maxDiscs = Math.max(0, Number(reward.max_discs_in_one_bag) || 0);

    if (code && reward.card_hidden) {
      var compact = el('section', 'gkmb3-reward-compact');
      compact.appendChild(el('span', '', '🎁 Du har en personlig 15 % rabattkode klar.'));

      var show = el('button', 'gkmb3-btn secondary', 'Vis min rabattkode');
      show.type = 'button';
      show.disabled = !!STATE.rewardBusy;
      show.onclick = function () {
        setRewardCardHidden(false);
      };
      compact.appendChild(show);
      return compact;
    }

    var card = el('section', 'gkmb3-reward');
    var head = el('div', 'gkmb3-reward-head');
    var copy = el('div', '');

    if (code) {
      copy.appendChild(el('div', 'gkmb3-reward-kicker', '🎁 Min Bag-belønning låst opp'));
      copy.appendChild(el('h3', '', 'Du har fått 15 % rabatt på ett kjøp'));
      copy.appendChild(el(
        'p',
        '',
        'Du har bygget en bag med minst 3 discer. Denne koden er personlig tildelt Min Bag-brukeren din.'
      ));
      head.appendChild(copy);

      var close = el('button', 'gkmb3-reward-close', '×');
      close.type = 'button';
      close.title = 'Skjul rabattkoden';
      close.setAttribute('aria-label', 'Skjul rabattkoden');
      close.disabled = !!STATE.rewardBusy;
      close.onclick = function () {
        setRewardCardHidden(true);
      };
      head.appendChild(close);
      card.appendChild(head);

      var codeWrap = el('div', 'gkmb3-reward-codewrap');
      codeWrap.appendChild(el('div', 'gkmb3-reward-code', code));

      var copyBtn = el('button', 'gkmb3-btn', 'Kopier kode');
      copyBtn.type = 'button';
      copyBtn.onclick = function () {
        copyRewardCode(code);
      };
      codeWrap.appendChild(copyBtn);
      card.appendChild(codeWrap);

      var actions = el('div', 'gkmb3-reward-actions');
      var shop = el('button', 'gkmb3-btn', '🛒 Handle nå');
      shop.type = 'button';
      shop.onclick = function () {
        window.location.href = 'https://golfkongen.no/';
      };
      actions.appendChild(shop);

      var hide = el('button', 'gkmb3-btn secondary', 'Skjul for nå');
      hide.type = 'button';
      hide.disabled = !!STATE.rewardBusy;
      hide.onclick = function () {
        setRewardCardHidden(true);
      };
      actions.appendChild(hide);
      card.appendChild(actions);

      card.appendChild(el('div', 'gkmb3-reward-terms', rewardTermsText()));
      return card;
    }

    if (maxDiscs < 3) {
      copy.appendChild(el('div', 'gkmb3-reward-kicker', '🎁 Belønning for å bygge Min Bag'));
      copy.appendChild(el('h3', '', 'Bygg bagen – få 15 % rabatt'));
      copy.appendChild(el(
        'p',
        '',
        'Legg minst 3 discer i én bag, så låser du automatisk opp en personlig rabattkode på 15 % til ett kjøp.'
      ));
      head.appendChild(copy);
      card.appendChild(head);

      var progress = el('div', 'gkmb3-reward-progress');
      var fill = el('span', '');
      fill.style.width = Math.min(100, (maxDiscs / 3) * 100) + '%';
      progress.appendChild(fill);
      card.appendChild(progress);

      card.appendChild(el(
        'div',
        'gkmb3-reward-terms',
        maxDiscs + ' av 3 discer i din mest fylte bag. ' + rewardTermsText()
      ));
      return card;
    }

    return null;
  }

  function renderHomeDashboard() {
    var wrap = el('div', 'gkmb3-home');
    var bag = activeBag();
    var counts = bagSummaryCounts();

    var hero = el('section', 'gkmb3-homehero');
    var copy = el('div', '');

    copy.appendChild(el(
      'div',
      'gkmb3-homeeyebrow',
      'GolfKongen · din digitale caddie'
    ));

    copy.appendChild(el(
      'h2',
      '',
      bag ? bag.name : 'Min Bag'
    ));

    copy.appendChild(el(
      'div',
      'gkmb3-homelead',
      STATE.user && STATE.user.email
        ? 'Innlogget som ' + STATE.user.email + '. Her er status på bagen din akkurat nå.'
        : 'Her er status på bagen din akkurat nå.'
    ));

    var stats = el('div', 'gkmb3-homestats');

    var statRows = [
      [String(counts.total), 'Discer'],
      [String(uniqueMoldCount()), 'Ulike modeller'],
      [String(counts.favorites), 'Favoritter'],
      [String(Number(STATE.coursePlayedCount || 0)), 'Baner spilt']
    ];

    for (var i = 0; i < statRows.length; i += 1) {
      var stat = el('div', 'gkmb3-homestat');
      stat.appendChild(el('strong', '', statRows[i][0]));
      stat.appendChild(el('span', '', statRows[i][1]));
      stats.appendChild(stat);
    }

    copy.appendChild(stats);

    var flight = el('div', 'gkmb3-homeflight');
    flight.appendChild(el('span', '', 'Putter ' + counts.putter));
    flight.appendChild(el('span', '', 'Midrange ' + counts.midrange));
    flight.appendChild(el('span', '', 'Fairway ' + counts.fairway));
    flight.appendChild(el('span', '', 'Distance ' + counts.distance));
    copy.appendChild(flight);

    copy.appendChild(el(
      'div',
      'gkmb3-homeinsight',
      dashboardInsight()
    ));

    var quick = el('div', 'gkmb3-toolbar');
    quick.style.marginTop = '12px';

    var addDisc = el('button', 'gkmb3-btn', '+ Legg til disc');
    addDisc.type = 'button';
    addDisc.onclick = function () {
      STATE.addDiscOpen = true;
      openAppView('discs');
    };
    quick.appendChild(addDisc);

    var caddie = el('button', 'gkmb3-btn secondary', '🥏 Åpne caddien');
    caddie.type = 'button';
    caddie.onclick = function () {
      openAppView('throw');
    };
    quick.appendChild(caddie);

    copy.appendChild(quick);
    hero.appendChild(copy);

    var visual = el('div', 'gkmb3-homebagvisual');
    var bagImage = dashboardBagImageUrl(bag);

    if (bagImage) {
      var image = document.createElement('img');
      image.src = bagImage;
      image.alt = bag ? safe(bag.name) : 'Min Bag';
      image.loading = 'lazy';
      visual.appendChild(image);
    } else {
      visual.appendChild(el('div', 'gkmb3-homebagfallback', '🎒'));
    }

    if (STATE.bagScoreLoaded && STATE.bagScore) {
      var score = el('div', 'gkmb3-home-score');
      score.appendChild(el(
        'strong',
        '',
        Math.round(Number(STATE.bagScore.overall_score) || 0) + '/100'
      ));
      score.appendChild(el(
        'span',
        '',
        safe(STATE.bagScore.score_label || 'Bag-score')
      ));
      visual.appendChild(score);
    }

    hero.appendChild(visual);
    wrap.appendChild(hero);

    var rewardCard = renderRewardCard();
    if (rewardCard) wrap.appendChild(rewardCard);

    var launchHead = el('div', 'gkmb3-launch-head');
    var launchCopy = el('div', '');
    launchCopy.appendChild(el('h3', '', 'Hva vil du gjøre?'));
    launchCopy.appendChild(el(
      'p',
      '',
      'Velg en funksjon. Du slipper å lete deg gjennom én lang side.'
    ));
    launchHead.appendChild(launchCopy);
    wrap.appendChild(launchHead);

    var grid = el('div', 'gkmb3-launch-grid');
    var items = appMenuItems();

    for (var j = 0; j < items.length; j += 1) {
      grid.appendChild(renderLaunchButton(items[j]));
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function renderSidebar() {
    var side = el('aside', 'gkmb3-sidebar');

    var brand = el('div', 'gkmb3-sidebrand');
    brand.appendChild(el('strong', '', '👑 GolfKongen'));
    brand.appendChild(el(
      'span',
      '',
      STATE.user && STATE.user.email
        ? STATE.user.email
        : 'Min Bag'
    ));
    side.appendChild(brand);

    var nav = el('nav', 'gkmb3-sidenav');
    nav.setAttribute('aria-label', 'Min Bag-funksjoner');

    var order = [
      'home',
      'bag',
      'recommendations',
      'score',
      'throw',
      'roundbag',
      'discs',
      'courses',
      'popular'
    ];

    for (var i = 0; i < order.length; i += 1) {
      (function (view) {
        var meta = appViewMeta(view);
        var button = el(
          'button',
          STATE.activeView === view ? 'active' : ''
        );
        button.type = 'button';
        button.appendChild(el('span', 'gkmb3-sidenav-icon', meta.icon));
        button.appendChild(document.createTextNode(meta.title));
        button.onclick = function () {
          openAppView(view);
        };
        nav.appendChild(button);
      })(order[i]);
    }

    side.appendChild(nav);

    var footer = el('div', 'gkmb3-sidefooter');

    var feedbackBtn = el(
      'button',
      STATE.activeView === 'feedback'
        ? 'gkmb3-btn'
        : 'gkmb3-btn secondary',
      '💬 Tilbakemelding'
    );
    feedbackBtn.type = 'button';
    feedbackBtn.onclick = function () {
      openAppView('feedback');
    };
    footer.appendChild(feedbackBtn);

    var logoutBtn = el('button', 'gkmb3-btn secondary', 'Logg ut');
    logoutBtn.type = 'button';
    logoutBtn.onclick = logout;
    footer.appendChild(logoutBtn);
    side.appendChild(footer);

    return side;
  }

  function renderAppBar() {
    var meta = appViewMeta(STATE.activeView);
    var bar = el('div', 'gkmb3-appbar');

    var copy = el('div', 'gkmb3-appbar-copy');
    copy.appendChild(el(
      'div',
      'gkmb3-appbar-title',
      meta.icon + ' ' + meta.title
    ));
    copy.appendChild(el(
      'div',
      'gkmb3-appbar-sub',
      activeBag()
        ? safe(activeBag().name) + ' · ' + STATE.discs.length + ' discer'
        : safe(STATE.user && STATE.user.email)
    ));
    bar.appendChild(copy);

    var actions = el('div', 'gkmb3-appbar-actions');

    if (STATE.activeView !== 'home') {
      var home = el('button', 'gkmb3-btn secondary', '⌂ Hjem');
      home.type = 'button';
      home.onclick = function () {
        openAppView('home');
      };
      actions.appendChild(home);
    }

    bar.appendChild(actions);
    return bar;
  }

  function renderPageHead(view) {
    var meta = appViewMeta(view);
    var head = el('div', 'gkmb3-pagehead');
    var copy = el('div', '');
    copy.appendChild(el('h2', '', meta.icon + ' ' + meta.title));
    copy.appendChild(el('p', '', meta.description));
    head.appendChild(copy);

    var home = el('button', 'gkmb3-btn secondary', '← Til forsiden');
    home.type = 'button';
    home.onclick = function () {
      openAppView('home');
    };
    head.appendChild(home);

    return head;
  }

  function renderFeatureGuidance(text, targetView, targetLabel) {
    var card = el('section', 'gkmb3-card');
    card.appendChild(el('div', 'gkmb3-empty', text));

    if (targetView) {
      var button = el(
        'button',
        'gkmb3-btn',
        targetLabel || 'Fortsett'
      );
      button.type = 'button';
      button.style.marginTop = '10px';
      button.onclick = function () {
        openAppView(targetView);
      };
      card.appendChild(button);
    }

    return card;
  }

  function renderScoreView() {
    if (!STATE.recoProfile) {
      return renderFeatureGuidance(
        'Lag spillerprofilen først. Bag-score bruker profilen din for å vurdere hva som faktisk er relevant for deg.',
        'recommendations',
        '🎯 Lag spillerprofil'
      );
    }

    if (!STATE.discs.length) {
      return renderFeatureGuidance(
        'Bagen trenger minst én disc før vi kan beregne en meningsfull Bag-score.',
        'discs',
        '💿 Legg til discer'
      );
    }

    var card = el('section', 'gkmb3-featurecard');
    card.appendChild(renderBagScore());
    return card;
  }

  function renderThrowView() {
    if (!STATE.recoProfile) {
      return renderFeatureGuidance(
        'Lag spillerprofilen først, så kjenner caddien kastelengden og spillestilen din.',
        'recommendations',
        '🎯 Lag spillerprofil'
      );
    }

    if (!STATE.discs.length) {
      return renderFeatureGuidance(
        'Caddien kan bare velge blant discer du faktisk eier. Legg noen discer i bagen først.',
        'discs',
        '💿 Legg til discer'
      );
    }

    var card = el('section', 'gkmb3-featurecard');
    card.appendChild(renderThrowAdvisor());
    return card;
  }

  function renderRoundBagView() {
    if (!STATE.recoProfile) {
      return renderFeatureGuidance(
        'Lag spillerprofilen først, så kan Rundebag tilpasses nivået og kastelengden din.',
        'recommendations',
        '🎯 Lag spillerprofil'
      );
    }

    if (!STATE.discs.length) {
      return renderFeatureGuidance(
        'Rundebag trenger discer å velge mellom. Legg noen discer i bagen først.',
        'discs',
        '💿 Legg til discer'
      );
    }

    var card = el('section', 'gkmb3-featurecard');
    card.appendChild(renderRoundBagBuilder());
    return card;
  }

  function renderDiscsWorkspace() {
    var wrap = el('div', 'gkmb3-discworkspace');
    wrap.appendChild(renderAddPanel());
    wrap.appendChild(renderBagContents());
    return wrap;
  }


  function feedbackTypeSelect() {
    return createRecoSelect(
      'gkmb3-feedback-type',
      [
        ['suggestion', 'Forslag'],
        ['missing', 'Noe mangler'],
        ['bug', 'Feil / noe fungerer ikke'],
        ['other', 'Annet']
      ],
      'suggestion'
    );
  }

  function renderFeedbackPanel() {
    var card = el('section', 'gkmb3-featurecard');

    card.appendChild(el(
      'h3',
      '',
      'Hjelp oss å gjøre Min Bag bedre'
    ));

    card.appendChild(el(
      'p',
      'gkmb3-muted',
      'Savner du en funksjon, finner du en disc eller bane som mangler, eller er det noe som ikke fungerer? Send det til oss her.'
    ));

    var form = el('div', 'gkmb3-recoform');

    form.appendChild(field(
      'Hva gjelder det?',
      feedbackTypeSelect()
    ));

    var message = el('textarea', 'gkmb3-textarea');
    message.id = 'gkmb3-feedback-message';
    message.maxLength = 5000;
    message.placeholder =
      'Beskriv forslaget eller problemet så konkret du kan.';

    var messageWrap = field(
      'Tilbakemelding *',
      message
    );

    var charCount = el(
      'div',
      'gkmb3-note',
      '0 / 5000 tegn'
    );

    message.oninput = function () {
      charCount.textContent =
        String(message.value.length) +
        ' / 5000 tegn';
    };

    messageWrap.appendChild(charCount);
    form.appendChild(messageWrap);

    var replyLabel = el('label', 'gkmb3-check');
    var replyCheck = document.createElement('input');
    replyCheck.type = 'checkbox';
    replyCheck.id = 'gkmb3-feedback-reply';
    replyCheck.checked = true;

    replyLabel.appendChild(replyCheck);
    replyLabel.appendChild(document.createTextNode(
      'GolfKongen kan kontakte meg om denne tilbakemeldingen'
    ));
    form.appendChild(replyLabel);

    var email = el('input', 'gkmb3-input');
    email.id = 'gkmb3-feedback-email';
    email.type = 'email';
    email.autocomplete = 'email';
    email.placeholder = 'E-post for svar';
    email.value = safe(
      STATE.user && STATE.user.email
    );

    var emailField = field(
      'E-post for svar',
      email
    );
    form.appendChild(emailField);

    replyCheck.onchange = function () {
      email.disabled = !replyCheck.checked;
      emailField.style.opacity =
        replyCheck.checked ? '1' : '.45';

      if (
        replyCheck.checked &&
        !trim(email.value) &&
        STATE.user &&
        STATE.user.email
      ) {
        email.value = safe(STATE.user.email);
      }
    };

    form.appendChild(el(
      'div',
      'gkmb3-note',
      'Tilbakemeldingen knyttes til Min Bag-kontoen din for å hindre misbruk og gjøre feil enklere å følge opp. Kontakt-e-posten brukes bare dersom du ønsker svar. Innholdet i bagen din sendes ikke med.'
    ));

    var send = el(
      'button',
      'gkmb3-btn',
      'Send tilbakemelding'
    );
    send.type = 'button';
    send.id = 'gkmb3-feedback-submit';

    var localStatus = el(
      'div',
      'gkmb3-status'
    );
    localStatus.style.display = 'none';

    function setFeedbackStatus(text, type) {
      localStatus.textContent = text || '';
      localStatus.className =
        'gkmb3-status' +
        (type ? ' ' + type : '');
      localStatus.style.display =
        text ? 'block' : 'none';
    }

    send.onclick = function () {
      var feedbackType =
        getInputValue('gkmb3-feedback-type');

      var feedbackMessage =
        getInputValue('gkmb3-feedback-message');

      var wantsReply = !!replyCheck.checked;

      var contactEmail = wantsReply
        ? getInputValue('gkmb3-feedback-email')
        : '';

      if (trim(feedbackMessage).length < 5) {
        setFeedbackStatus(
          'Skriv litt mer om tilbakemeldingen.',
          'err'
        );
        message.focus();
        return;
      }

      if (
        wantsReply &&
        (
          !contactEmail ||
          contactEmail.indexOf('@') <= 0
        )
      ) {
        setFeedbackStatus(
          'Skriv inn en gyldig e-postadresse, eller fjern valget om at vi kan kontakte deg.',
          'err'
        );
        email.focus();
        return;
      }

      send.disabled = true;
      send.textContent = 'Sender…';

      setFeedbackStatus(
        'Lagrer tilbakemeldingen…',
        ''
      );

      supabaseClient.rpc(
        'minbag_submit_feedback',
        {
          p_feedback_type: feedbackType,
          p_message: trim(feedbackMessage),
          p_contact_email: wantsReply
            ? trim(contactEmail)
            : null,
          p_app_version: VERSION,
          p_app_view: STATE.activeView || 'feedback'
        }
      ).then(function (res) {
        if (res.error) {
          throw res.error;
        }

        var row = Array.isArray(res.data)
          ? res.data[0]
          : res.data;

        var feedbackId =
          row && row.feedback_id
            ? safe(row.feedback_id)
            : '';

        if (!feedbackId) {
          throw new Error(
            'Tilbakemeldingen ble lagret, men mangler referanse.'
          );
        }

        setFeedbackStatus(
          'Tilbakemeldingen er lagret. Sender varsel til GolfKongen…',
          ''
        );

        return supabaseClient.functions.invoke(
          'minbag-feedback-email',
          {
            body: {
              feedback_id: feedbackId
            }
          }
        ).then(function (mailRes) {
          message.value = '';
          charCount.textContent = '0 / 5000 tegn';

          if (mailRes.error) {
            console.warn(
              'Min Bag feedback email:',
              mailRes.error
            );

            setFeedbackStatus(
              'Takk! Tilbakemeldingen er lagret hos oss. E-postvarslingen kunne ikke sendes akkurat nå, men meldingen din er mottatt.',
              'ok'
            );
            return;
          }

          setFeedbackStatus(
            'Takk! Tilbakemeldingen er sendt til GolfKongen.',
            'ok'
          );
        });
      }).catch(function (err) {
        setFeedbackStatus(
          'Kunne ikke sende tilbakemeldingen: ' +
          errorMessage(err),
          'err'
        );
      }).finally(function () {
        send.disabled = false;
        send.textContent = 'Send tilbakemelding';
      });
    };

    form.appendChild(send);
    form.appendChild(localStatus);
    card.appendChild(form);

    return card;
  }


  function renderCurrentAppView() {
    var view = STATE.activeView || 'home';

    if (view === 'home') {
      return renderHomeDashboard();
    }

    var wrap = el('div', 'gkmb3-featureview');
    wrap.appendChild(renderPageHead(view));

    if (view === 'bag') {
      wrap.appendChild(renderBagManager());
    } else if (view === 'recommendations') {
      wrap.appendChild(renderRecommendationPanel());
    } else if (view === 'score') {
      wrap.appendChild(renderScoreView());
    } else if (view === 'throw') {
      wrap.appendChild(renderThrowView());
    } else if (view === 'roundbag') {
      wrap.appendChild(renderRoundBagView());
    } else if (view === 'discs') {
      wrap.appendChild(renderDiscsWorkspace());
    } else if (view === 'courses') {
      wrap.appendChild(renderCoursePanel());
    } else if (view === 'popular') {
      wrap.appendChild(renderTop3());
    } else if (view === 'feedback') {
      wrap.appendChild(renderFeedbackPanel());
    } else {
      STATE.activeView = 'home';
      return renderHomeDashboard();
    }

    return wrap;
  }

  function renderMobileBar() {
    var bar = el('nav', 'gkmb3-mobilebar');
    bar.setAttribute('aria-label', 'Hovednavigasjon i Min Bag');

    var items = [
      ['home', '⌂', 'Hjem'],
      ['discs', '💿', 'Discer'],
      ['throw', '🥏', 'Caddie'],
      ['courses', '🗺', 'Baner']
    ];

    for (var i = 0; i < items.length; i += 1) {
      (function (row) {
        var button = el(
          'button',
          STATE.activeView === row[0] ? 'active' : ''
        );
        button.type = 'button';
        button.appendChild(el('b', '', row[1]));
        button.appendChild(el('span', '', row[2]));
        button.onclick = function () {
          openAppView(row[0]);
        };
        bar.appendChild(button);
      })(items[i]);
    }

    var more = el(
      'button',
      STATE.appMenuOpen ? 'active' : ''
    );
    more.type = 'button';
    more.appendChild(el('b', '', '☰'));
    more.appendChild(el('span', '', 'Mer'));
    more.onclick = function () {
      STATE.appMenuOpen = !STATE.appMenuOpen;
      render();
    };
    bar.appendChild(more);

    return bar;
  }

  function renderMoreSheet() {
    if (!STATE.appMenuOpen) return null;

    var sheet = el('div', 'gkmb3-moresheet');
    var head = el('div', 'gkmb3-moresheet-head');
    head.appendChild(document.createTextNode('Velg funksjon'));

    var close = el('button', 'gkmb3-btn secondary', 'Lukk');
    close.type = 'button';
    close.style.minHeight = '32px';
    close.style.padding = '5px 8px';
    close.onclick = function () {
      STATE.appMenuOpen = false;
      render();
    };
    head.appendChild(close);
    sheet.appendChild(head);

    var grid = el('div', 'gkmb3-moresheet-grid');
    var views = [
      'bag',
      'recommendations',
      'score',
      'roundbag',
      'popular',
      'feedback'
    ];

    for (var i = 0; i < views.length; i += 1) {
      (function (view) {
        var meta = appViewMeta(view);
        var button = el('button', '');
        button.type = 'button';
        button.appendChild(el('span', '', meta.icon));
        button.appendChild(document.createTextNode(meta.title));
        button.onclick = function () {
          openAppView(view);
        };
        grid.appendChild(button);
      })(views[i]);
    }

    var logoutBtn = el('button', '');
    logoutBtn.type = 'button';
    logoutBtn.appendChild(el('span', '', '↪'));
    logoutBtn.appendChild(document.createTextNode('Logg ut'));
    logoutBtn.onclick = logout;
    grid.appendChild(logoutBtn);

    sheet.appendChild(grid);
    return sheet;
  }

  function render() {
    if (!root) return;

    clear(root);

    var shell = el(
      'div',
      'gkmb3-shell' + (STATE.user ? ' gkmb3-appshell' : '')
    );

    if (!STATE.user) {
      var hero = el('section', 'gkmb3-hero');

      hero.appendChild(el(
        'div',
        'gkmb3-eyebrow',
        'GolfKongen · Min Bag'
      ));
      hero.appendChild(el('h2', '', 'Min bag'));
      hero.appendChild(el(
        'p',
        '',
        'Logg inn med e-post for å bygge og lagre discgolf-bagen din. Du får en sikker innloggingslenke på e-post.'
      ));
      hero.appendChild(renderLogin());

      var loggedOutStatus = el(
        'div',
        'gkmb3-status',
        'Ikke innlogget.'
      );
      loggedOutStatus.id = 'gkmb3-status';
      hero.appendChild(loggedOutStatus);

      shell.appendChild(hero);
      shell.appendChild(renderTop3());
      root.appendChild(shell);
      return;
    }

    var frame = el('div', 'gkmb3-appframe');
    frame.appendChild(renderSidebar());

    var main = el('main', 'gkmb3-appmain');
    main.appendChild(renderAppBar());

    var appStatus = el(
      'div',
      'gkmb3-status ok gkmb3-appstatus',
      'Klar.'
    );
    appStatus.id = 'gkmb3-status';
    main.appendChild(appStatus);
    main.appendChild(renderCurrentAppView());

    frame.appendChild(main);
    shell.appendChild(frame);
    shell.appendChild(renderMobileBar());

    var sheet = renderMoreSheet();
    if (sheet) shell.appendChild(sheet);

    root.appendChild(shell);
  }

  function courseStyleLabel(value) {
    return {
      technical: 'Teknisk / skog',
      mixed: 'Blandet',
      open: 'Åpen / lengde'
    }[value] || safe(value);
  }

  function courseWindLabel(value) {
    return {
      normal: 'Lite / normal vind',
      mixed: 'Variert vind',
      windy: 'Mye vind'
    }[value] || safe(value);
  }

  function courseFocusLabel(value) {
    return {
      control: 'Kontroll',
      balanced: 'Balansert',
      distance: 'Lengde'
    }[value] || safe(value);
  }

  function courseDifficultyLabel(value) {
    var n = Number(value) || 0;

    return {
      1: 'Lett',
      2: 'Lett–middels',
      3: 'Middels',
      4: 'Krevende',
      5: 'Svært krevende'
    }[n] || '';
  }

  function courseStatusLabel(value) {
    return {
      private: 'Privat',
      pending: 'Venter godkjenning',
      public: 'Offentlig',
      rejected: 'Avvist'
    }[value] || safe(value);
  }

  function courseLocationText(course) {
    var bits = [];
    if (course.locality) bits.push(course.locality);
    if (course.municipality &&
        bits.indexOf(course.municipality) === -1) {
      bits.push(course.municipality);
    }
    if (course.county &&
        bits.indexOf(course.county) === -1) {
      bits.push(course.county);
    }
    return bits.join(' · ');
  }

  function courseTextInput(id, placeholder, type) {
    var input = el('input', 'gkmb3-input');
    input.id = id;
    input.type = type || 'text';
    input.placeholder = placeholder || '';
    return input;
  }

  function courseProgressFor(courseId) {
    if (!courseId) return null;
    return STATE.courseProgress[courseId] || null;
  }

  function formatPersonalBest(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    var n = Number(value);
    if (!isFinite(n)) return safe(value);

    return (n > 0 ? '+' : '') + n;
  }

  function renderCourseProgress(course) {
    var progress = courseProgressFor(course.id);
    var played = !!(progress && progress.has_played);
    var busy = STATE.courseProgressBusyId === course.id;

    var wrap = el(
      'div',
      'gkmb3-course-progress' + (played ? ' played' : '')
    );

    var label = el('label', 'gkmb3-check');
    label.style.cursor = busy ? 'wait' : 'pointer';

    var box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'gkmb3-course-played-' + course.id;
    box.checked = played;
    box.disabled = busy;
    box.style.cursor = busy ? 'wait' : 'pointer';

    box.onclick = function (event) {
      if (event) event.stopPropagation();

      var nextChecked = !!box.checked;
      toggleCoursePlayed(course.id, nextChecked);
    };

    label.appendChild(box);
    label.appendChild(document.createTextNode(
      played
        ? '✓ Har spilt denne banen'
        : 'Har spilt denne banen'
    ));

    label.onclick = function (event) {
      if (busy) return;

      // Native label handles clicks on checkbox/text.
      // Stop course-card/container handlers from interfering.
      if (event) event.stopPropagation();
    };

    wrap.appendChild(label);

    if (!played) {
      return wrap;
    }

    if (progress &&
        progress.personal_best_to_par !== null &&
        progress.personal_best_to_par !== undefined) {
      wrap.appendChild(el(
        'div',
        'gkmb3-course-progress-summary',
        '🏆 Din rekord: ' +
        formatPersonalBest(progress.personal_best_to_par)
      ));
    }

    var grid = el('div', 'gkmb3-course-progress-grid');

    var best = courseTextInput(
      'gkmb3-course-best-' + course.id,
      'F.eks. -7',
      'number'
    );
    best.step = '1';
    best.min = '-100';
    best.max = '200';

    if (progress &&
        progress.personal_best_to_par !== null &&
        progress.personal_best_to_par !== undefined) {
      best.value = safe(progress.personal_best_to_par);
    }

    grid.appendChild(field(
      'Personlig rekord · score mot par',
      best
    ));

    var comment = el('textarea', 'gkmb3-input');
    comment.id = 'gkmb3-course-comment-' + course.id;
    comment.placeholder =
      'Eget notat om banen, favorittlinjer, hva du vil forbedre osv.';
    comment.value =
      progress && progress.comment
        ? safe(progress.comment)
        : '';

    grid.appendChild(field(
      'Din kommentar',
      comment
    ));

    wrap.appendChild(grid);

    var toolbar = el('div', 'gkmb3-toolbar');
    toolbar.style.marginTop = '8px';

    var saveBtn = el(
      'button',
      'gkmb3-btn',
      busy ? 'Lagrer…' : 'Lagre rekord / kommentar'
    );
    saveBtn.type = 'button';
    saveBtn.disabled = busy;
    saveBtn.onclick = function () {
      saveCourseProgress(course.id);
    };

    toolbar.appendChild(saveBtn);
    wrap.appendChild(toolbar);

    return wrap;
  }

  function renderCourseCard(course, options) {
    options = options || {};

    var className = 'gkmb3-course';
    if (options.own) className += ' own';
    if (course.visibility_status === 'pending' || options.pending) {
      className += ' pending';
    }

    var card = el('article', className);
    var head = el('div', 'gkmb3-course-head');
    var title = el('div', '');

    title.appendChild(el(
      'div',
      'gkmb3-course-name',
      safe(course.name)
    ));

    var location = courseLocationText(course);
    if (location) {
      title.appendChild(el(
        'div',
        'gkmb3-course-location',
        location
      ));
    }

    head.appendChild(title);

    if (course.visibility_status) {
      head.appendChild(el(
        'div',
        'gkmb3-course-status',
        courseStatusLabel(course.visibility_status)
      ));
    } else {
      head.appendChild(el(
        'div',
        'gkmb3-course-status',
        'Offentlig bane'
      ));
    }

    card.appendChild(head);

    var badges = el('div', 'gkmb3-course-badges');

    if (course.holes) {
      badges.appendChild(el(
        'span',
        '',
        '🥏 ' + safe(course.holes) + ' hull'
      ));
    }

    if (course.course_style) {
      badges.appendChild(el(
        'span',
        '',
        '🌲 ' + courseStyleLabel(course.course_style)
      ));
    }

    if (course.difficulty_level) {
      badges.appendChild(el(
        'span',
        '',
        '📈 ' + courseDifficultyLabel(course.difficulty_level)
      ));
    }

    if (course.total_length_m) {
      badges.appendChild(el(
        'span',
        '',
        '📏 ' + safe(course.total_length_m) + ' m'
      ));
    }

    if (course.wind_style) {
      badges.appendChild(el(
        'span',
        '',
        '🌬 ' + courseWindLabel(course.wind_style)
      ));
    }

    card.appendChild(badges);

    if (course.description) {
      card.appendChild(el(
        'div',
        'gkmb3-course-desc',
        safe(course.description)
      ));
    }

    if (course.record_player_name) {
      var recordText =
        '🏆 Banerekord: ' +
        safe(course.record_player_name);

      if (course.record_score_to_par !== null &&
          course.record_score_to_par !== undefined) {
        var toPar = Number(course.record_score_to_par);
        recordText +=
          ' · ' +
          (toPar > 0 ? '+' : '') +
          toPar;
      } else if (course.record_total_score !== null &&
                 course.record_total_score !== undefined) {
        recordText +=
          ' · ' +
          safe(course.record_total_score) +
          ' kast';
      }

      if (course.record_layout_name) {
        recordText +=
          ' · ' +
          safe(course.record_layout_name);
      }

      card.appendChild(el(
        'div',
        'gkmb3-course-record',
        recordText
      ));
    }

    if (course.moderation_note &&
        course.visibility_status === 'rejected') {
      card.appendChild(el(
        'div',
        'gkmb3-note',
        'Merknad: ' + safe(course.moderation_note)
      ));
    }

    if (!options.pending) {
      card.appendChild(renderCourseProgress(course));
    }

    var toolbar = el('div', 'gkmb3-toolbar');
    toolbar.style.marginTop = '9px';

    if (!options.pending &&
        course.course_style &&
        course.wind_style &&
        course.focus) {
      var roundBag = el(
        'button',
        'gkmb3-btn',
        '🧳 Rundebag for banen'
      );
      roundBag.type = 'button';
      roundBag.onclick = function () {
        buildRoundBagForCourse(course);
      };
      toolbar.appendChild(roundBag);
    }

    var linkUrl =
      course.website_url ||
      course.map_url ||
      course.source_url ||
      '';

    if (linkUrl) {
      var open = el(
        'a',
        'gkmb3-btn secondary',
        course.website_url
          ? 'Åpne nettside'
          : course.map_url
            ? 'Åpne kart'
            : 'Se kilde'
      );
      open.href = linkUrl;
      open.target = '_blank';
      open.rel = 'noopener';
      toolbar.appendChild(open);
    }

    if (options.pending && STATE.courseAdmin) {
      var approve = el(
        'button',
        'gkmb3-btn',
        '✓ Godkjenn offentlig'
      );
      approve.type = 'button';
      approve.disabled = !!STATE.courseModerationBusy;
      approve.onclick = function () {
        moderateCourse(course.id, 'approve');
      };
      toolbar.appendChild(approve);

      var reject = el(
        'button',
        'gkmb3-btn danger',
        'Avvis'
      );
      reject.type = 'button';
      reject.disabled = !!STATE.courseModerationBusy;
      reject.onclick = function () {
        moderateCourse(course.id, 'reject');
      };
      toolbar.appendChild(reject);
    }

    if (toolbar.childNodes.length) {
      card.appendChild(toolbar);
    }

    return card;
  }

  function renderCourseSubmitForm() {
    var form = el('div', 'gkmb3-course-form');

    form.appendChild(el(
      'div',
      'gkmb3-course-sectiontitle',
      'Legg inn bane'
    ));

    form.appendChild(el(
      'div',
      'gkmb3-note',
      'Du kan beholde banen privat eller sende den til godkjenning. Godkjente baner blir søkbare for alle.'
    ));

    var grid = el('div', 'gkmb3-course-formgrid');

    grid.appendChild(field(
      'Bane *',
      courseTextInput(
        'gkmb3-course-name',
        'F.eks. Lyngdal DiscGolfPark'
      )
    ));

    grid.appendChild(field(
      'Sted',
      courseTextInput(
        'gkmb3-course-locality',
        'F.eks. Lyngdal'
      )
    ));

    grid.appendChild(field(
      'Kommune',
      courseTextInput(
        'gkmb3-course-municipality',
        'F.eks. Lyngdal'
      )
    ));

    grid.appendChild(field(
      'Fylke',
      courseTextInput(
        'gkmb3-course-county',
        'F.eks. Agder'
      )
    ));

    grid.appendChild(field(
      'Antall hull',
      numericInput(
        'gkmb3-course-holes',
        '18'
      )
    ));

    grid.appendChild(field(
      'Total lengde i meter',
      numericInput(
        'gkmb3-course-length',
        'F.eks. 1650'
      )
    ));

    grid.appendChild(field(
      'Banetype',
      createRecoSelect(
        'gkmb3-course-style',
        [
          ['technical', 'Teknisk / skog'],
          ['mixed', 'Blandet'],
          ['open', 'Åpen / lengde']
        ],
        'mixed'
      )
    ));

    grid.appendChild(field(
      'Vind',
      createRecoSelect(
        'gkmb3-course-wind',
        [
          ['normal', 'Lite / normal vind'],
          ['mixed', 'Variert vind'],
          ['windy', 'Mye vind']
        ],
        'mixed'
      )
    ));

    grid.appendChild(field(
      'Hva belønner banen?',
      createRecoSelect(
        'gkmb3-course-focus',
        [
          ['control', 'Kontroll'],
          ['balanced', 'Balansert'],
          ['distance', 'Lengde']
        ],
        'balanced'
      )
    ));

    grid.appendChild(field(
      'Vanskelighetsgrad',
      createRecoSelect(
        'gkmb3-course-difficulty',
        [
          ['1', '1 · Lett'],
          ['2', '2 · Lett–middels'],
          ['3', '3 · Middels'],
          ['4', '4 · Krevende'],
          ['5', '5 · Svært krevende']
        ],
        '3'
      )
    ));

    grid.appendChild(field(
      'Adresse',
      courseTextInput(
        'gkmb3-course-address',
        'Valgfritt'
      )
    ));

    grid.appendChild(field(
      'Nettside',
      courseTextInput(
        'gkmb3-course-website',
        'https://…',
        'url'
      )
    ));

    grid.appendChild(field(
      'Kartlenke',
      courseTextInput(
        'gkmb3-course-map',
        'https://…',
        'url'
      )
    ));

    grid.appendChild(field(
      'Kilde',
      courseTextInput(
        'gkmb3-course-source',
        'Nettside / kilde hvis du har den',
        'url'
      )
    ));

    var description = el('textarea', 'gkmb3-input');
    description.id = 'gkmb3-course-description';
    description.placeholder =
      'Kort beskrivelse: skog/åpent, høydeforskjell, OB, hva banen krever osv.';

    var descField = field('Beskrivelse', description);
    descField.className += ' wide';
    grid.appendChild(descField);

    form.appendChild(grid);

    var publicLabel = el('label', 'gkmb3-check');
    var publicBox = document.createElement('input');
    publicBox.id = 'gkmb3-course-public';
    publicBox.type = 'checkbox';
    publicBox.checked = true;

    publicLabel.appendChild(publicBox);
    publicLabel.appendChild(document.createTextNode(
      'Send banen til godkjenning slik at andre kan finne den'
    ));

    form.appendChild(publicLabel);

    var toolbar = el('div', 'gkmb3-toolbar');
    toolbar.style.marginTop = '10px';

    var save = el(
      'button',
      'gkmb3-btn',
      STATE.courseSubmitBusy
        ? 'Lagrer bane…'
        : 'Lagre bane'
    );
    save.type = 'button';
    save.disabled = !!STATE.courseSubmitBusy;
    save.onclick = submitCourse;
    toolbar.appendChild(save);

    var cancel = el(
      'button',
      'gkmb3-btn secondary',
      'Avbryt'
    );
    cancel.type = 'button';
    cancel.disabled = !!STATE.courseSubmitBusy;
    cancel.onclick = function () {
      STATE.courseSubmitOpen = false;
      render();
    };
    toolbar.appendChild(cancel);

    form.appendChild(toolbar);
    return form;
  }

  function renderCoursePanel() {
    var card = el('section', 'gkmb3-card gkmb3-courses gkmb3-section-anchor');
    card.id = 'gkmb3-section-courses';

    card.appendChild(el('h3', '', '🗺 Baner'));
    card.appendChild(el(
      'p',
      '',
      'Søk på bane, sted, kommune eller fylke. En baneprofil kan brukes direkte til å bygge optimal rundebag av discene du eier.'
    ));

    var search = el('div', 'gkmb3-course-search');

    var inputWrap = field(
      'Finn bane eller område',
      courseTextInput(
        'gkmb3-course-search',
        'F.eks. Lyngdal eller Agder'
      )
    );

    var input =
      inputWrap.querySelector('#gkmb3-course-search');

    if (input) {
      input.value = STATE.courseQuery || '';
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') searchCoursesFromForm();
      });
    }

    search.appendChild(inputWrap);

    var searchBtn = el(
      'button',
      'gkmb3-btn',
      STATE.courseSearchBusy ? 'Søker…' : 'Søk baner'
    );
    searchBtn.type = 'button';
    searchBtn.disabled = !!STATE.courseSearchBusy;
    searchBtn.onclick = searchCoursesFromForm;
    search.appendChild(searchBtn);

    card.appendChild(search);

    var toolbar = el('div', 'gkmb3-toolbar');
    toolbar.style.marginTop = '9px';

    var add = el(
      'button',
      'gkmb3-btn secondary',
      STATE.courseSubmitOpen
        ? 'Lukk skjema'
        : '+ Legg til bane'
    );
    add.type = 'button';
    add.onclick = function () {
      STATE.courseSubmitOpen = !STATE.courseSubmitOpen;
      render();
    };
    toolbar.appendChild(add);

    card.appendChild(toolbar);

    if (STATE.courseSubmitOpen) {
      card.appendChild(renderCourseSubmitForm());
    }

    var courseCountText = '';
    var totalCourseHits =
      Math.max(
        Number(STATE.courseTotalCount || 0),
        STATE.courses.length
      );

    if (STATE.coursesLoaded && !STATE.courseSearchBusy) {
      if (STATE.courseQuery) {
        if (totalCourseHits > STATE.courses.length) {
          courseCountText =
            ' · viser ' +
            STATE.courses.length +
            ' av ' +
            totalCourseHits +
            ' treff';
        } else {
          courseCountText =
            ' · ' +
            totalCourseHits +
            ' treff';
        }
      } else {
        courseCountText =
          ' · ' +
          totalCourseHits +
          ' aktive';
      }
    }

    card.appendChild(el(
      'div',
      'gkmb3-course-sectiontitle',
      STATE.courseQuery
        ? 'Treff for «' +
          STATE.courseQuery +
          '»' +
          courseCountText
        : 'Offentlige baner' +
          courseCountText
    ));

    if (!STATE.coursesLoaded || STATE.courseSearchBusy) {
      card.appendChild(el(
        'div',
        'gkmb3-note',
        STATE.courseQuery
          ? 'Søker etter baner…'
          : 'Laster antall aktive baner…'
      ));
    } else if (!STATE.courseQuery) {
      card.appendChild(el(
        'div',
        'gkmb3-note',
        totalCourseHits > 0
          ? 'Søk på fylke, kommune, sted eller banenavn for å vise baner.'
          : 'Banedatabasen er klar, men vi har ikke lagt inn offentlige baner ennå.'
      ));
    } else if (!STATE.courses.length) {
      card.appendChild(el(
        'div',
        'gkmb3-note',
        'Fant ingen godkjente baner på dette søket ennå.'
      ));
    } else {
      var list = el('div', 'gkmb3-course-list');

      for (var i = 0; i < STATE.courses.length; i += 1) {
        list.appendChild(
          renderCourseCard(STATE.courses[i])
        );
      }

      card.appendChild(list);
    }

    if (STATE.myCoursesLoaded && STATE.myCourses.length) {
      card.appendChild(el(
        'div',
        'gkmb3-course-sectiontitle',
        'Mine baner / innsendinger'
      ));

      var mine = el('div', 'gkmb3-course-list');

      for (var j = 0; j < STATE.myCourses.length; j += 1) {
        mine.appendChild(
          renderCourseCard(
            STATE.myCourses[j],
            { own: true }
          )
        );
      }

      card.appendChild(mine);
    }

    if (STATE.courseAdmin) {
      var admin = el('section', 'gkmb3-adminqueue');

      admin.appendChild(el(
        'h4',
        '',
        '🛡 Baner til godkjenning'
      ));

      admin.appendChild(el(
        'p',
        '',
        'Brukerinnsendte baner blir ikke offentlige før de er godkjent her.'
      ));

      if (!STATE.pendingCoursesLoaded) {
        admin.appendChild(el(
          'div',
          'gkmb3-note',
          'Laster godkjenningskø…'
        ));
      } else if (!STATE.pendingCourses.length) {
        admin.appendChild(el(
          'div',
          'gkmb3-note',
          'Ingen baner venter på godkjenning.'
        ));
      } else {
        var pending = el('div', 'gkmb3-course-list');

        for (var k = 0; k < STATE.pendingCourses.length; k += 1) {
          pending.appendChild(
            renderCourseCard(
              STATE.pendingCourses[k],
              { pending: true }
            )
          );
        }

        admin.appendChild(pending);
      }

      card.appendChild(admin);
    }

    return card;
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
      'Ingen passord nødvendig. Åpne lenken i e-posten, så kommer du tilbake hit ferdig innlogget.'
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
    var card = el('section', 'gkmb3-card gkmb3-section-anchor');
    card.id = 'gkmb3-section-bag';
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
      },
      comfort: {
        easy: 'Lettkastede discer',
        balanced: 'Balanserte discer',
        demanding: 'Krevende discer er OK'
      },
      goal: {
        balanced: 'Balansert bag',
        control: 'Mer kontroll',
        distance: 'Mer lengde',
        lines: 'Flere kastelinjer',
        wind: 'Bedre i vind',
        minimal: 'Enklere bag'
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
      include_putter_recommendations: false,
      brand_preference_mode: 'bag',
      preferred_brand: '',
      stability_preference_mode: 'auto',
      preferred_stabilities: [
        'understable',
        'neutral',
        'stable',
        'overstable'
      ],
      disc_comfort: 'balanced',
      improvement_goal: 'balanced'
    };

    var form = el('div', 'gkmb3-recoform');

    form.appendChild(el(
      'div',
      'gkmb3-recohelp',
      'Min Bag lærer både av svarene dine og av discene som faktisk ligger i bagen. Du kan la systemet lære automatisk, eller selv styre hvilke merker og stabiliteter du vil ha forslag på.'
    ));

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

    var brandMode = createRecoSelect(
      'gkmb3-reco-brand-mode',
      [
        ['bag', 'Følg merkene i bagen min'],
        ['specific', 'Prioriter ett bestemt merke'],
        ['any', 'Merke spiller ingen rolle']
      ],
      profile.brand_preference_mode || 'bag'
    );

    grid.appendChild(field(
      'Merker i forslagene',
      brandMode
    ));

    var brandSelect = el('select', 'gkmb3-select');
    brandSelect.id = 'gkmb3-reco-brand';

    var emptyBrand = document.createElement('option');
    emptyBrand.value = '';
    emptyBrand.textContent = 'Velg merke…';
    brandSelect.appendChild(emptyBrand);

    var currentBrand = safe(profile.preferred_brand);

    for (var b = 0; b < STATE.brands.length; b += 1) {
      var brand = STATE.brands[b];

      if (!brand || brand.is_custom || !brand.name) continue;

      var brandOption = document.createElement('option');
      brandOption.value = brand.name;
      brandOption.textContent = brand.name;

      if (
        currentBrand.toLowerCase() ===
        safe(brand.name).toLowerCase()
      ) {
        brandOption.selected = true;
      }

      brandSelect.appendChild(brandOption);
    }

    brandSelect.disabled =
      (profile.brand_preference_mode || 'bag') !== 'specific';

    grid.appendChild(field(
      'Merke som skal prioriteres',
      brandSelect
    ));

    var stabilityMode = createRecoSelect(
      'gkmb3-reco-stability-mode',
      [
        ['auto', 'Lær av bagen min'],
        ['custom', 'Jeg vil velge selv'],
        ['all', 'Vurder alle stabiliteter']
      ],
      profile.stability_preference_mode || 'auto'
    );

    grid.appendChild(field(
      'Stabilitet i anbefalingene',
      stabilityMode
    ));

    grid.appendChild(field(
      'Hva slags discer ønsker du?',
      createRecoSelect(
        'gkmb3-reco-comfort',
        [
          ['easy', 'Lettkastede og tilgivende'],
          ['balanced', 'Balansert'],
          ['demanding', 'Krevende discer er helt greit']
        ],
        profile.disc_comfort || 'balanced'
      )
    ));

    grid.appendChild(field(
      'Hva vil du først og fremst forbedre?',
      createRecoSelect(
        'gkmb3-reco-goal',
        [
          ['balanced', 'En balansert bag'],
          ['control', 'Mer kontroll'],
          ['distance', 'Mer lengde'],
          ['lines', 'Kunne forme flere kastelinjer'],
          ['wind', 'Spille bedre i vind'],
          ['minimal', 'En enklere bag med færre roller']
        ],
        profile.improvement_goal || 'balanced'
      )
    ));

    form.appendChild(grid);

    var stabilityBox = el('div', 'gkmb3-recochoice');

    stabilityBox.appendChild(el(
      'div',
      'gkmb3-recochoice-title',
      'Stabiliteter du trives med'
    ));

    var selectedStabilities =
      Array.isArray(profile.preferred_stabilities)
        ? profile.preferred_stabilities
        : [
            'understable',
            'neutral',
            'stable',
            'overstable'
          ];

    var stabilityOptions = [
      ['understable', 'Understabil'],
      ['neutral', 'Nøytral'],
      ['stable', 'Stabil'],
      ['overstable', 'Overstabil']
    ];

    var checks = el('div', 'gkmb3-recochecks');
    var customMode =
      (profile.stability_preference_mode || 'auto') === 'custom';

    for (var st = 0; st < stabilityOptions.length; st += 1) {
      var checkLabel = el(
        'label',
        'gkmb3-recocheck' + (customMode ? '' : ' disabled')
      );

      var check = document.createElement('input');
      check.type = 'checkbox';
      check.id = 'gkmb3-reco-stab-' + stabilityOptions[st][0];
      check.value = stabilityOptions[st][0];
      check.checked =
        selectedStabilities.indexOf(stabilityOptions[st][0]) !== -1;
      check.disabled = !customMode;

      checkLabel.appendChild(check);
      checkLabel.appendChild(
        document.createTextNode(stabilityOptions[st][1])
      );
      checks.appendChild(checkLabel);
    }

    stabilityBox.appendChild(checks);

    stabilityBox.appendChild(el(
      'div',
      'gkmb3-help',
      'Velger du selv, regnes andre stabiliteter ikke automatisk som hull i bagen. Du kan for eksempel velge bare understabil + nøytral.'
    ));

    form.appendChild(stabilityBox);

    brandMode.onchange = function () {
      brandSelect.disabled =
        brandMode.value !== 'specific';
    };

    stabilityMode.onchange = function () {
      var enabled =
        stabilityMode.value === 'custom';

      var inputs =
        checks.querySelectorAll(
          'input[type="checkbox"]'
        );

      for (var i = 0; i < inputs.length; i += 1) {
        inputs[i].disabled = !enabled;

        if (inputs[i].parentNode) {
          inputs[i].parentNode.className =
            'gkmb3-recocheck' +
            (enabled ? '' : ' disabled');
        }
      }
    };

    var putterLabel = el('label', 'gkmb3-check');
    var putter = document.createElement('input');
    putter.id = 'gkmb3-reco-putter';
    putter.type = 'checkbox';
    putter.checked =
      !!profile.include_putter_recommendations;

    putterLabel.appendChild(putter);
    putterLabel.appendChild(
      document.createTextNode(
        'Ta med puttere i anbefalingene'
      )
    );

    form.appendChild(putterLabel);

    var actions = el('div', 'gkmb3-toolbar');

    var save = el(
      'button',
      'gkmb3-btn',
      STATE.recoBusy
        ? 'Lagrer profil…'
        : 'Lagre spillerprofil'
    );

    save.type = 'button';
    save.disabled = !!STATE.recoBusy;
    save.onclick = saveRecoProfile;
    actions.appendChild(save);

    if (STATE.recoProfile) {
      var cancel = el(
        'button',
        'gkmb3-btn secondary',
        'Avbryt'
      );

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

  function renderRecoInsights() {
    if (!STATE.discs.length) return null;

    var box = el('section', 'gkmb3-insights');

    box.appendChild(
      el(
        'h4',
        '',
        '🧠 Bagen din forteller oss…'
      )
    );

    if (!STATE.recoInsightsLoaded) {
      box.appendChild(el(
        'div',
        'gkmb3-note',
        'Leser mønsteret i bagen din…'
      ));
      return box;
    }

    var insight = STATE.recoInsights;

    if (!insight) {
      box.appendChild(el(
        'div',
        'gkmb3-insight',
        'Min Bag bruker fortsatt spillerprofilen din, men har ikke nok data til å beskrive bagmønsteret ennå.'
      ));
      return box;
    }

    var grid = el('div', 'gkmb3-insightgrid');
    var profile = STATE.recoProfile || {};

    var brandText = '';

    if (
      profile.brand_preference_mode === 'specific' &&
      profile.preferred_brand
    ) {
      brandText =
        '<strong>Merke:</strong> ' +
        safe(profile.preferred_brand) +
        ' prioriteres når en god match finnes på lager.';
    } else if (
      profile.brand_preference_mode === 'any'
    ) {
      brandText =
        '<strong>Merke:</strong> Du har valgt at merke ikke skal påvirke forslagene.';
    } else if (
      insight.dominant_brand &&
      Number(insight.dominant_brand_share || 0) >= 50
    ) {
      brandText =
        '<strong>Merke:</strong> ' +
        safe(insight.dominant_brand) +
        ' utgjør ' +
        Math.round(
          Number(
            insight.dominant_brand_share || 0
          )
        ) +
        ' % av bagen og prioriteres når det finnes en god match.';
    } else {
      brandText =
        '<strong>Merke:</strong> Bagen er blandet nok til at Min Bag ikke låser hovedforslagene til ett merke.';
    }

    var brandItem = el(
      'div',
      'gkmb3-insight'
    );
    brandItem.innerHTML = brandText;
    grid.appendChild(brandItem);

    var stabilities =
      Array.isArray(insight.effective_stabilities)
        ? insight.effective_stabilities
        : [];

    var stabilityNames = [];

    for (var i = 0; i < stabilities.length; i += 1) {
      stabilityNames.push(
        recoStabilityLabel(
          stabilities[i]
        ).toLowerCase()
      );
    }

    var stabilityItem = el(
      'div',
      'gkmb3-insight'
    );

    stabilityItem.innerHTML =
      '<strong>Flights:</strong> ' +
      (
        stabilityNames.length
          ? stabilityNames.join(', ')
          : 'profilen din'
      ) +
      (
        insight.stability_preference_source ===
        'lært fra bagen'
          ? ' – lært av discene du faktisk bruker.'
          : insight.stability_preference_source ===
            'valgt av deg'
              ? ' – valgt av deg.'
              : '.'
      );

    grid.appendChild(stabilityItem);

    if (
      insight.average_speed !== null &&
      insight.average_speed !== undefined
    ) {
      var speedText =
        '<strong>Speed:</strong> snitt ' +
        Number(
          insight.average_speed
        )
          .toFixed(1)
          .replace('.', ',');

      if (
        insight.max_speed !== null &&
        insight.max_speed !== undefined
      ) {
        speedText +=
          ' · høyeste ' +
          safe(insight.max_speed);
      }

      var speedItem = el(
        'div',
        'gkmb3-insight'
      );

      speedItem.innerHTML =
        speedText + '.';

      grid.appendChild(speedItem);
    }

    var goalItem = el(
      'div',
      'gkmb3-insight'
    );

    goalItem.innerHTML =
      '<strong>Mål:</strong> ' +
      recoLabel(
        profile.improvement_goal ||
        'balanced',
        'goal'
      ) +
      ' · ' +
      recoLabel(
        profile.disc_comfort ||
        'balanced',
        'comfort'
      ).toLowerCase() +
      '.';

    grid.appendChild(goalItem);

    box.appendChild(grid);

    return box;
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
    if (
      !finding ||
      finding.finding_type !== 'gap'
    ) {
      return [];
    }

    var rows = [];

    for (
      var i = 0;
      i < STATE.recoProducts.length;
      i += 1
    ) {
      var row = STATE.recoProducts[i];

      if (
        row.recommendation_group !== 'fun' &&
        row.gap_disc_type === finding.disc_type &&
        row.gap_stability === finding.stability
      ) {
        rows.push(row);
      }
    }

    rows.sort(function (a, b) {
      return (
        Number(a.match_rank || 999) -
        Number(b.match_rank || 999)
      );
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
    var wrap = el(
      'section',
      'gkmb3-fun'
    );

    var head = el(
      'div',
      'gkmb3-funhead'
    );

    var textWrap = el('div', '');

    textWrap.appendChild(
      el(
        'h4',
        '',
        '🎲 Gøy å prøve'
      )
    );

    textWrap.appendChild(el(
      'p',
      '',
      'Her kan Min Bag være litt friere. Hvis hovedforslagene følger et merke du liker, kan sterke alternativer fra andre merker havne her – sammen med litt annerledes flights og små utfordringer.'
    ));

    head.appendChild(textWrap);

    var refresh = el(
      'button',
      'gkmb3-btn secondary',
      STATE.funRecommendationsBusy
        ? 'Finner nye…'
        : '🎲 Gi meg 3 nye'
    );

    refresh.type = 'button';
    refresh.disabled =
      !!STATE.funRecommendationsBusy;

    refresh.onclick =
      refreshFunRecommendations;

    head.appendChild(refresh);
    wrap.appendChild(head);

    var v3Rows = [];

    for (
      var i = 0;
      i < STATE.recoProducts.length;
      i += 1
    ) {
      if (
        STATE.recoProducts[i]
          .recommendation_group === 'fun'
      ) {
        v3Rows.push(
          STATE.recoProducts[i]
        );
      }
    }

    v3Rows.sort(function (a, b) {
      if (
        Number(a.gap_priority || 0) !==
        Number(b.gap_priority || 0)
      ) {
        return (
          Number(b.gap_priority || 0) -
          Number(a.gap_priority || 0)
        );
      }

      return (
        Number(a.match_rank || 999) -
        Number(b.match_rank || 999)
      );
    });

    v3Rows = v3Rows.slice(0, 2);

    if (
      !STATE.funRecommendationsLoaded &&
      !v3Rows.length
    ) {
      wrap.appendChild(el(
        'div',
        'gkmb3-note',
        'Finner noen morsomme utfordringer…'
      ));
      return wrap;
    }

    var list = el(
      'div',
      'gkmb3-funlist'
    );

    for (
      var v = 0;
      v < v3Rows.length;
      v += 1
    ) {
      var alt = {};

      for (var key in v3Rows[v]) {
        if (
          Object.prototype
            .hasOwnProperty
            .call(v3Rows[v], key)
        ) {
          alt[key] = v3Rows[v][key];
        }
      }

      alt.fun_label =
        'Alternativt merke';

      alt.fun_reason =
        v3Rows[v].match_reason ||
        'En sterk match fra et annet merke enn hovedforslaget.';

      list.appendChild(
        renderFunRecommendation(
          alt,
          v
        )
      );
    }

    var normalLimit =
      v3Rows.length ? 1 : 3;

    var normalRows =
      STATE.funRecommendations.slice(
        0,
        normalLimit
      );

    if (
      !v3Rows.length &&
      !normalRows.length
    ) {
      normalRows = [
        localFunChallenge()
      ];
    }

    for (
      var n = 0;
      n < normalRows.length;
      n += 1
    ) {
      list.appendChild(
        renderFunRecommendation(
          normalRows[n],
          v3Rows.length + n
        )
      );
    }

    wrap.appendChild(list);

    return wrap;
  }

  function renderBagScoreMetric(label, score) {
    score = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));

    var metric = el('div', 'gkmb3-scoremetric');
    var top = el('div', 'gkmb3-scoremetric-top');

    top.appendChild(el('span', '', label));
    top.appendChild(el('b', '', score));

    metric.appendChild(top);

    var bar = el('div', 'gkmb3-scorebar');
    var fill = document.createElement('span');
    fill.style.width = score + '%';
    bar.appendChild(fill);
    metric.appendChild(bar);

    return metric;
  }

  function renderBagScore() {
    var wrap = el('section', 'gkmb3-bagscore gkmb3-section-anchor');
    wrap.id = 'gkmb3-section-bagscore';

    if (!STATE.bagScoreLoaded) {
      wrap.appendChild(el('div', 'gkmb3-note', 'Beregner Bag-score…'));
      return wrap;
    }

    if (!STATE.bagScore) {
      wrap.appendChild(el(
        'div',
        'gkmb3-note',
        STATE.bagScoreError
          ? 'Kunne ikke beregne Bag-score akkurat nå.'
          : 'Bag-score er ikke tilgjengelig ennå.'
      ));
      return wrap;
    }

    var score = STATE.bagScore;
    var top = el('div', 'gkmb3-bagscore-top');

    var number = el('div', 'gkmb3-bagscore-number');
    number.appendChild(el(
      'strong',
      '',
      Math.round(Number(score.overall_score) || 0) + '/100'
    ));
    number.appendChild(el(
      'span',
      '',
      safe(score.score_label || 'Bag-score')
    ));
    top.appendChild(number);

    var copy = el('div', 'gkmb3-bagscore-copy');
    copy.appendChild(el('h4', '', '🏆 Bag-score'));

    if (score.summary) {
      copy.appendChild(el('p', '', safe(score.summary)));
    }

    copy.appendChild(el(
      'p',
      '',
      'Scoren vurderer hvor godt bagen dekker relevante roller for spillerprofilen din, variasjon, vind og overlapp. Flere discer gir ikke automatisk høyere score.'
    ));

    top.appendChild(copy);
    wrap.appendChild(top);

    var grid = el('div', 'gkmb3-bagscore-grid');
    grid.appendChild(renderBagScoreMetric(
      'Dekning',
      score.coverage_score
    ));
    grid.appendChild(renderBagScoreMetric(
      'Allsidighet',
      score.versatility_score
    ));
    grid.appendChild(renderBagScoreMetric(
      'Vind',
      score.wind_score
    ));
    grid.appendChild(renderBagScoreMetric(
      'Lite overlapp',
      score.overlap_score
    ));
    wrap.appendChild(grid);

    var meta = el('div', 'gkmb3-bagscore-meta');

    meta.appendChild(el(
      'span',
      '',
      '🎯 Roller ' +
      safe(score.covered_roles) +
      '/' +
      safe(score.eligible_roles)
    ));

    if (score.strongest_area) {
      meta.appendChild(el(
        'span',
        '',
        '💪 Sterkest: ' + safe(score.strongest_area)
      ));
    }

    if (score.weakest_area) {
      meta.appendChild(el(
        'span',
        '',
        '🔧 Svakest: ' + safe(score.weakest_area)
      ));
    }

    if (Number(score.overlap_group_count) > 0) {
      meta.appendChild(el(
        'span',
        '',
        '♻️ ' +
        Number(score.overlap_group_count) +
        ' overlappgruppe' +
        (Number(score.overlap_group_count) === 1 ? '' : 'r')
      ));
    }

    wrap.appendChild(meta);

    if (score.next_step) {
      wrap.appendChild(el(
        'div',
        'gkmb3-bagscore-next',
        safe(score.next_step)
      ));
    }

    return wrap;
  }

  function ensureThrowDefaults() {
    if (!STATE.throwDistance) {
      var profileDistance =
        STATE.recoProfile &&
        STATE.recoProfile.throw_distance_band
          ? STATE.recoProfile.throw_distance_band
          : '60_80';

      if (profileDistance === 'under_60') {
        STATE.throwDistance = '40_60';
      } else if (profileDistance === '60_80') {
        STATE.throwDistance = '60_80';
      } else if (profileDistance === '80_100') {
        STATE.throwDistance = '80_100';
      } else {
        STATE.throwDistance = '100_plus';
      }
    }

    if (!STATE.throwType) {
      STATE.throwType =
        STATE.recoProfile &&
        STATE.recoProfile.throw_style === 'forehand'
          ? 'forehand'
          : 'backhand';
    }
  }

  function renderThrowResult(row, index) {
    var result = el(
      'article',
      'gkmb3-throwresult' + (index === 0 ? ' best' : '')
    );

    var image = el('div', 'gkmb3-throwimg');

    if (row.image_url) {
      var img = document.createElement('img');
      img.src = row.image_url;
      img.alt = row.name || 'Disc';
      img.loading = 'lazy';
      image.appendChild(img);
    } else {
      image.textContent = 'DISC';
    }

    result.appendChild(image);

    var body = el('div', '');
    var top = el('div', 'gkmb3-throwtop');

    top.appendChild(el(
      'div',
      'gkmb3-throwname',
      '#' + (index + 1) + ' ' + safe(row.name)
    ));

    top.appendChild(el(
      'div',
      'gkmb3-throwscore',
      Math.round(Number(row.throw_score) || 0) + ' %'
    ));

    body.appendChild(top);

    body.appendChild(el(
      'div',
      'gkmb3-throwlabel',
      safe(row.throw_label || (index === 0 ? 'Beste valg' : 'Alternativ'))
    ));

    var meta = [];
    if (row.brand) meta.push(row.brand);
    if (row.plastic) meta.push(row.plastic);
    if (row.weight_grams !== null && row.weight_grams !== undefined) {
      meta.push(safe(row.weight_grams) + ' g');
    }
    if (row.color) meta.push(row.color);
    if (row.is_favorite) meta.push('★ Favoritt');

    if (meta.length) {
      body.appendChild(el(
        'div',
        'gkmb3-throwmeta',
        meta.join(' · ')
      ));
    }

    body.appendChild(renderFlight(
      row.speed,
      row.glide,
      row.turn,
      row.fade
    ));

    if (row.throw_reason) {
      body.appendChild(el(
        'div',
        'gkmb3-throwreason',
        safe(row.throw_reason)
      ));
    }

    if (row.product_url) {
      var actions = el('div', 'gkmb3-toolbar');
      actions.style.marginTop = '7px';

      var open = el(
        'a',
        'gkmb3-btn secondary',
        'Se hos GolfKongen'
      );
      open.href = row.product_url;
      open.target = '_blank';
      open.rel = 'noopener';

      actions.appendChild(open);
      body.appendChild(actions);
    }

    result.appendChild(body);
    return result;
  }

  function renderThrowAdvisor() {
    ensureThrowDefaults();

    var wrap = el('section', 'gkmb3-throwadvisor gkmb3-section-anchor');
    wrap.id = 'gkmb3-section-throw';
    var head = el('div', 'gkmb3-throwadvisor-head');
    var copy = el('div', '');

    copy.appendChild(el('h4', '', '🥏 Hva bør jeg kaste?'));
    copy.appendChild(el(
      'p',
      '',
      'Velg kastet du står foran. Min Bag rangerer bare discene du faktisk har i denne bagen og forklarer hvorfor.'
    ));

    head.appendChild(copy);
    wrap.appendChild(head);

    var grid = el('div', 'gkmb3-throwgrid');

    grid.appendChild(field(
      'Avstand',
      createRecoSelect(
        'gkmb3-throw-distance',
        [
          ['under_40', 'Under 40 m'],
          ['40_60', '40–60 m'],
          ['60_80', '60–80 m'],
          ['80_100', '80–100 m'],
          ['100_plus', '100+ m']
        ],
        STATE.throwDistance
      )
    ));

    grid.appendChild(field(
      'Vind',
      createRecoSelect(
        'gkmb3-throw-wind',
        [
          ['calm', 'Lite / ingen vind'],
          ['headwind', 'Motvind'],
          ['tailwind', 'Medvind'],
          ['crosswind', 'Sidevind']
        ],
        STATE.throwWind
      )
    ));

    grid.appendChild(field(
      'Ønsket linje',
      createRecoSelect(
        'gkmb3-throw-line',
        [
          ['straight', 'Rett'],
          ['hyzer', 'Hyzer'],
          ['turnover', 'Turnover'],
          ['flex', 'Flex / S-kurve'],
          ['max_distance', 'Maks lengde']
        ],
        STATE.throwLine
      )
    ));

    grid.appendChild(field(
      'Kast',
      createRecoSelect(
        'gkmb3-throw-type',
        [
          ['backhand', 'Backhand'],
          ['forehand', 'Forehand']
        ],
        STATE.throwType
      )
    ));

    wrap.appendChild(grid);

    var actions = el('div', 'gkmb3-throwactions');

    var find = el(
      'button',
      'gkmb3-btn',
      STATE.throwBusy ? 'Vurderer bagen…' : '🥏 Finn beste disc'
    );
    find.type = 'button';
    find.disabled = !!STATE.throwBusy;
    find.onclick = findBestThrowDisc;

    actions.appendChild(find);
    wrap.appendChild(actions);

    if (STATE.throwHasSearched) {
      if (STATE.throwBusy) {
        wrap.appendChild(el(
          'div',
          'gkmb3-note',
          'Sammenligner flightene i bagen…'
        ));
      } else if (STATE.throwResults.length) {
        var results = el('div', 'gkmb3-throwresults');

        for (var i = 0; i < STATE.throwResults.length; i += 1) {
          results.appendChild(
            renderThrowResult(STATE.throwResults[i], i)
          );
        }

        wrap.appendChild(results);
      } else {
        wrap.appendChild(el(
          'div',
          'gkmb3-note',
          STATE.throwError
            ? 'Kunne ikke beregne kastanbefalingen akkurat nå.'
            : 'Fant ingen discer med komplette flight-tall for dette kastet.'
        ));
      }
    }

    return wrap;
  }

  function ensureRoundBagDefaults() {
    if (!STATE.roundBagCourseStyle) {
      STATE.roundBagCourseStyle =
        STATE.recoProfile &&
        STATE.recoProfile.course_style
          ? STATE.recoProfile.course_style
          : 'mixed';
    }

    if (!STATE.roundBagWindStyle) {
      STATE.roundBagWindStyle =
        STATE.recoProfile &&
        STATE.recoProfile.wind_style
          ? STATE.recoProfile.wind_style
          : 'mixed';
    }

    if (!STATE.roundBagFocus) {
      if (STATE.roundBagCourseStyle === 'technical') {
        STATE.roundBagFocus = 'control';
      } else if (STATE.roundBagCourseStyle === 'open') {
        STATE.roundBagFocus = 'distance';
      } else {
        STATE.roundBagFocus = 'balanced';
      }
    }
  }

  function renderRoundBagItem(row) {
    var item = el('article', 'gkmb3-roundbag-item');

    var image = el('div', 'gkmb3-roundbag-img');

    if (row.image_url) {
      var img = document.createElement('img');
      img.src = row.image_url;
      img.alt = row.name || 'Rundebag-disc';
      img.loading = 'lazy';
      image.appendChild(img);
    } else {
      image.textContent = 'DISC';
    }

    item.appendChild(image);

    var body = el('div', '');
    var top = el('div', 'gkmb3-roundbag-top');

    top.appendChild(el(
      'div',
      'gkmb3-roundbag-name',
      '#' + safe(row.slot_rank) + ' ' + safe(row.name)
    ));

    top.appendChild(el(
      'div',
      'gkmb3-roundbag-role',
      '🎯 ' + safe(row.role_label || 'Allround')
    ));

    body.appendChild(top);

    var meta = [];
    if (row.brand) meta.push(row.brand);
    if (row.plastic) meta.push(row.plastic);
    if (row.weight_grams !== null && row.weight_grams !== undefined) {
      meta.push(safe(row.weight_grams) + ' g');
    }
    if (row.color) meta.push(row.color);
    if (row.is_favorite) meta.push('★ Favoritt');

    if (meta.length) {
      body.appendChild(el(
        'div',
        'gkmb3-roundbag-meta',
        meta.join(' · ')
      ));
    }

    body.appendChild(renderFlight(
      row.speed,
      row.glide,
      row.turn,
      row.fade
    ));

    if (row.selection_reason) {
      body.appendChild(el(
        'div',
        'gkmb3-roundbag-reason',
        safe(row.selection_reason)
      ));
    }

    if (row.selection_score !== null &&
        row.selection_score !== undefined) {
      body.appendChild(el(
        'div',
        'gkmb3-roundbag-score',
        'Rolle-match: ' +
        Math.round(Number(row.selection_score) || 0) +
        ' %'
      ));
    }

    if (row.product_url) {
      var actions = el('div', 'gkmb3-toolbar');
      actions.style.marginTop = '7px';

      var open = el(
        'a',
        'gkmb3-btn secondary',
        'Se hos GolfKongen'
      );
      open.href = row.product_url;
      open.target = '_blank';
      open.rel = 'noopener';

      actions.appendChild(open);
      body.appendChild(actions);
    }

    item.appendChild(body);
    return item;
  }

  function renderRoundBagBuilder() {
    ensureRoundBagDefaults();

    var wrap = el('section', 'gkmb3-roundbag gkmb3-section-anchor');
    wrap.id = 'gkmb3-roundbag-section';

    var head = el('div', 'gkmb3-roundbag-head');
    var copy = el('div', '');

    copy.appendChild(el('h4', '', '🧳 Bygg rundebag'));
    copy.appendChild(el(
      'p',
      '',
      'Velg hva slags runde du skal spille. Min Bag plukker et balansert utvalg av discene du faktisk eier og gir hver disc én tydelig jobb. Velger du Rundebag fra en bane, fylles baneprofilen inn automatisk.'
    ));

    head.appendChild(copy);
    wrap.appendChild(head);

    var grid = el('div', 'gkmb3-roundbag-grid');

    grid.appendChild(field(
      'Antall discer',
      createRecoSelect(
        'gkmb3-roundbag-count',
        [
          ['5', '5 discer · minimalistisk'],
          ['8', '8 discer · kompakt'],
          ['12', '12 discer · full rundebag']
        ],
        STATE.roundBagCount
      )
    ));

    grid.appendChild(field(
      'Banetype',
      createRecoSelect(
        'gkmb3-roundbag-course',
        [
          ['technical', 'Teknisk / skog'],
          ['mixed', 'Blandet'],
          ['open', 'Åpen / lengde']
        ],
        STATE.roundBagCourseStyle
      )
    ));

    grid.appendChild(field(
      'Vind',
      createRecoSelect(
        'gkmb3-roundbag-wind',
        [
          ['normal', 'Lite / normal vind'],
          ['mixed', 'Variert vind'],
          ['windy', 'Mye vind']
        ],
        STATE.roundBagWindStyle
      )
    ));

    grid.appendChild(field(
      'Fokus',
      createRecoSelect(
        'gkmb3-roundbag-focus',
        [
          ['control', 'Kontroll'],
          ['balanced', 'Balansert'],
          ['distance', 'Lengde']
        ],
        STATE.roundBagFocus
      )
    ));

    wrap.appendChild(grid);

    var actions = el('div', 'gkmb3-roundbag-actions');

    var build = el(
      'button',
      'gkmb3-btn',
      STATE.roundBagBusy
        ? 'Bygger rundebag…'
        : '🧳 Bygg rundebag'
    );
    build.type = 'button';
    build.disabled = !!STATE.roundBagBusy;
    build.onclick = buildRoundBag;

    actions.appendChild(build);
    wrap.appendChild(actions);

    if (STATE.roundBagHasBuilt) {
      if (STATE.roundBagBusy) {
        wrap.appendChild(el(
          'div',
          'gkmb3-note',
          'Fordeler roller og velger de beste kombinasjonene…'
        ));
      } else if (STATE.roundBagResults.length) {
        var requested = Number(STATE.roundBagCount) || 8;
        var actual = STATE.roundBagResults.length;

        wrap.appendChild(el(
          'div',
          'gkmb3-roundbag-summary',
          (STATE.roundBagSourceName
            ? 'Optimalisert for ' +
              STATE.roundBagSourceName +
              '. '
            : '') +
          (actual === requested
            ? 'Rundebagen er klar: ' +
              actual +
              ' ulike discmodeller med hver sin hovedrolle.'
            : 'Rundebagen fant ' +
              actual +
              ' av ønsket ' +
              requested +
              ' discer. Det betyr at denne bagen ikke har nok ulike discmodeller med komplette flight-tall til å fylle alle plassene uten unødvendige dubletter.')
        ));

        var list = el('div', 'gkmb3-roundbag-list');

        for (var i = 0; i < STATE.roundBagResults.length; i += 1) {
          list.appendChild(
            renderRoundBagItem(STATE.roundBagResults[i])
          );
        }

        wrap.appendChild(list);
      } else {
        wrap.appendChild(el(
          'div',
          'gkmb3-note',
          STATE.roundBagError
            ? 'Kunne ikke bygge rundebagen akkurat nå.'
            : 'Fant ingen discer med komplette flight-tall i denne bagen.'
        ));
      }
    }

    return wrap;
  }

  function canonicalDiscTypeFrontend(disc) {
    var speed = Number(disc && disc.speed);

    if (isFinite(speed)) {
      if (speed <= 3) return 'putter';
      if (speed <= 5) return 'midrange';
      if (speed <= 9) return 'fairway';
      return 'distance';
    }

    return safe(disc && disc.disc_type).toLowerCase();
  }

  function stabilityBucketFrontend(turn, fade) {
    turn = Number(turn);
    fade = Number(fade);

    if (!isFinite(turn) || !isFinite(fade)) return 'unknown';
    if (turn <= -2 && fade <= 2) return 'understable';
    if (fade >= 3 || (turn >= 0 && fade >= 2.5)) return 'overstable';
    if (fade >= 2 || (turn + fade) >= 1.5) return 'stable';
    return 'neutral';
  }

  function overlapFindingKey(finding) {
    return [
      safe(finding.disc_type),
      safe(finding.stability),
      safe(finding.target_speed_min),
      safe(finding.target_speed_max)
    ].join('|');
  }

  function discsForOverlapFinding(finding) {
    var rows = [];

    for (var i = 0; i < STATE.discs.length; i += 1) {
      var disc = STATE.discs[i];

      if (
        finding.disc_type &&
        canonicalDiscTypeFrontend(disc) !== finding.disc_type
      ) {
        continue;
      }

      if (
        finding.stability &&
        stabilityBucketFrontend(disc.turn, disc.fade) !== finding.stability
      ) {
        continue;
      }

      var speed = Number(disc.speed);

      if (
        finding.target_speed_min !== null &&
        finding.target_speed_min !== undefined &&
        isFinite(speed) &&
        speed < Number(finding.target_speed_min)
      ) {
        continue;
      }

      if (
        finding.target_speed_max !== null &&
        finding.target_speed_max !== undefined &&
        isFinite(speed) &&
        speed > Number(finding.target_speed_max)
      ) {
        continue;
      }

      rows.push(disc);
    }

    return rows;
  }

  function overlapDiscKeepScore(disc) {
    var score = 0;

    if (disc.is_favorite) score += 100;
    if (disc.note) score += 12;
    if (disc.weight_grams !== null && disc.weight_grams !== undefined) score += 5;
    if (disc.color) score += 3;
    if (disc.plastic) score += 3;

    return score;
  }

  function overlapReviewMap(discs) {
    var sorted = discs.slice();

    sorted.sort(function (a, b) {
      var scoreDiff =
        overlapDiscKeepScore(b) -
        overlapDiscKeepScore(a);

      if (scoreDiff) return scoreDiff;

      return safe(a.name || a.mold_name).localeCompare(
        safe(b.name || b.mold_name)
      );
    });

    var review = {};

    // Ved tydelig overlapp lar vi de to mest prioriterte være "behold".
    // Resten merkes som kandidater det er verdt å se nærmere på.
    for (var i = 2; i < sorted.length; i += 1) {
      review[sorted[i].id] = true;
    }

    return review;
  }

  function focusDiscInBag(discId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    STATE.activeView = 'discs';
    STATE.appMenuOpen = false;
    STATE.bagSearch = '';
    STATE.bagFilter = 'all';
    render();

    window.setTimeout(function () {
      var node = document.getElementById(
        'gkmb3-disc-' + discId
      );

      if (!node) {
        status(
          'Fant ikke discen i den aktive bagen akkurat nå.',
          ''
        );
        return;
      }

      node.classList.add('gkmb3-disc-focus');

      node.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      window.setTimeout(function () {
        node.classList.remove('gkmb3-disc-focus');
      }, 2600);
    }, 100);
  }

  function renderOverlapDetails(finding) {
    var discs = discsForOverlapFinding(finding);
    var list = el('div', 'gkmb3-overlap-list');

    if (!discs.length) {
      list.appendChild(el(
        'div',
        'gkmb3-note',
        'Fant ikke disse discene i den aktive bagen akkurat nå.'
      ));
      return list;
    }

    var reviewMap = overlapReviewMap(discs);

    list.appendChild(el(
      'div',
      'gkmb3-note',
      '«Verdt å se på» betyr ikke at discen bør slettes. Min Bag lar favoritter og de to tydeligst prioriterte eksemplarene stå igjen, og markerer resten som naturlige kandidater å vurdere når flere fyller nesten samme rolle.'
    ));

    for (var i = 0; i < discs.length; i += 1) {
      var disc = discs[i];
      var review = !!reviewMap[disc.id];

      var row = el(
        'div',
        'gkmb3-overlap-disc' + (review ? ' review' : '')
      );

      var body = el('div', '');
      body.appendChild(el(
        'div',
        'gkmb3-overlap-disc-name',
        safe(disc.name || disc.mold_name || 'Ukjent disc')
      ));

      var meta = [
        safe(disc.speed),
        safe(disc.glide),
        safe(disc.turn),
        safe(disc.fade)
      ].join(' / ');

      var extras = [];
      if (disc.plastic) extras.push(disc.plastic);
      if (disc.weight_grams !== null && disc.weight_grams !== undefined) {
        extras.push(safe(disc.weight_grams) + ' g');
      }
      if (disc.color) extras.push(disc.color);
      if (disc.is_favorite) extras.push('★ Favoritt');

      body.appendChild(el(
        'div',
        'gkmb3-overlap-disc-meta',
        meta + (extras.length ? ' · ' + extras.join(' · ') : '')
      ));

      row.appendChild(body);

      var actions = el('div', '');
      actions.style.display = 'grid';
      actions.style.justifyItems = 'end';
      actions.style.gap = '5px';

      actions.appendChild(el(
        'span',
        'gkmb3-overlap-badge',
        review
          ? '👀 Verdt å se på'
          : disc.is_favorite
            ? '★ Prioritert'
            : '✓ Behold-kandidat'
      ));

      var show = el(
        'button',
        'gkmb3-btn secondary',
        'Vis i bagen'
      );
      show.type = 'button';
      show.style.minHeight = '30px';
      show.style.padding = '5px 7px';
      show.onclick = (function (id) {
        return function (event) {
          focusDiscInBag(id, event);
        };
      })(disc.id);

      actions.appendChild(show);
      row.appendChild(actions);
      list.appendChild(row);
    }

    return list;
  }

  function scrollToRoundBag() {
    window.setTimeout(function () {
      var node = document.getElementById(
        'gkmb3-roundbag-section'
      );

      if (node) {
        node.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 80);
  }

  function renderRecommendationPanel() {
    var card = el(
      'section',
      'gkmb3-card gkmb3-reco gkmb3-section-anchor'
    );

    card.id =
      'gkmb3-section-recommendations';

    var head = el(
      'div',
      'gkmb3-recohead'
    );

    var headText = el('div', '');

    headText.appendChild(
      el(
        'h3',
        '',
        '🎯 Mine anbefalinger'
      )
    );

    headText.appendChild(el(
      'p',
      '',
      'Min Bag kombinerer spillerprofilen med det som faktisk ligger i bagen. Målet er ikke en teoretisk «perfekt» bag, men forslag som passer måten du ønsker å spille på.'
    ));

    head.appendChild(headText);

    if (STATE.recoProfile) {
      var edit = el(
        'button',
        'gkmb3-btn secondary',
        STATE.recoProfileOpen
          ? 'Lukk profil'
          : '✏ Endre profil'
      );

      edit.type = 'button';
      edit.disabled = !!STATE.recoBusy;

      edit.onclick = function () {
        STATE.recoProfileOpen =
          !STATE.recoProfileOpen;

        render();
      };

      head.appendChild(edit);
    }

    card.appendChild(head);

    if (!STATE.recoProfileLoaded) {
      card.appendChild(
        el(
          'div',
          'gkmb3-empty',
          'Laster spillerprofil…'
        )
      );

      return card;
    }

    if (!STATE.recoProfile) {
      var intro = el(
        'div',
        'gkmb3-note'
      );

      intro.textContent =
        'Lag spillerprofilen én gang. I tillegg til nivå og kastelengde kan du velge hvilke stabiliteter du trives med, om Min Bag skal følge merkene i bagen og hva du først og fremst ønsker å forbedre.';

      card.appendChild(intro);
      card.appendChild(
        renderRecoProfileForm()
      );

      return card;
    }

    var pills = el(
      'div',
      'gkmb3-recopills'
    );

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile.skill_level,
        'skill'
      )
    ));

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile
          .throw_distance_band,
        'distance'
      )
    ));

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile.handedness,
        'hand'
      )
    ));

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile.throw_style,
        'throwStyle'
      )
    ));

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile.course_style,
        'course'
      )
    ));

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile.wind_style,
        'wind'
      )
    ));

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile
          .improvement_goal ||
        'balanced',
        'goal'
      )
    ));

    pills.appendChild(el(
      'span',
      'gkmb3-recopill',
      recoLabel(
        STATE.recoProfile
          .disc_comfort ||
        'balanced',
        'comfort'
      )
    ));

    if (
      STATE.recoProfile
        .brand_preference_mode ===
      'specific'
    ) {
      pills.appendChild(el(
        'span',
        'gkmb3-recopill',
        'Merke: ' +
        safe(
          STATE.recoProfile
            .preferred_brand ||
          'valgt merke'
        )
      ));
    } else if (
      STATE.recoProfile
        .brand_preference_mode ===
      'any'
    ) {
      pills.appendChild(
        el(
          'span',
          'gkmb3-recopill',
          'Alle merker'
        )
      );
    } else {
      pills.appendChild(
        el(
          'span',
          'gkmb3-recopill',
          'Merke: følger bagen'
        )
      );
    }

    if (
      STATE.recoProfile
        .stability_preference_mode ===
      'custom'
    ) {
      var selected =
        Array.isArray(
          STATE.recoProfile
            .preferred_stabilities
        )
          ? STATE.recoProfile
              .preferred_stabilities
          : [];

      var selectedLabels = [];

      for (
        var ps = 0;
        ps < selected.length;
        ps += 1
      ) {
        selectedLabels.push(
          recoStabilityLabel(
            selected[ps]
          )
        );
      }

      pills.appendChild(el(
        'span',
        'gkmb3-recopill',
        'Flights: ' +
        selectedLabels.join(' + ')
      ));
    } else if (
      STATE.recoProfile
        .stability_preference_mode ===
      'all'
    ) {
      pills.appendChild(
        el(
          'span',
          'gkmb3-recopill',
          'Alle stabiliteter'
        )
      );
    } else {
      pills.appendChild(
        el(
          'span',
          'gkmb3-recopill',
          'Flights: lærer av bagen'
        )
      );
    }

    if (
      STATE.recoProfile
        .include_putter_recommendations
    ) {
      pills.appendChild(
        el(
          'span',
          'gkmb3-recopill',
          'Puttere med'
        )
      );
    }

    card.appendChild(pills);

    if (STATE.recoProfileOpen) {
      card.appendChild(
        renderRecoProfileForm()
      );

      return card;
    }

    var insightBox =
      renderRecoInsights();

    if (insightBox) {
      card.appendChild(insightBox);
    }

    if (STATE.discs.length) {
      var featureLinks = el(
        'div',
        'gkmb3-featurelinks'
      );

      var scoreLink = el(
        'button',
        'gkmb3-btn secondary',
        '🏆 Bag-score'
      );

      scoreLink.type = 'button';

      scoreLink.onclick = function () {
        openAppView('score');
      };

      featureLinks.appendChild(
        scoreLink
      );

      var throwLink = el(
        'button',
        'gkmb3-btn secondary',
        '🥏 Hva bør jeg kaste?'
      );

      throwLink.type = 'button';

      throwLink.onclick = function () {
        openAppView('throw');
      };

      featureLinks.appendChild(
        throwLink
      );

      var roundLink = el(
        'button',
        'gkmb3-btn secondary',
        '🧳 Rundebag'
      );

      roundLink.type = 'button';

      roundLink.onclick = function () {
        openAppView('roundbag');
      };

      featureLinks.appendChild(
        roundLink
      );

      card.appendChild(featureLinks);
    }

    if (!STATE.discs.length) {
      var emptyBag = el(
        'div',
        'gkmb3-empty'
      );

      emptyBag.appendChild(
        el(
          'strong',
          '',
          'Legg noen discer i bagen først'
        )
      );

      emptyBag.appendChild(el(
        'div',
        '',
        'Når bagen har discer lærer Min Bag blant annet hvilke stabiliteter, merker og speed-områder du faktisk bruker.'
      ));

      card.appendChild(emptyBag);
      card.appendChild(
        renderFunRecommendations()
      );

      return card;
    }

    if (!STATE.recoLoaded) {
      card.appendChild(
        el(
          'div',
          'gkmb3-empty',
          'Analyserer bagen…'
        )
      );

      return card;
    }

    if (!STATE.recoFindings.length) {
      var clean = el(
        'div',
        'gkmb3-empty'
      );

      clean.appendChild(
        el(
          'strong',
          '',
          'Ingen tydelige hull funnet'
        )
      );

      clean.appendChild(el(
        'div',
        '',
        'Bagen dekker de viktigste rollene for spillerprofilen og preferansene dine uten tydelig problematisk overlapp.'
      ));

      card.appendChild(clean);
      card.appendChild(
        renderFunRecommendations()
      );

      return card;
    }

    var list = el(
      'div',
      'gkmb3-recolist'
    );

    var max = Math.min(
      6,
      STATE.recoFindings.length
    );

    for (
      var i = 0;
      i < max;
      i += 1
    ) {
      var finding =
        STATE.recoFindings[i];

      var item = el(
        'div',
        'gkmb3-recofinding ' +
        (
          finding.finding_type ===
          'overlap'
            ? 'overlap'
            : 'gap'
        )
      );

      var itemHead = el(
        'div',
        'gkmb3-recofinding-head'
      );

      var title =
        (
          finding.finding_type ===
          'overlap'
            ? '♻️ '
            : '🎯 '
        ) +
        safe(finding.title);

      itemHead.appendChild(
        el(
          'div',
          'gkmb3-recofinding-title',
          title
        )
      );

      itemHead.appendChild(el(
        'div',
        'gkmb3-recofinding-priority',
        recoPriorityLabel(
          finding.priority
        )
      ));

      item.appendChild(itemHead);

      item.appendChild(el(
        'div',
        'gkmb3-recofinding-reason',
        safe(finding.reason)
      ));

      var meta = [];

      if (finding.disc_type) {
        meta.push(
          recoTypeLabel(
            finding.disc_type
          )
        );
      }

      if (finding.stability) {
        meta.push(
          recoStabilityLabel(
            finding.stability
          )
        );
      }

      if (
        finding.target_speed_min !==
          null &&
        finding.target_speed_min !==
          undefined &&
        finding.target_speed_max !==
          null &&
        finding.target_speed_max !==
          undefined
      ) {
        var minSpeed =
          Number(
            finding.target_speed_min
          );

        var maxSpeed =
          Number(
            finding.target_speed_max
          );

        meta.push(
          minSpeed === maxSpeed
            ? 'Speed ' + minSpeed
            : 'Speed ' +
              minSpeed +
              '–' +
              maxSpeed
        );
      }

      if (
        finding.finding_type ===
          'overlap' &&
        Number(
          finding.disc_count
        ) > 0
      ) {
        meta.push(
          Number(
            finding.disc_count
          ) +
          ' discer'
        );
      }

      if (meta.length) {
        item.appendChild(el(
          'div',
          'gkmb3-recofinding-meta',
          meta.join(' · ')
        ));
      }

      if (
        finding.finding_type ===
        'overlap'
      ) {
        var overlapKey =
          overlapFindingKey(finding);

        var overlapOpen =
          STATE.expandedOverlapKey ===
          overlapKey;

        item.className +=
          ' clickable';

        item.appendChild(el(
          'div',
          'gkmb3-overlap-toggle',
          overlapOpen
            ? '▲ Skjul discer'
            : '▼ Trykk for å se hvilke discer'
        ));

        item.onclick =
          (function (key) {
            return function (event) {
              if (
                event &&
                event.target &&
                (
                  event.target.tagName ===
                    'BUTTON' ||
                  event.target.closest &&
                  event.target.closest(
                    'button'
                  )
                )
              ) {
                return;
              }

              STATE.expandedOverlapKey =
                STATE.expandedOverlapKey ===
                key
                  ? ''
                  : key;

              render();
            };
          })(overlapKey);

        if (overlapOpen) {
          item.appendChild(
            renderOverlapDetails(
              finding
            )
          );
        }
      }

      if (
        finding.finding_type ===
        'gap'
      ) {
        if (
          !STATE.recoProductsLoaded
        ) {
          item.appendChild(el(
            'div',
            'gkmb3-note',
            'Finner de beste GolfKongen-matchene…'
          ));
        } else {
          var matches =
            recommendationsForFinding(
              finding
            );

          if (matches.length) {
            var matchList = el(
              'div',
              'gkmb3-recomatches'
            );

            for (
              var j = 0;
              j < matches.length;
              j += 1
            ) {
              matchList.appendChild(
                renderRecommendationMatch(
                  matches[j]
                )
              );
            }

            item.appendChild(
              matchList
            );
          } else {
            item.appendChild(el(
              'div',
              'gkmb3-note',
              'Ingen god lagerført GolfKongen-match for akkurat denne rollen nå.'
            ));
          }
        }
      }

      list.appendChild(item);
    }

    card.appendChild(list);
    card.appendChild(
      renderFunRecommendations()
    );

    return card;
  }

  function renderBagContents() {
    var card = el('section', 'gkmb3-card gkmb3-section-anchor');
    card.id = 'gkmb3-section-discs';

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
    card.id = 'gkmb3-disc-' + disc.id;

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
      'Endrer bare dette eksemplaret i bagen din. Produktinformasjon og flight-tall beholdes.'
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
        'Flytter bare dette eksemplaret. Vekt, farge, notat og favorittstatus følger med.'
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
    var card = el(
      'section',
      'gkmb3-card gkmb3-addpanel ' +
      (STATE.addDiscOpen ? 'open' : 'closed')
    );

    var head = el('div', 'gkmb3-addpanel-head');
    var copy = el('div', '');

    copy.appendChild(el('h3', '', '➕ Legg til disc'));
    copy.appendChild(el(
      'p',
      '',
      STATE.addDiscOpen
        ? 'Velg en GolfKongen-disc eller registrer en disc manuelt.'
        : 'Søk etter en disc eller registrer en du allerede eier.'
    ));

    var toggle = el(
      'button',
      STATE.addDiscOpen ? 'gkmb3-btn secondary' : 'gkmb3-btn',
      STATE.addDiscOpen ? '− Lukk' : '+ Åpne'
    );
    toggle.type = 'button';
    toggle.onclick = function () {
      STATE.addDiscOpen = !STATE.addDiscOpen;
      render();
    };

    head.appendChild(copy);
    head.appendChild(toggle);
    card.appendChild(head);

    if (!STATE.addDiscOpen) {
      return card;
    }

    var body = el('div', 'gkmb3-addpanel-body');

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
        targetOption.textContent =
          STATE.bags[b].name +
          (STATE.bags[b].is_default ? ' ★' : '');

        if (STATE.bags[b].id === selectedTarget) {
          targetOption.selected = true;
        }

        targetSelect.appendChild(targetOption);
      }

      targetSelect.onchange = function () {
        STATE.addTargetBagId = safe(targetSelect.value);
        status(
          'Nye discer legges i ' + selectedAddBagName() + '.',
          ''
        );
      };

      targetField.appendChild(targetSelect);
      body.appendChild(targetField);
    }

    var tabs = el('div', 'gkmb3-tabs');

    var catalogTab = el(
      'button',
      'gkmb3-tab active',
      'Fra GolfKongen'
    );
    catalogTab.type = 'button';
    catalogTab.dataset.target = 'catalog';

    var manualTab = el(
      'button',
      'gkmb3-tab',
      'Egen disc'
    );
    manualTab.type = 'button';
    manualTab.dataset.target = 'manual';

    tabs.appendChild(catalogTab);
    tabs.appendChild(manualTab);
    body.appendChild(tabs);

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

    body.appendChild(catalog);
    body.appendChild(manual);
    card.appendChild(body);

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
        'Søk etter discer GolfKongen har eller tidligere har hatt. Da kan bilde og flight-tall fylles inn automatisk, også for utgåtte modeller.'
      ));
    }

    wrap.appendChild(results);

    return wrap;
  }

  function renderCatalogResult(product) {
    var row = el(
      'article',
      'gkmb3-result'
    );

    var image = el(
      'div',
      'gkmb3-resultimg'
    );

    if (product.image_url) {
      var img =
        document.createElement('img');

      img.src =
        product.image_url;

      img.alt =
        product.product_name ||
        'Disc';

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
      product.product_name ||
      'Ukjent disc'
    ));

    var sub = [];

    if (product.brand) {
      sub.push(product.brand);
    }

    if (product.plastic) {
      sub.push(product.plastic);
    }

    sub.push(
      discTypeLabel(
        product.disc_type
      )
    );

    body.appendChild(el(
      'div',
      'gkmb3-resultsub',
      sub.join(' · ')
    ));

    var availability =
      product.availability_status ||
      (
        product.is_active === false
          ? 'historical'
          : product.is_in_stock === false
            ? 'sold_out'
            : 'available'
      );

    if (
      availability ===
      'historical'
    ) {
      body.appendChild(el(
        'div',
        'gkmb3-availability historical',
        'Tidligere hos GolfKongen'
      ));
    } else if (
      availability ===
      'sold_out'
    ) {
      body.appendChild(el(
        'div',
        'gkmb3-availability soldout',
        'Utsolgt akkurat nå'
      ));
    } else {
      body.appendChild(el(
        'div',
        'gkmb3-availability available',
        'På lager'
      ));
    }

    body.appendChild(
      renderFlight(
        product.speed,
        product.glide,
        product.turn,
        product.fade
      )
    );

    if (
      availability !==
        'historical' &&
      product.price_nok !== null &&
      product.price_nok !== undefined
    ) {
      body.appendChild(el(
        'div',
        'gkmb3-price',
        product.price_nok +
        ' kr'
      ));
    }

    var toolbar = el(
      'div',
      'gkmb3-toolbar'
    );

    toolbar.style.marginTop =
      '8px';

    var add = el(
      'button',
      'gkmb3-btn',
      'Legg i bag'
    );

    add.type = 'button';

    add.onclick = function () {
      addCatalogDisc(product);
    };

    toolbar.appendChild(add);

    if (
      availability !==
        'historical' &&
      product.product_url
    ) {
      var open = el(
        'a',
        'gkmb3-btn secondary',
        'Se produkt'
      );

      open.href =
        product.product_url;

      open.target =
        '_blank';

      open.rel =
        'noopener';

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
    grid1.appendChild(field('Modell / mold *', mold));
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
    var turn = numericInput('gkmb3-manual-turn', 'Turn', true);
    var fade = numericInput('gkmb3-manual-fade', 'Fade');

    turn.min = '-5';
    turn.max = '1';

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
    note.placeholder = 'Valgfritt notat om akkurat dette eksemplaret.';
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
      'Finner du ikke discen hos GolfKongen? Registrer den her med flight-tallene, så kan Min Bag bruke den i Bag-score, anbefalinger, caddien og Rundebag.'
    ));

    return wrap;
  }

  function field(labelText, control) {
    var label = el('label', 'gkmb3-field');
    label.appendChild(el('span', '', labelText));
    label.appendChild(control);
    return label;
  }

  function numericInput(id, placeholder, allowNegative) {
    var input = el('input', 'gkmb3-input');
    input.id = id;

    if (allowNegative) {
      input.type = 'text';
      input.inputMode = 'text';
      input.pattern = '-?[0-9]*([.,][0-9]+)?';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
    } else {
      input.type = 'number';
      input.step = '0.1';
      input.inputMode = 'decimal';
    }

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

      authEpoch += 1;
      resetUserState();
      render();
    }).catch(function (err) {
      setLoading(false);
      status('Kunne ikke logge ut: ' + errorMessage(err), 'err');
    });
  }

  function resetUserState() {
    STATE.user = null;
    STATE.activeView = 'home';
    STATE.appMenuOpen = false;
    STATE.addDiscOpen = false;
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
    STATE.recoInsights = null;
    STATE.recoInsightsLoaded = false;
    STATE.reward = null;
    STATE.rewardLoaded = false;
    STATE.rewardBusy = false;
    STATE.rewardError = '';
    STATE.funRecommendations = [];
    STATE.funRecommendationsLoaded = false;
    STATE.funRecommendationsError = '';
    STATE.funRecommendationsPage = 0;
    STATE.funRecommendationsBusy = false;
    STATE.bagScore = null;
    STATE.bagScoreLoaded = false;
    STATE.bagScoreError = '';
    STATE.throwDistance = '';
    STATE.throwWind = 'calm';
    STATE.throwLine = 'straight';
    STATE.throwType = '';
    STATE.throwResults = [];
    STATE.throwHasSearched = false;
    STATE.throwBusy = false;
    STATE.throwError = '';
    STATE.roundBagCount = '8';
    STATE.roundBagCourseStyle = '';
    STATE.roundBagWindStyle = '';
    STATE.roundBagFocus = '';
    STATE.roundBagResults = [];
    STATE.roundBagHasBuilt = false;
    STATE.roundBagBusy = false;
    STATE.roundBagError = '';
    STATE.roundBagSourceName = '';
    STATE.expandedOverlapKey = '';
    STATE.courses = [];
    STATE.coursesLoaded = false;
    STATE.courseTotalCount = 0;
    STATE.courseQuery = '';
    STATE.courseSearchBusy = false;
    STATE.courseProgress = {};
    STATE.courseProgressLoaded = false;
    STATE.courseProgressBusyId = null;
    STATE.coursePlayedCount = 0;
    STATE.courseSubmitOpen = false;
    STATE.courseSubmitBusy = false;
    STATE.myCourses = [];
    STATE.myCoursesLoaded = false;
    STATE.courseAdmin = false;
    STATE.courseAdminLoaded = false;
    STATE.pendingCourses = [];
    STATE.pendingCoursesLoaded = false;
    STATE.courseModerationBusy = false;
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

      var nextUser =
        session && session.user
          ? session.user
          : null;

      var userContext = applySessionUser(nextUser);

      if (!STATE.user) {
        render();
        return;
      }

      render();
      status('Laster Min Bag…');

      return ensureAndLoad(userContext);
    }).catch(function (err) {
      authEpoch += 1;
      resetUserState();
      render();
      status('Innloggingen feilet: ' + errorMessage(err), 'err');
    });
  }

  function ensureAndLoad(userContext) {
    if (!isCurrentUserContext(userContext)) {
      return Promise.resolve();
    }

    return supabaseClient.rpc('minbag_ensure_user')
      .then(function (res) {
        if (!isCurrentUserContext(userContext)) return null;
        if (res.error) throw res.error;
        return loadBrands();
      })
      .then(function () {
        if (!isCurrentUserContext(userContext)) return null;

        return Promise.all([
          loadStoreBagCatalog(),
          loadBags()
        ]);
      })
      .then(function () {
        if (!isCurrentUserContext(userContext)) return null;
        return loadRecoProfile();
      })
      .then(function () {
        if (!isCurrentUserContext(userContext)) return null;

        return Promise.all([
          loadActiveBagDiscs(),
          loadCourseModule()
        ]);
      })
      .then(function () {
        if (!isCurrentUserContext(userContext)) return;

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

    var userContext =
      captureUserContext();

    return supabaseClient
      .rpc(
        'minbag_get_reco_profile_v3'
      )
      .then(function (res) {
        if (
          !isCurrentUserContext(
            userContext
          )
        ) {
          return;
        }

        if (res.error) {
          throw res.error;
        }

        var rows =
          res.data || [];

        STATE.recoProfile =
          rows.length
            ? rows[0]
            : null;

        STATE.recoProfileLoaded =
          true;

        if (!STATE.recoProfile) {
          STATE.recoProfileOpen =
            true;
        }
      });
  }

  function loadCourses(query) {
    var wanted = trim(query);

    STATE.courseQuery = wanted;
    STATE.courseSearchBusy = true;

    var countPromise = supabaseClient.rpc(
      'minbag_count_courses',
      {
        p_query: wanted || null
      }
    );

    // Ingen søketekst: hent bare totalantallet aktive offentlige baner.
    // Selve banelisten skal være tom til brukeren søker.
    if (!wanted) {
      STATE.courses = [];

      return countPromise.then(function (countRes) {
        if (countRes.error) throw countRes.error;

        STATE.courses = [];
        STATE.courseTotalCount =
          Number(countRes.data || 0);
        STATE.coursesLoaded = true;
        STATE.courseSearchBusy = false;
      }).catch(function (err) {
        STATE.courses = [];
        STATE.courseTotalCount = 0;
        STATE.coursesLoaded = true;
        STATE.courseSearchBusy = false;

        console.warn(
          '[GK MIN BAG V3] Antall baner feilet',
          err
        );
      });
    }

    var searchPromise = supabaseClient.rpc(
      'minbag_search_courses',
      {
        p_query: wanted,
        p_limit: 100
      }
    );

    return Promise.all([
      searchPromise,
      countPromise
    ]).then(function (results) {
      var searchRes = results[0];
      var countRes = results[1];

      if (searchRes.error) throw searchRes.error;
      if (countRes.error) throw countRes.error;

      STATE.courses = searchRes.data || [];
      STATE.courseTotalCount =
        Number(countRes.data || 0);

      STATE.coursesLoaded = true;
      STATE.courseSearchBusy = false;
    }).catch(function (err) {
      STATE.courses = [];
      STATE.courseTotalCount = 0;
      STATE.coursesLoaded = true;
      STATE.courseSearchBusy = false;

      console.warn(
        '[GK MIN BAG V3] Banesøk feilet',
        err
      );
    });
  }


  function loadCourseProgress() {
    STATE.courseProgressLoaded = false;

    if (!STATE.user) {
      STATE.courseProgress = {};
      STATE.coursePlayedCount = 0;
      STATE.courseProgressLoaded = true;
      return Promise.resolve();
    }

    var userContext = captureUserContext();

    return supabaseClient.rpc(
      'minbag_get_course_progress'
    ).then(function (res) {
      if (!isCurrentUserContext(userContext)) return;
      if (res.error) throw res.error;

      var rows = res.data || [];
      var map = {};

      for (var i = 0; i < rows.length; i += 1) {
        if (rows[i] && rows[i].course_id) {
          map[rows[i].course_id] = rows[i];
        }
      }

      STATE.courseProgress = map;
      STATE.coursePlayedCount = rows.length;
      STATE.courseProgressLoaded = true;
    }).catch(function (err) {
      if (!isCurrentUserContext(userContext)) return;

      STATE.courseProgress = {};
      STATE.coursePlayedCount = 0;
      STATE.courseProgressLoaded = true;

      console.warn(
        '[GK MIN BAG V3] Baneprogresjon feilet',
        err
      );
    });
  }

  function loadMyCourses() {
    if (!STATE.user) {
      STATE.myCourses = [];
      STATE.myCoursesLoaded = true;
      return Promise.resolve();
    }

    var userContext = captureUserContext();

    return supabaseClient.rpc('minbag_get_my_courses')
      .then(function (res) {
        if (!isCurrentUserContext(userContext)) return;
        if (res.error) throw res.error;

        STATE.myCourses = res.data || [];
        STATE.myCoursesLoaded = true;
      })
      .catch(function (err) {
        if (!isCurrentUserContext(userContext)) return;

        STATE.myCourses = [];
        STATE.myCoursesLoaded = true;

        console.warn(
          '[GK MIN BAG V3] Mine baner feilet',
          err
        );
      });
  }

  function loadPendingCourses() {
    if (!STATE.courseAdmin) {
      STATE.pendingCourses = [];
      STATE.pendingCoursesLoaded = true;
      return Promise.resolve();
    }

    var userContext = captureUserContext();
    STATE.pendingCoursesLoaded = false;

    return supabaseClient.rpc(
      'minbag_admin_get_pending_courses'
    ).then(function (res) {
      if (!isCurrentUserContext(userContext)) return;
      if (res.error) throw res.error;

      STATE.pendingCourses = res.data || [];
      STATE.pendingCoursesLoaded = true;
    }).catch(function (err) {
      if (!isCurrentUserContext(userContext)) return;

      STATE.pendingCourses = [];
      STATE.pendingCoursesLoaded = true;

      console.warn(
        '[GK MIN BAG V3] Banekø feilet',
        err
      );
    });
  }

  function loadCourseAdminStatus() {
    if (!STATE.user) {
      STATE.courseAdmin = false;
      STATE.courseAdminLoaded = true;
      STATE.pendingCourses = [];
      STATE.pendingCoursesLoaded = true;
      return Promise.resolve();
    }

    var userContext = captureUserContext();

    return supabaseClient.rpc(
      'minbag_course_admin_status'
    ).then(function (res) {
      if (!isCurrentUserContext(userContext)) return;
      if (res.error) throw res.error;

      STATE.courseAdmin = !!res.data;
      STATE.courseAdminLoaded = true;

      return loadPendingCourses();
    }).catch(function (err) {
      if (!isCurrentUserContext(userContext)) return;

      STATE.courseAdmin = false;
      STATE.courseAdminLoaded = true;
      STATE.pendingCourses = [];
      STATE.pendingCoursesLoaded = true;

      console.warn(
        '[GK MIN BAG V3] Adminstatus for baner feilet',
        err
      );
    });
  }

  function loadCourseModule() {
    return Promise.all([
      loadCourses(''),
      loadCourseProgress(),
      loadMyCourses(),
      loadCourseAdminStatus()
    ]);
  }

  function searchCoursesFromForm() {
    if (STATE.courseSearchBusy) return;

    var query = trim(getInputValue('gkmb3-course-search'));

    STATE.courseSearchBusy = true;
    render();

    if (!query) {
      status('Nullstiller banesøket…');

      loadCourses('')
        .then(function () {
          render();
          status(
            'Skriv inn fylke, kommune, sted eller banenavn for å vise baner.',
            ''
          );
        });

      return;
    }

    status('Søker etter baner…');

    loadCourses(query)
      .then(function () {
        render();

        if (STATE.courseTotalCount > 0) {
          status(
            'Fant ' +
            STATE.courseTotalCount +
            ' bane' +
            (STATE.courseTotalCount === 1 ? '.' : 'r.'),
            'ok'
          );
        } else {
          status('Fant ingen godkjente baner på søket.', '');
        }
      });
  }

  function toggleCoursePlayed(courseId, checked) {
    if (!STATE.user ||
        !courseId ||
        STATE.courseProgressBusyId) {
      return;
    }

    var existing = courseProgressFor(courseId);
    var previous = existing
      ? {
          course_id: existing.course_id,
          has_played: !!existing.has_played,
          personal_best_to_par:
            existing.personal_best_to_par,
          comment: existing.comment || '',
          updated_at: existing.updated_at || null
        }
      : null;

    if (!checked &&
        previous &&
        (
          previous.personal_best_to_par !== null &&
          previous.personal_best_to_par !== undefined
          || trim(previous.comment)
        )) {
      if (!window.confirm(
        'Fjerne «Har spilt» og samtidig slette personlig rekord og kommentar for denne banen?'
      )) {
        render();
        return;
      }
    }

    STATE.courseProgressBusyId = courseId;

    // Optimistisk UI:
    // Haken og feltene vises/fjernes umiddelbart.
    if (checked) {
      STATE.courseProgress[courseId] = {
        course_id: courseId,
        has_played: true,
        personal_best_to_par:
          previous &&
          previous.personal_best_to_par !== undefined
            ? previous.personal_best_to_par
            : null,
        comment:
          previous && previous.comment
            ? previous.comment
            : '',
        updated_at: new Date().toISOString()
      };

      if (!previous || !previous.has_played) {
        STATE.coursePlayedCount =
          Number(STATE.coursePlayedCount || 0) + 1;
      }
    } else {
      delete STATE.courseProgress[courseId];

      if (previous && previous.has_played) {
        STATE.coursePlayedCount = Math.max(
          0,
          Number(STATE.coursePlayedCount || 0) - 1
        );
      }
    }

    render();

    status(
      checked
        ? 'Lagrer at banen er spilt…'
        : 'Fjerner banen fra spilte baner…'
    );

    supabaseClient.rpc(
      'minbag_set_course_progress',
      {
        p_course_id: courseId,
        p_has_played: !!checked,
        p_personal_best_to_par:
          checked &&
          previous &&
          previous.personal_best_to_par !== undefined
            ? previous.personal_best_to_par
            : null,
        p_comment:
          checked &&
          previous &&
          previous.comment
            ? previous.comment
            : null
      }
    ).then(function (res) {
      if (res.error) throw res.error;

      return loadCourseProgress();
    }).then(function () {
      STATE.courseProgressBusyId = null;
      render();

      status(
        checked
          ? 'Banen er markert som spilt.'
          : 'Banen er fjernet fra spilte baner.',
        'ok'
      );
    }).catch(function (err) {
      // Rull UI tilbake dersom Supabase ikke lagret.
      if (previous && previous.has_played) {
        STATE.courseProgress[courseId] = previous;
      } else {
        delete STATE.courseProgress[courseId];
      }

      STATE.coursePlayedCount = Object.keys(
        STATE.courseProgress
      ).length;

      STATE.courseProgressBusyId = null;
      render();

      status(
        'Kunne ikke oppdatere banen akkurat nå: ' +
        errorMessage(err),
        'err'
      );
    });
  }


  function saveCourseProgress(courseId) {
    if (!STATE.user ||
        !courseId ||
        STATE.courseProgressBusyId) {
      return;
    }

    var bestText = getInputValue(
      'gkmb3-course-best-' + courseId
    );

    var best = null;

    if (trim(bestText) !== '') {
      best = Number(bestText);

      if (!isFinite(best) ||
          Math.round(best) !== best ||
          best < -100 ||
          best > 200) {
        status(
          'Personlig rekord må være et heltall mellom -100 og +200, for eksempel -7.',
          'err'
        );
        return;
      }
    }

    var comment = getInputValue(
      'gkmb3-course-comment-' + courseId
    );

    STATE.courseProgressBusyId = courseId;
    render();
    status('Lagrer rekord og kommentar…');

    supabaseClient.rpc(
      'minbag_set_course_progress',
      {
        p_course_id: courseId,
        p_has_played: true,
        p_personal_best_to_par: best,
        p_comment: comment || null
      }
    ).then(function (res) {
      if (res.error) throw res.error;

      return loadCourseProgress();
    }).then(function () {
      STATE.courseProgressBusyId = null;
      render();
      status('Personlig rekord og kommentar er lagret.', 'ok');
    }).catch(function (err) {
      STATE.courseProgressBusyId = null;
      render();

      status(
        'Kunne ikke lagre rekord og kommentar: ' +
        errorMessage(err),
        'err'
      );
    });
  }

  function submitCourse() {
    if (!STATE.user || STATE.courseSubmitBusy) return;

    var name = getInputValue('gkmb3-course-name');

    if (!name) {
      status('Skriv inn navn på banen.', 'err');
      return;
    }

    var holes = numOrNull(
      getInputValue('gkmb3-course-holes')
    );

    var length = numOrNull(
      getInputValue('gkmb3-course-length')
    );

    STATE.courseSubmitBusy = true;
    render();
    status('Lagrer bane…');

    supabaseClient.rpc(
      'minbag_submit_course',
      {
        p_name: name,
        p_locality: getInputValue('gkmb3-course-locality') || null,
        p_municipality: getInputValue('gkmb3-course-municipality') || null,
        p_county: getInputValue('gkmb3-course-county') || null,
        p_address: getInputValue('gkmb3-course-address') || null,

        p_holes: holes === null ? null : Math.round(holes),
        p_total_length_m:
          length === null ? null : Math.round(length),

        p_course_style:
          getInputValue('gkmb3-course-style') || 'mixed',

        p_wind_style:
          getInputValue('gkmb3-course-wind') || 'mixed',

        p_focus:
          getInputValue('gkmb3-course-focus') || 'balanced',

        p_difficulty_level:
          Number(
            getInputValue('gkmb3-course-difficulty')
          ) || 3,

        p_description:
          getInputValue('gkmb3-course-description') || null,

        p_website_url:
          getInputValue('gkmb3-course-website') || null,

        p_map_url:
          getInputValue('gkmb3-course-map') || null,

        p_source_url:
          getInputValue('gkmb3-course-source') || null,

        p_submit_public:
          getChecked('gkmb3-course-public')
      }
    ).then(function (res) {
      if (res.error) throw res.error;

      var rows = res.data || [];
      var row = rows.length ? rows[0] : null;

      STATE.courseSubmitBusy = false;
      STATE.courseSubmitOpen = false;

      return Promise.all([
        loadMyCourses(),
        loadPendingCourses()
      ]).then(function () {
        render();

        status(
          row &&
          row.visibility_status === 'private'
            ? 'Privat bane lagret.'
            : 'Bane sendt til godkjenning.',
          'ok'
        );
      });
    }).catch(function (err) {
      STATE.courseSubmitBusy = false;
      render();

      status(
        'Kunne ikke lagre bane: ' + errorMessage(err),
        'err'
      );
    });
  }

  function moderateCourse(courseId, action) {
    if (!STATE.courseAdmin ||
        !courseId ||
        STATE.courseModerationBusy) {
      return;
    }

    var note = '';

    if (action === 'reject') {
      note =
        window.prompt(
          'Valgfri forklaring til brukeren på hvorfor banen avvises:',
          ''
        ) || '';

      if (!window.confirm('Avvise denne banen?')) {
        return;
      }
    } else if (!window.confirm(
      'Godkjenne banen som offentlig og søkbar for alle?'
    )) {
      return;
    }

    STATE.courseModerationBusy = true;
    render();

    supabaseClient.rpc(
      'minbag_admin_moderate_course',
      {
        p_course_id: courseId,
        p_action: action,
        p_note: note || null
      }
    ).then(function (res) {
      if (res.error) throw res.error;

      STATE.courseModerationBusy = false;

      return Promise.all([
        loadPendingCourses(),
        loadMyCourses(),
        loadCourses(STATE.courseQuery)
      ]);
    }).then(function () {
      render();

      status(
        action === 'approve'
          ? 'Bane godkjent og gjort offentlig.'
          : 'Bane avvist.',
        'ok'
      );
    }).catch(function (err) {
      STATE.courseModerationBusy = false;
      render();

      status(
        'Kunne ikke behandle banen: ' + errorMessage(err),
        'err'
      );
    });
  }

  function runRoundBagBuild(
    countValue,
    courseStyle,
    windStyle,
    focus,
    sourceName
  ) {
    if (!STATE.user ||
        !STATE.activeBagId ||
        STATE.roundBagBusy) {
      return;
    }

    var userContext = captureUserContext();
    var requestedBagId = STATE.activeBagId;

    STATE.roundBagCount =
      safe(countValue || STATE.roundBagCount || '8');

    STATE.roundBagCourseStyle =
      courseStyle || STATE.roundBagCourseStyle || 'mixed';

    STATE.roundBagWindStyle =
      windStyle || STATE.roundBagWindStyle || 'mixed';

    STATE.roundBagFocus =
      focus || STATE.roundBagFocus || 'balanced';

    STATE.roundBagSourceName = sourceName || '';

    STATE.roundBagBusy = true;
    STATE.roundBagHasBuilt = true;
    STATE.roundBagResults = [];
    STATE.roundBagError = '';

    render();

    if (sourceName) {
      scrollToRoundBag();
    }

    status(
      sourceName
        ? 'Bygger rundebag for ' + sourceName + '…'
        : 'Bygger optimal rundebag…'
    );

    supabaseClient.rpc(
      'minbag_build_round_bag',
      {
        p_bag_id: requestedBagId,
        p_disc_count:
          Number(STATE.roundBagCount) || 8,
        p_course_style:
          STATE.roundBagCourseStyle,
        p_wind_style:
          STATE.roundBagWindStyle,
        p_focus:
          STATE.roundBagFocus
      }
    ).then(function (res) {
      if (!isCurrentUserContext(userContext) ||
          STATE.activeBagId !== requestedBagId) {
        return;
      }

      if (res.error) throw res.error;

      STATE.roundBagResults = res.data || [];
      STATE.roundBagBusy = false;
      render();

      if (sourceName) {
        scrollToRoundBag();
      }

      if (STATE.roundBagResults.length) {
        status(
          sourceName
            ? 'Rundebag for ' +
              sourceName +
              ' bygget med ' +
              STATE.roundBagResults.length +
              ' discer.'
            : 'Rundebag bygget med ' +
              STATE.roundBagResults.length +
              ' discer.',
          'ok'
        );
      } else {
        status(
          'Fant ingen egnede discer med komplette flight-tall.',
          ''
        );
      }
    }).catch(function (err) {
      if (!isCurrentUserContext(userContext) ||
          STATE.activeBagId !== requestedBagId) {
        return;
      }

      STATE.roundBagResults = [];
      STATE.roundBagBusy = false;
      STATE.roundBagError = errorMessage(err);
      render();

      status(
        'Kunne ikke bygge rundebag: ' +
        errorMessage(err),
        'err'
      );
    });
  }

  function buildRoundBagForCourse(course) {
    if (!course) return;

    STATE.activeView = 'roundbag';
    STATE.appMenuOpen = false;

    var focus =
      course.focus ||
      (
        course.course_style === 'technical'
          ? 'control'
          : course.course_style === 'open'
            ? 'distance'
            : 'balanced'
      );

    runRoundBagBuild(
      STATE.roundBagCount || '8',
      course.course_style || 'mixed',
      course.wind_style || 'mixed',
      focus,
      course.name || 'valgt bane'
    );
  }

  function buildRoundBag() {
    if (!STATE.user || !STATE.activeBagId || STATE.roundBagBusy) {
      return;
    }

    runRoundBagBuild(
      getInputValue('gkmb3-roundbag-count') ||
        STATE.roundBagCount ||
        '8',

      getInputValue('gkmb3-roundbag-course') ||
        STATE.roundBagCourseStyle ||
        'mixed',

      getInputValue('gkmb3-roundbag-wind') ||
        STATE.roundBagWindStyle ||
        'mixed',

      getInputValue('gkmb3-roundbag-focus') ||
        STATE.roundBagFocus ||
        'balanced',

      ''
    );
  }

  function findBestThrowDisc() {
    if (!STATE.user || !STATE.activeBagId || STATE.throwBusy) return;

    var distance = getInputValue('gkmb3-throw-distance');
    var wind = getInputValue('gkmb3-throw-wind');
    var line = getInputValue('gkmb3-throw-line');
    var throwType = getInputValue('gkmb3-throw-type');

    STATE.throwDistance = distance || STATE.throwDistance || '60_80';
    STATE.throwWind = wind || STATE.throwWind || 'calm';
    STATE.throwLine = line || STATE.throwLine || 'straight';
    STATE.throwType = throwType || STATE.throwType || 'backhand';

    STATE.throwBusy = true;
    STATE.throwHasSearched = true;
    STATE.throwResults = [];
    STATE.throwError = '';

    render();
    status('Vurderer discene i bagen…');

    supabaseClient.rpc(
      'minbag_get_throw_recommendations',
      {
        p_bag_id: STATE.activeBagId,
        p_distance_band: STATE.throwDistance,
        p_wind: STATE.throwWind,
        p_line: STATE.throwLine,
        p_throw_type: STATE.throwType
      }
    ).then(function (res) {
      if (res.error) throw res.error;

      STATE.throwResults = res.data || [];
      STATE.throwBusy = false;
      render();

      if (STATE.throwResults.length) {
        status(
          'Beste disc for kastet er ' +
          safe(STATE.throwResults[0].name) +
          '.',
          'ok'
        );
      } else {
        status(
          'Fant ingen discer med komplette flight-tall for kastet.',
          ''
        );
      }
    }).catch(function (err) {
      STATE.throwResults = [];
      STATE.throwBusy = false;
      STATE.throwError = errorMessage(err);
      render();
      status(
        'Kunne ikke finne beste disc: ' + errorMessage(err),
        'err'
      );
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

    var userContext = captureUserContext();
    var requestedBagId = STATE.activeBagId;

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
      if (!isCurrentUserContext(userContext) || STATE.activeBagId !== requestedBagId) return;
      if (res.error) throw res.error;

      STATE.funRecommendations = res.data || [];
      STATE.funRecommendationsLoaded = true;
    }).catch(function (err) {
      if (!isCurrentUserContext(userContext) || STATE.activeBagId !== requestedBagId) return;

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

    STATE.recoInsights = null;
    STATE.recoInsightsLoaded = false;

    STATE.funRecommendations = [];
    STATE.funRecommendationsLoaded = false;
    STATE.funRecommendationsError = '';

    STATE.bagScore = null;
    STATE.bagScoreLoaded = false;
    STATE.bagScoreError = '';

    if (
      !STATE.user ||
      !STATE.activeBagId ||
      !STATE.recoProfile
    ) {
      STATE.recoLoaded = true;
      STATE.recoProductsLoaded = true;
      STATE.recoInsightsLoaded = true;
      STATE.funRecommendationsLoaded = true;
      STATE.bagScoreLoaded = true;

      return Promise.resolve();
    }

    var userContext =
      captureUserContext();

    var bagId =
      STATE.activeBagId;

    var gapPromise =
      supabaseClient.rpc(
        'minbag_get_gap_analysis_v3',
        {
          p_bag_id: bagId
        }
      )
      .then(function (res) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        if (res.error) {
          throw res.error;
        }

        STATE.recoFindings =
          res.data || [];

        STATE.recoLoaded =
          true;
      })
      .catch(function (err) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        STATE.recoFindings = [];
        STATE.recoLoaded = true;

        console.warn(
          '[GK MIN BAG V3] Personlig gap-analyse feilet',
          err
        );
      });

    var productPromise =
      supabaseClient.rpc(
        'minbag_get_product_recommendations_v3',
        {
          p_bag_id: bagId,
          p_limit_per_gap: 3
        }
      )
      .then(function (res) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        if (res.error) {
          throw res.error;
        }

        STATE.recoProducts =
          res.data || [];

        STATE.recoProductsLoaded =
          true;
      })
      .catch(function (err) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        STATE.recoProducts = [];
        STATE.recoProductsLoaded =
          true;

        STATE.recoProductsError =
          errorMessage(err);

        console.warn(
          '[GK MIN BAG V3] Personlige produktanbefalinger feilet',
          err
        );
      });

    var insightPromise =
      supabaseClient.rpc(
        'minbag_get_recommendation_insights_v3',
        {
          p_bag_id: bagId
        }
      )
      .then(function (res) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        if (res.error) {
          throw res.error;
        }

        var rows =
          res.data || [];

        STATE.recoInsights =
          rows.length
            ? rows[0]
            : null;

        STATE.recoInsightsLoaded =
          true;
      })
      .catch(function (err) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        STATE.recoInsights = null;
        STATE.recoInsightsLoaded =
          true;

        console.warn(
          '[GK MIN BAG V3] Baginnsikt feilet',
          err
        );
      });

    var funPromise =
      loadFunRecommendations();

    var scorePromise =
      supabaseClient.rpc(
        'minbag_get_bag_score_v2',
        {
          p_bag_id: bagId
        }
      )
      .then(function (res) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        if (res.error) {
          throw res.error;
        }

        var rows =
          res.data || [];

        STATE.bagScore =
          rows.length
            ? rows[0]
            : null;

        STATE.bagScoreLoaded =
          true;
      })
      .catch(function (err) {
        if (
          !isCurrentUserContext(
            userContext
          ) ||
          STATE.activeBagId !==
            bagId
        ) {
          return;
        }

        STATE.bagScore = null;
        STATE.bagScoreLoaded =
          true;

        STATE.bagScoreError =
          errorMessage(err);

        console.warn(
          '[GK MIN BAG V3] Personlig Bag-score feilet',
          err
        );
      });

    return Promise.all([
      gapPromise,
      productPromise,
      insightPromise,
      funPromise,
      scorePromise
    ]);
  }

  function saveRecoProfile() {
    if (
      !STATE.user ||
      STATE.recoBusy
    ) {
      return;
    }

    var brandMode =
      getInputValue(
        'gkmb3-reco-brand-mode'
      ) ||
      'bag';

    var preferredBrand =
      getInputValue(
        'gkmb3-reco-brand'
      );

    var stabilityMode =
      getInputValue(
        'gkmb3-reco-stability-mode'
      ) ||
      'auto';

    var stabilityKeys = [
      'understable',
      'neutral',
      'stable',
      'overstable'
    ];

    var preferredStabilities = [];

    for (
      var i = 0;
      i < stabilityKeys.length;
      i += 1
    ) {
      if (
        getChecked(
          'gkmb3-reco-stab-' +
          stabilityKeys[i]
        )
      ) {
        preferredStabilities.push(
          stabilityKeys[i]
        );
      }
    }

    if (
      brandMode === 'specific' &&
      !preferredBrand
    ) {
      status(
        'Velg hvilket merke du vil prioritere.',
        'err'
      );
      return;
    }

    if (
      stabilityMode === 'custom' &&
      !preferredStabilities.length
    ) {
      status(
        'Velg minst én stabilitet du trives med.',
        'err'
      );
      return;
    }

    var payload = {
      p_skill_level:
        getInputValue(
          'gkmb3-reco-skill'
        ),

      p_throw_distance_band:
        getInputValue(
          'gkmb3-reco-distance'
        ),

      p_handedness:
        getInputValue(
          'gkmb3-reco-hand'
        ),

      p_throw_style:
        getInputValue(
          'gkmb3-reco-throw-style'
        ),

      p_course_style:
        getInputValue(
          'gkmb3-reco-course'
        ),

      p_wind_style:
        getInputValue(
          'gkmb3-reco-wind'
        ),

      p_include_putter_recommendations:
        getChecked(
          'gkmb3-reco-putter'
        ),

      p_brand_preference_mode:
        brandMode,

      p_preferred_brand:
        brandMode === 'specific'
          ? preferredBrand
          : null,

      p_stability_preference_mode:
        stabilityMode,

      p_preferred_stabilities:
        preferredStabilities,

      p_disc_comfort:
        getInputValue(
          'gkmb3-reco-comfort'
        ) ||
        'balanced',

      p_improvement_goal:
        getInputValue(
          'gkmb3-reco-goal'
        ) ||
        'balanced'
    };

    STATE.recoBusy = true;

    STATE.roundBagCourseStyle = '';
    STATE.roundBagWindStyle = '';
    STATE.roundBagFocus = '';
    STATE.roundBagResults = [];
    STATE.roundBagHasBuilt = false;
    STATE.roundBagBusy = false;
    STATE.roundBagError = '';

    render();

    status(
      'Lagrer spillerprofil…'
    );

    supabaseClient
      .rpc(
        'minbag_set_reco_profile_v3',
        payload
      )
      .then(function (res) {
        if (res.error) {
          throw res.error;
        }

        return loadRecoProfile();
      })
      .then(function () {
        STATE.recoProfileOpen =
          false;

        return loadGapAnalysis();
      })
      .then(function () {
        STATE.recoBusy = false;

        render();

        status(
          'Spillerprofil lagret og bagen analysert på nytt.',
          'ok'
        );
      })
      .catch(function (err) {
        STATE.recoBusy = false;

        render();

        status(
          'Kunne ikke lagre spillerprofil: ' +
          errorMessage(err),
          'err'
        );
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

    var userContext = captureUserContext();

    return supabaseClient.rpc('minbag_get_golfkongen_bags')
      .then(function (res) {
        if (!isCurrentUserContext(userContext)) return;
        if (res.error) throw res.error;
        STATE.storeBags = res.data || [];
      });
  }

  function loadStoreBagSelections() {
    STATE.storeBagSelections = {};

    if (!STATE.user || !STATE.bags.length) {
      return Promise.resolve();
    }

    var userContext = captureUserContext();

    return supabaseClient.rpc('minbag_get_my_bag_store_selections')
      .then(function (res) {
        if (!isCurrentUserContext(userContext)) return;
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

    var userContext = captureUserContext();

    return supabaseClient.rpc('minbag_get_my_bag_images')
      .then(function (res) {
        if (!isCurrentUserContext(userContext)) return;
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
                  if (!isCurrentUserContext(userContext)) return;
                  if (signed.error) throw signed.error;

                  if (
                    signed.data &&
                    signed.data.signedUrl
                  ) {
                    STATE.bagImageUrls[bag.id] = signed.data.signedUrl;
                  }
                })
                .catch(function (err) {
                  if (!isCurrentUserContext(userContext)) return;
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

  function loadReward() {
    if (!STATE.user) {
      STATE.reward = null;
      STATE.rewardLoaded = true;
      STATE.rewardBusy = false;
      STATE.rewardError = '';
      return Promise.resolve();
    }

    var userContext = captureUserContext();

    return supabaseClient
      .rpc('minbag_get_or_claim_reward_code')
      .then(function (res) {
        if (!isCurrentUserContext(userContext)) return;
        if (res.error) throw res.error;

        var rows = res.data || [];
        STATE.reward = rows.length ? rows[0] : null;
        STATE.rewardLoaded = true;
        STATE.rewardBusy = false;
        STATE.rewardError = '';
      })
      .catch(function (err) {
        if (!isCurrentUserContext(userContext)) return;
        STATE.reward = null;
        STATE.rewardLoaded = true;
        STATE.rewardBusy = false;
        STATE.rewardError = errorMessage(err);
        console.warn('Min Bag reward:', err);
      });
  }

  function setRewardCardHidden(hidden) {
    if (!STATE.user || !STATE.reward || !STATE.reward.reward_code || STATE.rewardBusy) return;

    STATE.rewardBusy = true;
    render();

    supabaseClient
      .rpc('minbag_set_reward_card_hidden', {
        p_hidden: !!hidden
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return loadReward();
      })
      .then(function () {
        STATE.rewardBusy = false;
        render();
        status(
          hidden
            ? 'Rabattkoden er skjult. Du kan vise den igjen når som helst.'
            : 'Rabattkoden vises igjen.',
          'ok'
        );
      })
      .catch(function (err) {
        STATE.rewardBusy = false;
        render();
        status('Kunne ikke endre visningen av rabattkoden: ' + errorMessage(err), 'err');
      });
  }

  function loadBags(preferredBagId) {
    var userContext = captureUserContext();

    return supabaseClient.rpc('minbag_get_my_bags')
      .then(function (res) {
        if (!isCurrentUserContext(userContext)) return;
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
      STATE.recoInsights = null;
      STATE.recoInsightsLoaded = true;
      STATE.funRecommendations = [];
      STATE.funRecommendationsLoaded = true;
      STATE.funRecommendationsError = '';
      STATE.funRecommendationsPage = 0;
      STATE.funRecommendationsBusy = false;
      STATE.bagScore = null;
      STATE.bagScoreLoaded = true;
      STATE.bagScoreError = '';
      STATE.throwResults = [];
      STATE.throwHasSearched = false;
      STATE.throwBusy = false;
      STATE.throwError = '';
      STATE.roundBagResults = [];
      STATE.roundBagHasBuilt = false;
      STATE.roundBagBusy = false;
      STATE.roundBagError = '';
      STATE.roundBagSourceName = '';
      STATE.expandedOverlapKey = '';
      return loadReward();
    }

    var userContext = captureUserContext();
    var requestedBagId = STATE.activeBagId;

    return supabaseClient
      .from('minbag_discs')
      .select(
        'id,bag_id,catalog_id,source,name,brand,mold_name,plastic,disc_type,' +
        'product_url,image_url,speed,glide,turn,fade,weight_grams,color,note,' +
        'is_favorite,created_at,updated_at,mold_key'
      )
      .eq('bag_id', requestedBagId)
      .order('disc_type', { ascending: true })
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (!isCurrentUserContext(userContext) || STATE.activeBagId !== requestedBagId) return;
        if (res.error) throw res.error;
        STATE.discs = res.data || [];
        STATE.throwResults = [];
        STATE.throwHasSearched = false;
        STATE.throwBusy = false;
        STATE.throwError = '';
        STATE.roundBagResults = [];
        STATE.roundBagHasBuilt = false;
        STATE.roundBagBusy = false;
        STATE.roundBagError = '';
        STATE.roundBagSourceName = '';
        STATE.expandedOverlapKey = '';
        return Promise.all([
          loadGapAnalysis(),
          loadReward()
        ]);
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
    STATE.recoInsights = null;
    STATE.recoInsightsLoaded = false;
    STATE.funRecommendations = [];
    STATE.funRecommendationsLoaded = false;
    STATE.funRecommendationsError = '';
    STATE.funRecommendationsPage = 0;
    STATE.funRecommendationsBusy = false;
    STATE.bagScore = null;
    STATE.bagScoreLoaded = false;
    STATE.bagScoreError = '';
    STATE.throwResults = [];
    STATE.throwHasSearched = false;
    STATE.throwBusy = false;
    STATE.throwError = '';
    STATE.roundBagResults = [];
    STATE.roundBagHasBuilt = false;
    STATE.roundBagBusy = false;
    STATE.roundBagError = '';
    STATE.roundBagSourceName = '';
    STATE.expandedOverlapKey = '';
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
      'Vil du slette "' + label + '" fra denne bagen?\n\nDette sletter bare dette eksemplaret fra Min Bag.'
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
      status(
        'Mangler aktiv bag.',
        'err'
      );
      return;
    }

    var query =
      getInputValue(
        'gkmb3-catalog-query'
      );

    var type =
      getInputValue(
        'gkmb3-catalog-type'
      );

    STATE.catalogQuery = query;
    STATE.catalogType = type;
    STATE.addDiscOpen = true;

    setLoading(
      true,
      'Søker blant GolfKongen-discer…'
    );

    supabaseClient
      .rpc(
        'minbag_search_catalog_for_bag',
        {
          p_query:
            query || null,

          p_disc_type:
            type || null,

          p_limit:
            CONFIG.CATALOG_LIMIT
        }
      )
      .then(function (res) {
        setLoading(false);

        if (res.error) {
          status(
            'Kunne ikke søke etter discer akkurat nå: ' +
            errorMessage(
              res.error
            ),
            'err'
          );

          return;
        }

        STATE.catalogResults =
          res.data || [];

        render();

        if (
          STATE.catalogResults.length
        ) {
          status(
            'Fant ' +
            STATE.catalogResults.length +
            ' treff.',
            'ok'
          );
        } else {
          status(
            'Fant ingen treff.',
            ''
          );
        }
      })
      .catch(function (err) {
        setLoading(false);

        status(
          'Kunne ikke søke etter discer akkurat nå: ' +
          errorMessage(err),
          'err'
        );
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
      status('Kunne ikke legge til den anbefalte discen akkurat nå.', 'err');
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
      status('Kunne ikke legge til denne discen akkurat nå.', 'err');
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
      status('Velg hvilken bag discen skal legges i og prøv igjen.', 'err');
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

        return supabaseClient.rpc('minbag_add_catalog_disc_v2', {
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
      status('Modell / mold er obligatorisk.', 'err');
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

    var loading = el('div', 'gkmb3-status', 'Laster Min Bag…');
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
