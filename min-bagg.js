/* ============================================================================
   GOLFKONGEN – MIN BAG
   Build: v2026-02-21 (Login-required via qs_functions.js) – ES5 safe (no async/await)
   Fokus i denne versjonen:
   - Multi-bag: kun "Min bag (default)" og "Bag 2 (bag2)"
   - Bytt aktiv bag (default/bag2)
   - Slett Bag 2
   - Gi bag navn + bilde (URL) per bag
   - Legacy failsafe: aktiv discs speiles til mybag_bags.bag (array)
   - Supabase auth: magic link (Supabase sender e-post)
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = 'v2026-02-21';
  console.log('[MINBAG] boot ' + VERSION);

  // Root is injected on /sider/min-bag by Quickbutik page content
  var ROOT_ID = 'min-bag-root';
  var root = document.getElementById(ROOT_ID);
  if (!root) return;

  // ---------------------------
  // Small helpers (ES5)
  // ---------------------------
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }
  function a(href, txt, cls) {
    var e = el('a', cls || '', txt || '');
    e.href = href;
    e.rel = 'noopener';
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function nowIso() { return (new Date()).toISOString(); }
  function safeStr(v) { return (v === null || v === undefined) ? '' : String(v); }
  function clampTxt(s, n) { s = safeStr(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function banner() {
    var b = el('div', 'minbag-banner');
    b.style.cssText = 'margin-top:10px;font-size:12px;opacity:.65;text-align:right';
    b.textContent = VERSION + ' • Min bag';
    return b;
  }

  // ---------------------------
  // Config from loader
  // ---------------------------
  var SUPA_URL = window.GK_SUPABASE_URL;
  var SUPA_KEY = window.GK_SUPABASE_ANON_KEY;

  // ---------------------------
  // State
  // ---------------------------
  var STATE = {
    email: null,
    user: null,
    supa: null,

    bags: null,         // { default:{name,imageUrl,items{discs,bagInfo,profile}}, bag2:{...} }
    activeBagId: 'default',

    // cached active pointers
    discs: [],
    bagInfo: {},
    profile: null
  };

  window.__MINBAGG_STATE__ = STATE;

  function ensureBagsStructure() {
    if (!STATE.bags || typeof STATE.bags !== 'object') STATE.bags = {};

    if (!STATE.bags.default) {
      STATE.bags.default = {
        name: 'Min bag',
        imageUrl: '',
        createdAt: nowIso(),
        items: { discs: [], bagInfo: {}, profile: null }
      };
    }
    // Make sure structure for existing bags
    ['default', 'bag2'].forEach(function (id) {
      if (!STATE.bags[id]) return;
      var b = STATE.bags[id];
      if (!b.name) b.name = (id === 'default') ? 'Min bag' : 'Bag 2';
      if (!b.createdAt) b.createdAt = nowIso();
      if (!b.items || typeof b.items !== 'object') b.items = {};
      if (!Array.isArray(b.items.discs)) b.items.discs = [];
      if (!b.items.bagInfo || typeof b.items.bagInfo !== 'object') b.items.bagInfo = {};
      if (b.items.profile === undefined) b.items.profile = null;
      if (!b.imageUrl) b.imageUrl = '';
    });

    if (!STATE.activeBagId || !STATE.bags[STATE.activeBagId]) STATE.activeBagId = 'default';
    syncActiveFromBags();
  }

  function syncActiveFromBags() {
    ensureBagsStructure();
    var b = STATE.bags[STATE.activeBagId];
    STATE.discs = Array.isArray(b.items.discs) ? b.items.discs : [];
    STATE.bagInfo = b.items.bagInfo || {};
    STATE.profile = b.items.profile || null;
  }

  function writeActiveBackToBags() {
    ensureBagsStructure();
    var b = STATE.bags[STATE.activeBagId];
    if (!b.items || typeof b.items !== 'object') b.items = {};
    b.items.discs = Array.isArray(STATE.discs) ? STATE.discs : [];
    b.items.bagInfo = STATE.bagInfo || {};
    b.items.profile = STATE.profile || null;
  }

  // ---------------------------
  // Supabase client (no async/await)
  // ---------------------------
  function ensureSupabaseClient() {
    return new Promise(function (resolve, reject) {
      try {
        if (!SUPA_URL || !SUPA_KEY) return reject(new Error('Supabase URL/KEY mangler i loader'));
        if (!window.supabase || !window.supabase.createClient) {
          return reject(new Error('Supabase SDK er ikke lastet (window.supabase.createClient mangler).'));
        }
        if (!STATE.supa) {
          STATE.supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);
        }
        resolve(STATE.supa);
      } catch (e) {
        reject(e);
      }
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
  // DB read/write (mybag_bags)
  // ---------------------------
  function parseRowToState(row) {
    // row: { email, selected_bag, bag, bag_json }
    var out = {
      bags: null,
      activeBagId: 'default'
    };

    // bag_json format
    if (row && row.bag_json && typeof row.bag_json === 'object') {
      var bj = row.bag_json;
      if (bj.bags && typeof bj.bags === 'object') out.bags = bj.bags;
    }
    out.activeBagId = (row && row.selected_bag) ? row.selected_bag : 'default';

    // Backfill from legacy bag if bags missing
    if (!out.bags || typeof out.bags !== 'object') out.bags = {};
    if (!out.bags.default) {
      out.bags.default = {
        name: 'Min bag',
        imageUrl: '',
        createdAt: nowIso(),
        items: { discs: [], bagInfo: {}, profile: null }
      };
    }
    // Legacy: row.bag must be array; if not, try object.discs
    var legacyArray = [];
    if (row && row.bag) {
      if (Array.isArray(row.bag)) legacyArray = row.bag;
      else if (typeof row.bag === 'object' && Array.isArray(row.bag.discs)) legacyArray = row.bag.discs;
    }
    if (!Array.isArray(out.bags.default.items.discs) || out.bags.default.items.discs.length === 0) {
      if (legacyArray && legacyArray.length) out.bags.default.items.discs = legacyArray;
    }
    return out;
  }

  function dbLoad(email) {
    return ensureSupabaseClient().then(function (supa) {
      return supa
        .from('mybag_bags')
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
    writeActiveBackToBags();

    var bj = { bags: STATE.bags };
    var selected = STATE.activeBagId;
    var active = STATE.bags[selected] || STATE.bags.default;
    var legacyBagArray = (active && active.items && Array.isArray(active.items.discs)) ? active.items.discs : [];

    return ensureSupabaseClient().then(function (supa) {
      return supa
        .from('mybag_bags')
        .upsert({
          email: email,
          bag: legacyBagArray,        // legacy failsafe (array)
          bag_json: bj,               // multi-bag
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
  // UI
  // ---------------------------
  var ui = {
    header: null,
    content: null,
    top3: null,
    msg: null
  };

  function setMsg(txt, kind) {
    if (!ui.msg) return;
    ui.msg.textContent = txt || '';
    ui.msg.style.display = txt ? 'block' : 'none';
    ui.msg.style.borderColor = (kind === 'err') ? 'rgba(255,100,100,.35)' : 'rgba(255,255,255,.12)';
    ui.msg.style.background = (kind === 'err') ? 'rgba(255,60,60,.08)' : 'rgba(255,255,255,.04)';
  }

  function buildShell() {
    clear(root);

    var wrap = el('div', 'minbag-wrap');
    wrap.style.cssText = 'max-width:1100px';

    // Intro card
    var card = el('div', 'minbag-card');
    card.style.cssText = 'padding:14px 16px;border:1px solid rgba(255,255,255,.12);border-radius:14px;margin:10px 0;background:rgba(0,0,0,.18)';
    var h = el('div', 'minbag-h');
    h.style.cssText = 'font-size:18px;font-weight:700;margin:0 0 4px 0';
    h.textContent = 'Min bag';
    var p = el('div', 'minbag-p');
    p.style.cssText = 'opacity:.9;margin-bottom:10px';
    p.textContent = 'Lag og vedlikehold discgolf-sekken din. Logg inn med magic link for å lagre.';
    card.appendChild(h);
    card.appendChild(p);

    // Header row
    ui.header = el('div', 'minbag-row');
    ui.header.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center';

    // email label
    var who = el('div', 'minbag-who', '');
    who.style.cssText = 'opacity:.85';
    who.textContent = STATE.email ? ('Innlogget som ' + STATE.email) : 'Ikke innlogget';
    ui.header.appendChild(who);

    // bag select (only default & bag2)
    var sel = el('select', 'minbag-select');
    sel.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.2);color:#fff;min-width:210px';

    function opt(id, label) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = label;
      sel.appendChild(o);
    }
    opt('default', (STATE.bags && STATE.bags.default && STATE.bags.default.name ? STATE.bags.default.name : 'Min bag') + ' (default)');
    opt('bag2', (STATE.bags && STATE.bags.bag2 && STATE.bags.bag2.name ? STATE.bags.bag2.name : 'Bag 2') + ' (bag2)');
    sel.value = STATE.activeBagId || 'default';

    sel.onchange = function () {
      var id = sel.value;
      // create bag2 on demand
      if (id === 'bag2' && (!STATE.bags || !STATE.bags.bag2)) {
        ensureBagsStructure();
        STATE.bags.bag2 = {
          name: 'Bag 2',
          imageUrl: '',
          createdAt: nowIso(),
          items: { discs: [], bagInfo: {}, profile: null }
        };
      }
      STATE.activeBagId = id;
      syncActiveFromBags();
      // persist selected bag quickly
      setMsg('Bytter bag…', '');
      dbSave(STATE.email).then(function () {
        setMsg('', '');
        renderAll();
      }).catch(function (e) {
        setMsg('Kunne ikke bytte bag: ' + (e && e.message ? e.message : e), 'err');
      });
    };

    ui.header.appendChild(sel);

    // Delete bag button (only for bag2)
    var delBtn = el('button', 'minbag-btn danger', 'Slett bag');
    delBtn.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid rgba(255,90,90,.35);background:rgba(255,90,90,.12);color:#fff';
    delBtn.onclick = function () {
      if (STATE.activeBagId === 'default') return;
      if (!confirm('Slette "' + (STATE.bags[STATE.activeBagId] && STATE.bags[STATE.activeBagId].name ? STATE.bags[STATE.activeBagId].name : STATE.activeBagId) + '"? Dette kan ikke angres.')) return;

      // delete bag2, switch to default
      try {
        if (STATE.bags && STATE.bags[STATE.activeBagId]) delete STATE.bags[STATE.activeBagId];
        STATE.activeBagId = 'default';
        syncActiveFromBags();
      } catch (_) {}

      setMsg('Sletter…', '');
      dbSave(STATE.email).then(function () {
        setMsg('', '');
        renderAll();
      }).catch(function (e) {
        setMsg('Kunne ikke slette: ' + (e && e.message ? e.message : e), 'err');
      });
    };
    // show only when bag2 is active AND exists
    delBtn.style.display = (STATE.activeBagId === 'bag2' && STATE.bags && STATE.bags.bag2) ? 'inline-block' : 'none';
    ui.header.appendChild(delBtn);

    card.appendChild(ui.header);

    // Message row
    ui.msg = el('div', 'minbag-msg', '');
    ui.msg.style.cssText = 'display:none;margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)';
    card.appendChild(ui.msg);

    wrap.appendChild(card);

    // Content
    ui.content = el('div', 'minbag-content');
    wrap.appendChild(ui.content);

    // Top 3
    ui.top3 = el('div', 'minbag-top3');
    ui.top3.style.cssText = 'margin-top:14px;padding:14px 16px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.12)';
    var t = el('div', 'minbag-top3-title', 'Topp 3 globalt');
    t.style.cssText = 'font-weight:800;margin-bottom:6px';
    ui.top3.appendChild(t);
    var s = el('div', 'minbag-top3-body', 'Laster…');
    s.id = 'minbag-top3-body';
    s.style.cssText = 'opacity:.85';
    ui.top3.appendChild(s);

    wrap.appendChild(ui.top3);
    wrap.appendChild(banner());

    root.appendChild(wrap);
  }

  function renderBagMetaEditor(parent) {
    var b = STATE.bags[STATE.activeBagId];

    var box = el('div', 'minbag-meta');
    box.style.cssText = 'margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.10);border-radius:12px;background:rgba(0,0,0,.08)';

    var title = el('div', '', 'Aktiv bag: ' + (b && b.name ? b.name : STATE.activeBagId));
    title.style.cssText = 'font-weight:800;margin-bottom:8px';
    box.appendChild(title);

    var row = el('div', '');
    row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end';

    // Name
    var nameWrap = el('div', '');
    var nameLbl = el('div', '', 'Navn');
    nameLbl.style.cssText = 'font-size:12px;opacity:.75;margin-bottom:4px';
    var nameIn = el('input', '');
    nameIn.type = 'text';
    nameIn.value = b && b.name ? b.name : '';
    nameIn.placeholder = 'F.eks. "Turneringsbag"';
    nameIn.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.2);color:#fff;min-width:220px';
    nameWrap.appendChild(nameLbl);
    nameWrap.appendChild(nameIn);
    row.appendChild(nameWrap);

    // Image URL
    var imgWrap = el('div', '');
    var imgLbl = el('div', '', 'Bilde (URL)');
    imgLbl.style.cssText = 'font-size:12px;opacity:.75;margin-bottom:4px';
    var imgIn = el('input', '');
    imgIn.type = 'text';
    imgIn.value = b && b.imageUrl ? b.imageUrl : '';
    imgIn.placeholder = 'Lim inn bilde-URL (fra GolfKongen eller andre steder)';
    imgIn.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.2);color:#fff;min-width:360px';
    imgWrap.appendChild(imgLbl);
    imgWrap.appendChild(imgIn);
    row.appendChild(imgWrap);

    // Save button
    var saveBtn = el('button', 'minbag-btn', 'Lagre');
    saveBtn.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#2e8b57;color:#fff';

    saveBtn.onclick = function () {
      ensureBagsStructure();
      var bb = STATE.bags[STATE.activeBagId];
      bb.name = (safeStr(nameIn.value).trim() || (STATE.activeBagId === 'default' ? 'Min bag' : 'Bag 2'));
      bb.imageUrl = safeStr(imgIn.value).trim();

      setMsg('Lagrer…', '');
      dbSave(STATE.email).then(function () {
        setMsg('Lagret ✅', '');
        // rerender header select labels too
        renderAll();
      }).catch(function (e) {
        setMsg('Kunne ikke lagre: ' + (e && e.message ? e.message : e), 'err');
      });
    };
    row.appendChild(saveBtn);

    box.appendChild(row);

    // Preview
    if (b && b.imageUrl) {
      var prev = el('div', '');
      prev.style.cssText = 'margin-top:10px;display:flex;align-items:center;gap:10px';
      var img = document.createElement('img');
      img.src = b.imageUrl;
      img.alt = 'Bag-bilde';
      img.style.cssText = 'width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.15)';
      prev.appendChild(img);
      var cap = el('div', '', clampTxt(b.imageUrl, 90));
      cap.style.cssText = 'font-size:12px;opacity:.75';
      prev.appendChild(cap);
      box.appendChild(prev);
    }

    parent.appendChild(box);
  }

  function renderDiscs(parent) {
    var title = el('div', '', 'Disker: ' + (Array.isArray(STATE.discs) ? STATE.discs.length : 0));
    title.style.cssText = 'font-weight:800;margin:10px 0 8px 0';
    parent.appendChild(title);

    if (!STATE.discs || !STATE.discs.length) {
      var empty = el('div', '', 'Tom bag – legg til disker fra produktsider (knapp kommer), eller senere via kategori-knapper.');
      empty.style.cssText = 'opacity:.8;padding:12px;border:1px dashed rgba(255,255,255,.18);border-radius:12px;background:rgba(0,0,0,.06)';
      parent.appendChild(empty);
      return;
    }

    var grid = el('div', 'minbag-grid');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px';

    STATE.discs.forEach(function (d, idx) {
      var card = el('div', 'minbag-disc');
      card.style.cssText = 'padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.12);display:flex;gap:10px;align-items:flex-start';

      var img = document.createElement('img');
      img.src = (d && d.image) ? d.image : '';
      img.alt = (d && d.name) ? d.name : 'Disk';
      img.style.cssText = 'width:44px;height:44px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05)';
      card.appendChild(img);

      var info = el('div', '');
      info.style.cssText = 'flex:1;min-width:0';

      var name = el('div', '', (d && d.name) ? d.name : 'Ukjent');
      name.style.cssText = 'font-weight:800;line-height:1.1';
      info.appendChild(name);

      var type = el('div', '', (d && d.type) ? d.type : '');
      type.style.cssText = 'opacity:.75;font-size:12px;margin-top:2px';
      info.appendChild(type);

      var url = (d && d.url) ? d.url : '';
      if (url) {
        var link = a(url, url, '');
        link.style.cssText = 'display:block;margin-top:4px;font-size:12px;opacity:.75;color:#cfe';
        info.appendChild(link);
      }

      card.appendChild(info);

      var rm = el('button', 'minbag-btn', 'Fjern');
      rm.style.cssText = 'padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff';
      rm.onclick = function () {
        STATE.discs.splice(idx, 1);
        setMsg('Lagrer…', '');
        dbSave(STATE.email).then(function () {
          setMsg('', '');
          renderAll();
        }).catch(function (e) {
          setMsg('Kunne ikke lagre: ' + (e && e.message ? e.message : e), 'err');
        });
      };
      card.appendChild(rm);

      grid.appendChild(card);
    });

    parent.appendChild(grid);
  }

  function renderTop3() {
    var body = document.getElementById('minbag-top3-body');
    if (!body) return;
    body.textContent = 'Laster…';

    // Best-effort: try view mybag_popular (public select). If it fails, show "Ingen data".
    ensureSupabaseClient().then(function (supa) {
      return supa
        .from('mybag_popular')
        .select('*')
        .limit(3)
        .then(function (r) {
          if (r && r.error) throw r.error;
          var rows = (r && r.data) ? r.data : [];
          if (!rows.length) {
            body.textContent = 'Ingen data ennå.';
            return;
          }
          clear(body);
          rows.forEach(function (row) {
            var line = el('div', '');
            line.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)';
            var left = el('div', '', (row && (row.name || row.disc_name || row.product_name)) ? (row.name || row.disc_name || row.product_name) : 'Disk');
            var right = el('div', '', 'Valgt ' + (row && (row.count || row.cnt || row.times)) ? (row.count || row.cnt || row.times) : '');
            right.style.cssText = 'opacity:.8';
            line.appendChild(left);
            line.appendChild(right);
            body.appendChild(line);
          });
        });
    }).catch(function () {
      body.textContent = 'Ingen data ennå.';
    });
  }

  function renderAll() {
    buildShell();
    clear(ui.content);
    ensureBagsStructure();

    // Update header select labels to current names (rebuildShell already did but uses STATE.bags values)
    renderBagMetaEditor(ui.content);
    renderDiscs(ui.content);
    renderTop3();
  }

  // ---------------------------
  // Connect view (magic link) if no Supabase session
  // ---------------------------
  function renderConnectView() {
    buildShell();
    clear(ui.content);

    var box = el('div', '');
    box.style.cssText = 'padding:14px 16px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.12)';

    var h = el('div', '', 'Koble til (magic link)');
    h.style.cssText = 'font-weight:900;margin-bottom:6px';
    box.appendChild(h);

    var p = el('div', '', 'Skriv inn e-postadressen din. Du får en innloggingslenke fra Supabase (trygg).');
    p.style.cssText = 'opacity:.85;margin-bottom:10px';
    box.appendChild(p);

    var row = el('div', '');
    row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';

    var input = el('input', '');
    input.type = 'email';
    input.placeholder = 'din@epost.no';
    input.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.2);color:#fff;min-width:260px';
    row.appendChild(input);

    var btn = el('button', 'minbag-btn', 'Send magic link');
    btn.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#2e8b57;color:#fff';
    btn.onclick = function () {
      var email = safeStr(input.value).trim().toLowerCase();
      if (!email || email.indexOf('@') === -1) { setMsg('Skriv inn gyldig e-post.', 'err'); return; }
      setMsg('Sender…', '');
      supaSendMagicLink(email).then(function () {
        setMsg('Sjekk innboksen din og klikk på lenken ✅', '');
      }).catch(function (e) {
        setMsg('Kunne ikke sende: ' + (e && e.message ? e.message : e), 'err');
      });
    };
    row.appendChild(btn);

    box.appendChild(row);

    ui.content.appendChild(box);
    renderTop3();
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function boot() {
    setMsg('', '');

    supaGetUser().then(function (user) {
      if (!user || !user.email) {
        renderConnectView();
        return;
      }

      STATE.user = user;
      STATE.email = (user.email || '').toLowerCase();

      // Load db row
      dbLoad(STATE.email).then(function (row) {
        var parsed = parseRowToState(row || {});
        STATE.bags = parsed.bags;
        STATE.activeBagId = parsed.activeBagId || 'default';
        ensureBagsStructure();

        // If user selects bag2 in DB but it doesn't exist, fix
        if (STATE.activeBagId === 'bag2' && !STATE.bags.bag2) {
          STATE.bags.bag2 = {
            name: 'Bag 2',
            imageUrl: '',
            createdAt: nowIso(),
            items: { discs: [], bagInfo: {}, profile: null }
          };
        }

        syncActiveFromBags();
        renderAll();
      }).catch(function (e) {
        buildShell();
        setMsg('Kunne ikke laste: ' + (e && e.message ? e.message : e), 'err');
        renderTop3();
      });
    }).catch(function (e) {
      buildShell();
      setMsg('Kunne ikke starte: ' + (e && e.message ? e.message : e), 'err');
      renderTop3();
    });
  }

  // Expose for loader BFCache helper
  window.__MINBAG_BOOT__ = boot;
  window.__MINBAG_REFRESH_TOP3__ = renderTop3;

  // Start
  boot();

})();
