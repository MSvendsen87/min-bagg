/* ==========================================================
   GOLFKONGEN – MIN BAGG (SAFE CORE)
   - Ingen top-level async/await
   - Fungerer med loader + jsDelivr pinned commit
   ========================================================== */

(function () {
  'use strict';

  try {
    var path = ((location && location.pathname) ? location.pathname : "")
      .replace(/\/+$/, "")
      .toLowerCase();

    if (path !== "/sider/min-bagg") return;
    if (window.__MINBAGG_APP_RUNNING__) return;
    window.__MINBAGG_APP_RUNNING__ = true;

    console.log("[MINBAGG] app boot");

    // ==================================================
    // CONFIG
    // ==================================================
    var SUPA_URL = (window.GK_SUPABASE_URL || "").trim();
    var SUPA_ANON = (window.GK_SUPABASE_ANON_KEY || "").trim();

    if (!SUPA_URL || !SUPA_ANON) {
      throw new Error("Missing Supabase config from loader");
    }

    // ==================================================
    // ROOT
    // ==================================================
    var root = document.getElementById("min-bagg-root");
    if (!root) throw new Error("Root missing");

    // ==================================================
    // UI HELPERS
    // ==================================================
    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    function clear(n) {
      while (n.firstChild) n.removeChild(n.firstChild);
    }

    function section(title) {
      var box = el("div", "minbagg-box");
      box.style.padding = "12px";
      box.style.border = "1px solid rgba(255,255,255,.15)";
      box.style.borderRadius = "10px";
      box.style.marginBottom = "12px";

      var h = el("h3", "", title);
      h.style.margin = "0 0 8px 0";

      box.appendChild(h);
      return box;
    }

    // ==================================================
    // SUPABASE CLIENT (MANUELL)
    // ==================================================
    function supaFetch(path, opts) {
      opts = opts || {};
      opts.headers = opts.headers || {};
      opts.headers["apikey"] = SUPA_ANON;
      opts.headers["Authorization"] = "Bearer " + SUPA_ANON;
      return fetch(SUPA_URL + "/rest/v1" + path, opts)
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) {
            throw new Error(t || r.status);
          });
          return r.json();
        });
    }

    // ==================================================
    // TOPP 3 GLOBAL
    // ==================================================
    function fetchTop3() {
      return supaFetch("/mybag_popular?select=*", {
        method: "GET"
      }).then(function (rows) {
        var by = {};
        rows.forEach(function (r) {
          var g = r.disc_group || r.category || "Discs";
          if (!by[g]) by[g] = [];
          by[g].push(r);
        });

        var out = [];
        Object.keys(by).forEach(function (g) {
          var arr = by[g]
            .sort(function (a, b) {
              return (b.count || 0) - (a.count || 0);
            })
            .slice(0, 3);
          out.push({ group: g, items: arr });
        });

        return out;
      });
    }

    function renderTop3(container, data) {
      clear(container);

      if (!data.length) {
        container.appendChild(el("div", "", "Ingen data ennå"));
        return;
      }

      data.forEach(function (grp) {
        var box = section(grp.group);
        grp.items.forEach(function (it) {
          var row = el("div", "");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.opacity = ".9";

          row.appendChild(el("span", "", it.name || it.disc_name || "Disk"));
          row.appendChild(el("span", "", "Valgt " + (it.count || 0) + " ganger"));

          box.appendChild(row);
        });
        container.appendChild(box);
      });
    }

    // ==================================================
    // RENDER
    // ==================================================
    clear(root);

    var banner = el("div", "");
    banner.textContent =
      "⚠ Under konstruksjon – denne siden er under aktiv utvikling.";
    banner.style.padding = "10px";
    banner.style.border = "1px dashed rgba(255,255,255,.3)";
    banner.style.borderRadius = "8px";
    banner.style.marginBottom = "12px";
    root.appendChild(banner);

    var topBox = section("Topp 3 globalt");
    root.appendChild(topBox);

    fetchTop3()
      .then(function (data) {
        renderTop3(topBox, data);
      })
      .catch(function (err) {
        topBox.appendChild(
          el("div", "", "Kunne ikke laste topp 3")
        );
        console.log("[MINBAGG] top3 error", err);
      });

    // ==================================================
    // READONLY MARKER
    // ==================================================
    if (window.__MINBAGG_READONLY__) {
      var info = el("div", "");
      info.style.opacity = ".8";
      info.style.marginTop = "8px";
      info.textContent =
        "Du er ikke innlogget – kun visning er aktivert.";
      root.appendChild(info);
    }

    console.log("[MINBAGG] app ready");

  } catch (err) {
    console.log("[MINBAGG] fatal", err);
    var r = document.getElementById("min-bagg-root");
    if (r) {
      r.textContent =
        "Min Bagg kunne ikke starte: " + (err && err.message || err);
    }
  }
})();
