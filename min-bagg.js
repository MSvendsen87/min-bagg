(function () {
  // Kjør kun om root finnes
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

  function uniqBy(arr, keyFn) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = keyFn(arr[i]);
      if (!k || seen[k]) continue;
      seen[k] = 1;
      out.push(arr[i]);
    }
    return out;
  }

  function findFirstText(el, patterns) {
    if (!el) return "";
    var txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(txt)) return txt;
    }
    return "";
  }

  function parseProductsFromSearchHtml(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, "text/html");

    // Finn lenker som ser ut som produktlenker
    var a = doc.querySelectorAll('a[href*="/shop/"]');
    var items = [];

    for (var i = 0; i < a.length; i++) {
      var href = a[i].getAttribute("href") || "";
      // Filtrer vekk søk/kolleksjoner/annet støy
      if (href.indexOf("/shop/search") === 0) continue;
      if (href.indexOf("/shop/cart") === 0) continue;
      if (href.indexOf("/shop/checkout") === 0) continue;

      // Mange temaer bruker /shop/product/... eller /shop/<slug>
      // Vi tar det vi får, men krever at lenken har et "kort" rundt seg med bilde/tekst
      var card = a[i];
      // gå litt opp for å finne et kort-element
      for (var up = 0; up < 4; up++) {
        if (!card || !card.parentElement) break;
        if (card.querySelector && (card.querySelector("img") || card.querySelector("h2,h3,h4"))) break;
        card = card.parentElement;
      }

      var img = card && card.querySelector ? card.querySelector("img") : null;
      var titleEl = card && card.querySelector ? card.querySelector("h2,h3,h4,.title,.product-title") : null;

      var name = titleEl ? (titleEl.textContent || "").trim() : "";
      if (!name) {
        // fallback: bruk lenketekst
        name = (a[i].textContent || "").replace(/\s+/g, " ").trim();
      }

      // Flight-badge i ditt tema ser ut til å være en tekst som inneholder "Speed:"
      var flight = "";
      if (card) {
        flight = findFirstText(card, [/Speed:\s*\d+/i, /Glide:\s*\d+/i, /Turn:\s*[-\d]+/i, /Fade:\s*\d+/i]);
        // Hvis hele kortet har mye tekst, plukk bare badge-linjen hvis mulig
        if (flight && flight.length > 140) {
          // prøv igjen på små elementer
          var smallEls = card.querySelectorAll("span,div,p");
          for (var s = 0; s < smallEls.length; s++) {
            var t = (smallEls[s].textContent || "").replace(/\s+/g, " ").trim();
            if (/Speed:\s*\d+/i.test(t)) { flight = t; break; }
          }
        }
      }

      var imgUrl = img ? (img.getAttribute("src") || img.getAttribute("data-src") || "") : "";
      var absHref = href;
      if (absHref && absHref.indexOf("http") !== 0) {
        absHref = location.origin + (absHref.charAt(0) === "/" ? absHref : ("/" + absHref));
      }

      // Krev minimum: lenke + navn
      if (absHref && name) {
        items.push({
          href: absHref,
          name: name,
          img: imgUrl,
          flight: flight
        });
      }
    }

    // fjern duplikater på href
    items = uniqBy(items, function (x) { return x.href; });

    // Ta de første 12
    if (items.length > 12) items = items.slice(0, 12);
    return items;
  }

  function fetchSearch(q, cb) {
    // Viktig: bruk samme endpoint som du testet i Network
    var url = "/shop/search?s=" + encodeURIComponent(q);

    fetch(url, { credentials: "same-origin" })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var items = parseProductsFromSearchHtml(html);
        cb(null, items, url);
      })
      .catch(function (err) {
        cb(err || new Error("Fetch failed"), [], url);
      });
  }

  // Render UI
  root.innerHTML =
    '<div class="gk-minbagg" style="padding:16px;border:1px solid #2f2f2f;border-radius:12px;margin:16px 0;">' +
      '<h2 style="margin:0 0 10px 0;">Legg til disk (test)</h2>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '<input id="gk-mb-search" type="text" placeholder="Søk i nettbutikken (f.eks. Buzzz)" ' +
          'style="flex:1;min-width:240px;padding:10px 12px;border-radius:10px;border:1px solid #444;background:#141414;color:#fff;" />' +
        '<button id="gk-mb-clear" type="button" ' +
          'style="padding:10px 12px;border-radius:10px;border:1px solid #444;background:#1d1d1d;color:#fff;cursor:pointer;">Tøm</button>' +
      '</div>' +
      '<div id="gk-mb-status" style="margin-top:10px;opacity:.85;"></div>' +
      '<div id="gk-mb-results" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;"></div>' +
    '</div>';

  var inp = document.getElementById("gk-mb-search");
  var btnClear = document.getElementById("gk-mb-clear");
  var statusEl = document.getElementById("gk-mb-status");
  var resultsEl = document.getElementById("gk-mb-results");

  var t = null;
  function setStatus(html) { statusEl.innerHTML = html || ""; }

  function renderItems(items) {
    if (!items || !items.length) {
      resultsEl.innerHTML = "";
      return;
    }

    var html = "";
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var imgHtml = it.img
        ? '<img src="' + esc(it.img) + '" alt="' + esc(it.name) + '" style="width:100%;height:150px;object-fit:cover;border-radius:10px;background:#0f0f0f;" />'
        : '<div style="width:100%;height:150px;border-radius:10px;background:#0f0f0f;"></div>';

      var flightHtml = it.flight
        ? '<div style="margin-top:8px;font-size:12px;opacity:.9;">' + esc(it.flight) + "</div>"
        : "";

      html +=
        '<a href="' + esc(it.href) + '" style="text-decoration:none;color:inherit;">' +
          '<div style="border:1px solid #2f2f2f;border-radius:12px;padding:10px;background:#101010;">' +
            imgHtml +
            '<div style="margin-top:10px;font-weight:700;line-height:1.2;">' + esc(it.name) + "</div>" +
            flightHtml +
            '<div style="margin-top:10px;font-size:12px;opacity:.8;">Klikk for å se produkt</div>' +
          "</div>" +
        "</a>";
    }

    resultsEl.innerHTML = html;
  }

  function doSearch(q) {
    q = (q || "").trim();
    if (q.length < 2) {
      setStatus("Skriv minst 2 tegn for å søke.");
      resultsEl.innerHTML = "";
      return;
    }

    setStatus("Søker etter <b>" + esc(q) + "</b> …");
    fetchSearch(q, function (err, items, usedUrl) {
      if (err) {
        setStatus('Feil ved søk. Prøv igjen. <span style="opacity:.8;">(' + esc(String(err)) + ")</span>");
        resultsEl.innerHTML = "";
        return;
      }

      setStatus(
        'Fant <b>' + items.length + "</b> treff via <span style=\"opacity:.8;\">" + esc(usedUrl) + "</span>"
      );
      renderItems(items);
    });
  }

  inp.addEventListener("input", function () {
    if (t) clearTimeout(t);
    t = setTimeout(function () { doSearch(inp.value); }, 250);
  });

  btnClear.addEventListener("click", function () {
    inp.value = "";
    setStatus("");
    resultsEl.innerHTML = "";
    inp.focus();
  });

  setStatus("Skriv minst 2 tegn for å søke.");
  console.log("[MINBAGG] Add-disc search module loaded");
})();
