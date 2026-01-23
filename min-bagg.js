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
      try { href = new URL(href).pathname + (new URL(href).search || ""); } catch (e) {}
    }
    return href;
  }

  // ✅ MYE mer tolerant: vi krever bare /shop/..., og filtrerer eksplisitt bort “ikke-produkt”
  function looksLikeProductUrl(path) {
    if (!path) return false;
    path = String(path).trim();

    // Fjern query/hash for sjekk
    var pure = path.split("#")[0];
    var pureNoQ = pure.split("?")[0];

    if (!pureNoQ.startsWith("/shop/")) return false;

    var low = pureNoQ.toLowerCase();

    // Blokker typiske ikke-produkt-sider
    var blockedPrefixes = [
      "/shop/search",
      "/shop/wishlist",
      "/shop/onskeliste",
      "/shop/cart",
      "/shop/kasse",
      "/shop/checkout",
      "/shop/account",
      "/shop/konto",
      "/shop/login",
      "/shop/logg",
      "/shop/categories",
      "/shop/kategorier",
      "/shop/brands",
      "/shop/merker"
    ];
    for (var i = 0; i < blockedPrefixes.length; i++) {
      if (low.indexOf(blockedPrefixes[i]) === 0) return false;
    }

    // Må ha noe etter /shop/
    var rest = pureNoQ.slice("/shop/".length);
    if (!rest || rest === "/" || rest.length < 2) return false;

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

        // Finn et scope som mest sannsynlig inneholder produkter
        var scope =
          doc.querySelector(".product-list, .products, .product-grid, .productList, [data-products], main, body") ||
          doc;

        // Finn alle shop-lenker
        var anchors = scope.querySelectorAll("a[href]");
        var out = [];
        var seen = {};

        anchors.forEach(function (a) {
          var hrefRaw = a.getAttribute("href") || "";
          if (!hrefRaw) return;

          // kun shop-lenker (relative eller absolute)
          if (hrefRaw.indexOf("/shop/") === -1 && hrefRaw.indexOf("://golfkongen.no/shop/") === -1) return;

          var href = normHref(hrefRaw);
          if (!looksLikeProductUrl(href)) return;

          // Unngå duplikater
          var key = href.split("#")[0];
          if (seen[key]) return;
          seen[key] = 1;

          // Krev at lenken ser ut som et produktkort: bilde ELLER ligger i en produkt-container
          var hasImg = !!a.querySelector("img");
          var inProductThing = !!(a.closest && a.closest(".product, .product-card, .product-item, .productCard, li, article, .card"));
          if (!hasImg && !inProductThing) return;

          var title = pickTitleFromAnchor(a);
          if (!title) return;

          // Filtrer bort tydelige ikke-produkt-tekster
          var tLow = title.toLowerCase();
          if (tLow === "ønskeliste" || tLow === "onskeliste" || tLow === "logg inn") return;

          out.push({ title: title, href: href.split("?")[0] }); // vi trenger ikke query på produktlink
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

  console.log("[MINBAGG] Search parser loaded (v2)");
})();
