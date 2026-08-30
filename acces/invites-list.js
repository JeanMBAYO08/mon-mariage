(() => {
  const {
    request,
    tableLabel,
    fillTableSelect,
    tableNames,
  } = window.AccesAPI;

  const rosterBody = document.querySelector("#guest-roster tbody");
  const listStatus = document.getElementById("list-status");
  const btnRefresh = document.getElementById("btn-refresh");
  const filterSearch = document.getElementById("filter-search");
  const filterType = document.getElementById("filter-type");
  const filterTable = document.getElementById("filter-table");

  let allGuests = [];

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

  async function saveRow(guest, tr, btn) {
    const next = rowValues(tr);
    if (!next.nom) {
      window.alert("Le nom est obligatoire.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "…";
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
      fillTableFilter(allGuests);
      paint();
    } catch (err) {
      window.alert(err?.message || "Modification impossible.");
      btn.disabled = false;
      btn.textContent = "Enregistrer";
    }
  }

  function renderRow(guest) {
    const tr = document.createElement("tr");

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
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-gold btn-row-save";
    saveBtn.textContent = "Enregistrer";
    saveBtn.addEventListener("click", () => saveRow(guest, tr, saveBtn));
    actionTd.appendChild(saveBtn);

    tr.append(nomTd, typeTd, tableTd, actionTd);
    return tr;
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
