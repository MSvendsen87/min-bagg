(function () {
  var root = document.getElementById("min-bagg-root");
  if (!root) return;

  root.innerHTML = `
    <div style="padding:16px;border:1px solid #444;border-radius:12px;margin:16px 0;">
      <h2 style="margin:0 0 8px 0;">Min Bagg (GitHub-loader)</h2>
      <p style="margin:0;">✅ JS lastet fra GitHub og kjører.</p>
    </div>
  `;

  console.log("[MINBAGG] min-bagg.js loaded OK");
})();
