/* ============================================================================
   GOLFKONGEN – MIN BAG V2 TEST
   Fil: min-bagg.js
   Steg: Test Supabase Auth + minbag_ensure_user()
   ============================================================================ */

(function () {
  'use strict';

  var VERSION = '2026-06-09.1-test';

  var SUPABASE_URL = 'https://fwztrnxhfvrlceicctlv.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3enRybnhoZnZybGNlaWNjdGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTgwMjYsImV4cCI6MjA5NTI5NDAyNn0.q4QthdBWEtUi_Fdz_Ge88E_5CpJMtUvjWhMAa0R0zmE';

  var ROOT_ID = 'min-bag-root';
  var SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  var root = null;
  var supabaseClient = null;

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

  function injectCss() {
    if (document.getElementById('gk-minbag-v2-css')) return;

    var style = document.createElement('style');
    style.id = 'gk-minbag-v2-css';
    style.textContent =
      '#min-bag-root{max-width:980px;margin:0 auto;padding:20px 14px;color:#fff;font-family:inherit;}' +
      '.gkmb-card{border:1px solid rgba(34,197,94,.28);background:linear-gradient(135deg,#061109,#102719 60%,#07140d);border-radius:24px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);}' +
      '.gkmb-eyebrow{display:inline-flex;padding:6px 10px;border-radius:999px;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#b8ffd0;margin-bottom:12px;}' +
      '.gkmb-card h1{font-size:clamp(34px,7vw,60px);line-height:.95;margin:0 0 10px;font-weight:1000;letter-spacing:-.05em;}' +
      '.gkmb-card p{color:rgba(255,255,255,.75);line-height:1.55;margin:0 0 14px;}' +
      '.gkmb-box{margin-top:14px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.07);border-radius:18px;padding:14px;}' +
      '.gkmb-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}' +
      '.gkmb-input{min-height:44px;flex:1;min-width:240px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.28);color:#fff;padding:11px 13px;outline:none;}' +
      '.gkmb-input:focus{border-color:rgba(34,197,94,.7);box-shadow:0 0 0 3px rgba(34,197,94,.13);}' +
      '.gkmb-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;color:#fff;background:linear-gradient(135deg,#22c55e,#15803d);}' +
      '.gkmb-btn.secondary{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);}' +
      '.gkmb-status{margin-top:14px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.13);color:rgba(255,255,255,.86);font-weight:800;}' +
      '.gkmb-status.ok{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.35);}' +
      '.gkmb-status.err{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35);}' +
      '.gkmb-small{font-size:13px;color:rgba(255,255,255,.65);margin-top:10px;}' +
      '.gkmb-data{font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.30);border-radius:14px;padding:12px;margin-top:10px;color:#b8ffd0;}';

    document.head.appendChild(style);
  }

  function setStatus(text, type) {
    var box = document.getElementById('gkmb-status');
    if (!box) return;
    box.className = 'gkmb-status' + (type ? ' ' + type : '');
    box.textContent = text || '';
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

  function renderBase() {
    clear(root);

    var card = el('section', 'gkmb-card');

    card.appendChild(el('div', 'gkmb-eyebrow', 'GolfKongen verktøy'));
    card.appendChild(el('h1', '', 'Min bag'));
    card.appendChild(el('p', '', 'Dette er første test av ny og trygg Min bag. Her tester vi bare innlogging og oppretting av standardbag.'));

    var loginBox = el('div', 'gkmb-box');
    loginBox.id = 'gkmb-login-box';

    var row = el('div', 'gkmb-row');

    var input = el('input', 'gkmb-input');
    input.type = 'email';
    input.placeholder = 'Din e-postadresse';
    input.id = 'gkmb-email';

    var loginBtn = el('button', 'gkmb-btn', 'Send innloggingslenke');
    loginBtn.type = 'button';
    loginBtn.onclick = sendMagicLink;

    row.appendChild(input);
    row.appendChild(loginBtn);

    loginBox.appendChild(row);
    loginBox.appendChild(el('div', 'gkmb-small', 'Du får en e-post med innloggingslenke. Etter innlogging kommer du tilbake til denne siden.'));
    card.appendChild(loginBox);

    var appBox = el('div', 'gkmb-box');
    appBox.id = 'gkmb-app-box';
    appBox.style.display = 'none';

    var userInfo = el('div', '', '');
    userInfo.id = 'gkmb-user-info';
    appBox.appendChild(userInfo);

    var ensureBtn = el('button', 'gkmb-btn', 'Test/opprett Min bag');
    ensureBtn.type = 'button';
    ensureBtn.onclick = ensureUser;
    appBox.appendChild(ensureBtn);

    var logoutBtn = el('button', 'gkmb-btn secondary', 'Logg ut');
    logoutBtn.type = 'button';
    logoutBtn.style.marginLeft = '8px';
    logoutBtn.onclick = logout;
    appBox.appendChild(logoutBtn);

    var data = el('div', 'gkmb-data', '');
    data.id = 'gkmb-data';
    data.style.display = 'none';
    appBox.appendChild(data);

    card.appendChild(appBox);

    var status = el('div', 'gkmb-status', 'Laster Supabase…');
    status.id = 'gkmb-status';
    card.appendChild(status);

    root.appendChild(card);
  }

  function refreshAuthState() {
    setStatus('Sjekker innlogging…');

    supabaseClient.auth.getUser().then(function (res) {
      if (res.error) {
        setStatus('Auth-feil: ' + res.error.message, 'err');
        return;
      }

      var user = res.data ? res.data.user : null;

      if (!user) {
        showLoggedOut();
        return;
      }

      showLoggedIn(user);
    });
  }

  function showLoggedOut() {
    var loginBox = document.getElementById('gkmb-login-box');
    var appBox = document.getElementById('gkmb-app-box');

    if (loginBox) loginBox.style.display = '';
    if (appBox) appBox.style.display = 'none';

    setStatus('Ikke innlogget. Skriv inn e-post og send innloggingslenke.');
  }

  function showLoggedIn(user) {
    var loginBox = document.getElementById('gkmb-login-box');
    var appBox = document.getElementById('gkmb-app-box');
    var info = document.getElementById('gkmb-user-info');

    if (loginBox) loginBox.style.display = 'none';
    if (appBox) appBox.style.display = '';
    if (info) {
      info.innerHTML =
        '<strong>Innlogget:</strong> ' +
        (user.email || 'ukjent') +
        '<br><span class="gkmb-small">User ID: ' +
        user.id +
        '</span>';
    }

    setStatus('Innlogging OK. Nå kan du teste/opprette Min bag.', 'ok');
  }

  function sendMagicLink() {
    var input = document.getElementById('gkmb-email');
    var email = input ? String(input.value || '').trim().toLowerCase() : '';

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

  function ensureUser() {
    setStatus('Kjører minbag_ensure_user()…');

    supabaseClient.rpc('minbag_ensure_user').then(function (res) {
      if (res.error) {
        setStatus('Feil fra minbag_ensure_user: ' + res.error.message, 'err');
        return;
      }

      var dataBox = document.getElementById('gkmb-data');
      if (dataBox) {
        dataBox.style.display = 'block';
        dataBox.textContent = JSON.stringify(res.data, null, 2);
      }

      setStatus('Success! Profil og standardbag er opprettet/hentet.', 'ok');
    });
  }

  function logout() {
    setStatus('Logger ut…');

    supabaseClient.auth.signOut().then(function () {
      setStatus('Du er logget ut.');
      refreshAuthState();
    });
  }

  function boot() {
    root = document.getElementById(ROOT_ID);

    if (!root) {
      console.warn('[GK MIN BAG V2] Fant ikke #' + ROOT_ID);
      return;
    }

    injectCss();
    renderBase();

    loadSupabaseSdk()
      .then(function () {
        createClient();

        supabaseClient.auth.onAuthStateChange(function () {
          refreshAuthState();
        });

        refreshAuthState();
      })
      .catch(function (err) {
        setStatus(err.message || String(err), 'err');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
