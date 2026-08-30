(() => {
  const {
    request,
    tableLabel,
    fillTableSelect,
    tableNames,
    inviteTypeLabel,
  } = window.AccesAPI;

  const rosterBody = document.querySelector("#guest-roster tbody");
  const listStatus = document.getElementById("list-status");
  const btnRefresh = document.getElementById("btn-refresh");
  const filterSearch = document.getElementById("filter-search");
  const filterType = document.getElementById("filter-type");
  const filterTable = document.getElementById("filter-table");

  let allGuests = [];
  let editingCode = "";

  function typeLabelOf(type) {
    if (typeof inviteTypeLabel === "function") return inviteTypeLabel(type);
    if (type === "couple") return "Couple";
    if (type === "collectif") return "Collectif";
    if (type === "singleton") return "Singleton";
    return type || "—";
  }

  function iconButton(className, label, svg) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = svg;
    return btn;
  }

  const ICON_EDIT =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 15.5V20h4.5l10.2-10.2-4.5-4.5L4 15.5Zm15.7-8.3c.4-.4.4-1 0-1.4l-3.5-3.5c-.4-.4-1-.4-1.4 0l-1.8 1.8 4.5 4.5 2.2-1.4Z"/></svg>';
  const ICON_SAVE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.2 16.6 4.8 12.2l-1.4 1.4 5.8 5.8L21 7.6l-1.4-1.4-10.4 10.4Z"/></svg>';
  const ICON_CANCEL =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z"/></svg>';

  function sortGuests(guests) {
    return [...guests].sort((a, b) =>
      String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" })
    );
  }

  function fillTableFilter(guests) {
    if (!filterTable) return;
    const current = filterTable.value || "all";
    const assigned = [
      ...new Set(guests.map((g) => String(g.table || "").trim()).filter(Boolean)),
    ];
    const ordered = [
      ...tableNames().filter((n) => assigned.includes(n)),
      ...assigned.filter((n) => !tableNames().includes(n)).sort((a, b) => a.localeCompare(b, "fr")),
    ];
    filterTable.innerHTML = "";
    [
      ["all", "Toutes"],
      ["none", "Sans table"],
      ...ordered.map((t) => [t, tableLabel(t)]),
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      filterTable.appendChild(option);
    });
    filterTable.value = [...filterTable.options].some((o) => o.value === current)
      ? current
      : "all";
  }

  function filteredGuests() {
    const q = String(filterSearch?.value || "").trim().toLowerCase();
    const typeMode = filterType?.value || "all";
    const tableMode = filterTable?.value || "all";
    return sortGuests(allGuests).filter((guest) => {
      if (q && !String(guest.nom || "").toLowerCase().includes(q)) return false;
      if (typeMode !== "all" && String(guest.type || "").toLowerCase() !== typeMode) return false;
      const tableRaw = String(guest.table || "").trim();
      if (tableMode === "none") return !tableRaw;
      if (tableMode !== "all") return tableRaw === tableMode;
      return true;
    });
  }

  function createTypeSelect(selected) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Type");
    [
      ["singleton", "Singleton"],
      ["couple", "Couple"],
      ["collectif", "Collectif"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (value === selected) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function rowValues(tr) {
    return {
      nom: tr.querySelector('[data-field="nom"]').value.trim(),
      type: tr.querySelector('[data-field="type"]').value,
      table: tr.querySelector('[data-field="table"]').value,
    };
  }

  async function saveRow(guest, tr, saveBtn) {
    const next = rowValues(tr);
    if (!next.nom) {
      window.alert("Le nom est obligatoire.");
      return;
    }
    saveBtn.disabled = true;
    try {
      const result = await request({
        action: "update",
        code: guest.code,
        nom: next.nom,
        type: next.type,
        table: next.table,
      });
      if (!result.ok) throw new Error(result.error || "Enregistrement impossible");
      allGuests = allGuests.map((g) => (g.code === result.guest.code ? result.guest : g));
      editingCode = "";
      fillTableFilter(allGuests);
      paint();
    } catch (err) {
      window.alert(err?.message || "Modification impossible.");
      saveBtn.disabled = false;
    }
  }

  function renderViewRow(guest) {
    const tr = document.createElement("tr");
    const nom = document.createElement("td");
    nom.textContent = guest.nom || "—";
    const type = document.createElement("td");
    type.textContent = typeLabelOf(guest.type);
    const table = document.createElement("td");
    table.textContent = guest.table ? tableLabel(guest.table) : "—";
    const action = document.createElement("td");
    action.className = "guest-row-actions";
    const editBtn = iconButton(
      "btn-icon btn-icon-edit",
      `Modifier ${guest.nom || "l’invité"}`,
      ICON_EDIT
    );
    editBtn.addEventListener("click", () => {
      editingCode = guest.code;
      paint();
    });
    action.appendChild(editBtn);
    tr.append(nom, type, table, action);
    return tr;
  }

  function renderEditRow(guest) {
    const tr = document.createElement("tr");
    tr.className = "is-editing";

    const nomTd = document.createElement("td");
    const nomInput = document.createElement("input");
    nomInput.type = "text";
    nomInput.dataset.field = "nom";
    nomInput.value = guest.nom || "";
    nomInput.setAttribute("aria-label", `Nom de ${guest.nom || "l’invité"}`);
    nomTd.appendChild(nomInput);

    const typeTd = document.createElement("td");
    const typeSelect = createTypeSelect(String(guest.type || "singleton").toLowerCase());
    typeSelect.dataset.field = "type";
    typeTd.appendChild(typeSelect);

    const tableTd = document.createElement("td");
    const tableSelect = document.createElement("select");
    tableSelect.dataset.field = "table";
    tableSelect.setAttribute("aria-label", `Table de ${guest.nom || "l’invité"}`);
    fillTableSelect(tableSelect, guest.table || "");
    tableTd.appendChild(tableSelect);

    const actionTd = document.createElement("td");
    actionTd.className = "guest-row-actions";
    const saveBtn = iconButton("btn-icon btn-icon-save", "Enregistrer", ICON_SAVE);
    const cancelBtn = iconButton("btn-icon btn-icon-cancel", "Annuler", ICON_CANCEL);
    saveBtn.addEventListener("click", () => saveRow(guest, tr, saveBtn));
    cancelBtn.addEventListener("click", () => {
      editingCode = "";
      paint();
    });
    actionTd.append(saveBtn, cancelBtn);

    tr.append(nomTd, typeTd, tableTd, actionTd);
    window.setTimeout(() => nomInput.focus(), 0);
    return tr;
  }

  function renderRow(guest) {
    return guest.code === editingCode ? renderEditRow(guest) : renderViewRow(guest);
  }

  function paint() {
    const guests = filteredGuests();
    rosterBody.innerHTML = "";
    if (!allGuests.length) {
      listStatus.textContent = "Aucun invité pour le moment.";
      return;
    }
    listStatus.textContent =
      guests.length === allGuests.length
        ? `${allGuests.length} invité(s)`
        : `${guests.length} / ${allGuests.length} invité(s)`;
    guests.forEach((guest) => rosterBody.appendChild(renderRow(guest)));
  }

  async function loadList() {
    listStatus.textContent = "Chargement…";
    try {
      const data = await request({ action: "list" });
      allGuests = Array.isArray(data.guests) ? data.guests : [];
      fillTableFilter(allGuests);
      paint();
    } catch (err) {
      listStatus.textContent = err?.message || "Impossible de charger la liste.";
    }
  }

  filterSearch?.addEventListener("input", paint);
  filterType?.addEventListener("change", paint);
  filterTable?.addEventListener("change", paint);
  btnRefresh?.addEventListener("click", loadList);
  loadList();
})();
