import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import sharp from "sharp";
import { normalizeEvenement } from "./invites.js";

const BASE_CARD = fileURLToPath(new URL("../images/invitation-final.jpg", import.meta.url));
const SERIF_FONT = fileURLToPath(new URL("../fonts/PlayfairDisplay-Medium.ttf", import.meta.url));
const SANS_FONT = fileURLToPath(new URL("../fonts/JosefinSans-Medium.ttf", import.meta.url));

const OUTPUT_WIDTH = 1080;
const REMAKE_TOP = 0.954;
const PANEL_TOP = 0.785;

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLines(text, maxLen = 24) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
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
    ? `Table ${tableRaw}`
    : evenement === "civil"
      ? "Cérémonie civile"
      : "Table à confirmer";
  return { nom, type, table };
}

export async function renderInviteCard(guest) {
  const { nom, type, table } = inviteCardLabels(guest);
  const source = sharp(readFileSync(BASE_CARD)).rotate();
  const meta = await source.metadata();
  const srcW = meta.width || 608;
  const srcH = meta.height || 1080;
  const w = OUTPUT_WIDTH;
  const h = Math.round(srcH * (w / srcW));
  const photo = await sharp(readFileSync(BASE_CARD))
    .rotate()
    .resize(w, h, { kernel: "lanczos3" })
    .sharpen({ sigma: 0.7 })
    .toBuffer();

  const panelTop = Math.round(h * PANEL_TOP);
  const remakeTop = Math.round(h * REMAKE_TOP);
  const panelH = remakeTop - panelTop;
  const nameLines = wrapLines(nom, 26);
  const nameSize = nameLines.some((line) => line.length > 22)
    ? Math.round(w * 0.038)
    : Math.round(w * 0.044);
  const typeSize = Math.round(w * 0.026);
  const tableSize = Math.round(w * 0.028);
  const lineGap = Math.round(h * 0.032);
  const blockH =
    nameLines.length * Math.round(nameSize * 1.15) + lineGap * 2 + typeSize + tableSize;
  let y = panelTop + Math.round((panelH - blockH) / 2) + nameSize;

  const nameSvg = nameLines
    .map((line, i) => {
      const yy = y + i * Math.round(nameSize * 1.15);
      return `<text x="${w / 2}" y="${yy}" text-anchor="middle" fill="#ffffff" font-size="${nameSize}" font-family="InviteSerif" font-weight="500">${escapeXml(line)}</text>`;
    })
    .join("");
  y += nameLines.length * Math.round(nameSize * 1.15) + Math.round(lineGap * 0.35);
  const typeY = y;
  const tableY = y + lineGap + Math.round(typeSize * 0.2);

  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face {
            font-family: "InviteSerif";
            src: url("${pathToFileURL(SERIF_FONT).href}");
          }
          @font-face {
            font-family: "InviteSans";
            src: url("${pathToFileURL(SANS_FONT).href}");
          }
        </style>
        <linearGradient id="fade" x1="0" y1="${panelTop}" x2="0" y2="${remakeTop}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="rgb(28,22,16)" stop-opacity="0"/>
          <stop offset="0.22" stop-color="rgb(28,22,16)" stop-opacity="0.55"/>
          <stop offset="1" stop-color="rgb(28,22,16)" stop-opacity="0.78"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${panelTop}" width="${w}" height="${panelH}" fill="url(#fade)"/>
      ${nameSvg}
      <text x="${w / 2}" y="${typeY}" text-anchor="middle" fill="rgba(255,255,255,0.86)" font-size="${typeSize}" font-family="InviteSans" font-weight="500">${escapeXml(type)}</text>
      <text x="${w / 2}" y="${tableY}" text-anchor="middle" fill="#e8d5a3" font-size="${tableSize}" font-family="InviteSans" font-weight="500">${escapeXml(table)}</text>
    </svg>
  `;

  return sharp(photo)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 96, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}
