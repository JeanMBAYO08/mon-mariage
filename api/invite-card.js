import { get, put } from "@vercel/blob";
import { cors, bodyOf } from "../lib/httpApi.js";
import { loadInvites } from "../lib/invites.js";

const token = () => process.env.BLOB_READ_WRITE_TOKEN;

function cardPath(code) {
  return `cards/${String(code || "").trim().toUpperCase()}.jpg`;
}

async function streamToBuffer(stream) {
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
  return Buffer.from(merged);
}

function decodeImage(raw) {
  const value = String(raw || "").trim();
  const match = value.match(/^data:image\/\w+;base64,(.+)$/);
  const b64 = match ? match[1] : value;
  if (!b64) return null;
  const buf = Buffer.from(b64, "base64");
  return buf.length ? buf : null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const code = String(req.query?.code || "").trim().toUpperCase();
      if (!/^PJ-[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ ok: false, error: "Code requis" });
      }
      if (!token()) return res.status(503).json({ ok: false, error: "Stockage indisponible" });
      const result = await get(cardPath(code), {
        access: "private",
        useCache: false,
        token: token(),
      });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return res.status(404).json({ ok: false, error: "Image introuvable" });
      }
      const buf = await streamToBuffer(result.stream);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=120");
      return res.status(200).send(buf);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST ou GET requis" });
    }

    const body = bodyOf(req);
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^PJ-[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({ ok: false, error: "Code requis" });
    }

    const guests = await loadInvites();
    const guest = guests.find((g) => String(g.code || "").toUpperCase() === code);
    if (!guest) return res.status(404).json({ ok: false, error: "Invité introuvable" });

    const image = decodeImage(body.image);
    if (!image) return res.status(400).json({ ok: false, error: "Image requise" });
    if (!token()) return res.status(503).json({ ok: false, error: "Stockage indisponible" });

    await put(cardPath(code), image, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
      token: token(),
    });

    return res.status(200).json({
      ok: true,
      code,
      imageUrl: `/api/invite-card?code=${encodeURIComponent(code)}`,
      viewUrl: `/carte-invite.html?code=${encodeURIComponent(code)}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Erreur invitation",
    });
  }
}
