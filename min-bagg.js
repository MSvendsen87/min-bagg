/* ========================================================================
   GOLFKONGEN – MIN BAG (min-bagg.js) – v2026-02-21
   ES5-compatible (NO async/await). Multi-bag via mybag_bags.bag_json + selected_bag.
   Failsafe: legacy column mybag_bags.bag is kept as ARRAY of active bag discs.
   ======================================================================== */

(function () {
  'use strict';

  // -------------------- Helpers --------------------
  function log() { try { console.log.apply(console, arguments); } catch(e){} }
  function warn() { try { console.warn.apply(console, arguments); } catch(e){} }
  function err() { try { console.error.apply(console, arguments); } catch(e){} }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = txt;
    return n;
  }
  function safeStr(x) { return (x === null || x === undefined) ? '' : String(x); }
  function uniqId(prefix) { return (prefix||'id') + '_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16); }

  function jsonClone(x) { return JSON.parse(JSON.stringify(x)); }

  function groupBy(arr, keyFn) {
    var m = {};
    for (var i=0;i<arr.length;i++) {
      var k = keyFn(arr[i]);
      if (!m[k]) m[k] = [];
      m[k].push(arr[i]);
    }
    return m;
  }

  function typeFromUrl(url) {
    var u = safeStr(url);
    if (u.indexOf('/discgolf/disc-putter') === 0) return 'putter';
    if (u.indexOf('/discgolf/midrange') === 0) return 'midrange';
    if (u.indexOf('/discgolf/fairway-driver') === 0) return 'fairway';
    if (u.indexOf('/discgolf/driver') === 0) return 'distance';
    return '';
  }

  function typeLabel(t) {
    if (t === 'putter') return 'Putter';
    if (t === 'midrange') return 'Midrange';
    if (t === 'fairway') return 'Fairway';
    if (t === 'distance') return 'Distance';
    return 'Ukjent';
  }

  function normalizeBagRow(row) {
    // row from mybag_bags (may be null)
    var out = {
      bags: {},
      activeBagId: 'default'
    };
    if (!row) return out;

    var bag_json = row.bag_json;
    var selected = row.selected_bag || 'default';
    out.activeBagId = selected;

    // Support old formats:
    // - legacy bag array stored in row.bag
    // - bag_json.bags map
    if (bag_json && typeof bag_json === 'object' && bag_json.bags && typeof bag_json.bags === 'object') {
      out.bags = bag_json.bags;
    } else {
      out.bags = {};
    }

    if (!out.bags.default) {
      out.bags.default = {
        name: 'Min bag',
        createdAt: (new Date()).toISOString(),
        items: {
          discs: [],
          bagInfo: {},
          profile: {}
        }
      };
    }

    // Ensure active exists
    if (!out.bags[out.activeBagId]) out.activeBagId = 'default';
    if (!out.bags[out.activeBagId]) out.bags[out.activeBagId] = jsonClone(out.bags.default);

    // If active bag missing discs, try hydrate from legacy
    var legacy = row.bag;
    if (legacy && typeof legacy === 'object' && Array.isArray(legacy.discs)) legacy = legacy.discs; // tolerate wrong legacy
    if (!out.bags[out.activeBagId].items || typeof out.bags[out.activeBagId].items !== 'object') out.bags[out.activeBagId].items = {};
    if (!Array.isArray(out.bags[out.activeBagId].items.discs)) {
      out.bags[out.activeBagId].items.discs = Array.isArray(legacy) ? legacy : [];
    }

    // Ensure other keys exist
    if (!out.bags[out.activeBagId].items.bagInfo || typeof out.bags[out.activeBagId].items.bagInfo !== 'object') out.bags[out.activeBagId].items.bagInfo = {};
    if (!out.bags[out.activeBagId].items.profile || typeof out.bags[out.activeBagId].items.profile !== 'object') out.bags[out.activeBagId].items.profile = {};

    return out;
  }

  function getActiveBag(state) {
    if (!state.bags) state.bags = {};
    if (!state.activeBagId) state.activeBagId = 'default';
    if (!state.bags[state.activeBagId]) {
      if (!state.bags.default) {
        state.bags.default = {
          name: 'Min bag',
          createdAt: (new Date()).toISOString(),
          items: { discs: [], bagInfo: {}, profile: {} }
        };
      }
      state.activeBagId = 'default';
    }
    var bag = state.bags[state.activeBagId];
    if (!bag.items || typeof bag.items !== 'object') bag.items = { discs: [], bagInfo: {}, profile: {} };
    if (!Array.isArray(bag.items.discs)) bag.items.discs = [];
    if (!bag.items.bagInfo || typeof bag.items.bagInfo !== 'object') bag.items.bagInfo = {};
    if (!bag.items.profile || typeof bag.items.profile !== 'object') bag.items.profile = {};
    return bag;
  }

  // -------------------- Supabase --------------------
  function ensureSupabaseClient() {
    return new Promise(function (resolve, reject) {
      try {
        var url = window.GK_SUPABASE_URL;
        var key = window.GK_SUPABASE_ANON_KEY;
        if (!url || !key) return reject(new Error('Mangler GK_SUPABASE_URL eller GK_SUPABASE_ANON_KEY.'));
        if (!window.supabase || !window.supabase.createClient) {
          return reject(new Error('Supabase SDK er ikke lastet (window.supabase.createClient mangler).'));
        }
        var client = window.supabase.createClient(url, key);
        resolve(client);
      } catch (e) {
        reject(e);
      }
    });
  }

  function getLoggedInEmail(supa) {
    // returns Promise<string|null>
    return supa.auth.getUser().then(function (res) {
      var user = res && res.data && res.data.user;
      return user && user.email ? user.email : null;
    });
  }

  function signInMagicLink(supa, email) {
    var redirectTo = location.origin + '/sider/min-bag';
    return supa.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo } });
  }

  // -------------------- DB (multi-bag) --------------------
  function dbLoad(supa, email) {
    return supa
      .from('mybag_bags')
      .select('email, bag, bag_json, selected_bag, updated_at')
      .eq('email', email)
      .maybeSingle()
      .then(function (res) {
        if (res && res.error) throw res.error;
        return res && res.data ? res.data : null;
      });
  }

  function dbSave(supa, email, state) {
    var active = getActiveBag(state);
    var legacyArray = Array.isArray(active.items.discs) ? active.items.discs : [];
    var payload = {
      email: email,
      bag: legacyArray, // failsafe
      bag_json: { bags: state.bags },
      selected_bag: state.activeBagId,
      updated_at: new Date().toISOString()
    };
    return supa.from('mybag_bags')
      .upsert(payload, { onConflict: 'email' })
      .select('email, selected_bag, bag_json')
      .then(function (res) {
        if (res && res.error) throw res.error;
        return res;
      });
  }

  // -------------------- Popular Top 3 --------------------
  function fetchPopular(supa) {
    // Uses view mybag_popular (public SELECT) if present
    return supa.from('mybag_popular').select('*').limit(200).then(function (res) {
      if (res && res.error) throw res.error;
      return (res && res.data) ? res.data : [];
    });
  }

  function pickTop3ByType(rows) {
    // Expect rows with fields like type/name/count/product_url/image_url
    // We normalize best-effort.
    var cleaned = [];
    for (var i=0;i<rows.length;i++) {
      var r = rows[i] || {};
      var t = safeStr(r.type || r.p_type || r.disc_type || '').toLowerCase();
      var n = safeStr(r.name || r.p_name || r.disc_name || '');
      var c = Number(r.count || r.cnt || r.times || 0) || 0;
      var u = safeStr(r.product_url || r.url || r.p_url || '');
      var img = safeStr(r.image_url || r.image || r.p_image || '');
      if (!t || !n) continue;
      cleaned.push({ type: t, name: n, count: c, url: u, image: img });
    }
    // group and sort
    var byT = groupBy(cleaned, function (x) { return x.type; });
    var out = {};
    Object.keys(byT).forEach(function (t2) {
      var arr = byT[t2].slice();
      arr.sort(function (a,b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
      out[t2] = arr.slice(0,3);
    });
    return out;
  }

  // -------------------- UI --------------------
  function mountStyles() {
    if (qs('#minbag-style')) return;
    var st = el('style', '');
    st.id = 'minbag-style';
    st.textContent = [
      '#min-bag-root .minbag-wrap{max-width:980px;margin:0 auto;padding:18px 12px;font-family:inherit;}',
      '#min-bag-root .minbag-card{background:#111;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;margin:10px 0;color:#eee;}',
      '#min-bag-root .minbag-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}',
      '#min-bag-root .minbag-title{font-size:20px;font-weight:700;margin:0 0 6px 0;}',
      '#min-bag-root .minbag-muted{opacity:.8;font-size:13px;}',
      '#min-bag-root .minbag-btn{background:#1f8f3a;color:#fff;border:0;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer;}',
      '#min-bag-root .minbag-btn.secondary{background:rgba(255,255,255,.12);}',
      '#min-bag-root .minbag-input{width:260px;max-width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0b0b0b;color:#fff;}',
      '#min-bag-root .minbag-select{padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0b0b0b;color:#fff;}',
      '#min-bag-root .minbag-hr{height:1px;background:rgba(255,255,255,.08);margin:12px 0;}',
      '#min-bag-root .minbag-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}',
      '#min-bag-root .minbag-item{display:flex;gap:10px;align-items:center;}',
      '#min-bag-root .minbag-thumb{width:54px;height:54px;border-radius:10px;object-fit:cover;background:#000;border:1px solid rgba(255,255,255,.08);}',
      '#min-bag-root .minbag-name{font-weight:800;font-size:14px;line-height:1.2;}',
      '#min-bag-root .minbag-sub{opacity:.8;font-size:12px;}',
      '#min-bag-root .minbag-actions{margin-left:auto;display:flex;gap:8px;}',
      '#min-bag-root .minbag-link{color:#8ff0a4;text-decoration:underline;cursor:pointer;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function render(root, ctx) {
    root.innerHTML = '';
    mountStyles();

    var wrap = el('div', 'minbag-wrap');
    root.appendChild(wrap);

    // Header card
    var head = el('div', 'minbag-card');
    wrap.appendChild(head);

    head.appendChild(el('div', 'minbag-title', 'Min bag'));
    head.appendChild(el('div', 'minbag-muted', 'Lag og vedlikehold discgolf-sekken din. Logg inn med magic link for å lagre.'));

    head.appendChild(el('div', 'minbag-hr'));

    var row = el('div', 'minbag-row');
    head.appendChild(row);

    if (!ctx.email) {
      var inp = el('input', 'minbag-input');
      inp.type = 'email';
      inp.placeholder = 'E-post';
      row.appendChild(inp);

      var btn = el('button', 'minbag-btn', 'Send magic link');
      row.appendChild(btn);

      var msg = el('div', 'minbag-muted', '');
      msg.style.marginTop = '8px';
      head.appendChild(msg);

      btn.addEventListener('click', function () {
        var e = safeStr(inp.value).trim();
        if (!e) { msg.textContent = 'Skriv inn e-post.'; return; }
        msg.textContent = 'Sender…';
        ctx.supaReady().then(function (supa) {
          return signInMagicLink(supa, e);
        }).then(function (res) {
          if (res && res.error) throw res.error;
          msg.textContent = 'Sjekk e-posten din og trykk på linken for å fullføre innloggingen.';
        }).catch(function (e2) {
          msg.textContent = 'Feil: ' + (e2 && e2.message ? e2.message : String(e2));
        });
      });
    } else {
      row.appendChild(el('div', 'minbag-muted', 'Innlogget som: ' + ctx.email));

      var sel = el('select', 'minbag-select');
      var bagIds = Object.keys(ctx.state.bags || {});

      if (bagIds.indexOf('default') === -1) bagIds.unshift('default');

      for (var i=0;i<bagIds.length;i++) {
        var id = bagIds[i];
        var bag = ctx.state.bags[id];
        var name = (bag && bag.name) ? bag.name : id;
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name + ' (' + id + ')';
        if (id === ctx.state.activeBagId) opt.selected = true;
        sel.appendChild(opt);
      }
      row.appendChild(sel);

      var btnNew = el('button', 'minbag-btn secondary', 'Ny bag');
      row.appendChild(btnNew);

      var msg2 = el('div', 'minbag-muted', '');
      msg2.style.marginTop = '8px';
      head.appendChild(msg2);

      sel.addEventListener('change', function () {
        var id2 = sel.value;
        if (!ctx.state.bags[id2]) return;
        ctx.state.activeBagId = id2;
        msg2.textContent = 'Bytter…';
        ctx.supaReady().then(function (supa) {
          return dbSave(supa, ctx.email, ctx.state);
        }).then(function () {
          msg2.textContent = '';
          ctx.refresh();
        }).catch(function (e3) {
          msg2.textContent = 'Feil: ' + (e3 && e3.message ? e3.message : String(e3));
        });
      });

      btnNew.addEventListener('click', function () {
        var newId = uniqId('bag').slice(0,12);
        ctx.state.bags[newId] = {
          name: 'Ny bag',
          createdAt: (new Date()).toISOString(),
          items: { discs: [], bagInfo: {}, profile: {} }
        };
        ctx.state.activeBagId = newId;
        msg2.textContent = 'Oppretter…';
        ctx.supaReady().then(function (supa) {
          return dbSave(supa, ctx.email, ctx.state);
        }).then(function () {
          msg2.textContent = '';
          ctx.refresh();
        }).catch(function (e4) {
          msg2.textContent = 'Feil: ' + (e4 && e4.message ? e4.message : String(e4));
        });
      });
    }

    // Bag card
    var bagCard = el('div', 'minbag-card');
    wrap.appendChild(bagCard);

    var activeBag = getActiveBag(ctx.state);
    bagCard.appendChild(el('div', 'minbag-title', (ctx.email ? ('Aktiv bag: ' + safeStr(activeBag.name || 'Min bag')) : 'Din bag (demo)')));

    var discs = activeBag.items.discs || [];
    bagCard.appendChild(el('div', 'minbag-muted', 'Disker: ' + discs.length));
    bagCard.appendChild(el('div', 'minbag-hr'));

    if (discs.length === 0) {
      bagCard.appendChild(el('div', 'minbag-muted', ctx.email ? 'Tom bag – legg til disker fra produktsider eller senere via kategori-knapper.' : 'Logg inn for å se din lagrede sekk.'));
    } else {
      var grid = el('div', 'minbag-grid');
      bagCard.appendChild(grid);

      discs.forEach(function (d, idx) {
        var card = el('div', 'minbag-card');
        card.style.margin = '0';
        card.style.padding = '12px';

        var it = el('div', 'minbag-item');
        var img = el('img', 'minbag-thumb');
        img.src = d.image || '';
        img.alt = '';
        img.loading = 'lazy';
        if (!img.src) img.style.display = 'none';
        it.appendChild(img);

        var meta = el('div', '');
        meta.appendChild(el('div', 'minbag-name', safeStr(d.name || '')));
        var t = d.type || typeFromUrl(d.url) || '';
        meta.appendChild(el('div', 'minbag-sub', typeLabel(t)));
        meta.appendChild(el('div', 'minbag-sub', safeStr(d.url || '')));
        it.appendChild(meta);

        var actions = el('div', 'minbag-actions');
        var rm = el('button', 'minbag-btn secondary', 'Fjern');
        actions.appendChild(rm);
        it.appendChild(actions);

        rm.addEventListener('click', function () {
          activeBag.items.discs.splice(idx, 1);
          activeBag.items.discs.forEach(function(x) {
            if (!x.type) x.type = typeFromUrl(x.url) || x.type || '';
          });

          if (!ctx.email) { ctx.refresh(); return; }
          ctx.supaReady().then(function (supa) {
            return dbSave(supa, ctx.email, ctx.state);
          }).then(function () {
            ctx.refresh();
          }).catch(function (e5) {
            alert('Kunne ikke lagre: ' + (e5 && e5.message ? e5.message : String(e5)));
          });
        });

        card.appendChild(it);
        grid.appendChild(card);
      });
    }

    // Top 3 card (always show)
    var top = el('div', 'minbag-card');
    wrap.appendChild(top);
    top.appendChild(el('div', 'minbag-title', 'Topp 3 globalt'));
    var topMsg = el('div', 'minbag-muted', 'Laster…');
    top.appendChild(topMsg);

    ctx.supaReady().then(function (supa) {
      return fetchPopular(supa);
    }).then(function (rows) {
      var top3 = pickTop3ByType(rows || []);
      top.innerHTML = '';
      top.appendChild(el('div', 'minbag-title', 'Topp 3 globalt'));

      var any = false;
      ['putter','midrange','fairway','distance'].forEach(function (t2) {
        var arr = top3[t2] || [];
        if (!arr.length) return;
        any = true;

        var sec = el('div', '');
        sec.style.marginTop = '10px';
        sec.appendChild(el('div', 'minbag-name', typeLabel(t2)));

        arr.forEach(function (x) {
          var row2 = el('div', 'minbag-item');
          row2.style.marginTop = '8px';

          var img2 = el('img', 'minbag-thumb');
          img2.src = x.image || '';
          img2.alt = '';
          img2.loading = 'lazy';
          if (!img2.src) img2.style.display = 'none';
          row2.appendChild(img2);

          var m2 = el('div', '');
          m2.appendChild(el('div', 'minbag-name', x.name));
          m2.appendChild(el('div', 'minbag-sub', 'Valgt ' + (x.count || 0) + ' ganger'));
          if (x.url) {
            var a = el('a', 'minbag-link', 'Se produkt');
            a.href = x.url;
            a.target = '_blank';
            a.rel = 'noopener';
            m2.appendChild(a);
          }
          row2.appendChild(m2);
          sec.appendChild(row2);
        });

        top.appendChild(sec);
      });

      if (!any) {
        top.appendChild(el('div', 'minbag-muted', 'Ingen data ennå.'));
      }
    }).catch(function (e6) {
      topMsg.textContent = 'Kunne ikke laste topp 3: ' + (e6 && e6.message ? e6.message : String(e6));
    });

    var foot = el('div', 'minbag-muted', 'v2026-02-21 • Min bag');
    foot.style.textAlign = 'center';
    foot.style.margin = '14px 0 6px';
    wrap.appendChild(foot);
  }

  // -------------------- Boot --------------------
  function boot() {
    var root = document.getElementById('min-bag-root');
    if (!root) {
      warn('[MINBAG] root missing (#min-bag-root)');
      return;
    }

    var state = {
      bags: { default: { name:'Min bag', createdAt:(new Date()).toISOString(), items:{ discs:[], bagInfo:{}, profile:{} } } },
      activeBagId: 'default'
    };
    window.__MINBAGG_STATE__ = state;

    var supaPromise = null;
    function supaReady() {
      if (!supaPromise) supaPromise = ensureSupabaseClient();
      return supaPromise;
    }

    var ctx = {
      email: null,
      state: state,
      supaReady: supaReady,
      refresh: function () { render(root, ctx); }
    };

    log('[MINBAG] boot v2026-02-21');

    supaReady().then(function (supa) {
      return getLoggedInEmail(supa).then(function (email) {
        ctx.email = email;
        if (!email) { render(root, ctx); return null; }
        return dbLoad(supa, email).then(function (row) {
          var norm = normalizeBagRow(row);
          ctx.state.bags = norm.bags;
          ctx.state.activeBagId = norm.activeBagId;
          window.__MINBAGG_STATE__ = ctx.state;

          var act = getActiveBag(ctx.state);
          act.items.discs.forEach(function (d) {
            if (!d.type) d.type = typeFromUrl(d.url) || d.type || '';
          });

          render(root, ctx);
          return null;
        });
      });
    }).catch(function (e) {
      root.innerHTML = '';
      mountStyles();
      var wrap = el('div', 'minbag-wrap');
      root.appendChild(wrap);
      var c = el('div', 'minbag-card');
      c.appendChild(el('div', 'minbag-title', 'Min bag kunne ikke starte'));
      c.appendChild(el('div', 'minbag-muted', safeStr(e && e.message ? e.message : e)));
      wrap.appendChild(c);
      err('[MINBAG] fatal', e);
    });
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  } catch (e) {
    err('[MINBAG] boot error', e);
  }

})();
