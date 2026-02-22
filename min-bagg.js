/*
============================================================================
GOLFKONGEN – MIN BAG Build: v2026-02-22.1 (ES5 safe – no async/await)
Mål i denne versjonen: - Få tilbake “bra versjon”-følelsen: tydelige
GK-cards, seksjoner, mindre rot - Kun 2 bagger (default + bag2), slett
Bag 2 - Bag-navn + bag-bilde (URL) - Legg til disker via
kategori-knapper (mobilvennlig) - Diskliste pr kategori + flight-liste -
Enkel flight-visual (inline SVG) pr disk - “Anbefalt for deg” (på lager
– best effort) + “Nei takk” gir nytt forslag - Topp 3 per type
(putter/midrange/fairway/distance) fra popular_discs - Under bygging
banner øverst MERK: - Flight-data hentes best-effort fra produktside
(fallback: tomme felter + manuell edit) - Denne fila bygger videre på
det som allerede fungerer i Supabase-oppsettet ditt.
============================================================================
*/

(function () { ‘use strict’;

var VERSION = ‘v2026-02-22.1’; console.log(‘[MINBAG] boot’ + VERSION);

// Root var ROOT_ID = ‘min-bag-root’; var root =
document.getElementById(ROOT_ID); if (!root) return;

// Supabase config (fra loader) var SUPA_URL = window.GK_SUPABASE_URL;
var SUPA_KEY = window.GK_SUPABASE_ANON_KEY;

// ————————— // Helpers (ES5) // ————————— function el(tag, cls, txt) {
var e = document.createElement(tag); if (cls) e.className = cls; if (txt
!== undefined && txt !== null) e.textContent = txt; return e; } function
css(e, s) { e.style.cssText = s; return e; } function clear(node) {
while (node.firstChild) node.removeChild(node.firstChild); } function
safeStr(v) { return (v === null || v === undefined) ? ’’ : String(v); }
function nowIso() { return (new Date()).toISOString(); } function
clampTxt(s, n) { s = safeStr(s); return s.length > n ? s.slice(0,
n - 1) + ‘…’ : s; } function normEmail(s) { return
safeStr(s).trim().toLowerCase(); } function uniqId(prefix) { return
prefix + ’_’ + Math.random().toString(16).slice(2) +
Date.now().toString(16); } function isAbsUrl(u) { return
/^https?:///i.test(u || ’‘); } function toAbs(u) { u =
safeStr(u).trim(); if (!u) return’‘; if (isAbsUrl(u)) return u; if
(u.indexOf(’//‘) === 0) return location.protocol + u; if (u[0] ===’/’)
return location.origin + u; return u; }

function toast(msg, kind) { if (!ui.toast) return; ui.toast.textContent
= msg || ’‘; ui.toast.style.display = msg ? ’block’ : ‘none’;
ui.toast.style.borderColor = (kind === ‘err’) ? ‘rgba(255,100,100,.35)’
: ‘rgba(255,255,255,.14)’; ui.toast.style.background = (kind === ‘err’)
? ‘rgba(255,60,60,.09)’ : ‘rgba(255,255,255,.05)’; }

function card(title, subtitle) { var c = el(‘div’, ‘gk-card’); css(c,
‘border:1px solid
rgba(255,255,255,.10);background:rgba(0,0,0,.16);border-radius:16px;padding:14px
16px;box-shadow:0 10px 28px rgba(0,0,0,.22);’); if (title) { var h =
el(‘div’, ‘gk-h’, title); css(h,
‘font-weight:900;font-size:18px;letter-spacing:.2px;margin:0 0 4px 0;’);
c.appendChild(h); } if (subtitle) { var p = el(‘div’, ‘gk-sub’,
subtitle); css(p, ‘opacity:.88;margin:0 0 12px 0;line-height:1.35;’);
c.appendChild(p); } return c; }

function chip(txt) { var c = el(‘span’, ‘gk-chip’, txt); css(c,
‘display:inline-flex;align-items:center;gap:6px;padding:6px
10px;border-radius:999px;border:1px solid
rgba(255,255,255,.14);background:rgba(255,255,255,.04);font-size:12px;opacity:.9;’);
return c; }

function btn(txt, kind) { var b = el(‘button’, ‘gk-btn’, txt); var base
= ‘padding:10px 12px;border-radius:12px;border:1px solid
rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-weight:800;cursor:pointer;’;
if (kind === ‘primary’) base +=
‘background:#2e8b57;border-color:rgba(46,139,87,.55);’; if (kind ===
‘danger’) base +=
‘background:rgba(255,90,90,.14);border-color:rgba(255,90,90,.40);’;
css(b, base); return b; }

function inputText(placeholder, value) { var i = el(‘input’, ‘gk-in’);
i.type = ‘text’; i.placeholder = placeholder || ’‘; i.value = value
||’‘; css(i, ’padding:10px 12px;border-radius:12px;border:1px solid
rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff;min-width:240px;’);
return i; }

function selectBox() { var s = el(‘select’, ‘gk-sel’); css(s,
‘padding:10px 12px;border-radius:12px;border:1px solid
rgba(255,255,255,.18);background:rgba(0,0,0,.22);color:#fff;min-width:220px;’);
return s; }

function modal(title) { var overlay = el(‘div’, ‘gk-modal-overlay’);
css(overlay,
‘position:fixed;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;’);
var box = el(‘div’, ‘gk-modal’); css(box, ‘width:min(980px,
100%);max-height:85vh;overflow:auto;border-radius:18px;border:1px solid
rgba(255,255,255,.14);background:rgba(18,18,18,.95);box-shadow:0 24px
70px rgba(0,0,0,.55);’); var head = el(‘div’,‘gk-modal-head’);
css(head,‘display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px
16px;border-bottom:1px solid rgba(255,255,255,.10);’); var h =
el(‘div’,’‘, title || ’Dialog’);
css(h,‘font-weight:900;font-size:16px;’); var close = btn(‘Lukk’,’‘);
close.onclick = function(){ document.body.removeChild(overlay); };
head.appendChild(h); head.appendChild(close); var body =
el(’div’,‘gk-modal-body’); css(body,‘padding:14px 16px;’);
box.appendChild(head); box.appendChild(body); overlay.appendChild(box);
return { overlay: overlay, body: body, close: close }; }

// ————————— // Types / categories (fasit) // ————————— var TYPE_ORDER =
[‘putter’,‘midrange’,‘fairway’,‘distance’]; var TYPE_LABEL = {
putter:‘Puttere’, midrange:‘Midrange’, fairway:‘Fairway’,
distance:‘Drivere’ };

var CAT = [ { type:‘putter’, label:‘Puttere’,
url:‘/discgolf/disc-putter’ }, { type:‘midrange’, label:‘Midrange’,
url:‘/discgolf/midrange’ }, { type:‘fairway’, label:‘Fairway’,
url:‘/discgolf/fairway-driver’ }, { type:‘distance’, label:‘Drivere’,
url:‘/discgolf/driver’ } ];

function inferTypeFromUrl(url) { url = safeStr(url).toLowerCase(); if
(url.indexOf(‘/discgolf/disc-putter’) === 0) return ‘putter’; if
(url.indexOf(‘/discgolf/midrange’) === 0) return ‘midrange’; if
(url.indexOf(‘/discgolf/fairway-driver’) === 0) return ‘fairway’; if
(url.indexOf(‘/discgolf/driver’) === 0) return ‘distance’; return ’’; }

// ————————— // State // ————————— var STATE = { version: VERSION, supa:
null, user: null, email: null,

    bags: null,        // { default:{name,imageUrl,items:{discs,bagInfo,profile}}, bag2:{...} }
    activeBagId: 'default',

    discs: [],
    bagInfo: {},
    profile: null

}; window.__MINBAGG_STATE__ = STATE;

function ensureBags() { if (!STATE.bags || typeof STATE.bags !==
‘object’) STATE.bags = {};

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

function syncActiveFromBags() { if (!STATE.bags || typeof STATE.bags !==
‘object’) STATE.bags = {}; if (!STATE.activeBagId ||
!STATE.bags[STATE.activeBagId]) STATE.activeBagId = ‘default’;

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

function writeActiveToBags() { if (!STATE.bags || typeof STATE.bags !==
‘object’) STATE.bags = {}; if (!STATE.bags.default) { STATE.bags.default
= { name: ‘Min bag’, imageUrl: ’‘, createdAt: nowIso(), items: { discs:
[], bagInfo: {}, profile: null } }; } if (!STATE.activeBagId ||
!STATE.bags[STATE.activeBagId]) STATE.activeBagId = ’default’; var b =
STATE.bags[STATE.activeBagId]; if (!b.items || typeof b.items !==
‘object’) b.items = {}; b.items.discs = Array.isArray(STATE.discs) ?
STATE.discs : []; b.items.bagInfo = STATE.bagInfo || {}; b.items.profile
= (STATE.profile === undefined) ? null : STATE.profile; }

// ————————— // Supabase client / auth // ————————— function
ensureSupabaseClient() { return new Promise(function (resolve, reject) {
try { if (!SUPA_URL || !SUPA_KEY) return reject(new Error(‘Supabase
URL/KEY mangler i loader’)); if (!window.supabase ||
!window.supabase.createClient) return reject(new Error(‘Supabase SDK
mangler’)); if (!STATE.supa) STATE.supa =
window.supabase.createClient(SUPA_URL, SUPA_KEY); resolve(STATE.supa); }
catch (e) { reject(e); } }); }

function supaGetUser() { return ensureSupabaseClient().then(function
(supa) { return supa.auth.getUser().then(function (r) { if (r &&
r.error) throw r.error; return (r && r.data) ? r.data.user : null; });
}); }

function supaSendMagicLink(email) { return
ensureSupabaseClient().then(function (supa) { return
supa.auth.signInWithOtp({ email: email, options: { emailRedirectTo:
location.origin + ‘/sider/min-bag’ } }).then(function (r) { if (r &&
r.error) throw r.error; return r; }); }); }

// ————————— // DB: mybag_bags // ————————— function parseRow(row) { var
out = { bags: {}, activeBagId: ‘default’ }; if (row && row.bag_json &&
typeof row.bag_json === ‘object’ && row.bag_json.bags && typeof
row.bag_json.bags === ‘object’) { out.bags = row.bag_json.bags; }
out.activeBagId = (row && row.selected_bag) ? row.selected_bag :
‘default’;

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

function dbLoad(email) { return ensureSupabaseClient().then(function
(supa) { return supa.from(‘mybag_bags’) .select(‘email, selected_bag,
bag, bag_json’) .eq(‘email’, email) .maybeSingle() .then(function (r) {
if (r && r.error) throw r.error; return (r && r.data) ? r.data : null;
}); }); }

function dbSave(email) { writeActiveToBags(); var bj = { bags:
STATE.bags }; var selected = STATE.activeBagId; var active =
STATE.bags[selected] || STATE.bags.default; var legacyBagArray = (active
&& active.items && Array.isArray(active.items.discs)) ?
active.items.discs : [];

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

// ————————— // Product parsing (category pages) // ————————— function
fetchText(url) { return fetch(url, { credentials: ‘include’
}).then(function (r) { return r.text(); }); }

function parseProductsFromCategoryHtml(html, baseType) { // Best effort:
find product cards with href under /discgolf/ // Returns:
[{url,name,image,type}] var out = []; try { // Use DOMParser for
resilience var doc = new DOMParser().parseFromString(html, ‘text/html’);
var links = doc.querySelectorAll(‘a[href^=“/discgolf/”]’); var seen =
{}; for (var i = 0; i < links.length; i++) { var href =
links[i].getAttribute(‘href’); if (!href || href.indexOf(‘/discgolf/’)
!== 0) continue; if (seen[href]) continue;

        // attempt to find product name
        var name = '';
        var t = links[i].getAttribute('title');
        if (t) name = t;
        if (!name) name = links[i].textContent;
        name = safeStr(name).replace(/\s+/g,' ').trim();

        // ignore very short / nav links
        if (name.length < 3) continue;

        // image
        var img = links[i].querySelector('img');
        var imgUrl = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
        imgUrl = toAbs(imgUrl);

        // type
        var type = inferTypeFromUrl(href) || baseType || '';

        // only accept if looks like a product URL (has slug after category)
        if (href.split('/').length < 4) continue;

        out.push({ url: href, name: name, image: imgUrl, type: type });
        seen[href] = true;
        if (out.length >= 60) break;
      }
    } catch (_) {}
    return out;

}

function parseFlightFromProductHtml(html) { // Best effort: tries to
detect four numbers in common patterns // Returns {speed, glide, turn,
fade} as strings or null try { var txt = safeStr(html);

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

// ————————— // Flight visuals (inline SVG) // ————————— function
flightSvg(f) { // simple curve based on turn/fade (best effort) var s =
parseFloat((f && f.speed) ? f.speed : ‘0’) || 0; var t = parseFloat((f
&& f.turn) ? f.turn : ‘0’) || 0; var d = parseFloat((f && f.fade) ?
f.fade : ‘0’) || 0;

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

// ————————— // Recommendations (simple) // ————————— function
countByType(discs) { var c = { putter:0, midrange:0, fairway:0,
distance:0 }; for (var i=0;i<discs.length;i++) { var t = discs[i] &&
discs[i].type ? discs[i].type : ’’; if (c[t] !== undefined) c[t] += 1; }
return c; }

function pickNeededType(discs) { var c = countByType(discs); // super
enkel logikk: sørg for minst 2 puttere, 3 mid, 3 fairway, 2 distance if
(c.putter < 2) return ‘putter’; if (c.midrange < 3) return ‘midrange’;
if (c.fairway < 3) return ‘fairway’; if (c.distance < 2) return
‘distance’; // ellers prøv å fylle “rett” midrange/fairway (turn ~0 fade
~1) return ‘midrange’; }

function isApproxStraight(f) { if (!f) return false; var t =
parseFloat(f.turn || ‘0’) || 0; var d = parseFloat(f.fade || ‘0’) || 0;
return (Math.abs(t) <= 1.0 && d >= 0 && d <= 2.0); }

// ————————— // UI nodes // ————————— var ui = { shell: null, toast:
null, bagSel: null, delBagBtn: null, content: null, top3: null, reco:
null };

function buildShell() { clear(root); css(root,
‘max-width:1100px;margin:0 auto;padding:10px 14px;’);

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
      dbSave(STATE.email).then(function(){ toast(''); renderAll(); }).catch(function(e){ toast('Kunne ikke bytte: ' + (e&&e.message?e.message:e),'err'); });
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
      dbSave(STATE.email).then(function(){ toast(''); renderAll(); }).catch(function(e){ toast('Kunne ikke slette: ' + (e&&e.message?e.message:e),'err'); });
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

// ————————— // Bag meta modal (name + image url) // ————————— function
openBagMetaModal() { ensureBags(); var b =
STATE.bags[STATE.activeBagId];

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
      dbSave(STATE.email).then(function(){ toast('Lagret ✅'); document.body.removeChild(m.overlay); renderAll(); }).catch(function(e){ toast('Kunne ikke lagre: ' + (e&&e.message?e.message:e),'err'); });
    };

    m.body.appendChild(wrap);
    m.body.appendChild(el('div','', ''));
    m.body.appendChild(save);

    document.body.appendChild(m.overlay);

}

// ————————— // Add discs modal: category buttons + search + fetch //
————————— function openAddDiscModal() { var m = modal(‘Legg til disk’);
var top = el(‘div’,’‘);
css(top,’display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;’);

    // category buttons (mobile-friendly)
    CAT.forEach(function(c){
      var b = btn(c.label,'');
      b.onclick = function(){ loadCategory(c); };
      top.appendChild(b);
    });

    var hint = el('div','', 'Velg en kategori for å hente produkter. Klikk “Legg til” for å legge i aktiv bag.');
    css(hint,'opacity:.85;margin-bottom:10px;');
    m.body.appendChild(top);
    m.body.appendChild(hint);

    var list = el('div','');
    css(list,'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;');
    m.body.appendChild(list);

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
            renderAll();
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

}

function addProductToBag(p) { // fetch product page to try extract
flight return fetchText(p.url).then(function(html){ var flight =
parseFlightFromProductHtml(html); var disc = { id: uniqId(‘d’), url:
p.url, name: p.name, note: ’‘, type: p.type || inferTypeFromUrl(p.url)
||’‘, color:’‘, image: p.image ||’‘, flight: flight, addedAt:
nowIso().slice(0,10) }; if (!disc.type) disc.type = ’midrange’;

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

function incPopular(disc) { // Use popular_discs table directly (public
insert/update allowed in your RLS setup) return
ensureSupabaseClient().then(function(supa){ var t = disc.type || ’‘; var
name = disc.name ||’‘; var url = disc.url ||’‘; var img = disc.image
||’‘; // upsert (type,name) if unique constraint exists; if not, simple
insert return supa.from(’popular_discs’) .upsert({ type: t, name: name,
count: 1, product_url: url, image_url: img }, { onConflict: ‘type,name’
}) .select(‘type’) .then(function(r){ // if no unique constraint, error
can happen – ignore return r; }); }); }

// ————————— // Discs rendering // ————————— function
groupDiscsByType(discs) { var g = { putter:[], midrange:[], fairway:[],
distance:[] }; for (var i=0;i<discs.length;i++) { var d = discs[i]; var
t = (d && d.type) ? d.type : ’‘; if (!g[t]) t = inferTypeFromUrl(d &&
d.url ? d.url :’‘) || ’midrange’; if (!g[t]) t = ‘midrange’; d.type = t;
g[t].push(d); } return g; }

function flightRow(d) { var f = d.flight || {}; var sp =
safeStr(f.speed), gl = safeStr(f.glide), tu = safeStr(f.turn), fa =
safeStr(f.fade); if (!sp && !gl && !tu && !fa) return el(‘div’,’‘,
’Flight: (mangler)’); var r = el(‘div’,’‘);
css(r,’display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;’);
r.appendChild(chip(‘S’ + (sp||‘?’))); r.appendChild(chip(‘G’ +
(gl||‘?’))); r.appendChild(chip(‘T’ + (tu||‘?’)));
r.appendChild(chip(‘F’ + (fa||‘?’))); return r; }

function renderDiscs() { clear(ui.content);

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
    left.appendChild(chip('P ' + c.putter + ' • M ' + c.midrange + ' • F ' + c.fairway + ' • D ' + c.distance));
    metaRow.appendChild(left);

    var right = el('div','');
    css(right,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;');
    var add = btn('Legg til disk','primary');
    add.onclick = function(){ openAddDiscModal(); };
    right.appendChild(add);
    metaRow.appendChild(right);

    top.appendChild(metaRow);
    ui.content.appendChild(top);

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
        var ccard = el('div','');
        css(ccard,'border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px;');

        var topRow = el('div','');
        css(topRow,'display:flex;gap:10px;align-items:flex-start;');

        var img = document.createElement('img');
        img.src = d.image || '';
        css(img,'width:56px;height:56px;border-radius:16px;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);');
        topRow.appendChild(img);

        var mid = el('div','');
        css(mid,'flex:1;min-width:0;');
        var name = el('div','', clampTxt(d.name, 56));
        css(name,'font-weight:900;line-height:1.15;');
        mid.appendChild(name);

        var link = el('a','', 'Åpne produkt');
        link.href = d.url || '#';
        link.target = '_blank';
        css(link,'display:inline-block;margin-top:6px;font-size:12px;color:#cfe;text-decoration:none;opacity:.9;');
        mid.appendChild(link);

        mid.appendChild(flightRow(d));

        topRow.appendChild(mid);

        var rm = btn('Fjern','');
        rm.onclick = function(){
          // remove by id
          var id = d.id;
          STATE.discs = (STATE.discs || []).filter(function(x){ return x && x.id !== id; });
          writeActiveToBags();
          toast('Lagrer…');
          dbSave(STATE.email).then(function(){ toast(''); renderAll(); }).catch(function(e){ toast('Kunne ikke fjerne: ' + (e&&e.message?e.message:e),'err'); });
        };
        css(rm,'padding:9px 10px;border-radius:12px;');
        topRow.appendChild(rm);

        ccard.appendChild(topRow);

        // Flight chart
        var fbox = el('div','');
        css(fbox,'margin-top:10px;');
        fbox.appendChild(flightSvg(d.flight || null));
        ccard.appendChild(fbox);

        grid.appendChild(ccard);
      });

      sec.appendChild(grid);
      ui.content.appendChild(sec);
    });

}

// ————————— // Recommendations panel (right column) // ————————— var
recoState = { lastType: null, lastPicked: null };

function renderRecommendations() { clear(ui.reco);

    var c = card('Anbefalt for deg', 'Forslag basert på hva som mangler i bagen din akkurat nå.');
    ui.reco.appendChild(c);

    var needed = pickNeededType(STATE.discs || []);
    recoState.lastType = needed;

    var line = el('div','');
    css(line,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;');

    var left = el('div','');
    css(left,'opacity:.9;line-height:1.35;');
    left.innerHTML =
      '<div style="font-weight:900;">Neste steg: ' + (TYPE_LABEL[needed] || needed) + '</div>' +
      '<div style="opacity:.85;margin-top:4px;">Vi prøver å bygge en mer komplett sekk (mål: 85%+ kommer).</div>';
    line.appendChild(left);

    var right = el('div','');
    css(right,'display:flex;gap:10px;flex-wrap:wrap;align-items:center;');

    var btnPick = btn('Finn forslag','primary');
    var btnNo = btn('Nei takk','');

    right.appendChild(btnPick);
    right.appendChild(btnNo);
    line.appendChild(right);

    c.appendChild(line);

    var box = el('div','');
    css(box,'margin-top:12px;');

    function showPick(p) {
      clear(box);
      if (!p) {
        var t = el('div','', 'Fant ingen forslag akkurat nå.');
        css(t,'opacity:.85;');
        box.appendChild(t);
        return;
      }
      recoState.lastPicked = p;

      var wrap = el('div','');
      css(wrap,'border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px;display:flex;gap:10px;align-items:flex-start;');

      var img = document.createElement('img');
      img.src = p.image || '';
      css(img,'width:58px;height:58px;border-radius:16px;object-fit:cover;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);');
      wrap.appendChild(img);

      var mid = el('div','');
      css(mid,'flex:1;min-width:0;');
      var n = el('div','', clampTxt(p.name, 60));
      css(n,'font-weight:900;');
      mid.appendChild(n);
      var l = el('a','', 'Åpne produkt');
      l.href = p.url; l.target='_blank';
      css(l,'display:inline-block;margin-top:6px;font-size:12px;color:#cfe;text-decoration:none;opacity:.9;');
      mid.appendChild(l);
      wrap.appendChild(mid);

      var add = btn('Legg til','primary');
      add.onclick = function(){
        addProductToBag(p).then(function(){ toast('Lagt til ✅'); renderAll(); }).catch(function(e){ toast('Kunne ikke legge til: ' + (e&&e.message?e.message:e),'err'); });
      };
      wrap.appendChild(add);

      box.appendChild(wrap);
    }

    function pickSuggestion() {
      // Best effort: fetch category page and pick first "straight-ish" if possible, else first product
      var cat = null;
      for (var i=0;i<CAT.length;i++) if (CAT[i].type === needed) cat = CAT[i];
      if (!cat) cat = CAT[1];

      toast('Henter forslag…');
      fetchText(cat.url).then(function(html){
        var items = parseProductsFromCategoryHtml(html, cat.type);
        if (!items.length) { toast(''); showPick(null); return; }

        // try pick something not already in bag (by url)
        var existing = {};
        (STATE.discs || []).forEach(function(d){ if (d && d.url) existing[d.url] = true; });

        var candidate = null;
        for (var j=0;j<items.length;j++) {
          if (!existing[items[j].url]) { candidate = items[j]; break; }
        }
        if (!candidate) candidate = items[0];

        // optional: pull flight and prefer straight
        fetchText(candidate.url).then(function(ph){
          var f = parseFlightFromProductHtml(ph);
          candidate.flight = f;
          if (f && isApproxStraight(f)) {
            toast('');
            showPick(candidate);
            return;
          }
          // try scan a few to find straight
          var tries = Math.min(6, items.length);
          var idx = 0;
          function next() {
            idx++;
            if (idx >= tries) { toast(''); showPick(candidate); return; }
            var it = items[idx];
            if (existing[it.url]) return next();
            fetchText(it.url).then(function(h2){
              var f2 = parseFlightFromProductHtml(h2);
              if (f2 && isApproxStraight(f2)) {
                it.flight = f2;
                toast('');
                showPick(it);
              } else {
                next();
              }
            }).catch(function(){ next(); });
          }
          next();
        }).catch(function(){
          toast('');
          showPick(candidate);
        });
      }).catch(function(e){
        toast('Kunne ikke hente forslag: ' + (e&&e.message?e.message:e),'err');
      });
    }

    btnPick.onclick = pickSuggestion;
    btnNo.onclick = function(){
      // Just pick a new one
      pickSuggestion();
    };

    c.appendChild(box);

    // Start with one suggestion automatically
    pickSuggestion();

}

// ————————— // Top 3 per type (popular_discs) // ————————— function
renderTop3PerType() { // Top 3 lives under recommendations panel for now
var c = card(‘Topp 3 globalt (per type)’, ‘Basert på hva folk legger i
bag på GolfKongen.’); ui.reco.appendChild(el(‘div’,’‘,’’));
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

// ————————— // Connect view (magic link) // ————————— function
renderConnectView() { buildShell(); clear(ui.content); clear(ui.reco);

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

// ————————— // Render all // ————————— function renderAll() {
buildShell(); ensureBags(); renderDiscs(); renderRecommendations();
renderTop3PerType(); }

// ————————— // Boot // ————————— function boot() {
supaGetUser().then(function(user){ if (!user || !user.email) {
renderConnectView(); return; }

      STATE.user = user;
      STATE.email = normEmail(user.email);

      dbLoad(STATE.email).then(function(row){
        var parsed = parseRow(row || {});
        STATE.bags = parsed.bags;
        STATE.activeBagId = parsed.activeBagId || 'default';
        ensureBags();
        syncActiveFromBags();
        renderAll();
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
