import { cors, bodyOf } from "../lib/httpApi.js";
import { loadInvites } from "../lib/invites.js";
import { renderInviteCard } from "../lib/renderInviteCard.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET" || req.method === "POST") {
      const body = req.method === "POST" ? bodyOf(req) : {};
      const code = String(req.query?.code || body.code || "").trim().toUpperCase();
      if (!/^PJ-[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ ok: false, error: "Code requis" });
      }

      const guests = await loadInvites();
      const guest = guests.find((g) => String(g.code || "").toUpperCase() === code);
      if (!guest) return res.status(404).json({ ok: false, error: "Invité introuvable" });

      if (req.method === "POST") {
        return res.status(200).json({
          ok: true,
          code,
          imageUrl: `/api/invite-card?code=${encodeURIComponent(code)}`,
          viewUrl: `/carte-invite.html?code=${encodeURIComponent(code)}`,
        });
      }

      const buf = await renderInviteCard(guest);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
      return res.status(200).send(buf);
    }

    return res.status(405).json({ ok: false, error: "GET ou POST requis" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Erreur invitation",
    });
  }
}
