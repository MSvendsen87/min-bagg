/* =========================================================
   GOLFKONGEN – MIN BAGG
   Steg 4: Guest vs Logged-in + Topp 3 globalt med lenker/bilder
   Bevarer RPC / increment_popular_disc som før
   ========================================================= */

(function () {
  'use strict';

  // Kjør kun på /sider/min-bagg
  var path = (location && location.pathname || '').replace(/\/+$/, '').toLowerCase();
  if (path !== '/sider/min-bagg') return;

  if (window.__MINBAGG_LOADED__) return;
  window.__MINBAGG_LOADED__ = true;

  /* ------------------------------
     KONFIG
  ------------------------------ */
  var SUPA_URL = window.GK_SUPABASE_URL;
  var SUPA_KEY = window.GK_SUPABASE_ANON_KEY;

  if (!SUPA_URL || !SUPA_KEY) {
    console.warn('[MINBAGG] Missing Supabase config');
  }

  var root = document.getElementById('min-bagg-root');
  if (!root) {
    console.log('[MINBAGG] root not found on page');
    return;
  }

  /* ------------------------------
     HJELPERE
  ------------------------------ */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function fetchJson(url) {
    return fetch(url, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: 'Bearer ' + SUPA_KEY
      }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ------------------------------
     LOGIN-DETEKSJON (Quickbutik)
  ------------------------------ */
  function detectLogin() {
    // 1) DOM-signal: konto-ikon / "Kontoen din"
    var headerText = document.body.innerText || '';
    if (headerText.toLowerCase().indexOf('kontoen din') !== -1) return true;

    // 2) Cookie fallback
    if (document.cookie && document.cookie.match(/qb_session|quickbutik/i)) return true;

    return false;
  }

  /* ------------------------------
     Topp 3 GLOBALT
  ------------------------------ */
  function loadTop3() {
    var base = SUPA_URL.replace(/\/$/, '');
    var url =
      base +
      "/rest/v1/popular_discs" +
      "?select=type,name,count,product_url,image_url" +
      "&order=count.desc" +
      "&limit=50";

    return fetchJson(url).then(function (rows) {
      var grouped = {
        putter: [],
        midrange: [],
        fairway: [],
        distance: []
      };

      rows.forEach(function (r) {
        if (grouped[r.type]) grouped[r.type].push(r);
      });

      Object.keys(grouped).forEach(function (k) {
        grouped[k] = grouped[k].slice(0, 3);
      });

      return grouped;
    });
  }

  function renderTop3(container) {
    var box = el('div', 'minbagg-top3-box');
    box.appendChild(el('h2', '', 'Topp 3 globalt'));

    var loading = el('div', 'minbagg-loading', 'Laster toppliste…');
    box.appendChild(loading);
    container.appendChild(box);

    loadTop3()
      .then(function (groups) {
        loading.remove();

        Object.keys(groups).forEach(function (cat) {
          var list = groups[cat];
          if (!list.length) return;

          var section = el('div', 'minbagg-top3-section');
          section.appendChild(el('h3', '', cat.charAt(0).toUpperCase() + cat.slice(1)));

          list.forEach(function (d, i) {
            var row = el('div', 'minbagg-top3-row');

            var left = el('div', 'minbagg-top3-left');
            var right = el('div', 'minbagg-top3-right', String(d.count || 0));

            if (d.image_url) {
              var img = document.createElement('img');
              img.src = d.image_url;
              img.className = 'minbagg-top3-img';
              left.appendChild(img);
            }

            var name = el('span', 'minbagg-top3-name', (i + 1) + '. ' + d.name);

            if (d.product_url) {
              var a = document.createElement('a');
              a.href = d.product_url;
              a.appendChild(name);
              left.appendChild(a);
            } else {
              left.appendChild(name);
            }

            row.appendChild(left);
            row.appendChild(right);
            section.appendChild(row);
          });

          box.appendChild(section);
        });
      })
      .catch(function (e) {
        loading.innerHTML = 'Kunne ikke laste toppliste';
        console.warn('[MINBAGG] top3 error', e);
      });
  }

  /* ------------------------------
     GJESTEVISNING
  ------------------------------ */
  function renderGuestView() {
    root.innerHTML = '';

    var wrap = el('div', 'minbagg-guest-wrap');

    var cta = el(
      'div',
      'minbagg-guest-cta',
      '<h2>Bygg baggen din med GolfKongen</h2>' +
        '<p>For å starte å bygge baggen sammen med GolfKongen må du være innlogget.</p>'
    );

    var actions = el('div', 'minbagg-guest-actions');
    var loginBtn = el('a', 'minbagg-btn', 'Logg inn');
    loginBtn.href = '/kunde/login';
    var regBtn = el('a', 'minbagg-btn secondary', 'Opprett konto');
    regBtn.href = '/kunde/registrer';

    actions.appendChild(loginBtn);
    actions.appendChild(regBtn);

    cta.appendChild(actions);
    wrap.appendChild(cta);

    renderTop3(wrap);
    root.appendChild(wrap);
  }

  /* ------------------------------
     INNLOGGET VISNING
     (Beholder eksisterende app)
  ------------------------------ */
  function renderLoggedInView() {
    // Her laster vi selve appen fra GitHub (slik du allerede har)
    var s = document.createElement('script');
    s.src =
      'https://cdn.jsdelivr.net/gh/MSvendsen87/min-bagg@main/min-bagg.js?v=' +
      Date.now();
    s.defer = true;
    document.body.appendChild(s);

    console.log('[MINBAGG] logged-in app loaded');
  }

  /* ------------------------------
     START
  ------------------------------ */
  try {
    var loggedIn = detectLogin();

    if (loggedIn) {
      renderLoggedInView();
    } else {
      renderGuestView();
    }
  } catch (e) {
    console.warn('[MINBAGG] init error', e);
  }
})();
