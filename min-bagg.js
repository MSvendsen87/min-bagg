(function () {
  'use strict';

  // =========================
  // GolfKongen – Min Bagg
  // - Kjører på /sider/min-bagg
  // - Krever kun: <div id="min-bagg-root"></div>
  // - Valgfritt: <span id="gk-auth" data-logged-in="1" data-user-id="..."></span>
  // =========================

  var ROOT_ID = 'min-bagg-root';
  var root = document.getElementById(ROOT_ID);
  if (!root) return;

  // ---- Config (kan settes i theme/qs_functions.js før denne fila lastes) ----
  var SUPABASE_URL = window.GK_SUPABASE_URL || '';
  var SUPABASE_ANON_KEY = window.GK_SUPABASE_ANON_KEY || '';
  var POP_API_URL = window.GK_POP_API_URL || ''; // Google Apps Script / popular discs endpoint (valgfritt)

  // ---- State ----
  var state = {
    q: '',
    searchItems: [],
    bag: [],
    bagKey: 'gk_min_bagg_v1',
    isLoggedIn: false,
    userId: null,
    supa: null
  };

  // ---- Helpers ----
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function normHref(hrefRaw) {
    var href = String(hrefRaw || '').trim();
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    if (href[0] !== '/') href = '/' + href;
    return href;
  }
  function normalizeImgUrl(u) {
    if (!u) return '';
    u = String(u);
    if (u.indexOf('http') === 0) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u[0] !== '/') u = '/' + u;
    return location.origin + u;
  }

  // ---- Auth marker ----
  function readAuthMarker() {
    var el = document.getElementById('gk-auth');
    if (!el) return { isLoggedIn: false, userId: null };
    var logged = (el.getAttribute('data-logged-in') || '').toString() === '1';
    var uid = el.getAttribute('data-user-id') || null;
    return { isLoggedIn: !!logged, userId: uid };
  }

  // ---- UI ----
  function injectCssOnce() {
    if (document.getElementById('gk-minbagg-style')) return;
    var style = document.createElement('style');
    style.id = 'gk-minbagg-style';
    style.textContent = `
      .gk-mb-card{background:#1f1f1f;border:1px solid #333;border-radius:12px;padding:14px;margin:12px 0}
      .gk-mb-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .gk-mb-input{flex:1;min-width:220px;background:#111;border:1px solid #444;color:#fff;border-radius:10px;padding:10px 12px}
      .gk-mb-btn{background:#2f7d32;border:1px solid #3f9b43;color:#fff;border-radius:10px;padding:10px 14px;cursor:pointer}
      .gk-mb-btn.secondary{background:#333;border-color:#555}
      .gk-mb-muted{color:#aaa;font-size:13px}
      .gk-mb-list{margin-top:10px}
      .gk-mb-item{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a2a}
      .gk-mb-left{display:flex;gap:10px;align-items:center}
      .gk-mb-img{width:42px;height:42px;border-radius:10px;object-fit:cover;background:#111;border:1px solid #333}
      .gk-mb-title{color:#d7e7ff;text-decoration:none}
      .gk-mb-pill{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #444;font-size:12px;color:#bbb}
      .gk-mb-map{height:260px;border:1px dashed #444;border-radius:12px;position:relative;background:linear-gradient(180deg,#161616,#101010)}
      .gk-mb-dot{position:absolute;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#8ab4ff;border:1px solid #1b2b44}
      .gk-mb-dot:hover{filter:brightness(1.2)}
      .gk-mb-tooltip{position:absolute;pointer-events:none;background:#111;border:1px solid #444;color:#fff;padding:8px 10px;border-radius:10px;font-size:12px;max-width:260px;z-index:50;display:none}
    `;
    document.head.appendChild(style);
  }

  function renderShell() {
    injectCssOnce();
    root.innerHTML = `
      <div class="gk-mb-card">
        <h2 style="margin:0 0 10px 0;">Min Bagg</h2>
        <div class="gk-mb-row">
          <input id="gk-mb-q" class="gk-mb-input" placeholder="Søk disk (f.eks. buzzz)" />
          <button id="gk-mb-search" class="gk-mb-btn">Søk</button>
        </div>
        <div id="gk-mb-msg" class="gk-mb-muted" style="margin-top:8px;"></div>
        <div id="gk-mb-results" class="gk-mb-list"></div>
      </div>

      <div class="gk-mb-card">
        <h3 style="margin:0 0 6px 0;">Baggen din</h3>
        <div id="gk-mb-bag" class="gk-mb-list"></div>
      </div>

      <div class="gk-mb-card">
        <h3 style="margin:0 0 6px 0;">Anbefalt for deg</h3>
        <div id="gk-mb-recos" class="gk-mb-muted">Anbefalinger kommer når baggen er aktiv.</div>
      </div>

      <div class="gk-mb-card">
        <h3 style="margin:0 0 6px 0;">Bag-map</h3>
        <div class="gk-mb-muted">Understabil (venstre) → Overstabil (høyre) • Slow (nede) → Fast (oppe)</div>
        <div id="gk-mb-map" class="gk-mb-map" style="margin-top:10px;"></div>
        <div id="gk-mb-tip" class="gk-mb-tooltip"></div>
      </div>

      <div class="gk-mb-card">
        <h3 style="margin:0 0 6px 0;">Topp 3 globalt</h3>
        <div id="gk-mb-top3" class="gk-mb-muted">Laster topp 3 fra global statistikk…</div>
      </div>
    `;

    var input = document.getElementById('gk-mb-q');
    var btn = document.getElementById('gk-mb-search');

    btn.addEventListener('click', function () {
      doSearch(input.value.trim());
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch(input.value.trim());
    });
  }

  function setMsg(s) {
    var el = document.getElementById('gk-mb-msg');
    if (el) el.textContent = s || '';
  }

  // ---- Storage (local) ----
  function loadLocalBag() {
    try {
      var raw = localStorage.getItem(state.bagKey);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch (e) {
      return [];
    }
  }
  function saveLocalBag(arr) {
    try {
      localStorage.setItem(state.bagKey, JSON.stringify(arr || []));
    } catch (e) {}
  }

  // ---- Supabase init + save/load (valgfritt) ----
  function ensureSupabaseLoaded() {
    return new Promise(function (resolve) {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return resolve(null);
      if (window.supabase && window.supabase.createClient) {
        state.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return resolve(state.supa);
      }
      var existing = document.getElementById('gk-supabase-js');
      if (existing) {
        existing.addEventListener('load', function () {
          if (window.supabase && window.supabase.createClient) {
            state.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            resolve(state.supa);
          } else resolve(null);
        });
        return;
      }
      var s = document.createElement('script');
      s.id = 'gk-supabase-js';
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = function () {
        try {
          if (window.supabase && window.supabase.createClient) {
            state.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            resolve(state.supa);
          } else resolve(null);
        } catch (e) {
          resolve(null);
        }
      };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  // Forventede tabeller:
  // - mybag_bags (user_id text pk, bag jsonb, updated_at timestamptz)
  // - mybag_popularity (product_id text pk, title text, url text, image text, count int)
  function loadRemoteBag() {
    if (!state.supa || !state.userId) return Promise.resolve(null);
    return state.supa
      .from('mybag_bags')
      .select('bag')
      .eq('user_id', state.userId)
      .maybeSingle()
      .then(function (res) {
        if (res && res.data && Array.isArray(res.data.bag)) return res.data.bag;
        return null;
      })
      .catch(function () { return null; });
  }
  function saveRemoteBag(arr) {
    if (!state.supa || !state.userId) return Promise.resolve(false);
    return state.supa
      .from('mybag_bags')
      .upsert({ user_id: state.userId, bag: arr, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  
function bumpPopularity(item) {
    // Legacy (valgfritt): Apps Script tracker
    if (POP_API_URL) {
      try {
        var u = POP_API_URL + '?op=increment'
          + '&id=' + encodeURIComponent(item.id || '')
          + '&title=' + encodeURIComponent(item.title || '')
          + '&url=' + encodeURIComponent(item.href || '')
          + '&image=' + encodeURIComponent(item.image || '');
        fetch(u, { mode: 'no-cors' }).catch(function () {});
      } catch (e) {}
    }

    // Ny: Supabase RPC → increment_popular_disc(type,name) i public.popular_discs
    try {
      var t = inferPopularType(item);
      var n = (item && item.title) ? String(item.title) : '';
      if (t && n) {
        rpcIncrementPopularDisc(t, n, item && item.href, item && item.image).catch(function(){});
      }
    } catch (e) {}
  }

  function inferPopularType(item) {
    // 1) Hvis vi har flight -> speed avgjør kategori
    var speed = null;
    try {
      if (item && item.flight) {
        var m = String(item.flight).match(/(-?\d+(?:\.\d+)?)/g);
        if (m && m.length >= 1) speed = parseFloat(m[0]);
      }
    } catch (e) {}

    if (typeof speed === 'number' && !isNaN(speed)) {
      if (speed <= 3) return 'putter';
      if (speed <= 6) return 'midrange';
      if (speed <= 9) return 'fairway';
      return 'distance';
    }

    // 2) Fallback: heuristikk på tittel
    var txt = ((item && item.title) ? String(item.title) : '').toLowerCase();
    if (/(putter|p2|aviar|judge|pure|luna|pa-\d)/.test(txt)) return 'putter';
    if (/(mid|midrange|buzzz|roc|md\d|mako|truth|hex|fuse|tursas)/.test(txt)) return 'midrange';
    if (/(fairway|teebird|fd|essence|leopard|river|explorer|stalker|passion)/.test(txt)) return 'fairway';
    if (/(distance|destroyer|wraith|shryke|force|nuke|ballista|trace|photon|octane|wave|hades)/.test(txt)) return 'distance';

    // 3) Ukjent → ikke logg popularitet
    return '';
  }

  function rpcIncrementPopularDisc(type, name, productUrl, imageUrl) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.reject(new Error('Supabase not configured'));
    var base = String(SUPABASE_URL).replace(/\/+$/, '');
    var url = base + '/rest/v1/rpc/increment_popular_disc';

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ p_type: String(type), p_name: String(name), p_url: productUrl ? String(productUrl) : null, p_image: imageUrl ? String(imageUrl) : null })
    }).then(function (r) {
      if (!r.ok && r.status !== 204) throw new Error('RPC failed: ' + r.status);
      return true;
    });
  }

  function loadTop3() {
    var el = document.getElementById('gk-mb-top3');
    if (!el) return;

    if (POP_API_URL) {
      var url = POP_API_URL + '?op=top3';
      fetch(url).then(function (r) { return r.json(); })
        .then(function (data) {
          if (!Array.isArray(data) || !data.length) {
            el.textContent = 'Ingen data ennå.';
            return;
          }
          el.innerHTML = data.slice(0, 3).map(function (x, i) {
            var href = normHref(x.url || '');
            var img = normalizeImgUrl(x.image || '');
            return `
              <div class="gk-mb-item">
                <div class="gk-mb-left">
                  <span class="gk-mb-pill">#${i + 1}</span>
                  ${img ? `<img class="gk-mb-img" src="${esc(img)}" alt="" />` : `<span class="gk-mb-img"></span>`}
                  <a class="gk-mb-title" href="${esc(href)}" target="_blank" rel="noopener">${esc(x.title || '')}</a>
                </div>
                <span class="gk-mb-muted">${esc(x.count || '')}</span>
              </div>
            `;
          }).join('');
        })
        .catch(function () {
          el.textContent = 'Kunne ikke laste topp 3 (API).';
        });
      return;
    }

    if (state.supa) {
      // Ny kilde: public.popular_discs (type, name, count, last_seen)
      // Vi henter en "stor nok" liste, og plukker topp 3 per type.
      state.supa.from('popular_discs')
        .select('type,name,count,last_seen,product_url,image_url')
        .order('count', { ascending: false })
        .limit(200)
        .then(function (res) {
          var rows = (res && res.data) ? res.data : [];
          if (!rows.length) { el.textContent = 'Ingen data ennå.'; return; }

          var TYPES = [
            { key: 'putter', label: 'Puttere' },
            { key: 'midrange', label: 'Midrange' },
            { key: 'fairway', label: 'Fairway drivers' },
            { key: 'distance', label: 'Distance drivers' }
          ];

          function topForType(t) {
            var out = [];
            for (var i = 0; i < rows.length; i++) {
              var r = rows[i];
              if (String(r.type || '').toLowerCase() !== t) continue;
              out.push(r);
              if (out.length >= 3) break;
            }
            return out;
          }

          el.innerHTML = TYPES.map(function (t) {
            var top = topForType(t.key);
            if (!top.length) {
              return `
                <div style="margin:10px 0 14px 0;">
                  <div class="gk-mb-row" style="justify-content:space-between;">
                    <strong>${esc(t.label)}</strong>
                    <span class="gk-mb-muted">Ingen data ennå</span>
                  </div>
                </div>
              `;
            }
            return `
              <div style="margin:10px 0 14px 0;">
                <div class="gk-mb-row" style="justify-content:space-between;">
                  <strong>${esc(t.label)}</strong>
                  <span class="gk-mb-muted">Topp 3</span>
                </div>
                <div class="gk-mb-list" style="margin-top:6px;">
                  ${top.map(function (x, i) {
                    return `
                      <div class="gk-mb-item">
                        <div class="gk-mb-left">
                          <span class="gk-mb-pill">#${i + 1}</span>
                          ${x.image_url ? `<img class="gk-mb-img" src="${esc(normalizeImgUrl(x.image_url))}" alt="" />` : `<span class="gk-mb-img"></span>`}
                          ${(x.product_url ? `<a class="gk-mb-title" href="${esc(normHref(x.product_url))}" target="_blank" rel="noopener">${esc(x.name || '')}</a>` : `<span class="gk-mb-title">${esc(x.name || '')}</span>`)}
                        </div>
                        <span class="gk-mb-muted">${esc(x.count || '')}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('');
        })
        .catch(function () { el.textContent = 'Kunne ikke laste topp 3 (Supabase).'; });
      return;
    }

    el.textContent = 'Topp 3 krever GK_POP_API_URL eller Supabase.';
  }

  // ---- Search ----
  function parseSearchResultsFromJson(json) {
    var sr = json && (json.searchresults || json.searchResults || json.results);
    if (!Array.isArray(sr)) return [];
    var out = [];
    for (var i = 0; i < sr.length; i++) {
      var prod = sr[i] && (sr[i].product || sr[i]);
      if (!prod) continue;
      var title = prod.title || prod.name || '';
      var href = prod.url || prod.href || '';
      if (!title || !href) continue;

      var tLow = String(title).toLowerCase();
      if (tLow === 'ønskeliste' || tLow === 'onskeliste' || tLow === 'logg inn') continue;

      out.push({
        id: String(prod.id || prod.product_id || ''),
        title: String(title),
        href: normHref(href),
        image: normalizeImgUrl(prod.firstimage || prod.image || ''),
        raw: prod
      });
    }
    return out;
  }

  // HTML fallback (fra din fungerende parser)
  function parseSearchResultsFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var scope = doc.querySelector('.product-list, .products, .product-grid, .productList, [data-products], main, body') || doc;
    var anchors = scope.querySelectorAll('a[href]');
    var out = [];
    var seen = {};
    anchors.forEach(function (a) {
      var hrefRaw = a.getAttribute('href') || '';
      if (!hrefRaw) return;
      if (hrefRaw.indexOf('/shop/') === -1 && hrefRaw.indexOf('/discgolf/') === -1 && hrefRaw.indexOf('/golf/') === -1 && hrefRaw.indexOf('/frisbee/') === -1) return;

      var href = normHref(hrefRaw);
      var key = href.split('#')[0];
      if (seen[key]) return;
      seen[key] = 1;

      var hasImg = !!a.querySelector('img');
      var inProductThing = !!(a.closest && a.closest('.product, .product-card, .product-item, .productCard, li, article, .card'));
      if (!hasImg && !inProductThing) return;

      var title = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!title) return;

      var tLow = title.toLowerCase();
      if (tLow === 'ønskeliste' || tLow === 'onskeliste' || tLow === 'logg inn') return;

      var imgEl = a.querySelector('img');
      var img = imgEl ? (imgEl.getAttribute('src') || '') : '';

      out.push({
        id: '',
        title: title,
        href: href.split('?')[0],
        image: normalizeImgUrl(img)
      });
    });
    return out;
  }

  function fetchSearch(q) {
    var urlJson = '/shop/search?s=' + encodeURIComponent(q) + '&out=json&limit=12';
    return fetch(urlJson, { credentials: 'same-origin' })
      .then(function (r) {
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('application/json') >= 0) return r.json();
        return r.text().then(function (t) {
          try { return JSON.parse(t); } catch (e) { return null; }
        });
      })
      .then(function (json) {
        var items = parseSearchResultsFromJson(json || {});
        if (items && items.length) return items;

        var urlHtml = '/shop/search?s=' + encodeURIComponent(q);
        return fetch(urlHtml, { credentials: 'same-origin' })
          .then(function (r) { return r.text(); })
          .then(function (html) { return parseSearchResultsFromHtml(html); });
      })
      .catch(function () {
        return [];
      });
  }

  function renderSearch(items) {
    var box = document.getElementById('gk-mb-results');
    if (!box) return;

    if (!items.length) {
      box.innerHTML = `<div class="gk-mb-muted">Ingen treff (eller siden endret HTML).</div>`;
      return;
    }

    box.innerHTML = items.slice(0, 12).map(function (p) {
      return `
        <div class="gk-mb-item">
          <div class="gk-mb-left">
            ${p.image ? `<img class="gk-mb-img" src="${esc(p.image)}" alt="" />` : `<span class="gk-mb-img"></span>`}
            <a class="gk-mb-title" href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.title)}</a>
          </div>
          <button class="gk-mb-btn secondary" data-add="${esc(p.href)}">Legg til</button>
        </div>
      `;
    }).join('');

    box.querySelectorAll('button[data-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        var href = b.getAttribute('data-add');
        var item = items.find(function (x) { return x.href === href; });
        if (item) addToBag(item);
      });
    });
  }

  function doSearch(q) {
    if (!q || q.length < 2) { setMsg('Skriv minst 2 tegn…'); return; }
    state.q = q;
    setMsg('Søker…');
    fetchSearch(q).then(function (items) {
      state.searchItems = items || [];
      setMsg('Fant ' + (state.searchItems.length || 0) + ' produkter.');
      renderSearch(state.searchItems);
    });
  }

  // ---- Bag logic ----
  function addToBag(item) {
    var exists = state.bag.some(function (x) { return x.href === item.href; });
    if (exists) return;

    var entry = {
      id: item.id || '',
      title: item.title,
      href: item.href,
      image: item.image || '',
      added_at: new Date().toISOString(),
      flight: item.flight || null
    };

    state.bag.unshift(entry);
    saveLocalBag(state.bag);
    renderBag();
    computeRecos();
    renderMap();
    bumpPopularity(entry);

    if (state.isLoggedIn) {
      saveRemoteBag(state.bag).then(function () {
        loadTop3();
      });
    }
  }

  function removeFromBag(href) {
    state.bag = state.bag.filter(function (x) { return x.href !== href; });
    saveLocalBag(state.bag);
    renderBag();
    computeRecos();
    renderMap();
    if (state.isLoggedIn) saveRemoteBag(state.bag);
  }

  function renderBag() {
    var box = document.getElementById('gk-mb-bag');
    if (!box) return;

    if (!state.bag.length) {
      box.innerHTML = `<div class="gk-mb-muted">Ingen discer lagt til enda.</div>`;
      return;
    }

    box.innerHTML = state.bag.map(function (p) {
      return `
        <div class="gk-mb-item">
          <div class="gk-mb-left">
            ${p.image ? `<img class="gk-mb-img" src="${esc(p.image)}" alt="" />` : `<span class="gk-mb-img"></span>`}
            <a class="gk-mb-title" href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.title)}</a>
            ${p.flight ? `<span class="gk-mb-pill">${esc(p.flight)}</span>` : ``}
          </div>
          <button class="gk-mb-btn secondary" data-remove="${esc(p.href)}">Fjern</button>
        </div>
      `;
    }).join('');

    box.querySelectorAll('button[data-remove]').forEach(function (b) {
      b.addEventListener('click', function () {
        removeFromBag(b.getAttribute('data-remove'));
      });
    });
  }

  // ---- Recommendations (enkelt regelsett – kan bygges videre) ----
  function computeRecos() {
    var el = document.getElementById('gk-mb-recos');
    if (!el) return;

    if (state.bag.length < 2) {
      el.textContent = 'Legg til noen discer så kan jeg foreslå hull i baggen din.';
      return;
    }

    var txt = state.bag.map(function (x) { return (x.title || '').toLowerCase(); }).join(' ');
    var hasPutter = /putter|p2|aviar|judge|pure|pa-/.test(txt);
    var hasMid = /mid|buzzz|roc|md|truth|hex|origin|fuse/.test(txt);
    var hasFair = /fairway|teebird|fd|essence|leopard|river|explorer/.test(txt);
    var hasDist = /destroyer|wraith|dd3|shryke|distance|ballista|nuke/.test(txt);

    var recos = [];
    if (!hasPutter) recos.push('Mangler en putter du stoler på (rett/lett understabil).');
    if (!hasMid) recos.push('Mangler en stabil midrange (typ Buzzz/Hex-rollen).');
    if (!hasFair) recos.push('Mangler en kontrollerbar fairway (rett til litt understabil).');
    if (!hasDist) recos.push('Mangler en distance-driver (kun om du har farten til det).');

    el.innerHTML = recos.length
      ? '<ul style="margin:8px 0 0 18px;">' + recos.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>'
      : '<div class="gk-mb-muted">Ser ganske komplett ut! 🔥 (vi kan fin-tune med flight-data)</div>';
  }

  // ---- Bag-map ----
  function renderMap() {
    var map = document.getElementById('gk-mb-map');
    var tip = document.getElementById('gk-mb-tip');
    if (!map || !tip) return;

    map.innerHTML = '';
    tip.style.display = 'none';

    if (!state.bag.length) return;

    state.bag.forEach(function (d) {
      var xy = flightToXY(d.flight);
      var dot = document.createElement('div');
      dot.className = 'gk-mb-dot';
      dot.style.left = (xy.x * 100) + '%';
      dot.style.top = (xy.y * 100) + '%';
      map.appendChild(dot);

      dot.addEventListener('mouseenter', function () {
        tip.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">' + esc(d.title || '') + '</div>'
          + (d.flight ? '<div class="gk-mb-muted">Flight: ' + esc(d.flight) + '</div>' : '<div class="gk-mb-muted">Flight-data ikke satt</div>');
        tip.style.display = 'block';
      });
      dot.addEventListener('mousemove', function (e) {
        var rect = map.getBoundingClientRect();
        tip.style.left = (e.clientX - rect.left + 12) + 'px';
        tip.style.top = (e.clientY - rect.top + 12) + 'px';
      });
      dot.addEventListener('mouseleave', function () {
        tip.style.display = 'none';
      });
      dot.addEventListener('click', function () {
        window.open(d.href, '_blank', 'noopener');
      });
    });
  }

  function flightToXY(f) {
    if (!f) return { x: 0.5, y: 0.55 };
    var m = String(f).match(/(-?\d+(\.\d+)?)/g);
    if (!m || m.length < 4) return { x: 0.5, y: 0.55 };
    var speed = parseFloat(m[0]);
    var turn = parseFloat(m[2]);
    var fade = parseFloat(m[3]);

    var stability = (-turn) + fade;
    var x = (stability - 0) / (8 - 0);
    x = Math.max(0.05, Math.min(0.95, x));

    var y = 1 - ((speed - 1) / (14 - 1));
    y = Math.max(0.05, Math.min(0.95, y));
    return { x: x, y: y };
  }

  // ---- Boot ----
  function boot() {
    renderShell();

    var a = readAuthMarker();
    state.isLoggedIn = a.isLoggedIn;
    state.userId = a.userId;

    state.bag = loadLocalBag();
    renderBag();
    computeRecos();
    renderMap();

    ensureSupabaseLoaded().then(function () {
      if (state.isLoggedIn && state.supa && state.userId) {
        loadRemoteBag().then(function (remoteBag) {
          if (Array.isArray(remoteBag) && remoteBag.length) {
            state.bag = remoteBag;
            saveLocalBag(state.bag);
            renderBag();
            computeRecos();
            renderMap();
          }
          loadTop3();
        });
      } else {
        loadTop3();
      }
    });

    console.log('[MINBAGG] loaded OK');
  }

  boot();
})();
