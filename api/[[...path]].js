import {
  loadInvites,
  upsertGuest,
  updateGuest,
  deleteGuest,
  validateCode,
  checkinCode,
  toCsv,
  isRsvpOpen,
} from "../lib/invites.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function bodyOf(req) {
  if (req.body == null) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const parts = req.query.path;
    const subPath = Array.isArray(parts) ? parts.join("/") : parts || "";
    const path = subPath.replace(/^\/+|\/+$/g, "");
    const url = new URL(req.url, "http://localhost");
    const q = Object.fromEntries(url.searchParams.entries());

    if (path === "ping") {
      return res.status(200).json({ ok: true, message: "API Vercel prête" });
    }

    if (path === "invites" || path === "list") {
      const guests = await loadInvites();
      return res.status(200).json({ ok: true, guests, total: guests.length });
    }

    if (path === "invites.csv") {
      const guests = await loadInvites();
      const csv = toCsv(guests);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="invites.csv"');
      return res.status(200).send(csv);
    }

    if (path === "validate") {
      const code = q.code || bodyOf(req).code || "";
      return res.status(200).json(await validateCode(code));
    }

    if (path === "checkin") {
      const code = q.code || bodyOf(req).code || "";
      return res.status(200).json(await checkinCode(code));
    }

    if (path === "rsvp" && req.method === "POST") {
      if (!isRsvpOpen()) {
        return res.status(403).json({
          ok: false,
          closed: true,
          error: "Les confirmations sont closes depuis le 15 août 2026.",
        });
      }
      return res.status(200).json(await upsertGuest(bodyOf(req), { defaultStatut: "confirme" }));
    }

    if (path === "add" && req.method === "POST") {
      return res.status(200).json(await upsertGuest(bodyOf(req), { defaultStatut: "invite" }));
    }

    if ((path === "update" || path === "table") && req.method === "POST") {
      return res.status(200).json(await updateGuest(bodyOf(req)));
    }

    if (path === "delete" && req.method === "POST") {
      return res.status(200).json(await deleteGuest(bodyOf(req)));
    }

    // Compat: POST /api/rsvp etc. already handled; unknown
    return res.status(404).json({ ok: false, error: "Route inconnue", path });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Erreur serveur",
    });
  }
}
