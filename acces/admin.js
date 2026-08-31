(() => {
  const {
    request,
    ticketUrl,
    renderQrWithLogo,
    tableLabel,
    fillTableSelect,
    tableNames,
    whatsappShareUrl,
    guestTicketMessage,
    normalizeWhatsapp,
    formatWhatsappIntl,
    normalizeEvenement,
    evenementLabel,
  } = window.AccesAPI;
  const form = document.getElementById("add-form");
  const waForm = document.getElementById("wa-import-form");
  const waText = document.getElementById("wa-import-text");
  const waMsg = document.getElementById("wa-import-msg");
  const typeSelect = document.getElementById("admin-type");
  const evenementSelect = document.getElementById("admin-evenement");
  const countWrap = document.getElementById("admin-count-wrap");
  const countInput = document.getElementById("admin-count");
  const tableSelect = document.getElementById("admin-table");
  const msg = document.getElementById("add-msg");
  const grid = document.getElementById("qr-grid");
  const listStatus = document.getElementById("list-status");
  const btnRefresh = document.getElementById("btn-refresh");
  const filterTable = document.getElementById("filter-table");
  const filterEvenement = document.getElementById("filter-evenement");
  const filterType = document.getElementById("filter-type");

  let allGuests = [];
  const saveTimers = new Map();

  fillTableSelect(tableSelect);
  fillTableSelect(document.getElementById("wa-table"));

  function personnesForType(type, raw) {
    const t = String(type || "singleton").toLowerCase();
    if (t === "singleton") return 1;
    if (t === "couple") return 2;
    const n = Number(raw);
    return Number.isFinite(n) ? n : "";
  }

  function syncPersonnesField(typeEl, countWrap, countInput) {
    if (!typeEl || !countInput) return;
    const type = typeEl.value;
    const isCollectif = type === "collectif";
    if (countWrap) countWrap.hidden = false;
    countInput.required = isCollectif;
    countInput.readOnly = !isCollectif;
    countInput.min = isCollectif ? "3" : "1";
    if (isCollectif) {
      const n = Number(countInput.value);
      if (!n || n < 3) countInput.value = "";
      countInput.placeholder = "À renseigner (min. 3)";
    } else {
      countInput.placeholder = "";
      countInput.value = String(personnesForType(type));
    }
  }

  function syncCount() {
    syncPersonnesField(typeSelect, countWrap, countInput);
  }

  function syncEvenementForm() {
    const isCivil = normalizeEvenement(evenementSelect?.value) === "civil";
    const tableLabelEl = tableSelect?.closest("label");
    if (tableLabelEl) tableLabelEl.hidden = isCivil;
    if (isCivil && tableSelect) tableSelect.value = "";
  }

  typeSelect.addEventListener("change", syncCount);
  if (evenementSelect) evenementSelect.addEventListener("change", syncEvenementForm);
  syncCount();
  syncEvenementForm();

  function sortGuests(guests) {
    return [...guests].sort((a, b) => {
      const byName = String(a.nom || "").localeCompare(String(b.nom || ""), "fr", {
        sensitivity: "base",
      });
      if (byName !== 0) return byName;
      const ea = normalizeEvenement(a.evenement);
      const eb = normalizeEvenement(b.evenement);
      if (ea !== eb) return ea.localeCompare(eb, "fr");
      return String(a.code || "").localeCompare(String(b.code || ""), "fr");
    });
  }

  function fillFilterOptions(guests) {
    const current = filterTable.value || "all";
    const assigned = [
      ...new Set(guests.map((g) => String(g.table || "").trim()).filter(Boolean)),
    ];
    const ordered = [
      ...tableNames().filter((n) => assigned.includes(n)),
      ...assigned.filter((n) => !tableNames().includes(n)).sort((a, b) => a.localeCompare(b, "fr")),
    ];

    filterTable.innerHTML = "";
    const opts = [
      ["all", "Toutes"],
      ["none", "Sans table"],
      ...ordered.map((t) => [t, tableLabel(t)]),
    ];
    opts.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      filterTable.appendChild(option);
    });
    filterTable.value = opts.some(([v]) => v === current) ? current : "all";
  }

  function filteredGuests() {
    const mode = filterTable.value || "all";
    const eventMode = filterEvenement?.value || "all";
    const typeMode = filterType?.value || "all";
    let list = allGuests;
    if (eventMode !== "all") {
      list = list.filter((g) => normalizeEvenement(g.evenement) === eventMode);
    }
    if (typeMode !== "all") {
      list = list.filter((g) => String(g.type || "").toLowerCase() === typeMode);
    }
    if (mode === "all") return list;
    if (mode === "none") return list.filter((g) => !String(g.table || "").trim());
    return list.filter((g) => String(g.table || "").trim() === mode);
  }

  async function saveGuestFields(code, fields, statusEl) {
    if (statusEl) {
      statusEl.textContent = "…";
      statusEl.classList.remove("is-error", "is-ok");
    }
    try {
      const result = await request({ action: "update", code, ...fields });
      if (!result.ok) throw new Error(result.error || "Échec");
      const guest = result.guest;
      allGuests = allGuests.map((g) => (g.code === guest.code ? guest : g));
      if (statusEl) {
        statusEl.textContent = "OK";
        statusEl.classList.add("is-ok");
        window.setTimeout(() => {
          if (statusEl.textContent === "OK") statusEl.textContent = "";
        }, 1200);
      }
      fillFilterOptions(allGuests);
      return guest;
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || "Erreur";
        statusEl.classList.add("is-error");
      }
      throw err;
    }
  }

  function scheduleSave(code, fields, statusEl, { repaint = false } = {}) {
    const key = `${code}:${Object.keys(fields).sort().join(",")}`;
    if (saveTimers.has(key)) window.clearTimeout(saveTimers.get(key));
    saveTimers.set(
      key,
      window.setTimeout(async () => {
        saveTimers.delete(key);
        try {
          await saveGuestFields(code, fields, statusEl);
          if (repaint) paint();
        } catch {
          /* status already shown */
        }
      }, 250)
    );
  }

  function shareIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 21 5a3 3 0 1 0-5.91.7L8.04 9.81A3 3 0 1 0 8 14.2l7.12 4.16c-.05.21-.08.43-.08.64A3 3 0 1 0 18 16.08Z"/>
      </svg>
    `;
  }

  function linkIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M3.9 12a5 5 0 0 1 5-5h3v2h-3a3 3 0 0 0 0 6h3v2h-3a5 5 0 0 1-5-5Zm12.2-5h-3v2h3a3 3 0 0 1 0 6h-3v2h3a5 5 0 0 0 0-10ZM8 11h8v2H8v-2Z"/>
      </svg>
    `;
  }

  function guestInviteUrl(guest) {
    if (window.InviteCard?.guestInviteUrl) return window.InviteCard.guestInviteUrl(guest);
    const origin = String(window.AccesAPI?.cfg?.SITE_BASE_URL || window.location.origin).replace(/\/$/, "");
    return `${origin}/api/invite-card?code=${encodeURIComponent(String(guest?.code || "").toUpperCase())}`;
  }

  async function copyInviteLink(guest, button) {
    const url = guestInviteUrl(guest);
    try {
      if (window.InviteCard?.copyGuestInviteLink) {
        await window.InviteCard.copyGuestInviteLink(guest);
      } else {
        await navigator.clipboard.writeText(url);
      }
      if (button) {
        const previous = button.innerHTML;
        button.textContent = "Lien copié";
        window.setTimeout(() => {
          button.innerHTML = previous;
        }, 1600);
      }
      return url;
    } catch {
      window.prompt("Copiez le lien d’invitation :", url);
      return url;
    }
  }

  function showAddedInvite(statusEl, guest, summary) {
    if (!statusEl || !guest) return;
    statusEl.classList.remove("is-error");
    statusEl.replaceChildren();
    const line = document.createElement("span");
    line.textContent = summary;
    const row = document.createElement("span");
    row.className = "invite-link-row";
    const urlEl = document.createElement("code");
    urlEl.className = "invite-link-url";
    urlEl.textContent = guestInviteUrl(guest);
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-ghost-dark btn-copy-link";
    copyBtn.innerHTML = `${linkIconSvg()}<span>Copier le lien</span>`;
    copyBtn.addEventListener("click", () => copyInviteLink(guest, copyBtn));
    row.append(urlEl, copyBtn);
    statusEl.append(line, row);
  }

  function openWhatsappShare(guest, phoneOverride) {
    const phone = formatWhatsappIntl(phoneOverride ?? guest.whatsapp);
    if (!phone) {
      window.alert("Ajoutez d’abord le numéro WhatsApp de l’invité (ex. +243…).");
      return;
    }

    if (!window.InviteCard?.shareGuestInviteCard) {
      window.alert("Module invitation indisponible. Rafraîchissez la page.");
      return;
    }

    window.InviteCard.shareGuestInviteCard(guest, phone).catch((err) => {
      window.alert(err?.message || "Impossible d’envoyer le lien d’invitation.");
    });
  }

  function renderGuests(guests) {
    grid.innerHTML = "";
    if (!guests.length) {
      listStatus.textContent =
        allGuests.length === 0
          ? "Aucun invité pour le moment."
          : "Aucun invité pour ce filtre.";
      return;
    }

    const withTable = allGuests.filter((g) => String(g.table || "").trim()).length;
    const civilCount = allGuests.filter((g) => normalizeEvenement(g.evenement) === "civil").length;
    listStatus.textContent =
      guests.length === allGuests.length
        ? `${allGuests.length} invité(s) · ${civilCount} civil · ${withTable} table(s)`
        : `${guests.length} / ${allGuests.length} invité(s)`;

    guests.forEach((guest) => {
      const evenement = normalizeEvenement(guest.evenement);
      const isCivil = evenement === "civil";
      const card = document.createElement("article");
      card.className = `qr-card${isCivil ? " is-civil" : ""}`;

      const box = document.createElement("div");
      box.className = "qr-card-box";

      const shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "btn-share-qr";
      shareBtn.title = "Envoyer l’invitation (nom + table) sur WhatsApp";
      shareBtn.setAttribute("aria-label", `Envoyer l’invitation de ${guest.nom} sur WhatsApp`);
      shareBtn.innerHTML = shareIconSvg();

      const name = document.createElement("p");
      name.className = "qr-card-name";
      name.textContent = guest.nom;

      const meta = document.createElement("p");
      meta.className = "qr-card-meta";
      meta.textContent = `${evenementLabel(evenement)} · ${guest.type || "—"} · ${guest.personnes || 1} pers.`;

      const code = document.createElement("p");
      code.className = "qr-card-code";
      code.textContent = guest.code;

      const tableRow = document.createElement("label");
      tableRow.className = "qr-table-field";
      tableRow.hidden = isCivil;
      const tableCaption = document.createElement("span");
      tableCaption.textContent = "Table";
      const guestTableSelect = document.createElement("select");
      guestTableSelect.setAttribute("aria-label", `Table pour ${guest.nom}`);
      fillTableSelect(guestTableSelect, guest.table || "");
      const tableStatus = document.createElement("small");
      tableStatus.className = "qr-table-status";
      tableRow.append(tableCaption, guestTableSelect, tableStatus);

      guestTableSelect.addEventListener("change", () => {
        scheduleSave(guest.code, { table: guestTableSelect.value }, tableStatus, {
          repaint: true,
        });
      });

      const waRow = document.createElement("label");
      waRow.className = "qr-table-field qr-wa-field";
      const waCaption = document.createElement("span");
      waCaption.textContent = "WhatsApp";
      const waInput = document.createElement("input");
      waInput.type = "tel";
      waInput.inputMode = "tel";
      waInput.placeholder = "+243…";
      waInput.value = formatWhatsappIntl(guest.whatsapp || "");
      waInput.setAttribute("aria-label", `WhatsApp pour ${guest.nom}`);
      const waStatus = document.createElement("small");
      waStatus.className = "qr-table-status";
      waRow.append(waCaption, waInput, waStatus);

      const syncShareState = () => {
        const hasPhone = Boolean(normalizeWhatsapp(waInput.value || guest.whatsapp));
        shareBtn.classList.toggle("is-disabled", !hasPhone);
        shareBtn.disabled = false;
      };
      syncShareState();

      const persistWhatsapp = () => {
        const formatted = formatWhatsappIntl(waInput.value);
        waInput.value = formatted;
        guest.whatsapp = formatted;
        scheduleSave(guest.code, { whatsapp: formatted }, waStatus);
        syncShareState();
      };

      waInput.addEventListener("change", persistWhatsapp);
      waInput.addEventListener("blur", () => {
        const formatted = formatWhatsappIntl(waInput.value);
        if (formatted !== formatWhatsappIntl(guest.whatsapp || "")) {
          persistWhatsapp();
        } else if (formatted) {
          waInput.value = formatted;
        }
      });
      waInput.addEventListener("input", syncShareState);

      shareBtn.addEventListener("click", async () => {
        const phone = formatWhatsappIntl(waInput.value);
        if (!phone) {
          waInput.focus();
          window.alert("Ajoutez d’abord le numéro WhatsApp de l’invité (ex. +243…).");
          return;
        }
        waInput.value = phone;
        if (phone !== formatWhatsappIntl(guest.whatsapp || "")) {
          try {
            const updated = await saveGuestFields(guest.code, { whatsapp: phone }, waStatus);
            guest.whatsapp = formatWhatsappIntl(updated.whatsapp || phone);
          } catch {
            return;
          }
        }
        openWhatsappShare({ ...guest, whatsapp: phone }, phone);
      });

      const badge = document.createElement("span");
      badge.className = `badge${guest.statut === "entree" ? " is-entree" : ""}`;
      badge.textContent = guest.statut || "invite";

      const eventBadge = document.createElement("span");
      eventBadge.className = `badge badge-event${isCivil ? " is-civil" : ""}`;
      eventBadge.textContent = isCivil ? "CIVIL" : "SOIRÉE";

      const tableBadge = document.createElement("span");
      tableBadge.className = `badge badge-table${guest.table ? "" : " is-empty"}`;
      tableBadge.textContent = isCivil ? "Civil" : tableLabel(guest.table);
      tableBadge.hidden = isCivil;

      const actions = document.createElement("div");
      actions.className = "qr-card-actions";

      const billetHref = ticketUrl(guest.code, evenement);
      const link = document.createElement("a");
      link.className = "btn btn-ghost-dark";
      link.href = billetHref;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Ouvrir billet";

      const shareAction = document.createElement("button");
      shareAction.type = "button";
      shareAction.className = "btn btn-share-wa";
      shareAction.innerHTML = `${shareIconSvg()}<span>Invitation WA</span>`;
      shareAction.addEventListener("click", () => shareBtn.click());

      const copyLinkBtn = document.createElement("button");
      copyLinkBtn.type = "button";
      copyLinkBtn.className = "btn btn-ghost-dark btn-copy-link";
      copyLinkBtn.title = "Copier le lien d’invitation";
      copyLinkBtn.innerHTML = `${linkIconSvg()}<span>Copier le lien</span>`;
      copyLinkBtn.addEventListener("click", () => copyInviteLink(guest, copyLinkBtn));

      const downloadCardBtn = document.createElement("button");
      downloadCardBtn.type = "button";
      downloadCardBtn.className = "btn btn-ghost-dark";
      downloadCardBtn.textContent = "Carte";
      downloadCardBtn.title = "Télécharger l’invitation personnalisée";
      downloadCardBtn.addEventListener("click", async () => {
        try {
          if (!window.InviteCard?.buildGuestInviteCard) {
            throw new Error("Module invitation indisponible");
          }
          const { blob, filename } = await window.InviteCard.buildGuestInviteCard(guest);
          window.InviteCard.downloadBlob(blob, filename);
        } catch (err) {
          window.alert(err?.message || "Téléchargement impossible.");
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger-ghost";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", async () => {
        const ok = window.confirm(
          `Supprimer la confirmation de ${guest.nom} (${guest.code}) ?\nCette action est définitive.`
        );
        if (!ok) return;
        deleteBtn.disabled = true;
        try {
          const result = await request({ action: "delete", code: guest.code });
          if (!result.ok) throw new Error(result.error || "Suppression impossible");
          allGuests = allGuests.filter((g) => g.code !== guest.code);
          paint();
          // Recharge depuis le serveur pour confirmer la persistance
          await loadList();
        } catch (err) {
          window.alert(err.message || "Erreur lors de la suppression.");
          deleteBtn.disabled = false;
          await loadList();
        }
      });

      actions.append(link, copyLinkBtn, shareAction, downloadCardBtn, deleteBtn);
      card.append(box, name, meta, code, tableRow, waRow, eventBadge, badge, tableBadge, actions);
      grid.appendChild(card);

      renderQrWithLogo(box, billetHref, 128);
      box.appendChild(shareBtn);
    });
  }

  function paint() {
    fillFilterOptions(allGuests);
    renderGuests(sortGuests(filteredGuests()));
  }

  async function loadList() {
    listStatus.textContent = "Chargement…";
    try {
      const data = await request({ action: "list" });
      if (!data.ok) throw new Error(data.error || "Erreur liste");
      allGuests = data.guests || [];
      paint();
    } catch (err) {
      listStatus.textContent =
        err.message || "Impossible de charger la liste. Lancez: python3 serve-iphone.py";
      grid.innerHTML = "";
    }
  }

  function fieldFromText(text, label) {
    const re = new RegExp(`(?:${label})\\s*[:：]\\s*(.+)`, "i");
    const match = String(text || "").match(re);
    return match ? String(match[1] || "").trim() : "";
  }

  function normalizeInviteCode(raw) {
    const code = String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    return /^PJ-[A-Z0-9]{6}$/.test(code) ? code : "";
  }

  function extractCodeFromChunk(chunk) {
    const labeled = fieldFromText(
      chunk,
      "Code\\s*QR|CodeQR|QR\\s*code|Code\\s*billet"
    );
    let code = normalizeInviteCode(labeled);
    if (code) return code;

    // Parfois le label capture du texte autour : isoler PJ-XXXXXX
    const labeledMatch = String(labeled || "").match(/\b(PJ-[A-Za-z0-9]{6})\b/i);
    code = normalizeInviteCode(labeledMatch?.[1]);
    if (code) return code;

    const billet = fieldFromText(chunk, "Billet|Ticket|Lien");
    if (billet) {
      try {
        const url = new URL(billet.trim().split(/\s+/)[0]);
        code = normalizeInviteCode(url.searchParams.get("code"));
        if (code) return code;
      } catch {
        /* ignore */
      }
      const fromQuery = billet.match(/[?&]code=([A-Za-z0-9-]+)/i);
      code = normalizeInviteCode(fromQuery?.[1]);
      if (code) return code;
    }

    const anywhere = String(chunk).match(/\b(PJ-[A-Za-z0-9]{6})\b/i);
    return normalizeInviteCode(anywhere?.[1]);
  }

  function parseInviteType(raw) {
    const value = String(raw || "").toLowerCase();
    const countMatch = value.match(/(\d+)\s*personnes?/);
    if (value.includes("collectif") || countMatch) {
      return {
        type: "collectif",
        personnes: countMatch ? countMatch[1] : "3",
      };
    }
    if (value.includes("couple")) return { type: "couple", personnes: "2" };
    if (value.includes("singleton") || value.includes("seul")) {
      return { type: "singleton", personnes: "1" };
    }
    return { type: "singleton", personnes: "1" };
  }

  function extractPhoneFromText(text) {
    const labeled =
      fieldFromText(text, "WhatsApp") ||
      fieldFromText(text, "Téléphone|Telephone|Tel|Tél");
    if (labeled) return formatWhatsappIntl(labeled);
    const match = String(text || "").match(/(?:\+|00)?(?:243|32|33|1)?[\s./-]*\d[\d\s./-]{7,}/);
    return formatWhatsappIntl(match?.[0] || "");
  }

  function extractNameFromText(text) {
    const labeled = fieldFromText(text, "Nom(?:\\s+complet)?");
    if (labeled) return labeled.replace(/\s+/g, " ").trim();
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (line) =>
          !/^(bonjour|je confirme|merci|événement|evenement|type|whatsapp|téléphone|telephone|code|billet|table|remarque)/i.test(
            line
          )
      );
    return lines[0] || "";
  }

  function parseWhatsappDraft(raw) {
    const text = String(raw || "").replace(/\r\n/g, "\n").trim();
    if (!text) return null;
    const eventRaw = fieldFromText(text, "Événement|Evenement") || text;
    const typeRaw =
      fieldFromText(text, "Type d[’']invitation") ||
      fieldFromText(text, "Type") ||
      text;
    const { type, personnes } = parseInviteType(typeRaw);
    return {
      nom: extractNameFromText(text),
      evenement: /civil/i.test(eventRaw) ? "civil" : "soiree",
      type,
      personnes,
      whatsapp: extractPhoneFromText(text),
      code: extractCodeFromChunk(text),
      table: fieldFromText(text, "Table"),
    };
  }

  const waNom = document.getElementById("wa-nom");
  const waWhatsapp = document.getElementById("wa-whatsapp");
  const waEvenement = document.getElementById("wa-evenement");
  const waType = document.getElementById("wa-type");
  const waCountWrap = document.getElementById("wa-count-wrap");
  const waCount = document.getElementById("wa-count");
  const waTableWrap = document.getElementById("wa-table-wrap");
  const waTable = document.getElementById("wa-table");
  const waCode = document.getElementById("wa-code");

  function syncWaFields() {
    syncPersonnesField(waType, waCountWrap, waCount);
    const isCivil = normalizeEvenement(waEvenement?.value) === "civil";
    if (waTableWrap) waTableWrap.hidden = isCivil;
    if (isCivil && waTable) waTable.value = "";
  }

  function fillWaFields(draft) {
    if (!draft) return;
    if (waNom && draft.nom) waNom.value = draft.nom;
    if (waWhatsapp && draft.whatsapp) waWhatsapp.value = draft.whatsapp;
    if (waEvenement && draft.evenement) waEvenement.value = draft.evenement;
    if (waType && draft.type) waType.value = draft.type;
    if (waCode) waCode.value = draft.code || "";
    if (waTable && draft.table) {
      fillTableSelect(waTable, draft.table);
    }
    syncWaFields();
    if (waCount && draft.type === "collectif" && draft.personnes) {
      waCount.value = draft.personnes;
    }
  }

  const WA_MESSAGE_TEMPLATE =
    "Bonjour Parfaite & Jean,\n\n" +
    "Je confirme ma présence à votre mariage.\n\n" +
    "Nom : \n" +
    "Événement : Mariage (invitation complète)\n" +
    "Type d’invitation : Couple\n" +
    "WhatsApp : ";

  if (waType) waType.addEventListener("change", syncWaFields);
  if (waEvenement) waEvenement.addEventListener("change", syncWaFields);
  syncWaFields();

  function resetWaForm() {
    if (waText) waText.value = WA_MESSAGE_TEMPLATE;
    if (waNom) waNom.value = "";
    if (waWhatsapp) waWhatsapp.value = "";
    if (waCode) waCode.value = "";
    if (waTable) waTable.value = "";
    if (waEvenement) waEvenement.value = "soiree";
    if (waType) waType.value = "couple";
    syncWaFields();
    fillWaFields(parseWhatsappDraft(WA_MESSAGE_TEMPLATE));
  }

  if (waText) {
    if (!String(waText.value || "").trim()) waText.value = WA_MESSAGE_TEMPLATE;
    fillWaFields(parseWhatsappDraft(waText.value));
    waText.addEventListener("input", () => {
      fillWaFields(parseWhatsappDraft(waText.value || ""));
    });
  }

  if (waForm) {
    waForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!waMsg) return;
      waMsg.classList.remove("is-error");

      const nom = String(waNom?.value || "").trim();
      const whatsapp = formatWhatsappIntl(String(waWhatsapp?.value || "").trim());
      const evenement = normalizeEvenement(waEvenement?.value || "soiree");
      const type = String(waType?.value || "couple");
      const personnes = personnesForType(type, waCount?.value);
      const table = evenement === "civil" ? "" : String(waTable?.value || "").trim();
      const code = String(waCode?.value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

      if (!nom) {
        waMsg.classList.add("is-error");
        waMsg.textContent = "Indique le nom, puis ajoute.";
        waNom?.focus();
        return;
      }
      if (type === "collectif" && !(Number(personnes) >= 3)) {
        waMsg.classList.add("is-error");
        waMsg.textContent = "Pour un collectif, indique le nombre de personnes (min. 3).";
        waCount?.focus();
        return;
      }

      waMsg.textContent = "Ajout…";
      try {
        const payload = {
          action: "add",
          nom,
          type,
          personnes,
          table,
          whatsapp,
          notes: "Ajout manuel / WhatsApp",
          evenement,
          statut: "confirme",
        };
        if (/^PJ-[A-Z0-9]{6}$/.test(code)) payload.code = code;
        const result = await request(payload);
        if (!result?.ok) throw new Error(result?.error || "Échec");
        showAddedInvite(
          waMsg,
          result.guest,
          `Ajouté : ${result.guest?.code || code || "QR créé"} · ${nom}`
        );
        resetWaForm();
        await loadList();
      } catch (err) {
        waMsg.classList.add("is-error");
        waMsg.textContent = err.message || "Erreur lors de l’ajout.";
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    msg.classList.remove("is-error");
    msg.textContent = "Création…";

    const data = new FormData(form);
    const nom = String(data.get("nom") || "").trim();
    const type = String(data.get("type") || "couple");
    const evenement = normalizeEvenement(data.get("evenement") || "soiree");
    const personnes = personnesForType(type, data.get("personnes"));
    const table = evenement === "civil" ? "" : String(data.get("table") || "").trim();
    const whatsapp = formatWhatsappIntl(String(data.get("whatsapp") || "").trim());
    const notes = String(data.get("notes") || "").trim() || "Ajout manuel";
    const statut = String(data.get("statut") || "confirme").trim().toLowerCase() || "confirme";

    if (type === "collectif" && !(Number(personnes) >= 3)) {
      msg.classList.add("is-error");
      msg.textContent = "Pour un collectif, indique le nombre de personnes (min. 3).";
      countInput?.focus();
      return;
    }

    try {
      const result = await request({
        action: "add",
        nom,
        type,
        personnes,
        table,
        whatsapp,
        notes,
        evenement,
        statut,
      });
      if (!result.ok) throw new Error(result.error || "Échec");
      showAddedInvite(
        msg,
        result.guest,
        `Ajouté : ${result.guest.code} · ${evenementLabel(evenement)} · ${
          statut === "confirme" ? "confirmé" : "invité"
        }${result.guest.table ? ` · ${tableLabel(result.guest.table)}` : ""}`
      );
      form.reset();
      syncCount();
      syncEvenementForm();
      if (document.getElementById("admin-statut")) {
        document.getElementById("admin-statut").value = "confirme";
      }
      fillTableSelect(tableSelect);
      await loadList();
    } catch (err) {
      msg.classList.add("is-error");
      msg.textContent = err.message || "Erreur lors de la création.";
    }
  });

  filterTable.addEventListener("change", paint);
  if (filterEvenement) filterEvenement.addEventListener("change", paint);
  if (filterType) filterType.addEventListener("change", paint);
  btnRefresh.addEventListener("click", loadList);
  loadList();
})();
