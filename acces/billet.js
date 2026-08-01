(() => {
  const { request, ticketUrl, extractCode, renderQrWithLogo, normalizeEvenement, evenementLabel } =
    window.AccesAPI;
  const params = new URLSearchParams(window.location.search);
  const code = extractCode(params.get("code") || "");
  const queryEvent = params.get("ceremonie") || params.get("evenement") || "";
  const qrBox = document.getElementById("ticket-qr");
  const codeEl = document.getElementById("ticket-code");
  const nameEl = document.getElementById("ticket-guest-name");
  const typeEl = document.getElementById("ticket-guest-type");
  const tableEl = document.getElementById("ticket-guest-table");
  const tableRow = document.getElementById("ticket-table-row");
  const eventEl = document.getElementById("ticket-guest-event");
  const kickerEl = document.getElementById("ticket-kicker");
  const badgeEl = document.getElementById("ticket-event-badge");
  const dateEl = document.getElementById("ticket-date");
  const placeEl = document.getElementById("ticket-place");
  const statusEl = document.getElementById("ticket-status");

  function typeLabel(type) {
    if (type === "couple") return "Couple";
    if (type === "collectif") return "Collectif";
    if (type === "singleton") return "Singleton";
    return type || "—";
  }

  function applyEvenement(evenement) {
    const ev = normalizeEvenement(evenement || queryEvent);
    const isCivil = ev === "civil";
    document.body.classList.toggle("is-civil", isCivil);
    document.title = isCivil ? "Billet civil — Parfaite & Jean" : "Billet soirée — Parfaite & Jean";

    if (kickerEl) kickerEl.textContent = isCivil ? "Cérémonie civile" : "Soirée dansante";
    if (badgeEl) {
      badgeEl.hidden = !isCivil;
      badgeEl.textContent = "CIVIL";
    }
    if (dateEl) {
      dateEl.textContent = isCivil ? "10 septembre 2026 · 13h00" : "11 septembre 2026 · 18h00";
    }
    if (placeEl) {
      placeEl.textContent = isCivil
        ? "Musée national de Kinshasa"
        : "Chapiteau Imperial Strong · Kinshasa";
    }
    if (eventEl) eventEl.textContent = evenementLabel(ev);
    if (tableRow) tableRow.hidden = isCivil;
    return ev;
  }

  if (!code) {
    codeEl.textContent = "Code manquant";
    statusEl.textContent = "Ce billet est invalide";
    statusEl.classList.add("is-bad");
    applyEvenement(queryEvent);
    return;
  }

  codeEl.textContent = code;
  let evenement = applyEvenement(queryEvent);
  renderQrWithLogo(qrBox, ticketUrl(code, evenement), 200);

  request({ action: "validate", code })
    .then((data) => {
      evenement = applyEvenement(data.evenement || queryEvent);
      nameEl.textContent = data.nom || "—";
      typeEl.textContent = typeLabel(data.type);
      if (!tableRow.hidden) {
        const table = String(data.table || "").trim();
        tableEl.textContent = table ? table : "Non attribuée";
      }

      // Re-génère le QR avec le bon paramètre civil si besoin
      qrBox.innerHTML = "";
      renderQrWithLogo(qrBox, ticketUrl(code, evenement), 200);

      if (data.ok && data.canEnter) {
        statusEl.textContent = evenement === "civil" ? "Accès civil valide" : "Accès valide";
        statusEl.classList.add("is-ok");
      } else if (data.alreadyIn) {
        statusEl.textContent = "Déjà scanné à l’entrée";
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
