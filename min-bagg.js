/* ============================================================================
   GOLFKONGEN – MIN BAG
   File: min-bag-v1.js
   Build: 2026-06-07.1
   Purpose:
   - Clean new frontend baseline for GolfKongen "Min bag"
   - Uses Quickbutik login email from loader
   - API-ready for Cloudflare Worker
   - Falls back to localStorage until Worker is connected
   - No Supabase service keys or sensitive secrets in frontend
   - ES5-safe style where practical
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = '2026-06-07.1';
  var ROOT_ID = 'min-bag-root';

  var CONFIG = {
    apiBase: window.GK_MINBAG_API_BASE || '',
    email: normalizeEmail(window.__GK_MINBAG_QB_EMAIL__ || window.GK_MINBAG_EMAIL || ''),
    debug: !!window.GK_MINBAG_DEBUG
  };

  var TYPES = [
    { id: 'putter', label: 'Putter', plural: 'Puttere', url: '/discgolf/disc-putter' },
    { id: 'midrange', label: 'Midrange', plural: 'Midrange', url: '/discgolf/midrange' },
    { id: 'fairway', label: 'Fairway driver', plural: 'Fairway drivere', url: '/discgolf/fairway-driver' },
    { id: 'distance', label: 'Distance driver', plural: 'Distance drivere', url: '/discgolf/driver' }
  ];

  var TYPE_LABELS = {
    putter: 'Putter',
    midrange: 'Midrange',
    fairway: 'Fairway driver',
    distance: 'Distance driver'
  };

  var STATE = {
    email: CONFIG.email,
    loading: false,
    activeTypeFilter: 'all',
    searchText: '',
    bag: {
      name: 'Min bag',
      imageUrl: '',
      discs: [],
      updatedAt: null
    },
    searchResults: [],
    top3: {
      putter: [],
      midrange: [],
      fairway: [],
      distance: []
    },
    apiStatus: CONFIG.apiBase ? 'worker' : 'local'
  };

  var UI = {};

  log('boot ' + VERSION);

  function log() {
    if (!CONFIG.debug && !window.GK_MINBAG_DEBUG) return;
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[GK MIN BAG]');
      console.log.apply(console, args);
    } catch (_) {}
  }

  function normalizeEmail(v) {
    return String(v || '').trim().toLowerCase();
  }

  function safe(v) {
    return v === null || v === undefined ? '' : String(v);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    return 'disc_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function html(tag, className, markup) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (markup !== undefined && markup !== null) node.innerHTML = markup;
    return node;
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || 'Disc';
  }

  function byName(a, b) {
    var aa = safe(a && a.name).toLowerCase();
    var bb = safe(b && b.name).toLowerCase();
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  }

  function inferTypeFromUrl(url) {
    url = safe(url).toLowerCase();
    if (url.indexOf('/discgolf/disc-putter') === 0) return 'putter';
    if (url.indexOf('/discgolf/midrange') === 0) return 'midrange';
    if (url.indexOf('/discgolf/fairway-driver') === 0) return 'fairway';
    if (url.indexOf('/discgolf/driver') === 0) return 'distance';
    return '';
  }

  function toAbsUrl(url) {
    url = safe(url).trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return location.protocol + url;
    if (url.charAt(0) === '/') return location.origin + url;
    return url;
  }

  function localKey() {
    return 'GK_MINBAG_V1_' + (STATE.email || 'anon');
  }

  function toast(message, kind) {
    if (!UI.toast) return;
    UI.toast.textContent = message || '';
    UI.toast.className = 'gkmb-toast' + (kind ? ' ' + kind : '');
    UI.toast.style.display = message ? 'block' : 'none';
  }

  function setLoading(isLoading, message) {
    STATE.loading = !!isLoading;
    if (UI.loadingText) UI.loadingText.textContent = isLoading ? (message || 'Jobber…') : '';
    if (UI.loadingText) UI.loadingText.style.display = isLoading ? 'inline-flex' : 'none';
  }

  function requestJson(path, options) {
    if (!CONFIG.apiBase) return Promise.reject(new Error('Worker mangler'));
    var url = CONFIG.apiBase.replace(/\/$/, '') + path;
    var opts = options || {};
    opts.headers = opts.headers || {};
    opts.headers['Content-Type'] = 'application/json';
    opts.headers['X-GK-MinBag-Email'] = STATE.email || '';
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) {}
        if (!res.ok) {
          throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
        }
        return data;
      });
    });
  }

  function loadBag() {
    if (!STATE.email) return Promise.resolve();

    if (CONFIG.apiBase) {
      return requestJson('/bag', { method: 'GET' }).then(function (data) {
        if (data && data.bag) {
          STATE.bag = normalizeBag(data.bag);
        }
      }).catch(function (err) {
        STATE.apiStatus = 'local';
        toast('Worker ikke koblet ennå. Bruker midlertidig lokal lagring.', 'warn');
        return loadLocalBag();
      });
    }

    return loadLocalBag();
  }

  function loadLocalBag() {
    try {
      var raw = localStorage.getItem(localKey());
      if (raw) STATE.bag = normalizeBag(JSON.parse(raw));
    } catch (_) {}
    return Promise.resolve();
  }

  function saveBag() {
    STATE.bag.updatedAt = nowIso();

    if (CONFIG.apiBase) {
      return requestJson('/bag', {
        method: 'POST',
        body: JSON.stringify({ bag: STATE.bag })
      }).catch(function (err) {
        STATE.apiStatus = 'local';
        saveLocalBag();
        throw err;
      });
    }

    saveLocalBag();
    return Promise.resolve({ ok: true, local: true });
  }

  function saveLocalBag() {
    try {
      localStorage.setItem(localKey(), JSON.stringify(STATE.bag));
    } catch (_) {}
  }

  function loadTop3() {
    if (CONFIG.apiBase) {
      return requestJson('/top3', { method: 'GET' }).then(function (data) {
        if (data && data.top3) STATE.top3 = data.top3;
      }).catch(function () {
        STATE.top3 = makeLocalTop3();
      });
    }

    STATE.top3 = makeLocalTop3();
    return Promise.resolve();
  }

  function incrementPopular(disc) {
    if (!disc || !CONFIG.apiBase) return Promise.resolve();
    return requestJson('/popular/increment', {
      method: 'POST',
      body: JSON.stringify({
        type: disc.type,
        name: disc.name,
        url: disc.url,
        image: disc.image
      })
    }).catch(function () {});
  }

  function makeLocalTop3() {
    var out = { putter: [], midrange: [], fairway: [], distance: [] };
    var counts = {};
    for (var i = 0; i < STATE.bag.discs.length; i++) {
      var d = STATE.bag.discs[i];
      var key = (d.type || '') + '|' + (d.name || '');
      if (!counts[key]) {
        counts[key] = {
          type: d.type,
          name: d.name,
          url: d.url,
          image: d.image,
          count: 0
        };
      }
      counts[key].count += 1;
    }
    for (var k in counts) {
      if (!counts.hasOwnProperty(k)) continue;
      var item = counts[k];
      if (out[item.type]) out[item.type].push(item);
    }
    for (var t in out) {
      if (!out.hasOwnProperty(t)) continue;
      out[t].sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
      out[t] = out[t].slice(0, 3);
    }
    return out;
  }

  function normalizeBag(bag) {
    bag = bag || {};
    var discs = Array.isArray(bag.discs) ? bag.discs : [];
    var clean = [];
    for (var i = 0; i < discs.length; i++) {
      var d = normalizeDisc(discs[i]);
      if (d.name) clean.push(d);
    }
    return {
      name: safe(bag.name).trim() || 'Min bag',
      imageUrl: safe(bag.imageUrl).trim(),
      discs: clean,
      updatedAt: bag.updatedAt || null
    };
  }

  function normalizeDisc(d) {
    d = d || {};
    var type = safe(d.type) || inferTypeFromUrl(d.url) || 'midrange';
    if (!TYPE_LABELS[type]) type = 'midrange';
    return {
      id: safe(d.id) || uid(),
      name: safe(d.name).trim(),
      brand: safe(d.brand).trim(),
      type: type,
      url: safe(d.url).trim(),
      image: safe(d.image).trim(),
      flight: normalizeFlight(d.flight),
      note: safe(d.note).trim(),
      addedAt: d.addedAt || nowIso()
    };
  }

  function normalizeFlight(f) {
    f = f || {};
    return {
      speed: safe(f.speed).trim(),
      glide: safe(f.glide).trim(),
      turn: safe(f.turn).trim(),
      fade: safe(f.fade).trim()
    };
  }

  function hasFlight(disc) {
    var f = disc && disc.flight ? disc.flight : {};
    return f.speed !== '' && f.glide !== '' && f.turn !== '' && f.fade !== '';
  }

  function buildShell() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;

    clear(root);
    root.className = 'gkmb-root';

    injectStyles();

    var hero = el('section', 'gkmb-hero');
    var heroText = el('div', 'gkmb-hero-text');
    heroText.appendChild(el('div', 'gkmb-eyebrow', 'GolfKongen verktøy'));
    heroText.appendChild(el('h1', '', 'Min bag'));
    heroText.appendChild(el('p', '', 'Bygg discgolf-bagen din, få oversikt over flight-tall og se hvilke discer andre GolfKongen-spillere bruker.'));

    var meta = el('div', 'gkmb-meta-row');
    meta.appendChild(makePill(STATE.email ? 'Innlogget: ' + STATE.email : 'Ikke innlogget'));
    meta.appendChild(makePill(STATE.apiStatus === 'worker' ? 'Lagring: GolfKongen-konto' : 'Lagring: midlertidig lokalt'));
    UI.loadingText = makePill('');
    UI.loadingText.style.display = 'none';
    meta.appendChild(UI.loadingText);
    heroText.appendChild(meta);

    var heroCard = el('div', 'gkmb-hero-card');
    heroCard.appendChild(el('div', 'gkmb-stat-number', String(STATE.bag.discs.length)));
    heroCard.appendChild(el('div', 'gkmb-stat-label', 'disker i bagen'));
    heroCard.appendChild(makeTypeSummary());

    hero.appendChild(heroText);
    hero.appendChild(heroCard);
    root.appendChild(hero);

    UI.toast = el('div', 'gkmb-toast');
    UI.toast.style.display = 'none';
    root.appendChild(UI.toast);

    if (!STATE.email) {
      renderNotLoggedIn(root);
      return;
    }

    var toolbar = el('section', 'gkmb-toolbar');
    var left = el('div', 'gkmb-toolbar-left');

    UI.search = el('input', 'gkmb-input');
    UI.search.type = 'search';
    UI.search.placeholder = 'Søk etter disc på GolfKongen…';
    UI.search.value = STATE.searchText;
    UI.search.oninput = debounce(function () {
      STATE.searchText = UI.search.value || '';
      runSearch(STATE.searchText);
    }, 350);
    left.appendChild(UI.search);

    var manualBtn = button('Legg til manuelt', 'secondary');
    manualBtn.onclick = openManualModal;
    left.appendChild(manualBtn);

    var settingsBtn = button('Bag-innstillinger', 'ghost');
    settingsBtn.onclick = openBagSettings;
    left.appendChild(settingsBtn);

    toolbar.appendChild(left);

    var filters = el('div', 'gkmb-filters');
    filters.appendChild(filterButton('all', 'Alle'));
    for (var i = 0; i < TYPES.length; i++) {
      filters.appendChild(filterButton(TYPES[i].id, TYPES[i].label));
    }
    toolbar.appendChild(filters);
    root.appendChild(toolbar);

    var layout = el('section', 'gkmb-layout');

    UI.main = el('main', 'gkmb-main');
    UI.sidebar = el('aside', 'gkmb-sidebar');

    layout.appendChild(UI.main);
    layout.appendChild(UI.sidebar);
    root.appendChild(layout);

    renderMain();
    renderSidebar();
  }

  function renderNotLoggedIn(root) {
    var card = el('section', 'gkmb-empty-card');
    card.appendChild(el('h2', '', 'Logg inn for å bruke Min bag'));
    card.appendChild(el('p', '', 'Min bag bruker GolfKongen-kontoen din, slik at bagen kan lagres og hentes senere.'));
    root.appendChild(card);
  }

  function renderMain() {
    clear(UI.main);

    if (STATE.searchResults.length) {
      var searchCard = panel('Søkeresultater', 'Legg til discer direkte fra GolfKongen.');
      var grid = el('div', 'gkmb-product-grid');
      for (var i = 0; i < STATE.searchResults.length; i++) {
        grid.appendChild(renderSearchResult(STATE.searchResults[i]));
      }
      searchCard.appendChild(grid);
      UI.main.appendChild(searchCard);
    }

    var bagCard = panel(STATE.bag.name || 'Min bag', 'Disker du har lagt til.');
    if (!STATE.bag.discs.length) {
      var empty = el('div', 'gkmb-empty');
      empty.appendChild(el('h3', '', 'Bagen er tom'));
      empty.appendChild(el('p', '', 'Søk etter discer, eller legg inn en disc manuelt for å komme i gang.'));
      bagCard.appendChild(empty);
    } else {
      var grouped = groupByType(getFilteredDiscs());
      for (var t = 0; t < TYPES.length; t++) {
        var type = TYPES[t].id;
        if (!grouped[type].length) continue;
        var section = el('div', 'gkmb-type-section');
        section.appendChild(el('h3', '', TYPES[t].plural + ' (' + grouped[type].length + ')'));
        var list = el('div', 'gkmb-disc-list');
        grouped[type].sort(byName);
        for (var d = 0; d < grouped[type].length; d++) {
          list.appendChild(renderDiscCard(grouped[type][d]));
        }
        section.appendChild(list);
        bagCard.appendChild(section);
      }
    }

    UI.main.appendChild(bagCard);
  }

  function renderSidebar() {
    clear(UI.sidebar);

    var reco = panel('Anbefaling', 'Basert på det som mangler i bagen.');
    var needed = getNeededType();
    reco.appendChild(el('div', 'gkmb-reco-type', typeLabel(needed)));
    reco.appendChild(el('p', '', getRecommendationText(needed)));
    var quickBtn = button('Finn ' + typeLabel(needed).toLowerCase(), 'primary');
    quickBtn.onclick = function () {
      STATE.activeTypeFilter = needed;
      buildShell();
      runCategorySearch(needed);
    };
    reco.appendChild(quickBtn);
    UI.sidebar.appendChild(reco);

    var top = panel('Topp 3 hos GolfKongen', 'Når Worker er koblet på vises global statistikk.');
    for (var i = 0; i < TYPES.length; i++) {
      top.appendChild(renderTop3Block(TYPES[i]));
    }
    UI.sidebar.appendChild(top);

    var tips = panel('Tips', '');
    tips.appendChild(el('p', '', 'Start med minst én putter, én midrange og én fairway driver. Distance driver kan vente til du har god kontroll.'));
    tips.appendChild(el('p', '', 'Flight-tall vises som Speed / Glide / Turn / Fade.'));
    UI.sidebar.appendChild(tips);
  }

  function renderSearchResult(product) {
    var card = el('article', 'gkmb-product');
    card.appendChild(productImage(product.image, product.name));

    var body = el('div', 'gkmb-product-body');
    body.appendChild(el('h4', '', product.name || 'Ukjent disc'));
    body.appendChild(el('div', 'gkmb-small', typeLabel(product.type)));
    var actions = el('div', 'gkmb-card-actions');
    if (product.url) {
      var link = el('a', 'gkmb-link-btn', 'Åpne');
      link.href = product.url;
      link.target = '_blank';
      actions.appendChild(link);
    }
    var add = button('Legg til', 'primary');
    add.onclick = function () {
      addProduct(product);
    };
    actions.appendChild(add);
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function renderDiscCard(disc) {
    var card = el('article', 'gkmb-disc-card');
    card.appendChild(productImage(disc.image, disc.name));

    var body = el('div', 'gkmb-disc-body');
    body.appendChild(el('h4', '', disc.name));
    var sub = el('div', 'gkmb-small', (disc.brand ? disc.brand + ' · ' : '') + typeLabel(disc.type));
    body.appendChild(sub);

    body.appendChild(renderFlight(disc));

    if (disc.note) {
      body.appendChild(el('div', 'gkmb-note', disc.note));
    }

    var actions = el('div', 'gkmb-card-actions');

    var edit = button('Rediger', 'ghost');
    edit.onclick = function () { openEditDisc(disc); };
    actions.appendChild(edit);

    var remove = button('Fjern', 'danger');
    remove.onclick = function () { removeDisc(disc.id); };
    actions.appendChild(remove);

    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function renderFlight(disc) {
    var wrap = el('div', 'gkmb-flight');
    var f = disc.flight || {};
    wrap.appendChild(flightChip('Speed', f.speed));
    wrap.appendChild(flightChip('Glide', f.glide));
    wrap.appendChild(flightChip('Turn', f.turn));
    wrap.appendChild(flightChip('Fade', f.fade));
    if (!hasFlight(disc)) {
      wrap.appendChild(el('span', 'gkmb-flight-missing', 'Flight mangler'));
    }
    return wrap;
  }

  function renderTop3Block(type) {
    var wrap = el('div', 'gkmb-top3-block');
    wrap.appendChild(el('h4', '', type.plural));
    var items = STATE.top3[type.id] || [];

    if (!items.length) {
      wrap.appendChild(el('div', 'gkmb-small', 'Ingen data ennå'));
      return wrap;
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var row = el('div', 'gkmb-top3-row');
      row.appendChild(productImage(item.image, item.name));
      var text = el('div', '');
      text.appendChild(el('strong', '', item.name));
      text.appendChild(el('span', '', 'Valgt ' + (item.count || 0) + ' ganger'));
      row.appendChild(text);
      wrap.appendChild(row);
    }
    return wrap;
  }

  function productImage(src, alt) {
    var box = el('div', 'gkmb-imgbox');
    if (src) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = alt || '';
      img.loading = 'lazy';
      box.appendChild(img);
    } else {
      box.appendChild(el('span', '', 'GK'));
    }
    return box;
  }

  function flightChip(label, value) {
    var chip = el('span', 'gkmb-flight-chip');
    chip.appendChild(el('b', '', label));
    chip.appendChild(el('em', '', value !== undefined && value !== null && value !== '' ? value : '?'));
    return chip;
  }

  function makeTypeSummary() {
    var counts = countTypes();
    var row = el('div', 'gkmb-type-summary');
    for (var i = 0; i < TYPES.length; i++) {
      row.appendChild(el('span', '', TYPES[i].label + ': ' + counts[TYPES[i].id]));
    }
    return row;
  }

  function makePill(text) {
    return el('span', 'gkmb-pill', text);
  }

  function panel(title, subtitle) {
    var p = el('section', 'gkmb-panel');
    if (title) p.appendChild(el('h2', '', title));
    if (subtitle) p.appendChild(el('p', 'gkmb-panel-sub', subtitle));
    return p;
  }

  function button(text, kind) {
    var b = el('button', 'gkmb-btn ' + (kind || 'secondary'), text);
    b.type = 'button';
    return b;
  }

  function filterButton(id, label) {
    var b = button(label, STATE.activeTypeFilter === id ? 'primary' : 'secondary');
    b.onclick = function () {
      STATE.activeTypeFilter = id;
      renderMain();
    };
    return b;
  }

  function groupByType(discs) {
    var out = { putter: [], midrange: [], fairway: [], distance: [] };
    for (var i = 0; i < discs.length; i++) {
      var d = discs[i];
      var type = d.type || 'midrange';
      if (!out[type]) out[type] = [];
      out[type].push(d);
    }
    return out;
  }

  function getFilteredDiscs() {
    if (STATE.activeTypeFilter === 'all') return STATE.bag.discs.slice();
    var out = [];
    for (var i = 0; i < STATE.bag.discs.length; i++) {
      if (STATE.bag.discs[i].type === STATE.activeTypeFilter) out.push(STATE.bag.discs[i]);
    }
    return out;
  }

  function countTypes() {
    var out = { putter: 0, midrange: 0, fairway: 0, distance: 0 };
    for (var i = 0; i < STATE.bag.discs.length; i++) {
      var t = STATE.bag.discs[i].type || 'midrange';
      if (out[t] !== undefined) out[t] += 1;
    }
    return out;
  }

  function getNeededType() {
    var c = countTypes();
    if (c.putter < 1) return 'putter';
    if (c.midrange < 1) return 'midrange';
    if (c.fairway < 1) return 'fairway';
    if (c.putter < 2) return 'putter';
    if (c.midrange < 3) return 'midrange';
    if (c.fairway < 3) return 'fairway';
    if (c.distance < 2) return 'distance';
    return 'midrange';
  }

  function getRecommendationText(type) {
    if (type === 'putter') return 'En god putter gir tryggere putting og bedre kontroll på korte innspill.';
    if (type === 'midrange') return 'En midrange er ofte den mest nyttige disken for rette, kontrollerte kast.';
    if (type === 'fairway') return 'En fairway driver gir god lengde uten å være like krevende som en distance driver.';
    if (type === 'distance') return 'En distance driver passer best når du allerede har kontroll og ønsker mer lengde.';
    return 'Legg til flere discer for bedre anbefalinger.';
  }

  function openBagSettings() {
    var modal = makeModal('Bag-innstillinger');
    var name = input('Navn på bagen', STATE.bag.name || 'Min bag');
    var image = input('Bilde-URL', STATE.bag.imageUrl || '');

    modal.body.appendChild(labelWrap('Navn', name));
    modal.body.appendChild(labelWrap('Bilde-URL', image));

    var save = button('Lagre', 'primary');
    save.onclick = function () {
      STATE.bag.name = name.value.trim() || 'Min bag';
      STATE.bag.imageUrl = image.value.trim();
      persistAndRender('Bag-innstillinger lagret');
      closeModal(modal);
    };
    modal.footer.appendChild(save);

    document.body.appendChild(modal.overlay);
  }

  function openManualModal() {
    openDiscForm(null);
  }

  function openEditDisc(disc) {
    openDiscForm(disc);
  }

  function openDiscForm(existing) {
    var isEdit = !!existing;
    var disc = existing ? normalizeDisc(existing) : normalizeDisc({});
    var modal = makeModal(isEdit ? 'Rediger disc' : 'Legg til disc manuelt');

    var name = input('Navn på disc', disc.name || '');
    var brand = input('Merke/produsent', disc.brand || '');
    var type = selectType(disc.type || 'midrange');
    var image = input('Bilde-URL', disc.image || '');
    var url = input('Produktlenke', disc.url || '');

    var flightRow = el('div', 'gkmb-form-grid four');
    var speed = input('Speed', disc.flight.speed || '');
    var glide = input('Glide', disc.flight.glide || '');
    var turn = input('Turn', disc.flight.turn || '');
    var fade = input('Fade', disc.flight.fade || '');
    flightRow.appendChild(labelWrap('Speed', speed));
    flightRow.appendChild(labelWrap('Glide', glide));
    flightRow.appendChild(labelWrap('Turn', turn));
    flightRow.appendChild(labelWrap('Fade', fade));

    var note = document.createElement('textarea');
    note.className = 'gkmb-input';
    note.placeholder = 'Kommentar';
    note.value = disc.note || '';

    modal.body.appendChild(labelWrap('Navn', name));
    modal.body.appendChild(labelWrap('Merke', brand));
    modal.body.appendChild(labelWrap('Type', type));
    modal.body.appendChild(labelWrap('Bilde-URL', image));
    modal.body.appendChild(labelWrap('Produktlenke', url));
    modal.body.appendChild(flightRow);
    modal.body.appendChild(labelWrap('Kommentar', note));

    var save = button(isEdit ? 'Lagre endring' : 'Legg til disc', 'primary');
    save.onclick = function () {
      var updated = {
        id: isEdit ? existing.id : uid(),
        name: name.value.trim(),
        brand: brand.value.trim(),
        type: type.value,
        image: image.value.trim(),
        url: url.value.trim(),
        flight: {
          speed: speed.value.trim(),
          glide: glide.value.trim(),
          turn: turn.value.trim(),
          fade: fade.value.trim()
        },
        note: note.value.trim(),
        addedAt: isEdit ? existing.addedAt : nowIso()
      };

      if (!updated.name) {
        toast('Navn mangler', 'err');
        return;
      }

      if (isEdit) {
        replaceDisc(existing.id, updated);
      } else {
        STATE.bag.discs.push(normalizeDisc(updated));
      }

      persistAndRender(isEdit ? 'Disc oppdatert' : 'Disc lagt til');
      if (!isEdit) incrementPopular(updated);
      closeModal(modal);
    };

    modal.footer.appendChild(save);
    document.body.appendChild(modal.overlay);
  }

  function input(placeholder, value) {
    var i = el('input', 'gkmb-input');
    i.type = 'text';
    i.placeholder = placeholder || '';
    i.value = value || '';
    return i;
  }

  function selectType(value) {
    var s = el('select', 'gkmb-input');
    for (var i = 0; i < TYPES.length; i++) {
      var o = document.createElement('option');
      o.value = TYPES[i].id;
      o.textContent = TYPES[i].label;
      s.appendChild(o);
    }
    s.value = value || 'midrange';
    return s;
  }

  function labelWrap(label, field) {
    var wrap = el('label', 'gkmb-field');
    wrap.appendChild(el('span', '', label));
    wrap.appendChild(field);
    return wrap;
  }

  function makeModal(title) {
    var overlay = el('div', 'gkmb-modal-overlay');
    var box = el('div', 'gkmb-modal');
    var head = el('div', 'gkmb-modal-head');
    var body = el('div', 'gkmb-modal-body');
    var footer = el('div', 'gkmb-modal-footer');

    head.appendChild(el('h2', '', title || 'Dialog'));
    var close = button('Lukk', 'ghost');
    close.onclick = function () { closeModal(modal); };
    head.appendChild(close);

    box.appendChild(head);
    box.appendChild(body);
    box.appendChild(footer);
    overlay.appendChild(box);

    var modal = { overlay: overlay, body: body, footer: footer };
    overlay.onclick = function (e) {
      if (e.target === overlay) closeModal(modal);
    };
    return modal;
  }

  function closeModal(modal) {
    try {
      if (modal && modal.overlay && modal.overlay.parentNode) {
        modal.overlay.parentNode.removeChild(modal.overlay);
      }
    } catch (_) {}
  }

  function replaceDisc(id, updated) {
    for (var i = 0; i < STATE.bag.discs.length; i++) {
      if (STATE.bag.discs[i].id === id) {
        STATE.bag.discs[i] = normalizeDisc(updated);
        return;
      }
    }
  }

  function removeDisc(id) {
    var keep = [];
    for (var i = 0; i < STATE.bag.discs.length; i++) {
      if (STATE.bag.discs[i].id !== id) keep.push(STATE.bag.discs[i]);
    }
    STATE.bag.discs = keep;
    persistAndRender('Disc fjernet');
  }

  function persistAndRender(message) {
    setLoading(true, 'Lagrer…');
    saveBag().then(function () {
      setLoading(false);
      toast(message || 'Lagret', 'ok');
      loadTop3().then(buildShell);
    }).catch(function (err) {
      setLoading(false);
      toast('Kunne ikke lagre til Worker ennå. Lagret lokalt midlertidig.', 'warn');
      buildShell();
    });
  }

  function addProduct(product) {
    setLoading(true, 'Henter produkt…');
    getProductMeta(product.url, product).then(function (meta) {
      var disc = normalizeDisc({
        id: uid(),
        name: meta.name || product.name,
        brand: meta.brand || '',
        type: meta.type || product.type || inferTypeFromUrl(product.url),
        url: product.url,
        image: meta.image || product.image,
        flight: meta.flight || {},
        addedAt: nowIso()
      });

      STATE.bag.discs.push(disc);
      return saveBag().then(function () {
        incrementPopular(disc);
        return loadTop3();
      });
    }).then(function () {
      setLoading(false);
      toast('Disc lagt til i Min bag', 'ok');
      buildShell();
    }).catch(function (err) {
      setLoading(false);
      toast('Kunne ikke legge til disc: ' + (err && err.message ? err.message : err), 'err');
    });
  }

  function runCategorySearch(type) {
    var cfg = null;
    for (var i = 0; i < TYPES.length; i++) {
      if (TYPES[i].id === type) cfg = TYPES[i];
    }
    if (!cfg) return;

    setLoading(true, 'Henter ' + cfg.plural + '…');
    fetchText(cfg.url).then(function (text) {
      STATE.searchResults = parseProductsFromHtml(text, cfg.id).slice(0, 24);
      setLoading(false);
      buildShell();
    }).catch(function (err) {
      setLoading(false);
      toast('Kunne ikke hente kategori', 'err');
    });
  }

  function runSearch(query) {
    query = safe(query).trim();
    if (query.length < 2) {
      STATE.searchResults = [];
      renderMain();
      return;
    }

    setLoading(true, 'Søker…');
    searchProducts(query).then(function (items) {
      STATE.searchResults = items;
      setLoading(false);
      renderMain();
    }).catch(function (err) {
      setLoading(false);
      toast('Søk feilet: ' + (err && err.message ? err.message : err), 'err');
    });
  }

  function searchProducts(query) {
    query = safe(query).toLowerCase();

    if (CONFIG.apiBase) {
      return requestJson('/products/search?q=' + encodeURIComponent(query), { method: 'GET' }).then(function (data) {
        return data && Array.isArray(data.products) ? data.products : [];
      }).catch(function () {
        return searchProductsFromSitemap(query);
      });
    }

    return searchProductsFromSitemap(query);
  }

  var SITEMAP_CACHE = null;

  function searchProductsFromSitemap(query) {
    return getSitemapProducts().then(function (urls) {
      var out = [];
      for (var i = 0; i < urls.length; i++) {
        var url = urls[i];
        var slug = decodeURIComponent(url.split('/').pop() || '').replace(/-/g, ' ').toLowerCase();
        if (slug.indexOf(query) !== -1 || url.toLowerCase().indexOf(query) !== -1) {
          out.push({
            name: titleFromSlug(url),
            url: url,
            image: '',
            type: inferTypeFromUrl(url)
          });
        }
        if (out.length >= 30) break;
      }
      return out;
    });
  }

  function getSitemapProducts() {
    if (SITEMAP_CACHE) return Promise.resolve(SITEMAP_CACHE);

    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem('GK_MINBAG_SITEMAP_CACHE') || 'null');
    } catch (_) {}

    if (cached && cached.ts && cached.urls && Date.now() - cached.ts < 1000 * 60 * 60 * 12) {
      SITEMAP_CACHE = cached.urls;
      return Promise.resolve(SITEMAP_CACHE);
    }

    return fetchText('/sitemap.xml').then(function (xml) {
      var urls = [];
      var re = /<loc>([^<]+)<\/loc>/g;
      var match;
      while ((match = re.exec(xml))) {
        var path = safe(match[1]).replace(/^https?:\/\/[^\/]+/i, '');
        if (/^\/discgolf\/[^\/]+\/[^\/?#]+/.test(path)) {
          urls.push(path);
        }
      }
      SITEMAP_CACHE = unique(urls);
      try {
        localStorage.setItem('GK_MINBAG_SITEMAP_CACHE', JSON.stringify({
          ts: Date.now(),
          urls: SITEMAP_CACHE
        }));
      } catch (_) {}
      return SITEMAP_CACHE;
    });
  }

  function unique(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) {
        seen[arr[i]] = 1;
        out.push(arr[i]);
      }
    }
    return out;
  }

  function fetchText(url) {
    return fetch(url, { credentials: 'include' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  function parseProductsFromHtml(text, defaultType) {
    var out = [];
    var seen = {};
    var doc = new DOMParser().parseFromString(text, 'text/html');
    var links = doc.querySelectorAll('a[href^="/discgolf/"]');

    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      if (!/^\/discgolf\/[^\/]+\/[^\/?#]+/.test(href)) continue;
      if (seen[href]) continue;

      var name = (a.getAttribute('title') || a.textContent || titleFromSlug(href)).replace(/\s+/g, ' ').trim();
      if (!name || name.length < 3) name = titleFromSlug(href);

      var image = '';
      var img = a.querySelector('img');
      if (!img && a.parentNode && a.parentNode.querySelector) img = a.parentNode.querySelector('img');
      if (img) image = toAbsUrl(img.getAttribute('src') || img.getAttribute('data-src') || '');

      out.push({
        name: name,
        url: href,
        image: image,
        type: inferTypeFromUrl(href) || defaultType || 'midrange'
      });
      seen[href] = 1;
      if (out.length >= 60) break;
    }

    return out.sort(byName);
  }

  function titleFromSlug(url) {
    var last = safe(url).split('/').pop() || 'disc';
    return decodeURIComponent(last).replace(/-/g, ' ').replace(/\b\w/g, function (m) {
      return m.toUpperCase();
    });
  }

  function getProductMeta(url, fallback) {
    fallback = fallback || {};
    if (!url) return Promise.resolve(fallback);

    return fetchText(url).then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      var name = '';
      var h1 = doc.querySelector('h1');
      if (h1) name = h1.textContent.replace(/\s+/g, ' ').trim();
      if (!name && doc.title) name = doc.title.replace(/\s+\|\s+.*$/, '').trim();

      var image = fallback.image || '';
      var og = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
      if (og && og.getAttribute('content')) image = toAbsUrl(og.getAttribute('content'));

      var flight = parseFlight(text);

      return {
        name: name || fallback.name || titleFromSlug(url),
        image: image,
        type: inferTypeFromUrl(url) || fallback.type || 'midrange',
        flight: flight
      };
    }).catch(function () {
      return fallback;
    });
  }

  function parseFlight(text) {
    text = safe(text);
    function pick(label) {
      var re = new RegExp(label + '\\s*:?\\s*(-?\\d+(?:[\\.,]\\d+)?)', 'i');
      var m = text.match(re);
      return m ? m[1].replace(',', '.') : '';
    }

    var f = {
      speed: pick('speed'),
      glide: pick('glide'),
      turn: pick('turn'),
      fade: pick('fade')
    };

    if (f.speed || f.glide || f.turn || f.fade) return f;

    var m = text.match(/flight[^0-9-]{0,80}(-?\d+(?:[\\.,]\d+)?)\D+(-?\d+(?:[\\.,]\d+)?)\D+(-?\d+(?:[\\.,]\d+)?)\D+(-?\d+(?:[\\.,]\d+)?)/i);
    if (m) {
      return {
        speed: m[1].replace(',', '.'),
        glide: m[2].replace(',', '.'),
        turn: m[3].replace(',', '.'),
        fade: m[4].replace(',', '.')
      };
    }

    return { speed: '', glide: '', turn: '', fade: '' };
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait || 250);
    };
  }

  function injectStyles() {
    if (document.getElementById('gkmb-styles')) return;
    var style = document.createElement('style');
    style.id = 'gkmb-styles';
    style.textContent = [
      '.gkmb-root{--gk-green:#22c55e;--gk-green2:#15803d;--gk-dark:#07140d;--gk-card:rgba(255,255,255,.075);--gk-border:rgba(255,255,255,.14);--gk-text:#f7fff9;--gk-muted:rgba(247,255,249,.72);max-width:1180px;margin:0 auto;padding:18px 14px;color:var(--gk-text);font-family:inherit}',
      '.gkmb-root *{box-sizing:border-box}',
      '.gkmb-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:1.45fr .55fr;gap:18px;align-items:stretch;border-radius:28px;padding:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.32),transparent 38%),linear-gradient(135deg,#061109,#102719 55%,#07140d);border:1px solid rgba(34,197,94,.28);box-shadow:0 22px 70px rgba(0,0,0,.34);margin-bottom:14px}',
      '.gkmb-eyebrow{display:inline-flex;width:max-content;padding:6px 10px;border-radius:999px;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.35);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#b8ffd0}',
      '.gkmb-hero h1{font-size:clamp(34px,7vw,68px);line-height:.95;margin:12px 0 10px;font-weight:1000;letter-spacing:-.05em}',
      '.gkmb-hero p{max-width:680px;margin:0;color:var(--gk-muted);font-size:16px;line-height:1.55}',
      '.gkmb-meta-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}',
      '.gkmb-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.13);font-size:12px;font-weight:800;color:rgba(255,255,255,.88)}',
      '.gkmb-hero-card{border-radius:24px;padding:20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);display:flex;flex-direction:column;justify-content:center;align-items:flex-start;min-height:180px}',
      '.gkmb-stat-number{font-size:70px;font-weight:1000;line-height:.85;color:#b8ffd0}',
      '.gkmb-stat-label{font-weight:900;margin-top:8px;color:rgba(255,255,255,.82)}',
      '.gkmb-type-summary{display:grid;gap:6px;margin-top:18px;font-size:12px;color:var(--gk-muted)}',
      '.gkmb-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:14px 0;flex-wrap:wrap}',
      '.gkmb-toolbar-left,.gkmb-filters,.gkmb-card-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.gkmb-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px;align-items:start}',
      '.gkmb-panel,.gkmb-empty-card{border-radius:22px;padding:18px;background:linear-gradient(180deg,rgba(255,255,255,.085),rgba(255,255,255,.045));border:1px solid var(--gk-border);box-shadow:0 14px 42px rgba(0,0,0,.18);margin-bottom:14px}',
      '.gkmb-panel h2,.gkmb-empty-card h2{margin:0 0 5px;font-size:22px;font-weight:1000;letter-spacing:-.02em}',
      '.gkmb-panel-sub,.gkmb-panel p,.gkmb-empty-card p{color:var(--gk-muted);line-height:1.5}',
      '.gkmb-btn{appearance:none;border:0;border-radius:14px;padding:11px 13px;font-weight:950;cursor:pointer;transition:transform .14s ease,background .14s ease,border .14s ease;color:white}',
      '.gkmb-btn:hover{transform:translateY(-1px)}',
      '.gkmb-btn.primary{background:linear-gradient(135deg,var(--gk-green),var(--gk-green2));box-shadow:0 10px 24px rgba(34,197,94,.18)}',
      '.gkmb-btn.secondary{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.13)}',
      '.gkmb-btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.14)}',
      '.gkmb-btn.danger{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.30)}',
      '.gkmb-input{width:100%;min-height:44px;padding:11px 13px;border-radius:14px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.16);color:white;outline:none}',
      '.gkmb-toolbar .gkmb-input{min-width:min(420px,90vw)}',
      '.gkmb-input:focus{border-color:rgba(34,197,94,.65);box-shadow:0 0 0 3px rgba(34,197,94,.12)}',
      '.gkmb-toast{padding:12px 14px;border-radius:16px;margin:12px 0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-weight:800}',
      '.gkmb-toast.ok{border-color:rgba(34,197,94,.32);background:rgba(34,197,94,.10)}',
      '.gkmb-toast.err{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.10)}',
      '.gkmb-toast.warn{border-color:rgba(245,158,11,.40);background:rgba(245,158,11,.10)}',
      '.gkmb-product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:10px}',
      '.gkmb-product,.gkmb-disc-card{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:18px;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.10)}',
      '.gkmb-imgbox{width:72px;height:72px;flex:0 0 72px;border-radius:18px;overflow:hidden;background:radial-gradient(circle at top left,rgba(34,197,94,.28),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-weight:1000;color:#b8ffd0}',
      '.gkmb-imgbox img{width:100%;height:100%;object-fit:cover;display:block}',
      '.gkmb-product-body,.gkmb-disc-body{min-width:0;flex:1}',
      '.gkmb-product h4,.gkmb-disc-card h4{margin:0 0 4px;font-size:15px;font-weight:1000;line-height:1.18}',
      '.gkmb-small{display:block;color:var(--gk-muted);font-size:12px;margin-bottom:8px}',
      '.gkmb-link-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:10px 12px;text-decoration:none;color:white;background:transparent;border:1px solid rgba(255,255,255,.14);font-size:13px;font-weight:900}',
      '.gkmb-type-section{margin-top:14px}',
      '.gkmb-type-section h3{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:#b8ffd0;margin:0 0 8px}',
      '.gkmb-disc-list{display:grid;gap:10px}',
      '.gkmb-flight{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0}',
      '.gkmb-flight-chip{display:inline-flex;gap:6px;align-items:center;padding:6px 8px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.11);font-size:11px}',
      '.gkmb-flight-chip b{color:var(--gk-muted);font-weight:800}',
      '.gkmb-flight-chip em{font-style:normal;font-weight:1000;color:#b8ffd0}',
      '.gkmb-flight-missing{font-size:11px;color:#fca5a5;padding:6px 8px;border-radius:999px;background:rgba(239,68,68,.10)}',
      '.gkmb-note{margin:8px 0;padding:9px 10px;border-radius:14px;background:rgba(255,255,255,.06);color:var(--gk-muted);font-size:13px}',
      '.gkmb-reco-type{font-size:28px;font-weight:1000;color:#b8ffd0;margin:8px 0}',
      '.gkmb-top3-block{padding:12px 0;border-top:1px solid rgba(255,255,255,.10)}',
      '.gkmb-top3-block:first-of-type{border-top:0}',
      '.gkmb-top3-block h4{margin:0 0 8px;font-size:14px}',
      '.gkmb-top3-row{display:flex;gap:10px;align-items:center;margin:8px 0}',
      '.gkmb-top3-row .gkmb-imgbox{width:42px;height:42px;flex-basis:42px;border-radius:12px}',
      '.gkmb-top3-row strong{display:block;font-size:13px}',
      '.gkmb-top3-row span{display:block;color:var(--gk-muted);font-size:12px}',
      '.gkmb-empty{padding:30px;text-align:center;border:1px dashed rgba(255,255,255,.18);border-radius:20px;background:rgba(255,255,255,.035)}',
      '.gkmb-empty h3{margin:0 0 6px;font-size:22px}',
      '.gkmb-modal-overlay{position:fixed;z-index:999999;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.gkmb-modal{width:min(720px,100%);max-height:88vh;overflow:auto;border-radius:24px;background:#0b140e;border:1px solid rgba(255,255,255,.15);box-shadow:0 28px 90px rgba(0,0,0,.55);color:white}',
      '.gkmb-modal-head,.gkmb-modal-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.10)}',
      '.gkmb-modal-footer{border-top:1px solid rgba(255,255,255,.10);border-bottom:0;justify-content:flex-end}',
      '.gkmb-modal-head h2{margin:0;font-size:20px}',
      '.gkmb-modal-body{display:grid;gap:12px;padding:16px}',
      '.gkmb-field{display:grid;gap:6px;font-size:13px;font-weight:900;color:var(--gk-muted)}',
      '.gkmb-form-grid{display:grid;gap:10px}',
      '.gkmb-form-grid.four{grid-template-columns:repeat(4,1fr)}',
      '@media(max-width:920px){.gkmb-hero{grid-template-columns:1fr}.gkmb-layout{grid-template-columns:1fr}.gkmb-sidebar{order:-1}.gkmb-toolbar{align-items:stretch}.gkmb-toolbar-left{width:100%}.gkmb-toolbar .gkmb-input{min-width:100%}}',
      '@media(max-width:560px){.gkmb-root{padding:10px}.gkmb-hero{padding:18px;border-radius:22px}.gkmb-panel{padding:14px}.gkmb-product,.gkmb-disc-card{align-items:flex-start}.gkmb-form-grid.four{grid-template-columns:repeat(2,1fr)}.gkmb-btn{width:auto}.gkmb-filters .gkmb-btn{flex:1}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      log('root mangler');
      return;
    }

    if (!STATE.email) {
      buildShell();
      return;
    }

    setLoading(true, 'Laster…');
    Promise.resolve()
      .then(loadBag)
      .then(loadTop3)
      .then(function () {
        setLoading(false);
        buildShell();
      })
      .catch(function (err) {
        setLoading(false);
        toast('Kunne ikke laste Min bag: ' + (err && err.message ? err.message : err), 'err');
        buildShell();
      });
  }

  window.GK_MINBAG_APP = {
    version: VERSION,
    state: STATE,
    reload: boot
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
