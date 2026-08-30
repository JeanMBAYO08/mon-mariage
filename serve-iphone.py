#!/usr/bin/env python3
"""Serveur local pour tester sur iPhone + API liste d'invités."""

from __future__ import annotations

import csv
import json
import os
import random
import re
import base64
import socket
import ssl
import subprocess
import urllib.parse
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERT_DIR = ROOT / "acces" / "certs"
CERT = CERT_DIR / "cert.pem"
KEY = CERT_DIR / "key.pem"
CONFIG = ROOT / "acces" / "config.js"
DATA_DIR = ROOT / "data"
CARDS_DIR = DATA_DIR / "cards"
INVITES_JSON = DATA_DIR / "invites.json"
INVITES_CSV = DATA_DIR / "invites.csv"
PORT = int(os.environ.get("PORT", "5173"))
USE_HTTPS = os.environ.get("USE_HTTPS", "0") == "1"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def lan_ip() -> str:
    try:
        out = subprocess.check_output(["ipconfig", "getifaddr", "en0"], text=True).strip()
        if out:
            return out
    except Exception:
        pass

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


def ensure_certs(ip: str) -> None:
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    need = not CERT.exists() or not KEY.exists()
    if not need and CERT.exists():
        text = CERT.read_text(errors="ignore")
        if ip not in text:
            need = True
    if not need:
        return

    subprocess.check_call(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(KEY),
            "-out",
            str(CERT),
            "-days",
            "825",
            "-nodes",
            "-subj",
            f"/CN={ip}",
            "-addext",
            f"subjectAltName=IP:{ip},DNS:localhost",
        ]
    )


def public_base_url(ip: str, port: int, scheme: str) -> str:
    val = (os.environ.get("SITE_BASE_URL") or "").strip().rstrip("/")
    if val:
        return val
    return f"{scheme}://{ip}:{port}"


def update_site_base(ip: str, port: int, scheme: str) -> None:
    # Ne pas réécrire config.js en local (Vercel reste la source de vérité en prod)
    return


def load_invites() -> list[dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not INVITES_JSON.exists():
        INVITES_JSON.write_text("[]", encoding="utf-8")
        return []
    try:
        data = json.loads(INVITES_JSON.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def normalize_table(raw) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    # Noms de domaine (Vision, Robotique…) ou numéro éventuel
    if value.lower().startswith("table "):
        value = value[6:].strip()
    if value.isdigit():
        return str(int(value))
    return value


def normalize_whatsapp(raw) -> str:
    digits = re.sub(r"\D", "", str(raw or ""))
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    # RDC : 0821… → 243821…
    if digits.startswith("0") and len(digits) >= 9:
        digits = "243" + digits[1:]
    # 9 chiffres sans indicatif → RDC
    if len(digits) == 9 and not digits.startswith("243"):
        digits = "243" + digits
    return f"+{digits}"


def normalize_evenement(raw) -> str:
    value = str(raw or "").strip().lower()
    return "civil" if value == "civil" else "soiree"


def guest_public(guest: dict, *extra_keys: str) -> dict:
    keys = ("code", "nom", "type", "personnes", "statut", "table", "whatsapp", "date_entree", "evenement") + extra_keys
    data = {k: guest.get(k, "") for k in keys}
    data["evenement"] = normalize_evenement(data.get("evenement") or guest.get("evenement"))
    return data


def save_invites(invites: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    INVITES_JSON.write_text(json.dumps(invites, ensure_ascii=False, indent=2), encoding="utf-8")
    with INVITES_CSV.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "code",
                "nom",
                "type",
                "personnes",
                "table",
                "whatsapp",
                "statut",
                "date_entree",
                "evenement",
                "notes",
            ],
        )
        writer.writeheader()
        for guest in invites:
            writer.writerow(
                {
                    "code": guest.get("code", ""),
                    "nom": guest.get("nom", ""),
                    "type": guest.get("type", ""),
                    "personnes": guest.get("personnes", 1),
                    "table": guest.get("table", ""),
                    "whatsapp": guest.get("whatsapp", ""),
                    "statut": guest.get("statut", ""),
                    "date_entree": guest.get("date_entree", ""),
                    "evenement": normalize_evenement(guest.get("evenement")),
                    "notes": guest.get("notes", ""),
                }
            )


def generate_code(invites: list[dict]) -> str:
    existing = {str(g.get("code", "")).upper() for g in invites}
    while True:
        code = "PJ-" + "".join(random.choice(ALPHABET) for _ in range(6))
        if code not in existing:
            return code


def normalize_personnes(invite_type: str, raw: str | int | None) -> int:
    t = (invite_type or "singleton").lower()
    if t == "singleton":
        return 1
    if t == "couple":
        return 2
    try:
        n = int(raw or 0)
    except Exception:
        n = 0
    return max(n, 3)


def upsert_rsvp(payload: dict) -> dict:
    nom = str(payload.get("nom") or "").strip()
    if not nom:
        return {"ok": False, "error": "Nom requis"}

    invite_type = str(payload.get("type") or "singleton").strip().lower()
    personnes = normalize_personnes(invite_type, payload.get("personnes"))
    notes = str(payload.get("notes") or "RSVP site").strip()
    statut = str(payload.get("statut") or "confirme").strip().lower()
    evenement = normalize_evenement(payload.get("evenement"))
    table = normalize_table(payload.get("table"))
    has_table = "table" in payload
    has_whatsapp = "whatsapp" in payload
    whatsapp = normalize_whatsapp(payload.get("whatsapp"))

    invites = load_invites()
    for guest in invites:
        same_name = str(guest.get("nom", "")).strip().lower() == nom.lower()
        same_event = normalize_evenement(guest.get("evenement")) == evenement
        if same_name and same_event:
            if guest.get("statut") == "entree":
                return {"ok": True, "updated": True, "alreadyIn": True, "guest": guest_public(guest)}
            guest.update(
                {
                    "type": invite_type,
                    "personnes": personnes,
                    "statut": statut,
                    "evenement": evenement,
                    "notes": notes or guest.get("notes", ""),
                }
            )
            if has_table:
                guest["table"] = table
            elif "table" not in guest:
                guest["table"] = ""
            if has_whatsapp:
                guest["whatsapp"] = whatsapp
            elif "whatsapp" not in guest:
                guest["whatsapp"] = ""
            save_invites(invites)
            return {"ok": True, "updated": True, "guest": guest_public(guest)}

    preferred = str(payload.get("code") or "").strip().upper().replace(" ", "")
    existing_codes = {str(g.get("code", "")).upper() for g in invites}
    code = (
        preferred
        if re.fullmatch(r"PJ-[A-Z0-9]{6}", preferred) and preferred not in existing_codes
        else generate_code(invites)
    )
    guest = {
        "code": code,
        "nom": nom,
        "type": invite_type,
        "personnes": personnes,
        "table": table,
        "whatsapp": whatsapp,
        "statut": statut,
        "evenement": evenement,
        "date_entree": "",
        "notes": notes,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    invites.append(guest)
    save_invites(invites)
    return {"ok": True, "created": True, "guest": guest_public(guest)}


RSVP_DEADLINE = os.environ.get("RSVP_DEADLINE", "2026-08-25T23:59:59+01:00")


def rsvp_open(now: datetime | None = None) -> bool:
    if os.environ.get("RSVP_MANUAL_ONLY", "1") != "0":
        return False
    current = now or datetime.now().astimezone()
    try:
        deadline = datetime.fromisoformat(RSVP_DEADLINE)
    except Exception:
        deadline = datetime.fromisoformat("2026-08-25T23:59:59+01:00")
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=current.tzinfo)
    if current.tzinfo is None:
        current = current.replace(tzinfo=deadline.tzinfo)
    return current <= deadline


def delete_guest(payload: dict) -> dict:
    code = str(payload.get("code") or "").strip().upper()
    if not code:
        return {"ok": False, "error": "Code requis"}
    invites = load_invites()
    kept = [g for g in invites if str(g.get("code", "")).upper() != code]
    if len(kept) == len(invites):
        return {"ok": False, "error": "Invité introuvable", "code": code}
    save_invites(kept)
    return {"ok": True, "deleted": True, "code": code}


def update_guest(payload: dict) -> dict:
    code = str(payload.get("code") or "").strip().upper()
    if not code:
        return {"ok": False, "error": "Code requis"}

    invites = load_invites()
    for guest in invites:
        if str(guest.get("code", "")).upper() != code:
            continue
        if "table" in payload:
            guest["table"] = normalize_table(payload.get("table"))
        if "whatsapp" in payload:
            guest["whatsapp"] = normalize_whatsapp(payload.get("whatsapp"))
        if "notes" in payload:
            guest["notes"] = str(payload.get("notes") or "").strip()
        if "nom" in payload and str(payload.get("nom") or "").strip():
            guest["nom"] = str(payload.get("nom")).strip()
        if "evenement" in payload:
            guest["evenement"] = normalize_evenement(payload.get("evenement"))
        if "type" in payload:
            invite_type = str(payload.get("type") or "singleton").strip().lower()
            if invite_type in ("singleton", "couple", "collectif"):
                guest["type"] = invite_type
                guest["personnes"] = normalize_personnes(
                    invite_type, payload.get("personnes", guest.get("personnes"))
                )
        save_invites(invites)
        return {"ok": True, "updated": True, "guest": guest_public(guest)}

    return {"ok": False, "error": "Invité introuvable", "code": code}


def find_guest(code: str) -> dict | None:
    target = str(code or "").strip().upper()
    if "CODE=" in target:
        target = target.split("CODE=")[-1].split("&")[0]
    for guest in load_invites():
        if str(guest.get("code", "")).upper() == target:
            return guest
    return None


def validate_code(code: str) -> dict:
    guest = find_guest(code)
    if not guest:
        return {"ok": False, "error": "QR inconnu", "code": code}
    if guest.get("statut") == "entree":
        return {
            "ok": False,
            "error": "Déjà entré",
            "alreadyIn": True,
            **guest_public(guest),
        }
    return {
        "ok": True,
        "canEnter": True,
        **guest_public(guest),
    }


def checkin_code(code: str) -> dict:
    invites = load_invites()
    target = str(code or "").strip().upper()
    for guest in invites:
        if str(guest.get("code", "")).upper() == target:
            if guest.get("statut") == "entree":
                return {
                    "ok": False,
                    "error": "Déjà entré",
                    "alreadyIn": True,
                    **guest_public(guest),
                }
            guest["statut"] = "entree"
            guest["date_entree"] = datetime.now().strftime("%d/%m/%Y %H:%M")
            save_invites(invites)
            return {
                "ok": True,
                "message": "Entrée validée",
                **guest_public(guest),
            }
    return {"ok": False, "error": "QR inconnu", "code": code}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _json(self, payload: dict, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _parse_qs(self) -> dict[str, str]:
        parsed = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(parsed.query)
        return {k: (v[0] if v else "") for k, v in q.items()}

    def _serve_file_with_range(self, path: str) -> bool:
        """Sert les vidéos / gros fichiers avec HTTP Range (requis par iPhone)."""
        rel = path.lstrip("/")
        if not rel or ".." in rel.split("/"):
            return False
        file_path = (ROOT / rel).resolve()
        try:
            file_path.relative_to(ROOT.resolve())
        except ValueError:
            return False
        if not file_path.is_file():
            return False

        ext = file_path.suffix.lower()
        if ext not in {".mp4", ".mov", ".m4v", ".webm", ".jpg", ".jpeg", ".png", ".webp"}:
            return False

        size = file_path.stat().st_size
        ctype = self.guess_type(str(file_path))
        range_header = self.headers.get("Range")

        start, end = 0, size - 1
        status = 200
        if range_header and range_header.startswith("bytes="):
            spec = range_header.replace("bytes=", "", 1).strip()
            if "," in spec:
                # multi-range non géré → fichier entier
                pass
            else:
                left, _, right = spec.partition("-")
                try:
                    if left == "":
                        # bytes=-N
                        length = int(right)
                        start = max(0, size - length)
                    else:
                        start = int(left)
                        end = int(right) if right else size - 1
                    if start >= size:
                        self.send_response(416)
                        self.send_header("Content-Range", f"bytes */{size}")
                        self.end_headers()
                        return True
                    end = min(end, size - 1)
                    if start > end:
                        start, end = 0, size - 1
                    else:
                        status = 206
                except ValueError:
                    start, end = 0, size - 1
                    status = 200

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()

        with file_path.open("rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    break
                remaining -= len(chunk)
        return True

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/ping":
            return self._json({"ok": True, "message": "API locale prête"})

        if path == "/api/invites" or path == "/api/list":
            invites = load_invites()
            guests = [guest_public(g, "notes", "created_at") for g in invites]
            return self._json({"ok": True, "guests": guests, "total": len(guests)})

        if path == "/api/validate":
            q = self._parse_qs()
            return self._json(validate_code(q.get("code", "")))

        if path == "/api/checkin":
            q = self._parse_qs()
            return self._json(checkin_code(q.get("code", "")))

        if path == "/api/invites.csv":
            save_invites(load_invites())
            data = (
                INVITES_CSV.read_bytes()
                if INVITES_CSV.exists()
                else b"code,nom,type,personnes,table,whatsapp,statut,date_entree,notes\n"
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", "attachment; filename=invites.csv")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/invite-card":
            q = self._parse_qs()
            code = re.sub(r"[^A-Z0-9-]", "", str(q.get("code") or "").upper())
            card = CARDS_DIR / f"{code}.jpg"
            if not code or not card.exists():
                return self._json({"ok": False, "error": "Image introuvable"}, 404)
            data = card.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if self._serve_file_with_range(path):
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        payload = self._read_json()

        if path in ("/api/rsvp", "/api/add"):
            if path == "/api/rsvp":
                if not rsvp_open():
                    return self._json(
                        {
                            "ok": False,
                            "error": "Les confirmations en ligne sont closes. L’ajout se fait uniquement depuis l’admin.",
                            "closed": True,
                        },
                        403,
                    )
                payload["statut"] = payload.get("statut") or "confirme"
            else:
                payload["statut"] = payload.get("statut") or "invite"
            return self._json(upsert_rsvp(payload))

        if path in ("/api/update", "/api/table"):
            return self._json(update_guest(payload))

        if path == "/api/delete":
            return self._json(delete_guest(payload))

        if path == "/api/invite-card":
            code = re.sub(r"[^A-Z0-9-]", "", str(payload.get("code") or "").upper())
            raw = str(payload.get("image") or "")
            match = re.match(r"data:image/\w+;base64,(.+)$", raw)
            b64 = match.group(1) if match else raw
            if not code or not b64:
                return self._json({"ok": False, "error": "Code et image requis"}, 400)
            CARDS_DIR.mkdir(parents=True, exist_ok=True)
            (CARDS_DIR / f"{code}.jpg").write_bytes(base64.b64decode(b64))
            return self._json(
                {
                    "ok": True,
                    "code": code,
                    "imageUrl": f"/api/invite-card?code={code}",
                    "viewUrl": f"/carte-invite.html?code={code}",
                }
            )

        if path == "/api/checkin":
            return self._json(checkin_code(payload.get("code", "")))

        self._json({"ok": False, "error": "Route inconnue"}, 404)


def main() -> None:
    ip = lan_ip()
    scheme = "https" if USE_HTTPS else "http"
    if USE_HTTPS:
        ensure_certs(ip)
    update_site_base(ip, PORT, scheme)
    public = public_base_url(ip, PORT, scheme)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not INVITES_JSON.exists():
        save_invites([])

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    if USE_HTTPS:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=str(CERT), keyfile=str(KEY))
        server.socket = ctx.wrap_socket(server.socket, server_side=True)

    print("Serveur prêt", flush=True)
    print(f"  Public  : {public}", flush=True)
    print(f"  Admin   : {public}/admin-qr.html", flush=True)
    print(f"  Mac     : {scheme}://localhost:{PORT}", flush=True)
    print(f"  CSV     : {public}/api/invites.csv", flush=True)
    print(f"  Fichier : {INVITES_JSON}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
