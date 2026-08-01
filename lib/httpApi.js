import {
  loadInvites,
  upsertGuest,
  updateGuest,
  deleteGuest,
  validateCode,
  checkinCode,
  toCsv,
  isRsvpOpen,
} from "./invites.js";

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function bodyOf(req) {
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

export function resolvePath(req) {
  const parts = req.query?.path;
  if (Array.isArray(parts) && parts.length) {
    return parts.filter(Boolean).join("/");
  }
  if (typeof parts === "string" && parts.trim()) {
    return parts.replace(/^\/+|\/+$/g, "");
  }

  const raw = String(req.url || "").split("?")[0] || "";
  return raw
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\/?/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/g, "");
}

export async function handleApi(req, res, forcedPath = "") {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const path = String(forcedPath || resolvePath(req) || "").replace(/^\/+|\/+$/g, "");
    const url = new URL(req.url || "/", "http://localhost");
    const q = Object.fromEntries(url.searchParams.entries());

    if (path === "ping" || path === "") {
      return res.status(200).json({ ok: true, message: "API Vercel prête", path: path || "root" });
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

    if (path === "rsvp") {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "POST requis" });
      }
      if (!isRsvpOpen()) {
        return res.status(403).json({
          ok: false,
          closed: true,
          error: "Les confirmations sont closes depuis le 15 août 2026.",
        });
      }
      return res.status(200).json(await upsertGuest(bodyOf(req), { defaultStatut: "confirme" }));
    }

    if (path === "add") {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "POST requis" });
      }
      return res.status(200).json(await upsertGuest(bodyOf(req), { defaultStatut: "invite" }));
    }

    if (path === "update" || path === "table") {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "POST requis" });
      }
      return res.status(200).json(await updateGuest(bodyOf(req)));
    }

    if (path === "delete") {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "POST requis" });
      }
      return res.status(200).json(await deleteGuest(bodyOf(req)));
    }

    return res.status(404).json({ ok: false, error: "Route inconnue", path });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Erreur serveur",
    });
  }
}
