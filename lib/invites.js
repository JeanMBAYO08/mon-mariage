import { list, put } from "@vercel/blob";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BLOB_PATH = "invites/invites.json";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function loadBundledInvites() {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, "../data/invites.json"), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.map(normalizeGuestRecord) : [];
  } catch (err) {
    console.warn("Bundled invites:", err);
    return [];
  }
}

function normalizeGuestRecord(guest) {
  return {
    ...guest,
    evenement: normalizeEvenement(guest?.evenement),
    whatsapp: guest?.whatsapp || "",
    table: guest?.table || "",
  };
}

async function loadBlobInvites() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { blobs } = await list({ prefix: "invites/", limit: 20 });
    const file = blobs.find((b) => b.pathname === BLOB_PATH || b.pathname.endsWith("invites.json"));
    if (!file?.url) return null;
    const res = await fetch(file.url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map(normalizeGuestRecord);
  } catch (err) {
    console.warn("Blob load:", err);
    return null;
  }
}

export async function loadInvites() {
  if (Array.isArray(globalThis.__PJ_INVITES__)) {
    return globalThis.__PJ_INVITES__;
  }

  // Vercel uniquement : Blob (source de vérité) puis fichier du dépôt
  const blob = await loadBlobInvites();
  if (blob) {
    globalThis.__PJ_INVITES__ = blob;
    return globalThis.__PJ_INVITES__;
  }

  const bundled = loadBundledInvites();
  globalThis.__PJ_INVITES__ = bundled;

  if (bundled.length && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await put(BLOB_PATH, JSON.stringify(bundled, null, 2), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
    } catch (err) {
      console.warn("Blob bootstrap save:", err);
    }
  }

  return globalThis.__PJ_INVITES__;
}

export async function saveInvites(invites) {
  globalThis.__PJ_INVITES__ = invites;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("BLOB_READ_WRITE_TOKEN manquant — les changements ne seront pas persistés sur Vercel.");
    return;
  }

  try {
    await put(BLOB_PATH, JSON.stringify(invites, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.warn("Blob save:", err);
  }
}

export function normalizeWhatsapp(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 9) digits = `243${digits.slice(1)}`;
  if (digits.length === 9 && !digits.startsWith("243")) digits = `243${digits}`;
  return `+${digits}`;
}

export function normalizeTable(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  if (value.toLowerCase().startsWith("table ")) value = value.slice(6).trim();
  if (/^\d+$/.test(value)) return String(parseInt(value, 10));
  return value;
}

export function normalizePersonnes(inviteType, raw) {
  const t = String(inviteType || "singleton").toLowerCase();
  if (t === "singleton") return 1;
  if (t === "couple") return 2;
  const n = Number(raw || 0);
  return Number.isFinite(n) ? Math.max(n, 3) : 3;
}

export function generateCode(invites) {
  const existing = new Set(invites.map((g) => String(g.code || "").toUpperCase()));
  while (true) {
    let code = "PJ-";
    for (let i = 0; i < 6; i += 1) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
}

export function normalizeEvenement(raw) {
  return String(raw || "").trim().toLowerCase() === "civil" ? "civil" : "soiree";
}

export function guestPublic(guest) {
  return {
    code: guest.code || "",
    nom: guest.nom || "",
    type: guest.type || "",
    personnes: guest.personnes || 1,
    statut: guest.statut || "",
    table: guest.table || "",
    whatsapp: guest.whatsapp || "",
    date_entree: guest.date_entree || "",
    evenement: normalizeEvenement(guest.evenement),
  };
}

const RSVP_DEADLINE = process.env.RSVP_DEADLINE || "2026-08-15T23:59:59+01:00";

export function isRsvpOpen(now = new Date()) {
  const deadline = new Date(RSVP_DEADLINE);
  if (Number.isNaN(deadline.getTime())) return now <= new Date("2026-08-15T23:59:59+01:00");
  return now.getTime() <= deadline.getTime();
}

export async function deleteGuest(payload) {
  const code = String(payload.code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Code requis" };
  const invites = await loadInvites();
  const next = invites.filter((g) => String(g.code || "").toUpperCase() !== code);
  if (next.length === invites.length) return { ok: false, error: "Invité introuvable", code };
  await saveInvites(next);
  return { ok: true, deleted: true, code };
}

export async function upsertGuest(payload, { defaultStatut }) {
  const nom = String(payload.nom || "").trim();
  if (!nom) return { ok: false, error: "Nom requis" };

  const inviteType = String(payload.type || "singleton").trim().toLowerCase();
  const personnes = normalizePersonnes(inviteType, payload.personnes);
  const notes = String(payload.notes || "RSVP site").trim();
  const statut = String(payload.statut || defaultStatut).trim().toLowerCase();
  const evenement = normalizeEvenement(payload.evenement);
  const hasTable = Object.prototype.hasOwnProperty.call(payload, "table");
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(payload, "whatsapp");
  const table = normalizeTable(payload.table);
  const whatsapp = normalizeWhatsapp(payload.whatsapp);

  const invites = await loadInvites();
  const existing = invites.find(
    (g) =>
      String(g.nom || "").trim().toLowerCase() === nom.toLowerCase() &&
      normalizeEvenement(g.evenement) === evenement
  );
  if (existing) {
    if (existing.statut === "entree") {
      return { ok: true, updated: true, alreadyIn: true, guest: guestPublic(existing) };
    }
    existing.type = inviteType;
    existing.personnes = personnes;
    existing.statut = statut;
    existing.evenement = evenement;
    existing.notes = notes || existing.notes || "";
    if (hasTable) existing.table = table;
    if (hasWhatsapp) existing.whatsapp = whatsapp;
    await saveInvites(invites);
    return { ok: true, updated: true, guest: guestPublic(existing) };
  }

  const guest = {
    code: generateCode(invites),
    nom,
    type: inviteType,
    personnes,
    table: hasTable ? table : "",
    whatsapp: hasWhatsapp ? whatsapp : "",
    statut,
    evenement,
    date_entree: "",
    notes,
    created_at: new Date().toISOString().slice(0, 19),
  };
  invites.push(guest);
  await saveInvites(invites);
  return { ok: true, created: true, guest: guestPublic(guest) };
}

export async function updateGuest(payload) {
  const code = String(payload.code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Code requis" };
  const invites = await loadInvites();
  const guest = invites.find((g) => String(g.code || "").toUpperCase() === code);
  if (!guest) return { ok: false, error: "Invité introuvable", code };

  if (Object.prototype.hasOwnProperty.call(payload, "table")) {
    guest.table = normalizeTable(payload.table);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "whatsapp")) {
    guest.whatsapp = normalizeWhatsapp(payload.whatsapp);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    guest.notes = String(payload.notes || "").trim();
  }
  if (payload.nom && String(payload.nom).trim()) {
    guest.nom = String(payload.nom).trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "evenement")) {
    guest.evenement = normalizeEvenement(payload.evenement);
  }
  await saveInvites(invites);
  return { ok: true, updated: true, guest: guestPublic(guest) };
}

export async function validateCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  const invites = await loadInvites();
  const guest = invites.find((g) => String(g.code || "").toUpperCase() === code);
  if (!guest) return { ok: false, error: "QR inconnu", code };
  if (guest.statut === "entree") {
    return { ok: false, error: "Déjà entré", alreadyIn: true, ...guestPublic(guest) };
  }
  return { ok: true, canEnter: true, ...guestPublic(guest) };
}

export async function checkinCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  const invites = await loadInvites();
  const guest = invites.find((g) => String(g.code || "").toUpperCase() === code);
  if (!guest) return { ok: false, error: "QR inconnu", code };
  if (guest.statut === "entree") {
    return { ok: false, error: "Déjà entré", alreadyIn: true, ...guestPublic(guest) };
  }
  guest.statut = "entree";
  const now = new Date();
  guest.date_entree = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  await saveInvites(invites);
  return { ok: true, message: "Entrée validée", ...guestPublic(guest) };
}

export function toCsv(invites) {
  const header = "code,nom,type,personnes,table,whatsapp,statut,date_entree,evenement,notes";
  const rows = invites.map((g) =>
    [
      g.code,
      g.nom,
      g.type,
      g.personnes,
      g.table,
      g.whatsapp,
      g.statut,
      g.date_entree,
      normalizeEvenement(g.evenement),
      g.notes,
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}
