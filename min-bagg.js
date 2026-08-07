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

   Denne filen forutsetter at Quickbutik-loaderen har opprettet:
   <div id="min-bag-root"></div>

   Leveres som .txt fra ChatGPT. Når den senere legges i GitHub som kjørbar app,
   brukes innholdet som JavaScript.
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = '2026-08-07.1';

  var CONFIG = {
    ROOT_ID: 'min-bag-root',
    PAGE_PATH: '/sider/min-bag',
    SUPABASE_URL: 'https://fwztrnxhfvrlceicctlv.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3enRybnhoZnZybGNlaWNjdGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTgwMjYsImV4cCI6MjA5NTI5NDAyNn0.q4QthdBWEtUi_Fdz_Ge88E_5CpJMtUvjWhMAa0R0zmE',
    SUPABASE_SDK: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    MAGIC_LINK_REDIRECT: 'https://golfkongen.no/sider/min-bag',
    CATALOG_LIMIT: 30
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
      '.gkmb3-bagbtn.active{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.48);color:#dcfce7;}' +

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

      '@media(min-width:620px){' +
        '.gkmb3-grid2{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '.gkmb3-grid4{grid-template-columns:repeat(4,minmax(0,1fr));}' +
        '.gkmb3-discgrid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
      '}' +
      '@media(min-width:960px){' +
        '.gkmb3-layout{grid-template-columns:minmax(0,1.35fr) minmax(330px,.65fr);align-items:start;}' +
        '.gkmb3-sticky{position:sticky;top:18px;}' +
      '}' +
      '@media(max-width:480px){' +
        '.gkmb3-hero{padding:17px;border-radius:21px;}' +
        '.gkmb3-card{padding:13px;border-radius:18px;}' +
        '.gkmb3-disc{grid-template-columns:70px minmax(0,1fr);}' +
        '.gkmb3-discimg{width:70px;height:70px;}' +
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

    var layout = el('div', 'gkmb3-layout');

    var left = el('div', '');
    left.appendChild(renderBagManager());
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

    var toolbar = el('div', 'gkmb3-toolbar');

    var newBag = el('button', 'gkmb3-btn secondary', '+ Ny bag');
    newBag.type = 'button';
    newBag.onclick = createBagPrompt;
    toolbar.appendChild(newBag);

    var current = activeBag();

    if (current && !current.is_default) {
      var defaultBtn = el('button', 'gkmb3-btn secondary', 'Sett som hovedbag');
      defaultBtn.type = 'button';
      defaultBtn.onclick = function () {
        setDefaultBag(current.id);
      };
      toolbar.appendChild(defaultBtn);

      var deleteBtn = el('button', 'gkmb3-btn danger', 'Slett bag');
      deleteBtn.type = 'button';
      deleteBtn.onclick = function () {
        deleteBag(current);
      };
      toolbar.appendChild(deleteBtn);
    }

    card.appendChild(toolbar);

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
        if (STATE.discs[j].disc_type === type) {
          items.push(STATE.discs[j]);
        }
      }

      if (!items.length) continue;

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

    if (disc.product_url) {
      var link = el('a', 'gkmb3-btn secondary', 'Se hos GolfKongen');
      link.href = disc.product_url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.marginTop = '8px';
      link.style.minHeight = '36px';
      link.style.padding = '7px 10px';
      link.style.fontSize = '11px';
      body.appendChild(link);
    }

    card.appendChild(body);

    return card;
  }

  function renderAddPanel() {
    var card = el('section', 'gkmb3-card');
    card.appendChild(el('h3', '', 'Legg til disc'));
    card.appendChild(el(
      'p',
      '',
      'Velg en GolfKongen-disc eller registrer en disc manuelt.'
    ));

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
  }

  function refreshAuthState() {
    return supabaseClient.auth.getUser().then(function (res) {
      if (res.error) throw res.error;

      STATE.user = res.data ? res.data.user : null;

      if (!STATE.user) {
        STATE.bags = [];
        STATE.activeBagId = null;
        STATE.discs = [];
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
        return loadBags();
      })
      .then(function () {
        return loadActiveBagDiscs();
      })
      .then(function () {
        render();
        status('Min Bag er lastet.', 'ok');
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
      });
  }

  function loadActiveBagDiscs() {
    if (!STATE.activeBagId) {
      STATE.discs = [];
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
      });
  }

  function selectBag(bagId) {
    if (!bagId || bagId === STATE.activeBagId) return;

    STATE.activeBagId = bagId;
    STATE.catalogResults = [];
    STATE.catalogQuery = '';
    STATE.catalogType = '';

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

  function createBagPrompt() {
    var name = prompt('Navn på ny bag:', 'Bag 2');
    if (name === null) return;

    name = trim(name);

    if (!name) {
      status('Bag-navn kan ikke være tomt.', 'err');
      return;
    }

    setLoading(true, 'Oppretter bag…');

    supabaseClient.rpc('minbag_create_bag', {
      p_name: name
    }).then(function (res) {
      if (res.error) throw res.error;

      var newBagId = res.data;

      return loadBags(newBagId).then(function () {
        return loadActiveBagDiscs();
      });
    }).then(function () {
      setLoading(false);
      render();
      status('Ny bag opprettet.', 'ok');
    }).catch(function (err) {
      setLoading(false);
      status('Kunne ikke opprette bag: ' + errorMessage(err), 'err');
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
    if (!STATE.activeBagId || !product || !product.id) {
      status('Mangler aktiv bag eller katalog-ID.', 'err');
      return;
    }

    var duplicate = findCatalogDuplicate(product);

    if (duplicate) {
      var proceed = confirm(
        'Du har allerede en ' +
        (duplicate.brand ? duplicate.brand + ' ' : '') +
        (duplicate.mold_name || duplicate.name) +
        ' i denne baggen.\n\nVil du legge til enda ett eksemplar?'
      );

      if (!proceed) return;
    }

    setLoading(true, 'Legger disc i bag…');

    supabaseClient.rpc('minbag_add_catalog_disc', {
      p_bag_id: STATE.activeBagId,
      p_catalog_id: product.id,
      p_weight_grams: null,
      p_color: null,
      p_note: null
    }).then(function (res) {
      if (res.error) throw res.error;

      return Promise.all([
        loadBags(STATE.activeBagId),
        loadActiveBagDiscs()
      ]);
    }).then(function () {
      setLoading(false);
      render();
      status('Disc lagt til fra GolfKongen.', 'ok');
    }).catch(function (err) {
      setLoading(false);
      status('Kunne ikke legge til disc: ' + errorMessage(err), 'err');
    });
  }

  function addManualDisc() {
    if (!STATE.activeBagId) {
      status('Mangler aktiv bag.', 'err');
      return;
    }

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

    var duplicate = findManualDuplicate(mold, brandId, customBrand);

    if (duplicate) {
      var proceed = confirm(
        'Du har allerede en ' +
        (duplicate.brand ? duplicate.brand + ' ' : '') +
        (duplicate.mold_name || duplicate.name) +
        ' i denne baggen.\n\nVil du legge til enda ett eksemplar?'
      );

      if (!proceed) return;
    }

    setLoading(true, 'Lagrer egen disc…');

    supabaseClient.rpc('minbag_add_manual_disc', {
      p_bag_id: STATE.activeBagId,
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
    }).then(function (res) {
      if (res.error) throw res.error;

      return Promise.all([
        loadBags(STATE.activeBagId),
        loadActiveBagDiscs()
      ]);
    }).then(function () {
      setLoading(false);
      render();
      status('Egen disc lagret.', 'ok');
    }).catch(function (err) {
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

  function findDuplicateByMold(brandName, moldName) {
    var wanted = normalizeLocalKey(
      safe(brandName) + ' ' + safe(moldName)
    );

    if (!wanted) return null;

    for (var i = 0; i < STATE.discs.length; i += 1) {
      var disc = STATE.discs[i];

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

  function findCatalogDuplicate(product) {
    if (!product) return null;

    return findDuplicateByMold(
      product.brand,
      product.mold_name || product.product_name
    );
  }

  function findManualDuplicate(moldName, brandId, customBrand) {
    var selectedBrand = '';

    for (var i = 0; i < STATE.brands.length; i += 1) {
      if (Number(STATE.brands[i].id) === Number(brandId)) {
        selectedBrand = STATE.brands[i].is_custom
          ? customBrand
          : STATE.brands[i].name;
        break;
      }
    }

    return findDuplicateByMold(selectedBrand, moldName);
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

        return refreshAuthState();
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
