/**
 * ============================================
 *  Parfaite & Jean — Accès soirée (Google Sheet)
 * ============================================
 *
 * INSTALLATION
 * 1. Créez une Google Sheet
 * 2. Renommez la 1re feuille : "Invites"
 * 3. Ligne 1 (en-têtes exactes) :
 *    code | nom | type | personnes | statut | date_entree | notes
 * 4. Extensions > Apps Script > collez CE fichier > Enregistrer
 * 5. Modifiez SECRET_KEY ci-dessous (mot de passe équipe)
 * 6. Déployer > Nouveau déploiement > Type : Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui peut y accéder : Tout le monde
 * 7. Copiez l’URL du déploiement dans acces/config.js (WEB_APP_URL)
 * 8. Après chaque modification du script : Déployer > Gérer les déploiements > Modifier > Nouvelle version
 *
 * RSVP (site) :
 *  action=rsvp ajoute automatiquement le nom confirmé (statut: confirme) + génère un code QR
 *
 * STATUTS
 *  - invite    : créé, QR pas encore utilisé
 *  - confirme  : RSVP reçu (optionnel)
 *  - entree    : déjà entré à la soirée
 *
 * Exemple d’ajout manuel dans la Sheet :
 *  PJ-A1B2 | Marie Kabila | couple | 2 | invite | |
 */

const SHEET_NAME = "Invites";
const SECRET_KEY = "parfaite-jean-2026"; // changez ceci

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || "").toLowerCase();
  const key = String(params.key || "");

  let result;

  try {
    if (action === "ping") {
      result = { ok: true, message: "API soirée prête" };
    } else if (action === "validate") {
      result = validateCode_(params.code);
    } else if (action === "checkin") {
      assertKey_(key);
      result = checkIn_(params.code);
    } else if (action === "list") {
      assertKey_(key);
      result = listGuests_();
    } else if (action === "add") {
      assertKey_(key);
      result = addGuest_({
        nom: params.nom,
        type: params.type,
        personnes: params.personnes,
        notes: params.notes,
        statut: params.statut || "invite",
      });
    } else if (action === "rsvp") {
      // RSVP public (site) — ajoute / met à jour l’invité confirmé
      assertKey_(key);
      result = addGuest_({
        nom: params.nom,
        type: params.type,
        personnes: params.personnes,
        notes: params.notes || "RSVP site",
        statut: "confirme",
        upsertByName: true,
      });
    } else {
      result = { ok: false, error: "Action inconnue" };
    }
  } catch (err) {
    result = { ok: false, error: String(err.message || err) };
  }

  return respond_(result, params.callback);
}

function assertKey_(key) {
  if (key !== SECRET_KEY) {
    throw new Error("Clé d’accès invalide");
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Feuille "Invites" introuvable. Créez-la avec les bons en-têtes.');
  }
  return sheet;
}

function readRows_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });

  const idx = {
    code: headers.indexOf("code"),
    nom: headers.indexOf("nom"),
    type: headers.indexOf("type"),
    personnes: headers.indexOf("personnes"),
    statut: headers.indexOf("statut"),
    date_entree: headers.indexOf("date_entree"),
    notes: headers.indexOf("notes"),
  };

  if (idx.code < 0 || idx.nom < 0 || idx.statut < 0) {
    throw new Error("En-têtes manquants (code, nom, statut requis)");
  }

  const rows = [];
  for (var r = 1; r < values.length; r++) {
    const row = values[r];
    const code = String(row[idx.code] || "").trim();
    if (!code) continue;
    rows.push({
      rowNumber: r + 1,
      code: code,
      nom: String(row[idx.nom] || "").trim(),
      type: String(idx.type >= 0 ? row[idx.type] || "" : "").trim(),
      personnes: Number(idx.personnes >= 0 ? row[idx.personnes] || 1 : 1),
      statut: String(row[idx.statut] || "invite").trim().toLowerCase(),
      date_entree: idx.date_entree >= 0 ? row[idx.date_entree] : "",
      notes: String(idx.notes >= 0 ? row[idx.notes] || "" : "").trim(),
      indexes: idx,
    });
  }
  return rows;
}

function validateCode_(rawCode) {
  const code = normalizeCode_(rawCode);
  if (!code) return { ok: false, error: "Code manquant" };

  const guest = findGuest_(code);
  if (!guest) {
    return { ok: false, error: "QR inconnu", code: code };
  }

  if (guest.statut === "entree") {
    return {
      ok: false,
      error: "Déjà entré",
      code: guest.code,
      nom: guest.nom,
      type: guest.type,
      personnes: guest.personnes,
      statut: guest.statut,
      date_entree: formatDate_(guest.date_entree),
      alreadyIn: true,
    };
  }

  return {
    ok: true,
    code: guest.code,
    nom: guest.nom,
    type: guest.type,
    personnes: guest.personnes,
    statut: guest.statut,
    canEnter: true,
  };
}

function checkIn_(rawCode) {
  const code = normalizeCode_(rawCode);
  if (!code) return { ok: false, error: "Code manquant" };

  const sheet = getSheet_();
  const guest = findGuest_(code);
  if (!guest) {
    return { ok: false, error: "QR inconnu", code: code };
  }

  if (guest.statut === "entree") {
    return {
      ok: false,
      error: "Déjà entré",
      code: guest.code,
      nom: guest.nom,
      type: guest.type,
      personnes: guest.personnes,
      statut: guest.statut,
      date_entree: formatDate_(guest.date_entree),
      alreadyIn: true,
    };
  }

  const now = new Date();
  const idx = guest.indexes;
  sheet.getRange(guest.rowNumber, idx.statut + 1).setValue("entree");
  if (idx.date_entree >= 0) {
    sheet.getRange(guest.rowNumber, idx.date_entree + 1).setValue(now);
  }

  return {
    ok: true,
    message: "Entrée validée",
    code: guest.code,
    nom: guest.nom,
    type: guest.type,
    personnes: guest.personnes,
    statut: "entree",
    date_entree: formatDate_(now),
  };
}

function listGuests_() {
  const guests = readRows_().map(function (g) {
    return {
      code: g.code,
      nom: g.nom,
      type: g.type,
      personnes: g.personnes,
      statut: g.statut,
      date_entree: formatDate_(g.date_entree),
      notes: g.notes,
    };
  });
  return { ok: true, guests: guests, total: guests.length };
}

function addGuest_(payload) {
  const nom = String(payload.nom || "").trim();
  if (!nom) throw new Error("Nom requis");

  const type = String(payload.type || "singleton").trim().toLowerCase();
  var personnes = Number(payload.personnes || 1);
  if (type === "singleton") personnes = 1;
  if (type === "couple") personnes = 2;
  if (type === "collectif" && (!personnes || personnes < 3)) {
    throw new Error("Collectif : indiquez au moins 3 personnes");
  }

  const statut = String(payload.statut || "invite").trim().toLowerCase() || "invite";
  const notes = String(payload.notes || "").trim();
  const sheet = getSheet_();

  // Mise à jour si le même nom existe déjà
  if (payload.upsertByName) {
    const existing = findGuestByName_(nom);
    if (existing) {
      // Ne pas écraser un invité déjà entré
      if (existing.statut === "entree") {
        return {
          ok: true,
          updated: true,
          alreadyIn: true,
          guest: {
            code: existing.code,
            nom: existing.nom,
            type: existing.type,
            personnes: existing.personnes,
            statut: existing.statut,
          },
        };
      }

      const idx = existing.indexes;
      sheet.getRange(existing.rowNumber, idx.type + 1).setValue(type);
      if (idx.personnes >= 0) {
        sheet.getRange(existing.rowNumber, idx.personnes + 1).setValue(personnes);
      }
      sheet.getRange(existing.rowNumber, idx.statut + 1).setValue(statut);
      if (idx.notes >= 0 && notes) {
        sheet.getRange(existing.rowNumber, idx.notes + 1).setValue(notes);
      }

      return {
        ok: true,
        updated: true,
        guest: {
          code: existing.code,
          nom: nom,
          type: type,
          personnes: personnes,
          statut: statut,
        },
      };
    }
  }

  const code = generateCode_();
  sheet.appendRow([code, nom, type, personnes, statut, "", notes]);

  return {
    ok: true,
    created: true,
    guest: {
      code: code,
      nom: nom,
      type: type,
      personnes: personnes,
      statut: statut,
    },
  };
}

function findGuestByName_(nom) {
  const target = String(nom || "").trim().toLowerCase();
  if (!target) return null;
  const rows = readRows_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].nom || "").trim().toLowerCase() === target) return rows[i];
  }
  return null;
}

function findGuest_(code) {
  const rows = readRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].code.toUpperCase() === code.toUpperCase()) return rows[i];
  }
  return null;
}

function normalizeCode_(raw) {
  var value = String(raw || "").trim();
  if (!value) return "";

  // Si le QR contient une URL avec ?code=
  if (value.indexOf("code=") >= 0) {
    try {
      var query = value.split("?")[1] || "";
      var parts = query.split("&");
      for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].split("=");
        if (decodeURIComponent(pair[0] || "") === "code") {
          value = decodeURIComponent(pair[1] || "");
          break;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  return value.trim().toUpperCase();
}

function generateCode_() {
  var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var code = "PJ-";
  for (var i = 0; i < 6; i++) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  // Évite les doublons
  if (findGuest_(code)) return generateCode_();
  return code;
}

function formatDate_(value) {
  if (!value) return "";
  try {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  } catch (err) {
    return String(value);
  }
}

function respond_(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
