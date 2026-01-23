(function () {
  // Kjør kun hvis root finnes
  var root = document.getElementById("min-bagg-root");
  if (!root) return;

  // Enkel HTML-escape
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    </div>
  `;

  var input = document.getElementById("minbagg-search");
  var btn = document.getElementById("minbagg-btn");
  var results = document.getElementById("minbagg-results");

  function showMsg(msg) {
    results.innerHTML = `<div style="opacity:.8">${esc(msg)}</div>`;
  }

  function fetchSearch(q) {
    if (!q || q.length < 2) {
      showMsg("Skriv minst 2 tegn…");
      return;
    }
    showMsg("Søker…");

    var url = "/shop/search?s=" + encodeURIComponent(q);

    fetch(url, { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        // Parse HTML og plukk ut produktkort
        var doc = new DOMParser().parseFromString(html, "text/html");
        var cards = doc.querySelectorAll(".product-card, .product, .product-item, a[href*='/shop/']");
        var out = [];
        var seen = {};

        cards.forEach(function (c) {
          var a = c.tagName === "A" ? c : c.querySelector("a");
          if (!a) return;

          var href = a.getAttribute("href") || "";
          if (!href || seen[href]) return;
          seen[href] = 1;

          var titleEl = a.querySelector("h3, .title, .product-title") || a;
          var title = (titleEl.textContent || "").trim();
          if (!title) return;

          out.push({ title: title, href: href });
        });

        if (!out.length) {
          showMsg("Ingen treff.");
          return;
        }

        results.innerHTML = out.slice(0, 8).map(function (p) {
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

        // Klikk "Legg til" (foreløpig kun demo)
        results.querySelectorAll("button").forEach(function (b) {
          b.addEventListener("click", function () {
            alert("Disk lagt til (demo): " + b.getAttribute("data-title"));
          });
        });
      })
      .catch(function () {
        showMsg("Feil ved søk.");
      });
  }

  btn.addEventListener("click", function () {
    fetchSearch(input.value.trim());
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") fetchSearch(input.value.trim());
  });

  console.log("[MINBAGG] Search module loaded");
})();
