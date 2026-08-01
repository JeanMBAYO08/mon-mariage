(() => {
  const cfg = window.ACCES_CONFIG || {};

  function siteBase() {
    // Billets / QR : préfère l’URL publique configurée (Render)
    if (cfg.SITE_BASE_URL) return String(cfg.SITE_BASE_URL).replace(/\/$/, "");
    if (window.location && /^https?:$/.test(window.location.protocol)) {
      const host = window.location.hostname || "";
      if (host && host !== "0.0.0.0") {
        return window.location.origin;
      }
    }
    return window.location.origin;
  }

  function apiBase() {
    // Liste / RSVP : Render central, même depuis l’admin Vercel
    if (cfg.API_BASE_URL) return String(cfg.API_BASE_URL).replace(/\/$/, "");
    const host = (window.location && window.location.hostname) || "";
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return window.location.origin;
    }
    if (cfg.SITE_BASE_URL) return String(cfg.SITE_BASE_URL).replace(/\/$/, "");
    return window.location.origin;
  }

  function ticketUrl(code) {
    return `${siteBase()}/billet.html?code=${encodeURIComponent(code)}`;
  }

  function localApiAvailable() {
    return Boolean(apiBase());
  }

  async function localRequest(path, options = {}) {
    const res = await fetch(`${apiBase()}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.ok) {
      throw new Error(data.error || `Erreur API (${res.status})`);
    }
    return data;
  }

  function buildAppsScriptUrl(params) {
    if (!cfg.WEB_APP_URL || String(cfg.WEB_APP_URL).includes("COLLER_ICI")) {
      throw new Error("Apps Script non configuré");
    }
    const url = new URL(cfg.WEB_APP_URL);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
    return url.toString();
  }

  function appsScriptRequest(params) {
    return new Promise((resolve, reject) => {
      let script;
      try {
        const callback = `pjCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error("Délai Apps Script dépassé"));
        }, 15000);

        function cleanup() {
          window.clearTimeout(timeout);
          delete window[callback];
          if (script && script.parentNode) script.parentNode.removeChild(script);
        }

        window[callback] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = buildAppsScriptUrl({ ...params, callback });
        script.onerror = () => {
          cleanup();
          reject(new Error("Impossible de joindre Google Apps Script"));
        };
        document.body.appendChild(script);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function request(params = {}) {
    const action = String(params.action || "").toLowerCase();

    // API locale prioritaire (fonctionne tout de suite avec serve-iphone.py)
    if (localApiAvailable()) {
      try {
        if (action === "ping") return localRequest("/api/ping");
        if (action === "list") return localRequest("/api/invites");
        if (action === "validate") {
          return localRequest(`/api/validate?code=${encodeURIComponent(params.code || "")}`);
        }
        if (action === "checkin") {
          return localRequest("/api/checkin", {
            method: "POST",
            body: JSON.stringify({ code: params.code || "" }),
          });
        }
        if (action === "rsvp" || action === "add") {
          return localRequest(action === "rsvp" ? "/api/rsvp" : "/api/add", {
            method: "POST",
            body: JSON.stringify({
              nom: params.nom,
              type: params.type,
              personnes: params.personnes,
              table: params.table,
              whatsapp: params.whatsapp,
              notes: params.notes,
              statut: params.statut,
            }),
          });
        }
        if (action === "update" || action === "table") {
          return localRequest("/api/update", {
            method: "POST",
            body: JSON.stringify({
              code: params.code,
              table: params.table,
              whatsapp: params.whatsapp,
              notes: params.notes,
              nom: params.nom,
            }),
          });
        }
      } catch (err) {
        // Si l’API locale échoue, on tente Apps Script
        console.warn("API locale:", err);
      }
    }

    return appsScriptRequest(params);
  }

  function extractCode(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    try {
      const url = new URL(value);
      return (url.searchParams.get("code") || value).trim().toUpperCase();
    } catch {
      if (value.includes("code=")) {
        const part = value.split("code=")[1] || "";
        return decodeURIComponent(part.split("&")[0] || "").trim().toUpperCase();
      }
      return value.toUpperCase();
    }
  }

  function renderQrWithLogo(container, text, size = 180) {
    if (!container || typeof QRCode === "undefined") return;
    container.innerHTML = "";
    container.classList.add("qr-with-logo");

    // eslint-disable-next-line no-new
    new QRCode(container, {
      text,
      width: size,
      height: size,
      correctLevel: QRCode.CorrectLevel.H,
    });

    const logo = document.createElement("img");
    logo.className = "qr-logo";
    logo.src = "images/qr-couple.jpg";
    logo.alt = "Parfaite & Jean";
    logo.decoding = "async";
    container.appendChild(logo);
  }

  function tableNames() {
    const list = Array.isArray(cfg.TABLE_NAMES) ? cfg.TABLE_NAMES : [];
    return list.map((name) => String(name || "").trim()).filter(Boolean);
  }

  function tableLabel(table) {
    const t = String(table || "").trim();
    if (!t) return "Sans table";
    if (/^\d+$/.test(t)) return `Table ${t}`;
    return `Table ${t}`;
  }

  function normalizeWhatsapp(raw) {
    let digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("00")) digits = digits.slice(2);
    // RDC local : 0821… → 243821…
    if (digits.startsWith("0") && digits.length >= 9) digits = `243${digits.slice(1)}`;
    // 9 chiffres sans indicatif → RDC par défaut
    if (digits.length === 9 && !digits.startsWith("243")) digits = `243${digits}`;
    return digits;
  }

  /** Affichage / stockage : +243XXXXXXXXX */
  function formatWhatsappIntl(raw) {
    const digits = normalizeWhatsapp(raw);
    return digits ? `+${digits}` : "";
  }

  function whatsappShareUrl(phone, text) {
    const digits = normalizeWhatsapp(phone);
    if (!digits) return "";
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  function inviteTypeLabel(type) {
    if (type === "couple") return "Couple";
    if (type === "collectif") return "Collectif";
    if (type === "singleton") return "Singleton";
    return type || "Invitation";
  }

  function guestTicketMessage(guest) {
    const url = ticketUrl(guest.code);
    const first = String(guest.nom || "invité").trim().split(/\s+/)[0] || "invité";
    const nom = String(guest.nom || "").trim() || "—";
    const type = inviteTypeLabel(guest.type);
    const table = String(guest.table || "").trim() || "Non attribuée";
    return (
      `Bonjour ${first},\n\n` +
      `Voici le lien de votre QR code d’accès à la soirée de Parfaite & Jean :\n` +
      `${url}\n\n` +
      `Nom : ${nom}\n` +
      `Type : ${type}\n` +
      `Table : ${table}\n` +
      `Code : ${guest.code}\n\n` +
      `Ouvrez le lien pour afficher votre QR.\n` +
      `À très bientôt.`
    );
  }

  function fillTableSelect(select, selected = "") {
    if (!select) return;
    const current = String(selected || "").trim();
    const names = tableNames();
    const extras = current && !names.includes(current) ? [current] : [];
    select.innerHTML = "";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "— Choisir —";
    select.appendChild(empty);

    [...names, ...extras].forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === current) option.selected = true;
      select.appendChild(option);
    });
  }

  window.AccesAPI = {
    cfg,
    siteBase,
    ticketUrl,
    request,
    extractCode,
    renderQrWithLogo,
    tableNames,
    tableLabel,
    fillTableSelect,
    normalizeWhatsapp,
    formatWhatsappIntl,
    whatsappShareUrl,
    guestTicketMessage,
  };
})();
