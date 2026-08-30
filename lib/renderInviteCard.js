import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import opentype from "opentype.js";
import sharp from "sharp";
import { normalizeEvenement } from "./invites.js";

const BASE_CARD = fileURLToPath(new URL("../images/invitation-final.jpg", import.meta.url));
const SERIF_FONT = fileURLToPath(new URL("../fonts/PlayfairDisplay-Medium.ttf", import.meta.url));
const SANS_FONT = fileURLToPath(new URL("../fonts/JosefinSans-Medium.ttf", import.meta.url));

const OUTPUT_WIDTH = 1080;
const REMAKE_TOP = 0.954;
const PANEL_TOP = 0.785;

function parseFont(path) {
  const buf = readFileSync(path);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const serifFont = parseFont(SERIF_FONT);
const sansFont = parseFont(SANS_FONT);

function wrapLines(font, text, size, maxWidth) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.getAdvanceWidth(next, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function textPath(font, text, cx, y, size, fill, strokeWidth = 1.15) {
  const width = font.getAdvanceWidth(text, size);
  const path = font.getPath(text, cx - width / 2, y, size);
  return `<path d="${path.toPathData(2)}" fill="${fill}" stroke="${fill}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;
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
  const maxTextW = Math.round(w * 0.88);
  let nameSize = Math.round(w * 0.044);
  let nameLines = wrapLines(serifFont, nom, nameSize, maxTextW);
  if (nameLines.some((line) => serifFont.getAdvanceWidth(line, nameSize) > maxTextW)) {
    nameSize = Math.round(w * 0.036);
    nameLines = wrapLines(serifFont, nom, nameSize, maxTextW);
  }
  const typeSize = Math.round(w * 0.032);
  const tableSize = Math.round(w * 0.034);
  const lineGap = Math.round(h * 0.028);
  const blockH =
    nameLines.length * Math.round(nameSize * 1.2) + lineGap * 2 + typeSize + tableSize;
  let y = panelTop + Math.round((panelH - blockH) / 2) + nameSize;

  const nameSvg = nameLines
    .map((line, i) =>
      textPath(serifFont, line, w / 2, y + i * Math.round(nameSize * 1.2), nameSize, "#ffffff", 1.4)
    )
    .join("");
  y += nameLines.length * Math.round(nameSize * 1.2) + Math.round(lineGap * 0.45);
  const typeSvg = textPath(sansFont, type, w / 2, y, typeSize, "#ffffff", 1.5);
  const tableSvg = textPath(
    sansFont,
    table,
    w / 2,
    y + lineGap + Math.round(typeSize * 0.2),
    tableSize,
    "#f3dd9a",
    1.5
  );

  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="${panelTop}" x2="0" y2="${remakeTop}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="rgb(28,22,16)" stop-opacity="0"/>
          <stop offset="0.22" stop-color="rgb(28,22,16)" stop-opacity="0.55"/>
          <stop offset="1" stop-color="rgb(28,22,16)" stop-opacity="0.78"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${panelTop}" width="${w}" height="${panelH}" fill="url(#fade)"/>
      ${nameSvg}
      ${typeSvg}
      ${tableSvg}
    </svg>
  `;

  return sharp(photo)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 96, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}
