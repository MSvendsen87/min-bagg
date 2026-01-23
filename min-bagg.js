(function () {
  var root = document.getElementById("min-bagg-root");
  if (!root) return;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normHref(href) {
    if (!href) return "";
    href = String(href).trim();
    if (href.startsWith("http")) {
      try { href = new URL(href).pathname; } catch (e) {}
    }
    return href;
  }

  function looksLikeProductUrl(path) {
    if (!path) return false;
    // Typisk produkt: /shop/<slug> (ikke /shop/search, /shop/wishlist osv)
    if (!path.startsWith("/shop/")) return false;
    if (path.startsWith("/shop/search")) return false;
    if (path === "/shop" || path === "/shop/") return false;

    var low = path.toLowerCase();

    // Filtrer bort "ikke-produkter"
    var bad = [
      "wishlist", "onskeliste",
      "cart", "kasse", "checkout",
      "account", "konto", "login", "logg",
      "category", "kategori", "brands", "merker",
      "pages", "sider"
    ];
    for (var i = 0; i < bad.length; i++) {
      if (low.indexOf("/shop/" + bad[i]) !== -1) return false;
      if (low.indexOf(bad[i]) !== -1 && low.indexOf("/shop/") !== -1 && low.split("/").length <= 4) {
        // ekstra sikkerhet for korte "system-lenker"
        if (bad[i] === "wishlist" || bad[i] === "onskeliste") return false;
      }
    }

    // Må være “slug” (1 nivå etter /shop/)
    // /shop/slug  -> OK
    // /shop/slug/xxx -> ofte ikke produkt
    var parts = path.split("?")[0].split("#")[0].split("/").filter(Boolean);
    if (parts.length !== 2) return false; // ["shop","slug"]
    if (!parts[1] || parts[1].length < 2) return false;

    return true;
  }

  function pickTitleFromAnchor(a) {
    if (!a) return "";
    var t =
      (a.querySelector("[itemprop='name']") && a.querySelector("[itemprop='name']").textContent) ||
      (a.querySelector(".product-title") && a.querySelector(".product-title").textContent) ||
      (a.querySelector(".product-card__title") && a.querySelector(".product-card__title").textContent) ||
      (a.querySelector("h3") && a.querySelector("h3").textContent) ||
      (a.querySelector("h2") && a.querySelector("h2").textContent) ||
      a.getAttribute("title") ||
      a.textContent;

    return (t || "").replace(/\s+/g, " ").trim();
  }

  // UI
  root.innerHTML = `
    <div class="minbagg-box" style="padding:16px;border:1px solid #444;border-radius:12px;margin:16px 0;">
      <h2 style="margin:0 0 8px 0;">Min Bagg</h2>

      <div style="display:flex;gap:8px;align-items:center;">
        <input id="minbagg-search" type="text" placeholder="Søk disk i butikken (f.eks. buzzz)"
               style="flex:1;padding:8px;border-radius:8px;border:1px solid #555;background:#1f1f1f;color:#fff;">
        <button id="minbagg-btn"
                style="padding:8px 12px;border-radius:8px;border:1px solid #3a7a3a;background:#2f6f2f;color:#fff;cursor:pointer;">
          Søk
        </button>
      </div>

      <div id="minbagg-results" style="margin-top:12px;"></div>
      <div id="minbagg-debug" style="margin-top:8px;opacity:.65;font-size:12px;"></div>
    </div>
  `;

  var input = document.getElementById("minbagg-search");
  var btn = document.getElementById("minbagg-btn");
  var results = document.getElementById("minbagg-results");
  var debug = document.getElementById("minbagg-debug");

  function showMsg(msg) {
    results.innerHTML = `<div style="opacity:.85">${esc(msg)}</div>`;
  }

  function fetchSearch(q) {
    if (!q || q.length < 2) {
      showMsg("Skriv minst 2 tegn…");
      debug.textContent = "";
      return;
    }

    showMsg("Søker…");
    debug.textContent = "";

    var url = "/shop/search?s=" + encodeURIComponent(q);

    fetch(url, { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");

        // 1) Prøv å finne “produktområdet” først (grid/liste) for å unngå header/meny-lenker
        var scope =
          doc.querySelector(".product-list, .products, .product-grid, .productList, [data-products], main") ||
          doc;

        var anchors = scope.querySelectorAll("a[href^='/shop/'], a[href*='://golfkongen.no/shop/']");
        var out = [];
        var seen = {};

        anchors.forEach(function (a) {
          var href = normHref(a.getAttribute("href") || "");
          if (!looksLikeProductUrl(href)) return;

          if (seen[href]) return;
          seen[href] = 1;

          // Må “se ut som” et produktkort: har bilde eller ligger i element med product-klasse
          var hasImg = !!a.querySelector("img");
          var inProductThing = !!(a.closest && a.closest(".product, .product-card, .product-item, .productCard, li, article"));
          if (!hasImg && !inProductThing) return;

          var title = pickTitleFromAnchor(a);
          if (!title || title.toLowerCase() === "ønskeliste" || title.toLowerCase() === "onskeliste") return;

          out.push({ title: title, href: href });
        });

        debug.textContent = "Fant " + out.length + " produkter (etter filtrering).";

        if (!out.length) {
          showMsg("Ingen treff (eller siden endret HTML).");
          return;
        }

        results.innerHTML = out.slice(0, 12).map(function (p) {
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333;">
              <a href="${esc(p.href)}" target="_blank" style="color:#9ad; text-decoration:none;">
                ${esc(p.title)}
              </a>
              <button data-title="${esc(p.title)}"
                      style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#333;color:#fff;cursor:pointer;">
                Legg til
              </button>
            </div>
          `;
        }).join("");

        results.querySelectorAll("button").forEach(function (b) {
          b.addEventListener("click", function () {
            alert("Disk lagt til (demo): " + b.getAttribute("data-title"));
          });
        });
      })
      .catch(function (e) {
        showMsg("Feil ved søk.");
        debug.textContent = "Fetch error: " + (e && e.message ? e.message : String(e));
      });
  }

  btn.addEventListener("click", function () {
    fetchSearch(input.value.trim());
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") fetchSearch(input.value.trim());
  });

  console.log("[MINBAGG] Search parser loaded");
})();
