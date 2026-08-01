(() => {
  const { request, extractCode, cfg } = window.AccesAPI;
  const resultEl = document.getElementById("result");
  const statusEl = document.getElementById("result-status");
  const nameEl = document.getElementById("result-name");
  const metaEl = document.getElementById("result-meta");
  const btnCheckin = document.getElementById("btn-checkin");
  const btnNext = document.getElementById("btn-next");
  const manualInput = document.getElementById("manual-code");
  const btnManual = document.getElementById("btn-manual");

  let html5QrCode = null;
  let scanning = true;
  let currentCode = "";

  function showResult(data, mode) {
    resultEl.hidden = false;
    resultEl.classList.remove("is-ok", "is-bad");

    if (data.ok && data.canEnter) {
      resultEl.classList.add("is-ok");
      statusEl.textContent = "QR valide";
      nameEl.textContent = data.nom || "Invité";
      const tableBit = data.table ? ` · Table ${data.table}` : "";
      metaEl.textContent = `${labelType(data.type)} · ${data.personnes || 1} pers.${tableBit} · ${data.code}`;
      btnCheckin.hidden = false;
      currentCode = data.code;
      return;
    }

    resultEl.classList.add("is-bad");
    btnCheckin.hidden = true;
    statusEl.textContent = data.alreadyIn ? "Déjà entré" : data.error || "Refusé";
    nameEl.textContent = data.nom || "—";
    const tableBit = data.table ? ` · Table ${data.table}` : "";
    metaEl.textContent = data.alreadyIn
      ? `${data.code || ""}${tableBit} · Entrée : ${data.date_entree || "déjà enregistrée"}`
      : `${data.code || mode || ""}${tableBit}`;
    currentCode = "";
  }

  function labelType(type) {
    if (type === "couple") return "Couple";
    if (type === "collectif") return "Collectif";
    if (type === "singleton") return "Singleton";
    return type || "Invitation";
  }

  async function handleCode(raw) {
    const code = extractCode(raw);
    if (!code) return;

    scanning = false;
    await pauseScanner();

    statusEl.textContent = "Vérification…";
    nameEl.textContent = code;
    metaEl.textContent = "";
    resultEl.hidden = false;
    resultEl.classList.remove("is-ok", "is-bad");
    btnCheckin.hidden = true;

    try {
      const data = await request({ action: "validate", code });
      showResult(data);
    } catch (err) {
      showResult({ ok: false, error: err.message || "Erreur réseau", code });
    }
  }

  async function doCheckin() {
    if (!currentCode) return;
    btnCheckin.disabled = true;
    try {
      const data = await request({
        action: "checkin",
        code: currentCode,
      });
      if (data.ok) {
        resultEl.classList.remove("is-bad");
        resultEl.classList.add("is-ok");
        statusEl.textContent = "Entrée validée";
        nameEl.textContent = data.nom || nameEl.textContent;
        metaEl.textContent = `${labelType(data.type)} · ${data.personnes || 1} pers. · ${data.date_entree || ""}`;
        btnCheckin.hidden = true;
      } else {
        showResult(data);
      }
    } catch (err) {
      showResult({ ok: false, error: err.message || "Erreur check-in", code: currentCode });
    } finally {
      btnCheckin.disabled = false;
    }
  }

  async function startScanner() {
    if (!window.Html5Qrcode) return;
    html5QrCode = new Html5Qrcode("reader");
    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (!scanning) return;
          handleCode(decoded);
        },
        () => {}
      );
    } catch (err) {
      document.querySelector(".hint").textContent =
        "Caméra indisponible. Utilisez la saisie manuelle du code.";
    }
  }

  async function pauseScanner() {
    if (!html5QrCode) return;
    try {
      await html5QrCode.pause(true);
    } catch {
      // ignore
    }
  }

  async function resumeScanner() {
    resultEl.hidden = true;
    btnCheckin.hidden = true;
    currentCode = "";
    scanning = true;
    if (!html5QrCode) return;
    try {
      await html5QrCode.resume();
    } catch {
      // ignore
    }
  }

  btnManual.addEventListener("click", () => handleCode(manualInput.value));
  manualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCode(manualInput.value);
    }
  });
  btnCheckin.addEventListener("click", doCheckin);
  btnNext.addEventListener("click", resumeScanner);

  startScanner();
})();
