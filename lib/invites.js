import { get, put } from "@vercel/blob";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BLOB_PATH = "invites/invites.json";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GITHUB_REPO = process.env.INVITES_GITHUB_REPO || "JeanMBAYO08/mon-mariage";
const GITHUB_PATH = "data/invites.json";
const GITHUB_BRANCH = process.env.INVITES_GITHUB_BRANCH || "main";

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function streamToString(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8").decode(merged);
}

function dataFilePath() {
  const dir = dirname(fileURLToPath(import.meta.url));
  return join(dir, "../data/invites.json");
}

function loadBundledInvites() {
  try {
    const data = JSON.parse(readFileSync(dataFilePath(), "utf8"));
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

function githubHeaders(extra = {}) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function loadGitHubInvites() {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
    const res = await fetch(url, {
      headers: githubHeaders({ Accept: "application/vnd.github.raw+json" }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map(normalizeGuestRecord);
  } catch (err) {
    console.warn("GitHub load:", err);
    return null;
  }
}

async function saveGitHubInvites(invites) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) return false;

  const metaUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const metaRes = await fetch(metaUrl, { headers: githubHeaders(), cache: "no-store" });
  if (!metaRes.ok) throw new Error(`Lecture GitHub impossible (${metaRes.status})`);
  const meta = await metaRes.json();
  const sha = meta.sha;
  if (!sha) throw new Error("SHA GitHub introuvable");

  const content = Buffer.from(JSON.stringify(invites, null, 2) + "\n", "utf8").toString("base64");
  const putRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`, {
    method: "PUT",
    headers: githubHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      message: "chore: update invites list",
      content,
      sha,
      branch: GITHUB_BRANCH,
    }),
  });
  if (!putRes.ok) {
    const detail = await putRes.text();
    throw new Error(`Écriture GitHub impossible (${putRes.status}): ${detail.slice(0, 180)}`);
  }
  return true;
}

async function loadBlobInvites() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  try {
    // Lecture privée directe, sans cache CDN (sinon liste figée après un RSVP)
    const result = await get(BLOB_PATH, {
      access: "private",
      useCache: false,
      token,
    });
    if (!result) return [];
    if (result.statusCode !== 200 || !result.stream) {
      throw new Error(`Blob get status ${result.statusCode}`);
    }
    const raw = await streamToString(result.stream);
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("Blob invites.json invalide");
    return data.map(normalizeGuestRecord);
  } catch (err) {
    const message = err?.message || String(err);
    console.warn("Blob load:", message);
    // Ne jamais silencieusement retomber sur le JSON du déploiement :
    // cela réécraserait la vraie liste au prochain RSVP.
    const error = new Error(`Lecture Blob impossible: ${message}`);
    error.code = "BLOB_LOAD_FAILED";
    throw error;
  }
}

async function saveBlobInvites(invites) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    await put(BLOB_PATH, JSON.stringify(invites, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token,
    });
    return true;
  } catch (err) {
    console.warn("Blob save:", err?.message || err);
    return false;
  }
}

function saveLocalInvites(invites) {
  writeFileSync(dataFilePath(), `${JSON.stringify(invites, null, 2)}\n`, "utf8");
}

export async function loadInvites() {
  const onVercel = process.env.VERCEL === "1";

  // Cache uniquement hors Vercel (en prod les instances chaudes serviraient une liste périmée)
  if (
    !onVercel &&
    Array.isArray(globalThis.__PJ_INVITES__) &&
    globalThis.__PJ_INVITES_FRESH__
  ) {
    return globalThis.__PJ_INVITES__;
  }

  // 1) Blob Vercel — source de vérité dès qu’un token est présent
  if (hasBlobToken()) {
    const fromBlob = await loadBlobInvites();
    globalThis.__PJ_INVITES__ = fromBlob;
    globalThis.__PJ_INVITES_FRESH__ = !onVercel;
    return fromBlob;
  }

  // 2) GitHub
  const fromGitHub = await loadGitHubInvites();
  if (fromGitHub) {
    globalThis.__PJ_INVITES__ = fromGitHub;
    globalThis.__PJ_INVITES_FRESH__ = !onVercel;
    return fromGitHub;
  }

  // 3) Fichier local / déploiement (dev sans Blob)
  const bundled = loadBundledInvites();
  globalThis.__PJ_INVITES__ = bundled;
  globalThis.__PJ_INVITES_FRESH__ = !onVercel;
  return bundled;
}

export async function saveInvites(invites) {
  globalThis.__PJ_INVITES__ = invites;
  globalThis.__PJ_INVITES_FRESH__ = process.env.VERCEL !== "1";

  const onVercel = process.env.VERCEL === "1";

  if (!onVercel) {
    saveLocalInvites(invites);
    if (hasBlobToken()) await saveBlobInvites(invites);
    return;
  }

  // Prod : Blob d’abord, puis GitHub
  const blobOk = await saveBlobInvites(invites);
  if (blobOk) return;

  const githubOk = await saveGitHubInvites(invites);
  if (githubOk) return;

  throw new Error(
    "Stockage Vercel non configuré. Ouvrez Vercel → Storage → Create Database → Blob, " +
      "liez-le au projet mon-mariage, puis Redeploy. " +
      "Sinon ajoutez la variable GITHUB_TOKEN (droit Contents write)."
  );
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

const RSVP_DEADLINE = process.env.RSVP_DEADLINE || "2026-08-25T23:59:59+01:00";
const RSVP_MANUAL_ONLY = String(process.env.RSVP_MANUAL_ONLY || "1") !== "0";

export function isRsvpOpen(now = new Date()) {
  if (RSVP_MANUAL_ONLY) return false;
  const deadline = new Date(RSVP_DEADLINE);
  if (Number.isNaN(deadline.getTime())) return now <= new Date("2026-08-25T23:59:59+01:00");
  return now.getTime() <= deadline.getTime();
}

export async function deleteGuest(payload) {
  const code = String(payload.code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Code requis" };
  // Forcer un reload frais
  globalThis.__PJ_INVITES_FRESH__ = false;
  globalThis.__PJ_INVITES__ = undefined;
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

  globalThis.__PJ_INVITES_FRESH__ = false;
  globalThis.__PJ_INVITES__ = undefined;
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

  const preferredCode = String(payload.code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const codeTaken = new Set(invites.map((g) => String(g.code || "").toUpperCase()));
  const code =
    /^PJ-[A-Z0-9]{6}$/.test(preferredCode) && !codeTaken.has(preferredCode)
      ? preferredCode
      : generateCode(invites);

  const guest = {
    code,
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
  globalThis.__PJ_INVITES_FRESH__ = false;
  globalThis.__PJ_INVITES__ = undefined;
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
  if (Object.prototype.hasOwnProperty.call(payload, "type")) {
    const inviteType = String(payload.type || "singleton").trim().toLowerCase();
    if (["singleton", "couple", "collectif"].includes(inviteType)) {
      guest.type = inviteType;
      guest.personnes = normalizePersonnes(inviteType, payload.personnes ?? guest.personnes);
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "statut")) {
    const statut = String(payload.statut || "").trim().toLowerCase();
    if (["invite", "confirme", "entree"].includes(statut)) {
      guest.statut = statut;
      if (statut === "entree") {
        const now = new Date();
        guest.date_entree = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      } else {
        guest.date_entree = "";
      }
    }
  }
  await saveInvites(invites);
  return { ok: true, updated: true, guest: guestPublic(guest) };
}

export async function validateCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  globalThis.__PJ_INVITES_FRESH__ = false;
  globalThis.__PJ_INVITES__ = undefined;
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
  globalThis.__PJ_INVITES_FRESH__ = false;
  globalThis.__PJ_INVITES__ = undefined;
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
