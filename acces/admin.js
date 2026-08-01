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

  let allGuests = [];
  const saveTimers = new Map();

  fillTableSelect(tableSelect);

  function syncCount() {
    const isCollectif = typeSelect.value === "collectif";
    countWrap.hidden = !isCollectif;
    countInput.required = isCollectif;
    if (!isCollectif) countInput.value = "";
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
    let list = allGuests;
    if (eventMode !== "all") {
      list = list.filter((g) => normalizeEvenement(g.evenement) === eventMode);
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

  function openWhatsappShare(guest, phoneOverride) {
    const phone = formatWhatsappIntl(phoneOverride ?? guest.whatsapp);
    if (!phone) {
      window.alert("Ajoutez d’abord le numéro WhatsApp de l’invité (ex. +243…).");
      return;
    }
    const message = guestTicketMessage({ ...guest, whatsapp: phone });
    const url = whatsappShareUrl(phone, message);
    if (!url) {
      window.alert("Numéro WhatsApp invalide. Utilisez le format +243…");
      return;
    }
    // Ouvre WhatsApp vers le numéro de l’invité avec le lien du QR
    window.open(url, "_blank", "noopener,noreferrer");
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
    listStatus.textContent = `${allGuests.length} invitation(s) · ${civilCount} civil · ${withTable} table(s)`;

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
      shareBtn.title = "Partager le QR sur WhatsApp";
      shareBtn.setAttribute("aria-label", `Partager le QR de ${guest.nom} sur WhatsApp`);
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
      shareAction.innerHTML = `${shareIconSvg()}<span>WhatsApp</span>`;
      shareAction.addEventListener("click", () => shareBtn.click());

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

      actions.append(link, shareAction, deleteBtn);
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

  function parseWhatsappMessages(raw) {
    const text = String(raw || "").replace(/\r\n/g, "\n").trim();
    if (!text) return [];

    let chunks = text.split(/\n(?=Bonjour\s+Parfaite)/i).map((c) => c.trim()).filter(Boolean);
    if (chunks.length <= 1) {
      chunks = text
        .split(/\n\s*-{3,}\s*\n/)
        .map((c) => c.trim())
        .filter(Boolean);
    }
    if (chunks.length <= 1 && (text.match(/\nNom\s*[:：]/gi) || []).length > 1) {
      chunks = text.split(/\n(?=Nom\s*[:：])/i).map((c) => c.trim()).filter(Boolean);
    }

    return chunks
      .map((chunk) => {
        const nom = fieldFromText(chunk, "Nom");
        if (!nom) return null;
        const eventRaw = fieldFromText(chunk, "Événement|Evenement");
        const evenement = /civil/i.test(eventRaw) ? "civil" : "soiree";
        const typeRaw =
          fieldFromText(chunk, "Type d[’']invitation") ||
          fieldFromText(chunk, "Type");
        const { type, personnes } = parseInviteType(typeRaw);
        const whatsapp = formatWhatsappIntl(
          fieldFromText(chunk, "WhatsApp") || fieldFromText(chunk, "Téléphone|Telephone")
        );
        const code = extractCodeFromChunk(chunk);
        return {
          nom,
          evenement,
          type,
          personnes,
          whatsapp,
          code,
          notes: "Récupéré depuis WhatsApp",
          statut: "confirme",
        };
      })
      .filter(Boolean);
  }

  const waPreview = document.getElementById("wa-import-preview");

  function renderWaPreview(parsed) {
    if (!waPreview) return;
    if (!parsed.length) {
      waPreview.hidden = true;
      waPreview.innerHTML = "";
      return;
    }
    waPreview.hidden = false;
    waPreview.innerHTML = `<p class="wa-preview-title">${parsed.length} confirmation(s) détectée(s)</p><ul>${parsed
      .map((g) => {
        const codeLabel = g.code || "nouveau QR auto";
        return `<li><strong>${g.nom}</strong> · ${codeLabel} · ${g.whatsapp || "sans WhatsApp"} · ${
          g.evenement === "civil" ? "civil" : "soirée"
        }</li>`;
      })
      .join("")}</ul>`;
  }

  if (waText) {
    waText.addEventListener("input", () => {
      renderWaPreview(parseWhatsappMessages(waText.value || ""));
    });
  }

  if (waForm) {
    waForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!waMsg) return;
      waMsg.classList.remove("is-error");
      const parsed = parseWhatsappMessages(waText?.value || "");
      renderWaPreview(parsed);
      if (!parsed.length) {
        waMsg.classList.add("is-error");
        waMsg.textContent =
          "Aucun message reconnu. Colle un message avec au moins « Nom : … » et « WhatsApp : … ».";
        return;
      }

      waMsg.textContent = `Import de ${parsed.length} confirmation(s)…`;
      const ok = [];
      const fail = [];

      for (const guest of parsed) {
        try {
          if (!guest.whatsapp) throw new Error("WhatsApp manquant");
          const payload = {
            action: "add",
            nom: guest.nom,
            type: guest.type,
            personnes: guest.personnes,
            whatsapp: guest.whatsapp,
            notes: guest.notes,
            evenement: guest.evenement,
            statut: guest.statut,
          };
          if (guest.code) payload.code = guest.code;
          const result = await request(payload);
          if (!result?.ok) throw new Error(result?.error || "Échec");
          const savedCode = result.guest?.code || guest.code || "?";
          ok.push(`${guest.nom} → ${savedCode}`);
        } catch (err) {
          fail.push(`${guest.nom}: ${err.message || "erreur"}`);
        }
      }

      await loadList();
      if (ok.length && waText) {
        waText.value = "";
        renderWaPreview([]);
      }
      const parts = [];
      if (ok.length) parts.push(`${ok.length} ajouté(s) avec QR : ${ok.join(" · ")}`);
      if (fail.length) parts.push(`${fail.length} échec(s) : ${fail.join(" · ")}`);
      waMsg.classList.toggle("is-error", ok.length === 0);
      waMsg.textContent = parts.join(" | ");
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    msg.classList.remove("is-error");
    msg.textContent = "Création…";

    const data = new FormData(form);
    const nom = String(data.get("nom") || "").trim();
    const type = String(data.get("type") || "singleton");
    const evenement = normalizeEvenement(data.get("evenement") || "soiree");
    const personnes = String(data.get("personnes") || "");
    const table = evenement === "civil" ? "" : String(data.get("table") || "").trim();
    const whatsapp = formatWhatsappIntl(String(data.get("whatsapp") || "").trim());
    const notes = String(data.get("notes") || "").trim() || "Ajout manuel";
    const statut = String(data.get("statut") || "confirme").trim().toLowerCase() || "confirme";

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
      msg.textContent = `Ajouté : ${result.guest.code} · ${evenementLabel(evenement)} · ${
        statut === "confirme" ? "confirmé" : "invité"
      }${result.guest.table ? ` · ${tableLabel(result.guest.table)}` : ""}`;
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
  btnRefresh.addEventListener("click", loadList);
  loadList();
})();
