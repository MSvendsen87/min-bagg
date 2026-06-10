/* ============================================================================
   GOLFKONGEN – MIN BAG V2
   Fil: min-bagg.js
   Build: 2026-06-09.2
   Første ekte versjon:
   - Supabase Auth
   - Opprett/hent standardbag
   - Vis bag
   - Legg til disc manuelt
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = '2026-06-09.2';

  var SUPABASE_URL = 'https://fwztrnxhfvrlceicctlv.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3enRybnhoZnZybGNlaWNjdGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTgwMjYsImV4cCI6MjA5NTI5NDAyNn0.q4QthdBWEtUi_Fdz_Ge88E_5CpJMtUvjWhMAa0R0zmE';

  var ROOT_ID = 'min-bag-root';
  var SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  var root = null;
  var supabaseClient = null;

  var STATE = {
    user: null,
    bag: null,
    discs: [],
    loading: false
  };

  console.log('[GK MIN BAG V2] boot', VERSION);

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function safe(v) {
    return v === null || v === undefined ? '' : String(v);
  }

  function numOrNull(v) {
    v = safe(v).replace(',', '.').trim();
    if (v === '') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function setStatus(text, type) {
    var box = document.getElementById('gkmb-status');
    if (!box) return;
    box.className = 'gkmb-status' + (type ? ' ' + type : '');
    box.textContent = text || '';
  }

  function injectCss() {
    if (document.getElementById('gk-minbag-v2-css')) return;

    var style = document.createElement('style');
    style.id = 'gk-minbag-v2-css';
    style.textContent =
      '#min-bag-root{max-width:1120px;margin:0;padding:0;color:#fff;font-family:inherit;}' +
      '#min-bag-root *{box-sizing:border-box;}' +

      '.gkmb-card{border:1px solid rgba(34,197,94,.28);background:radial-gradient(circle at top left,rgba(34,197,94,.28),transparent 34%),linear-gradient(135deg,#061109,#102719 60%,#07140d);border-radius:24px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);margin-bottom:16px;}' +
      '.gkmb-eyebrow{display:inline-flex;padding:6px 10px;border-radius:999px;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#b8ffd0;margin-bottom:12px;}' +
      '.gkmb-card h1{font-size:clamp(34px,7vw,60px);line-height:.95;margin:0 0 10px;font-weight:1000;letter-spacing:-.05em;}' +
      '.gkmb-card h2{font-size:22px;margin:0 0 8px;font-weight:1000;}' +
      '.gkmb-card h3{font-size:16px;margin:0 0 8px;font-weight:1000;}' +
      '.gkmb-card p{color:rgba(255,255,255,.75);line-height:1.55;margin:0 0 14px;}' +

      '.gkmb-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px;align-items:start;}' +
      '.gkmb-panel{border:1px solid rgba(255,255,255,.13);background:linear-gradient(180deg,rgba(255,255,255,.085),rgba(255,255,255,.045));border-radius:22px;padding:16px;box-shadow:0 14px 42px rgba(0,0,0,.18);margin-bottom:14px;}' +

      '.gkmb-box{margin-top:14px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.07);border-radius:18px;padding:14px;}' +
      '.gkmb-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}' +
      '.gkmb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}' +
      '.gkmb-grid-four{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}' +

      '.gkmb-field{display:grid;gap:5px;font-size:12px;font-weight:900;color:rgba(255,255,255,.75);}' +
      '.gkmb-input,.gkmb-select,.gkmb-textarea{width:100%;min-height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.28);color:#fff;padding:11px 13px;outline:none;font-family:inherit;}' +
      '.gkmb-textarea{min-height:86px;resize:vertical;}' +
      '.gkmb-input:focus,.gkmb-select:focus,.gkmb-textarea:focus{border-color:rgba(34,197,94,.7);box-shadow:0 0 0 3px rgba(34,197,94,.13);}' +

      '.gkmb-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;color:#fff;background:linear-gradient(135deg,#22c55e,#15803d);}' +
      '.gkmb-btn.secondary{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);}' +
      '.gkmb-btn.danger{background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.35);}' +
      '.gkmb-btn:disabled{opacity:.55;cursor:not-allowed;}' +

      '.gkmb-status{margin-top:14px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.13);color:rgba(255,255,255,.86);font-weight:800;}' +
      '.gkmb-status.ok{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.35);}' +
      '.gkmb-status.err{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35);}' +

      '.gkmb-small{font-size:13px;color:rgba(255,255,255,.65);margin-top:6px;}' +
      '.gkmb-pill{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.13);font-size:12px;font-weight:900;color:rgba(255,255,255,.82);margin:4px 5px 4px 0;}' +

      '.gkmb-disc-list{display:grid;gap:10px;margin-top:12px;}' +
      '.gkmb-disc{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:18px;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.10);}' +
      '.gkmb-disc-img{width:72px;height:72px;flex:0 0 72px;border-radius:18px;overflow:hidden;background:radial-gradient(circle at top left,rgba(34,197,94,.28),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-weight:1000;color:#b8ffd0;}' +
      '.gkmb-disc-img img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.gkmb-disc-body{min-width:0;flex:1;}' +
      '.gkmb-disc-title{font-weight:1000;font-size:16px;margin-bottom:3px;}' +
      '.gkmb-disc-sub{font-size:12px;color:rgba(255,255,255,.65);margin-bottom:8px;}' +

      '.gkmb-flight{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;}' +
      '.gkmb-flight span{display:inline-flex;gap:5px;align-items:center;padding:6px 8px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.11);font-size:11px;}' +
      '.gkmb-flight b{color:rgba(255,255,255,.65);}' +
      '.gkmb-flight em{font-style:normal;font-weight:1000;color:#b8ffd0;}' +

      '.gkmb-empty{padding:28px;text-align:center;border:1px dashed rgba(255,255,255,.18);border-radius:20px;background:rgba(255,255,255,.035);}' +
      '.gkmb-empty strong{display:block;font-size:20px;margin-bottom:6px;}' +

      '@media(max-width:900px){.gkmb-layout{grid-template-columns:1fr}.gkmb-grid,.gkmb-grid-four{grid-template-columns:1fr 1fr;}}' +
      '@media(max-width:560px){.gkmb-card{padding:16px;border-radius:20px}.gkmb-grid,.gkmb-grid-four{grid-template-columns:1fr}.gkmb-disc{flex-direction:column}.gkmb-disc-img{width:100%;height:160px;flex-basis:auto}}';

    document.head.appendChild(style);
  }

  function loadSupabaseSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = SUPABASE_SDK;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Kunne ikke laste Supabase SDK')); };
      document.head.appendChild(script);
    });
  }

  function createClient() {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  function render() {
    clear(root);

    var hero = el('section', 'gkmb-card');
    hero.appendChild(el('div', 'gkmb-eyebrow', 'GolfKongen verktøy'));
    hero.appendChild(el('h1', '', 'Min bag'));

    if (!STATE.user) {
      hero.appendChild(el('p', '', 'Logg inn med e-post for å bygge og lagre discgolf-bagen din.'));
      hero.appendChild(renderLoginBox());
      var statusLoggedOut = el('div', 'gkmb-status', 'Ikke innlogget.');
      statusLoggedOut.id = 'gkmb-status';
      hero.appendChild(statusLoggedOut);
      root.appendChild(hero);
      return;
    }

    hero.appendChild(el('p', '', 'Bygg discgolf-bagen din, hold oversikt over flight-tall og lagre alt trygt på GolfKongen-kontoen din.'));

    var meta = el('div', '');
    meta.appendChild(el('span', 'gkmb-pill', 'Innlogget: ' + STATE.user.email));
    if (STATE.bag) meta.appendChild(el('span', 'gkmb-pill', 'Bag: ' + STATE.bag.name));
    meta.appendChild(el('span', 'gkmb-pill', 'Disker: ' + STATE.discs.length));
    hero.appendChild(meta);

    var status = el('div', 'gkmb-status ok', 'Klar');
    status.id = 'gkmb-status';
    hero.appendChild(status);

    root.appendChild(hero);

    var layout = el('div', 'gkmb-layout');

    var main = el('main', '');
    main.appendChild(renderBagPanel());

    var side = el('aside', '');
    side.appendChild(renderAddDiscPanel());
    side.appendChild(renderTipPanel());

    layout.appendChild(main);
    layout.appendChild(side);

    root.appendChild(layout);
  }

  function renderLoginBox() {
    var box = el('div', 'gkmb-box');

    var row = el('div', 'gkmb-row');

    var input = el('input', 'gkmb-input');
    input.type = 'email';
    input.placeholder = 'Din e-postadresse';
    input.id = 'gkmb-email';

    var btn = el('button', 'gkmb-btn', 'Send innloggingslenke');
    btn.type = 'button';
    btn.onclick = sendMagicLink;

    row.appendChild(input);
    row.appendChild(btn);

    box.appendChild(row);
    box.appendChild(el('div', 'gkmb-small', 'Du får en e-post med innloggingslenke. Etter innlogging kommer du tilbake til denne siden.'));

    return box;
  }

  function renderBagPanel() {
    var panel = el('section', 'gkmb-panel');
    panel.appendChild(el('h2', '', STATE.bag ? STATE.bag.name : 'Min bag'));

    if (!STATE.discs.length) {
      var empty = el('div', 'gkmb-empty');
      empty.appendChild(el('strong', '', 'Bagen er tom'));
      empty.appendChild(el('div', 'gkmb-small', 'Legg til en disc manuelt først. Produktsøk kobler vi på etterpå.'));
      panel.appendChild(empty);
      return panel;
    }

    var list = el('div', 'gkmb-disc-list');

    for (var i = 0; i < STATE.discs.length; i++) {
      list.appendChild(renderDisc(STATE.discs[i]));
    }

    panel.appendChild(list);
    return panel;
  }

  function renderDisc(disc) {
  var card = el('article', 'gkmb-disc');

  var imgBox = el('div', 'gkmb-disc-img');
  if (disc.image_url) {
    var img = document.createElement('img');
    img.src = disc.image_url;
    img.alt = disc.name || '';
    imgBox.appendChild(img);
  } else {
    imgBox.textContent = 'GK';
  }

  var body = el('div', 'gkmb-disc-body');
  body.appendChild(el('div', 'gkmb-disc-title', disc.name || 'Ukjent disc'));

  var sub = safe(disc.brand);
  if (sub) sub += ' · ';
  sub += discTypeLabel(disc.disc_type);
  body.appendChild(el('div', 'gkmb-disc-sub', sub));

  var flight = el('div', 'gkmb-flight');
  flight.appendChild(flightChip('Speed', disc.speed));
  flight.appendChild(flightChip('Glide', disc.glide));
  flight.appendChild(flightChip('Turn', disc.turn));
  flight.appendChild(flightChip('Fade', disc.fade));
  body.appendChild(flight);

  if (disc.note) {
    body.appendChild(el('div', 'gkmb-small', disc.note));
  }

  var actions = el('div', 'gkmb-row');

  if (disc.product_url) {
    var openLink = el('a', 'gkmb-btn secondary', 'Åpne produkt');
    openLink.href = disc.product_url;
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.style.textDecoration = 'none';
    actions.appendChild(openLink);
  }

  var editBtn = el('button', 'gkmb-btn secondary', 'Rediger');
  editBtn.type = 'button';
  editBtn.onclick = function () {
    openEditDiscModal(disc);
  };
  actions.appendChild(editBtn);

  var deleteBtn = el('button', 'gkmb-btn danger', 'Slett');
  deleteBtn.type = 'button';
  deleteBtn.onclick = function () {
    deleteDisc(disc.id);
  };
  actions.appendChild(deleteBtn);

  body.appendChild(actions);

  card.appendChild(imgBox);
  card.appendChild(body);

  return card;
}
  function flightChip(label, value) {
    var c = el('span', '');
    c.appendChild(el('b', '', label));
    c.appendChild(el('em', '', value !== null && value !== undefined && value !== '' ? String(value) : '?'));
    return c;
  }

  function renderAddDiscPanel() {
  var panel = el('section', 'gkmb-panel');
  panel.appendChild(el('h2', '', 'Legg til disc'));
  panel.appendChild(el('p', '', 'Legg inn disc manuelt. Produktsøk fra GolfKongen kobles på etterpå.'));

  var form = el('div', '');

  var grid1 = el('div', 'gkmb-grid');
  grid1.appendChild(field('Navn på disc', input('disc-name', 'F.eks. Buzzz')));
  grid1.appendChild(field('Merke', input('disc-brand', 'F.eks. Discraft')));
  form.appendChild(grid1);

  var grid2 = el('div', 'gkmb-grid');
  grid2.appendChild(field('Type', selectType('disc-type')));
  grid2.appendChild(field('Bilde-URL', input('disc-image', 'Valgfritt')));
  form.appendChild(grid2);

  form.appendChild(field('Produktlenke', input('disc-product-url', 'Valgfritt')));

  var grid3 = el('div', 'gkmb-grid-four');
  grid3.appendChild(field('Speed', input('disc-speed', '5')));
  grid3.appendChild(field('Glide', input('disc-glide', '4')));
  grid3.appendChild(field('Turn', input('disc-turn', '-1')));
  grid3.appendChild(field('Fade', input('disc-fade', '1')));
  form.appendChild(grid3);

  form.appendChild(field('Kommentar', textarea('disc-note', 'Valgfritt')));

  var btn = el('button', 'gkmb-btn', 'Lagre disc');
  btn.type = 'button';
  btn.onclick = addManualDisc;
  form.appendChild(btn);

  panel.appendChild(form);

  return panel;
}

  function renderTipPanel() {
    var panel = el('section', 'gkmb-panel');
    panel.appendChild(el('h2', '', 'Neste steg'));
    panel.appendChild(el('p', '', 'Når manuell lagring fungerer stabilt, kobler vi på produktsøk fra GolfKongen og Topp 3 per kategori.'));
    return panel;
  }

  function field(label, control) {
    var wrap = el('label', 'gkmb-field');
    wrap.appendChild(el('span', '', label));
    wrap.appendChild(control);
    return wrap;
  }

  function input(id, placeholder) {
    var i = el('input', 'gkmb-input');
    i.id = id;
    i.type = 'text';
    i.placeholder = placeholder || '';
    return i;
  }

  function textarea(id, placeholder) {
    var t = el('textarea', 'gkmb-textarea');
    t.id = id;
    t.placeholder = placeholder || '';
    return t;
  }

  function selectType(id) {
    var s = el('select', 'gkmb-select');
    s.id = id;

    var options = [
      ['putter', 'Putter'],
      ['midrange', 'Midrange'],
      ['fairway', 'Fairway driver'],
      ['distance', 'Distance driver']
    ];

    for (var i = 0; i < options.length; i++) {
      var o = document.createElement('option');
      o.value = options[i][0];
      o.textContent = options[i][1];
      s.appendChild(o);
    }

    return s;
  }

  function discTypeLabel(type) {
    if (type === 'putter') return 'Putter';
    if (type === 'midrange') return 'Midrange';
    if (type === 'fairway') return 'Fairway driver';
    if (type === 'distance') return 'Distance driver';
    return 'Disc';
  }

  function sendMagicLink() {
    var inputEl = document.getElementById('gkmb-email');
    var email = inputEl ? String(inputEl.value || '').trim().toLowerCase() : '';

    if (!email || email.indexOf('@') === -1) {
      setStatus('Skriv inn en gyldig e-postadresse.', 'err');
      return;
    }

    setStatus('Sender innloggingslenke…');

    supabaseClient.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: 'http://golfkongen.no/sider/min-bag'
      }
    }).then(function (res) {
      if (res.error) {
        setStatus('Kunne ikke sende lenke: ' + res.error.message, 'err');
        return;
      }

      setStatus('Innloggingslenke sendt. Sjekk e-posten din.', 'ok');
    });
  }

  function logout() {
    setStatus('Logger ut…');

    supabaseClient.auth.signOut().then(function () {
      STATE.user = null;
      STATE.bag = null;
      STATE.discs = [];
      render();
    });
  }

  function ensureUserAndLoadBag() {
    setStatus('Laster Min bag…');

    return supabaseClient.rpc('minbag_ensure_user')
      .then(function (res) {
        if (res.error) throw res.error;
        return loadDefaultBag();
      });
  }

  function loadDefaultBag() {
    return supabaseClient.rpc('minbag_get_default_bag_with_discs')
      .then(function (res) {
        if (res.error) throw res.error;

        var data = res.data || {};
        STATE.bag = data.bag || null;
        STATE.discs = data.discs || [];

        render();
        setStatus('Min bag er lastet.', 'ok');
      });
  }

  function addManualDisc() {
  if (!STATE.bag || !STATE.bag.id) {
    setStatus('Mangler aktiv bag. Last inn siden på nytt.', 'err');
    return;
  }

  var name = getVal('disc-name');
  var brand = getVal('disc-brand');
  var discType = getVal('disc-type');
  var imageUrl = getVal('disc-image');
  var productUrl = getVal('disc-product-url');
  var note = getVal('disc-note');

  if (!name) {
    setStatus('Navn på disc mangler.', 'err');
    return;
  }

  setStatus('Lagrer disc…');

  var row = {
    bag_id: STATE.bag.id,
    user_id: STATE.user.id,
    name: name,
    brand: brand || null,
    disc_type: discType || 'midrange',
    product_url: productUrl || null,
    image_url: imageUrl || null,
    speed: numOrNull(getVal('disc-speed')),
    glide: numOrNull(getVal('disc-glide')),
    turn: numOrNull(getVal('disc-turn')),
    fade: numOrNull(getVal('disc-fade')),
    note: note || null
  };

  supabaseClient
    .from('minbag_discs')
    .insert(row)
    .select('*')
    .single()
    .then(function (res) {
      if (res.error) {
        setStatus('Kunne ikke lagre disc: ' + res.error.message, 'err');
        return;
      }

      clearForm();

      return loadDefaultBag().then(function () {
        setStatus('Disc lagret i Min bag.', 'ok');
      });
    });
}
           
        function deleteDisc(discId) {
  if (!discId) {
    setStatus('Mangler disc-ID.', 'err');
    return;
  }

  if (!confirm('Vil du slette denne disken fra Min bag?')) {
    return;
  }

  setStatus('Sletter disc…');

  supabaseClient
    .from('minbag_discs')
    .delete()
    .eq('id', discId)
    .eq('user_id', STATE.user.id)
    .then(function (res) {
      if (res.error) {
        setStatus('Kunne ikke slette disc: ' + res.error.message, 'err');
        return;
      }

      loadDefaultBag().then(function () {
        setStatus('Disc slettet fra Min bag.', 'ok');
      });
    });
}

   function openEditDiscModal(disc) {
  if (!disc || !disc.id) {
    setStatus('Mangler disc-data.', 'err');
    return;
  }

  var overlay = el('div', '');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;';

  var modal = el('div', '');
  modal.style.cssText =
    'width:min(760px,100%);max-height:88vh;overflow:auto;border-radius:24px;background:#0b140e;border:1px solid rgba(255,255,255,.15);box-shadow:0 28px 90px rgba(0,0,0,.55);color:white;padding:16px;';

  var head = el('div', 'gkmb-row');
  head.style.justifyContent = 'space-between';
  head.appendChild(el('h2', '', 'Rediger disc'));

  var closeBtn = el('button', 'gkmb-btn secondary', 'Lukk');
  closeBtn.type = 'button';
  closeBtn.onclick = function () {
    document.body.removeChild(overlay);
  };
  head.appendChild(closeBtn);
  modal.appendChild(head);

  var form = el('div', '');

  var name = input('edit-disc-name', '');
  name.value = safe(disc.name);

  var brand = input('edit-disc-brand', '');
  brand.value = safe(disc.brand);

  var image = input('edit-disc-image', '');
  image.value = safe(disc.image_url);

  var productUrl = input('edit-disc-product-url', '');
  productUrl.value = safe(disc.product_url);

  var type = selectType('edit-disc-type');
  type.value = disc.disc_type || 'midrange';

  var speed = input('edit-disc-speed', '');
  speed.value = disc.speed !== null && disc.speed !== undefined ? String(disc.speed) : '';

  var glide = input('edit-disc-glide', '');
  glide.value = disc.glide !== null && disc.glide !== undefined ? String(disc.glide) : '';

  var turn = input('edit-disc-turn', '');
  turn.value = disc.turn !== null && disc.turn !== undefined ? String(disc.turn) : '';

  var fade = input('edit-disc-fade', '');
  fade.value = disc.fade !== null && disc.fade !== undefined ? String(disc.fade) : '';

  var note = textarea('edit-disc-note', '');
  note.value = safe(disc.note);

  var grid1 = el('div', 'gkmb-grid');
  grid1.appendChild(field('Navn på disc', name));
  grid1.appendChild(field('Merke', brand));
  form.appendChild(grid1);

  var grid2 = el('div', 'gkmb-grid');
  grid2.appendChild(field('Type', type));
  grid2.appendChild(field('Bilde-URL', image));
  form.appendChild(grid2);

  form.appendChild(field('Produktlenke', productUrl));

  var grid3 = el('div', 'gkmb-grid-four');
  grid3.appendChild(field('Speed', speed));
  grid3.appendChild(field('Glide', glide));
  grid3.appendChild(field('Turn', turn));
  grid3.appendChild(field('Fade', fade));
  form.appendChild(grid3);

  form.appendChild(field('Kommentar', note));

  var saveBtn = el('button', 'gkmb-btn', 'Lagre endringer');
  saveBtn.type = 'button';
  saveBtn.onclick = function () {
    updateDisc(disc.id, {
      name: name.value,
      brand: brand.value,
      disc_type: type.value,
      image_url: image.value,
      product_url: productUrl.value,
      speed: speed.value,
      glide: glide.value,
      turn: turn.value,
      fade: fade.value,
      note: note.value
    }, overlay);
  };

  form.appendChild(saveBtn);
  modal.appendChild(form);
  overlay.appendChild(modal);

  overlay.onclick = function (e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };

  document.body.appendChild(overlay);
}

function updateDisc(discId, values, overlay) {
  if (!discId) {
    setStatus('Mangler disc-ID.', 'err');
    return;
  }

  var name = safe(values.name).trim();

  if (!name) {
    setStatus('Navn på disc mangler.', 'err');
    return;
  }

  setStatus('Lagrer endringer…');

  var row = {
    name: name,
    brand: safe(values.brand).trim() || null,
    disc_type: safe(values.disc_type).trim() || 'midrange',
    image_url: safe(values.image_url).trim() || null,
    product_url: safe(values.product_url).trim() || null,
    speed: numOrNull(values.speed),
    glide: numOrNull(values.glide),
    turn: numOrNull(values.turn),
    fade: numOrNull(values.fade),
    note: safe(values.note).trim() || null
  };

  supabaseClient
    .from('minbag_discs')
    .update(row)
    .eq('id', discId)
    .eq('user_id', STATE.user.id)
    .then(function (res) {
      if (res.error) {
        setStatus('Kunne ikke lagre endringer: ' + res.error.message, 'err');
        return;
      }

      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }

      loadDefaultBag().then(function () {
        setStatus('Disc oppdatert.', 'ok');
      });
    });
}

  function getVal(id) {
    var node = document.getElementById(id);
    return node ? String(node.value || '').trim() : '';
  }

  function clearForm() {
  var ids = [
    'disc-name',
    'disc-brand',
    'disc-image',
    'disc-product-url',
    'disc-speed',
    'disc-glide',
    'disc-turn',
    'disc-fade',
    'disc-note'
  ];

  for (var i = 0; i < ids.length; i++) {
    var node = document.getElementById(ids[i]);
    if (node) node.value = '';
  }

  var type = document.getElementById('disc-type');
  if (type) type.value = 'putter';
}
  function refreshAuthState() {
    supabaseClient.auth.getUser().then(function (res) {
      if (res.error) {
        STATE.user = null;
        render();
        setStatus('Auth-feil: ' + res.error.message, 'err');
        return;
      }

      STATE.user = res.data ? res.data.user : null;

      if (!STATE.user) {
        STATE.bag = null;
        STATE.discs = [];
        render();
        return;
      }

      render();

      ensureUserAndLoadBag().catch(function (err) {
        render();
        setStatus('Kunne ikke laste Min bag: ' + (err.message || String(err)), 'err');
      });
    });
  }

  function boot() {
    root = document.getElementById(ROOT_ID);

    if (!root) {
      console.warn('[GK MIN BAG V2] Fant ikke #' + ROOT_ID);
      return;
    }

    injectCss();

    loadSupabaseSdk()
      .then(function () {
        createClient();

        supabaseClient.auth.onAuthStateChange(function () {
          refreshAuthState();
        });

        refreshAuthState();
      })
      .catch(function (err) {
        clear(root);
        root.appendChild(el('div', 'gkmb-status err', err.message || String(err)));
      });
  }

  window.GK_MINBAG_V2 = {
    version: VERSION,
    state: STATE
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
