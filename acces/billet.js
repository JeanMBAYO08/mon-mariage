(() => {
  const { request, ticketUrl, extractCode, renderQrWithLogo } = window.AccesAPI;
  const params = new URLSearchParams(window.location.search);
  const code = extractCode(params.get("code") || "");
  const qrBox = document.getElementById("ticket-qr");
  const codeEl = document.getElementById("ticket-code");
  const nameEl = document.getElementById("ticket-guest-name");
  const typeEl = document.getElementById("ticket-guest-type");
  const tableEl = document.getElementById("ticket-guest-table");
  const statusEl = document.getElementById("ticket-status");

  function typeLabel(type) {
    if (type === "couple") return "Couple";
    if (type === "collectif") return "Collectif";
    if (type === "singleton") return "Singleton";
    return type || "—";
  }

  if (!code) {
    codeEl.textContent = "Code manquant";
    statusEl.textContent = "Ce billet est invalide";
    statusEl.classList.add("is-bad");
    return;
  }

  codeEl.textContent = code;
  renderQrWithLogo(qrBox, ticketUrl(code), 200);

  request({ action: "validate", code })
    .then((data) => {
      nameEl.textContent = data.nom || "—";
      typeEl.textContent = typeLabel(data.type);
      const table = String(data.table || "").trim();
      tableEl.textContent = table ? table : "Non attribuée";

      if (data.ok && data.canEnter) {
        statusEl.textContent = "Accès valide";
        statusEl.classList.add("is-ok");
      } else if (data.alreadyIn) {
        statusEl.textContent = "Déjà utilisé à l’entrée";
        statusEl.classList.add("is-bad");
      } else {
        statusEl.textContent = data.error || "Billet non reconnu";
        statusEl.classList.add("is-bad");
      }
    })
    .catch(() => {
      statusEl.textContent = "Hors ligne — présentez quand même ce QR";
    });
})();
