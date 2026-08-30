import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { normalizeEvenement } from "./invites.js";

const BASE_CARD = fileURLToPath(new URL("../images/invitation-final.png", import.meta.url));

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inviteCardLabels(guest) {
  const evenement = normalizeEvenement(guest?.evenement);
  const nom = String(guest?.nom || "Invité").trim() || "Invité";
  const typeRaw = String(guest?.type || "").toLowerCase();
  const type =
    typeRaw === "couple"
      ? "Couple"
      : typeRaw === "collectif"
        ? "Collectif"
        : typeRaw === "singleton"
          ? "Singleton"
          : String(guest?.type || "Invitation");
  const tableRaw = String(guest?.table || "").trim();
  const table = tableRaw
    ? /^\d+$/.test(tableRaw)
      ? `Table ${tableRaw}`
      : `Table ${tableRaw}`
    : evenement === "civil"
      ? "Cérémonie civile"
      : "Table à confirmer";
  return { nom, type, table };
}

export async function renderInviteCard(guest) {
  const { nom, type, table } = inviteCardLabels(guest);
  const base = sharp(readFileSync(BASE_CARD));
  const meta = await base.metadata();
  const w = meta.width || 1080;
  const h = meta.height || 1920;
  const panelTop = Math.round(h * 0.86);
  const nameY = panelTop + Math.round(h * 0.045);
  const typeY = nameY + Math.round(h * 0.038);
  const tableY = typeY + Math.round(h * 0.034);
  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="${panelTop - 40}" x2="0" y2="${panelTop}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="rgb(86,66,41)" stop-opacity="0"/>
          <stop offset="1" stop-color="rgb(86,66,41)" stop-opacity="0.96"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${panelTop - 40}" width="${w}" height="40" fill="url(#fade)"/>
      <rect x="0" y="${panelTop}" width="${w}" height="${h - panelTop}" fill="rgb(86,66,41)" fill-opacity="0.96"/>
      <text x="${w / 2}" y="${nameY}" text-anchor="middle" fill="#ffffff" font-size="${Math.round(w * 0.042)}" font-family="Georgia, serif" font-weight="500">${escapeXml(nom)}</text>
      <text x="${w / 2}" y="${typeY}" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-size="${Math.round(w * 0.024)}" font-family="Helvetica, Arial, sans-serif">${escapeXml(type)}</text>
      <text x="${w / 2}" y="${tableY}" text-anchor="middle" fill="#e8d5a3" font-size="${Math.round(w * 0.022)}" font-family="Helvetica, Arial, sans-serif">${escapeXml(table)}</text>
    </svg>
  `;

  return sharp(readFileSync(BASE_CARD))
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
