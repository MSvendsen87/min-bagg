/* =========================================================
   GOLFKONGEN – MIN BAGG (FIX: ekte Supabase user før DB-kall)
   - Kjør kun på /sider/min-bagg
   - Guest: viser CTA + topp 3 globalt
   - Innlogget i butikk:
       - Hvis Supabase-session finnes: last/lagre bag i Supabase
       - Hvis ingen Supabase-session: vis “koble Min Bagg” (magic link)
   ========================================================= */

(function () {
  'use strict';

  // Kjør kun på /sider/min-bagg
  var path = ((location && location.pathname) ? location.pathname : '').replace(/\/+$/, '').toLowerCase();
  if (path !== '/sider/min-bagg') return;

  if (window.__MINBAGG_APP_RUNNING__) return;
  window.__MINBAGG_APP_RUNNING__ = true;

  /* ------------------------------
     Konfig (fra loader / global)
  ------------------------------ */
  var SUPA_URL = (window.GK_SUPABASE_URL || '').trim();
  var SUPA_ANON = (window.GK_SUPABASE_ANON_KEY || '').trim();

  /* ------------------------------
     Utils
  ------------------------------ */
  function log() {
    try { console.log.apply(console, arguments); } catch (_) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Når vi faktisk vil ha HTML (p/ul/strong etc)
  function elHtml(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function getLoginMarker() {
    // Bruker din nye fasit-marker i Theme:
    // <span id="gk-login-marker" style="display:none"
    //   data-logged-in="1/0"
    //   data-firstname="..."
    //   data-email="... (kan være tom)">
    var m = document.getElementById('gk-login-marker');
    if (!m) return { loggedIn: false, firstname: '', email: '' };

    var ds = m.dataset || {};
    var li = (ds.loggedIn || ds.loggedin || '0') + '';
    return {
      loggedIn: li === '1',
      firstname: ds.firstname || '',
      email: ds.email || ''
    };
  }

  function ensureRoot() {
    var root = document.getElementById('min-bagg-root');
    if (!root) {
      log('[MINBAGG] root not found');
      return null;
    }
    return root;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function btn(cls, text, onClick) {
    var b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function linkBtn(cls, text, href) {
    var a = el('a', cls, text);
    a.href = href;
    return a;
  }

  function looksLikeEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load: ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ------------------------------
     Supabase client
  ------------------------------ */
  function ensureSupabaseClient() {
    if (!SUPA_URL || !SUPA_ANON) {
      return Promise.reject(new Error('Mangler GK_SUPABASE_URL / GK_SUPABASE_ANON_KEY'));
    }

    // Hvis supabase-js allerede finnes, bruk den
    if (window.supabase && window.supabase.createClient) {
      return Promise.resolve(window.supabase.createClient(SUPA_URL, SUPA_ANON));
    }

    // Last supabase-js fra CDN
    return loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js')
      .then(function () {
        if (!window.supabase || !window.supabase.createClient) {
          throw new Error('Supabase library loaded, but createClient missing');
        }
        return window.supabase.createClient(SUPA_URL, SUPA_ANON);
      });
  }

  /* ------------------------------
     Data: mybag_bags
     Forutsetter tabell med:
       - user_id (uuid) PK / unique
       - bag (jsonb)
       - updated_at (timestamp) default now()
     RLS: tillat SELECT/UPSERT for auth.uid() = user_id
  ------------------------------ */
  function dbLoadBag(supa, userId) {
    // VIKTIG: ikke kall dette uten gyldig userId
    return supa.from('mybag_bags')
  .select('bag')
  .eq('email', marker.email)
  .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data && res.data.bag) ? res.data.bag : null;
      });
  }

  function dbSaveBag(supa, userId, bag) {
    return supa.from('mybag_bags')
      .upsert({ email: marker.email, bag: bag, updated_at: new Date().toISOString() }, { onConflict: 'email' })
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      });
  }

  function loadMyDiscs(client, userId) {
    log('[MINBAGG] loading my discs for user:', userId);

    return client
      .from('mybag_user_discs')
      .select('id,type,name,product_url,image_url,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        log('[MINBAGG] my discs result:', res.data);
        return res.data || [];
      });
  }

  /* ------------------------------
     Global topp 3 (popular_discs)
  ------------------------------ */
  function fetchJson(url, headers) {
    return fetch(url, {
      method: 'GET',
      headers: headers || {}
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function loadTop3() {
    var base = SUPA_URL.replace(/\/$/, '');
    var url =
      base +
      "/rest/v1/popular_discs" +
      "?select=type,name,count,product_url,image_url" +
      "&order=count.desc" +
      "&limit=50";

    var headers = {
      apikey: SUPA_ANON,
      Authorization: 'Bearer ' + SUPA_ANON
    };

    return fetchJson(url, headers).then(function (rows) {
      var grouped = { putter: [], midrange: [], fairway: [], distance: [] };
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

    loadTop3().then(function (grouped) {
      clear(loading);
      var wrap = el('div', 'minbagg-top3-wrap');

      function renderGroup(title, items) {
        var g = el('div', 'minbagg-top3-group');
        g.appendChild(el('h3', '', title));
        if (!items || !items.length) {
          g.appendChild(el('div', 'minbagg-muted', 'Ingen data enda.'));
          return g;
        }
        items.forEach(function (it) {
          var row = el('a', 'minbagg-top3-row');
          row.href = it.product_url || '#';
          row.target = '_self';

          if (it.image_url) {
            var img = document.createElement('img');
            img.className = 'minbagg-top3-img';
            img.alt = it.name || '';
            img.src = it.image_url;
            row.appendChild(img);
          }

          var txt = el('div', 'minbagg-top3-txt');
          txt.appendChild(el('div', 'minbagg-top3-name', it.name || 'Ukjent'));
          txt.appendChild(el('div', 'minbagg-top3-count', 'Valgt ' + (it.count || 0) + ' ganger'));
          row.appendChild(txt);

          g.appendChild(row);
        });
        return g;
      }

      wrap.appendChild(renderGroup('Putter', grouped.putter));
      wrap.appendChild(renderGroup('Midrange', grouped.midrange));
      wrap.appendChild(renderGroup('Fairway', grouped.fairway));
      wrap.appendChild(renderGroup('Distance', grouped.distance));

      box.appendChild(wrap);
    }).catch(function (e) {
      loading.textContent = 'Kunne ikke laste toppliste (' + (e && e.message ? e.message : 'feil') + ').';
    });
  }

  /* ------------------------------
     UI: Guest
  ------------------------------ */
  function renderGuestView(root) {
    clear(root);

    var wrap = el('div', 'minbagg-guest');
    wrap.appendChild(el('h2', '', 'Min Bagg'));
    wrap.appendChild(el('div', 'minbagg-muted',
      'For å bruke Min Bagg og lagre baggen din må du være innlogget.'
    ));

    var actions = el('div', 'minbagg-actions');
    actions.appendChild(linkBtn('minbagg-btn minbagg-btn-primary', 'Logg inn', '/customer/login'));
    actions.appendChild(linkBtn('minbagg-btn minbagg-btn-ghost', 'Opprett konto', '/customer/register'));
    wrap.appendChild(actions);

    renderTop3(wrap);
    root.appendChild(wrap);

    log('[MINBAGG] guest detected — app will NOT load');
  }

  /* ------------------------------
     UI: “Koble Min Bagg” (Supabase magic link)
  ------------------------------ */
  function renderConnectView(root, marker, supa) {
    clear(root);

    var wrap = el('div', 'minbagg-connect');
    wrap.appendChild(el('h2', '', 'Min Bagg'));

    // Viktig: forklar “to steg” på en enkel måte (HTML i streng)
    var infoHtml =
      '<p>' +
        'Du er innlogget i nettbutikken. ' +
        'For å kunne lagre <strong>Min Bagg</strong> på tvers av enheter bruker vi en egen “kobling” mot lagringen (Supabase). ' +
        'Derfor kan du bli bedt om én ekstra innlogging med <strong>engangslink på e-post</strong>.' +
      '</p>' +
      '<ul>' +
        '<li>Dette gjøres normalt <strong>bare én gang per enhet/nettleser</strong>.</li>' +
        '<li>Etterpå blir du husket automatisk (så lenge du ikke bruker inkognito / sletter cookies/lagring).</li>' +
        '<li>Hvis du bytter mobil/PC eller nettleser, må du koble til på nytt der.</li>' +
      '</ul>' +
      '<p style="margin-top:10px; opacity:.9;">' +
        'Tips: Bruk samme e-post som kontoen din i nettbutikken.' +
      '</p>';

    wrap.appendChild(elHtml('div', 'minbagg-muted', infoHtml));

    var form = el('div', 'minbagg-connect-form');

    var email = (marker.email || '').trim();
    var emailRow = el('div', 'minbagg-row');

    var emailLabel = el('div', 'minbagg-label', 'E-post (for engangslink)');
    emailRow.appendChild(emailLabel);

    var emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.className = 'minbagg-input';
    emailInput.placeholder = 'din@epost.no';
    emailInput.value = email;
    emailRow.appendChild(emailInput);

    form.appendChild(emailRow);

    var msg = el('div', 'minbagg-muted', '');
    form.appendChild(msg);

    var actions = el('div', 'minbagg-actions');

    actions.appendChild(btn('minbagg-btn minbagg-btn-primary', 'Send engangslink', function () {
      var em = (emailInput.value || '').trim();
      if (!looksLikeEmail(em)) {
        msg.textContent = 'Skriv inn en gyldig e-postadresse.';
        return;
      }
      msg.textContent = 'Sender…';

      supa.auth.signInWithOtp({
        email: em,
        options: {
          emailRedirectTo: location.origin + '/sider/min-bagg'
        }
      }).then(function (res) {
        if (res.error) throw res.error;
        msg.textContent = 'Sjekk e-posten din og trykk på linken. Du blir sendt tilbake hit.';
      }).catch(function (e) {
        msg.textContent = 'Feil ved sending: ' + (e && e.message ? e.message : 'ukjent feil');
      });
    }));

    actions.appendChild(linkBtn('minbagg-btn minbagg-btn-ghost', 'Logg ut av butikk', '/customer/logout'));
    form.appendChild(actions);

    wrap.appendChild(form);
    renderTop3(wrap);

    root.appendChild(wrap);

    log('[MINBAGG] shop logged-in, but no Supabase session — showing connect view');
  }

  /* ------------------------------
     UI: App (minimal bag + lagring)
  ------------------------------ */
  function renderApp(root, marker, supa, userId) {
    clear(root);

    var wrap = el('div', 'minbagg-app');

    var h = el('div', 'minbagg-header');
    h.appendChild(el('h2', '', 'Min Bagg'));
    h.appendChild(el('div', 'minbagg-muted',
      'Hei ' + (marker.firstname || 'der') + ' 👋 Baggen din lagres på kontoen din.'
    ));
    wrap.appendChild(h);

    // Status + actions
    var topActions = el('div', 'minbagg-actions');
    topActions.appendChild(btn('minbagg-btn minbagg-btn-ghost', 'Koble fra (logg ut Min Bagg)', function () {
      supa.auth.signOut().then(function () {
        location.reload();
      });
    }));
    wrap.appendChild(topActions);

    // Bag UI
    var bagBox = el('div', 'minbagg-box');
    bagBox.appendChild(el('h3', '', 'Baggen din'));

    var bagList = el('div', 'minbagg-list');
    bagBox.appendChild(bagList);

    var saveMsg = el('div', 'minbagg-muted', '');
    bagBox.appendChild(saveMsg);

    wrap.appendChild(bagBox);

    // Topp 3 globalt nederst
    renderTop3(wrap);

    root.appendChild(wrap);

    var state = {
      bag: [] // enkel liste: {name, url, image}
    };

    function renderBag() {
      clear(bagList);
      if (!state.bag.length) {
        bagList.appendChild(el('div', 'minbagg-muted', 'Ingen disker lagt til enda.'));
        return;
      }

      state.bag.forEach(function (d, idx) {
        var row = el('div', 'minbagg-item');

        if (d.image) {
          var img = document.createElement('img');
          img.className = 'minbagg-item-img';
          img.src = d.image;
          img.alt = d.name || '';
          row.appendChild(img);
        }

        var mid = el('div', 'minbagg-item-mid');
        var a = el('a', 'minbagg-item-name', d.name || 'Ukjent disk');
        a.href = d.url || '#';
        a.target = '_self';
        mid.appendChild(a);
        row.appendChild(mid);

        row.appendChild(btn('minbagg-btn minbagg-btn-danger', 'Fjern', function () {
          state.bag.splice(idx, 1);
          renderBag();
          save();
        }));

        bagList.appendChild(row);
      });
    }

    function save() {
      saveMsg.textContent = 'Lagrer…';
      dbSaveBag(supa, userId, state.bag).then(function () {
        saveMsg.textContent = 'Lagret ✅';
        setTimeout(function () { saveMsg.textContent = ''; }, 1200);
      }).catch(function (e) {
        saveMsg.textContent = 'Kunne ikke lagre: ' + (e && e.message ? e.message : 'ukjent feil');
      });
    }

    // Load
    saveMsg.textContent = 'Laster…';
    dbLoadBag(supa, userId).then(function (bag) {
      state.bag = Array.isArray(bag) ? bag : [];
      renderBag();
      saveMsg.textContent = '';
    }).catch(function (e) {
      saveMsg.textContent = 'Kunne ikke laste: ' + (e && e.message ? e.message : 'ukjent feil');
    });
  }

  /* ------------------------------
     Start
  ------------------------------ */
  var root = ensureRoot();
  if (!root) return;

  var marker = getLoginMarker();

  // 1) Ikke innlogget i butikken → guest view
  if (!marker.loggedIn) {
    renderGuestView(root);
    return;
  }

  // 2) Innlogget i butikken → Supabase “connect” eller app
  ensureSupabaseClient().then(function (supa) {
    return supa.auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      var user = session && session.user ? session.user : null;

      // VIKTIG: Ingen DB-kall før user.id finnes
      if (!user || !user.id) {
        renderConnectView(root, marker, supa);
        return;
      }

      renderApp(root, marker, supa, user.id);
    });
  }).catch(function (e) {
    clear(root);
    root.appendChild(el('div', 'minbagg-muted',
      'Min Bagg feilet å starte: ' + (e && e.message ? e.message : 'ukjent feil')
    ));
    log('[MINBAGG] init error', e);
  });

})();
