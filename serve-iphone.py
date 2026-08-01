#!/usr/bin/env python3
"""Serveur local pour tester sur iPhone + API liste d'invités."""

from __future__ import annotations

import csv
import json
import os
import random
import re
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
    # Render / prod : utiliser l’URL publique, jamais l’IP interne du conteneur
    for key in ("SITE_BASE_URL", "RENDER_EXTERNAL_URL"):
        val = (os.environ.get(key) or "").strip().rstrip("/")
        if val:
            return val
    return f"{scheme}://{ip}:{port}"


def update_site_base(ip: str, port: int, scheme: str) -> None:
    if not CONFIG.exists():
        return
    content = CONFIG.read_text(encoding="utf-8")
    base = public_base_url(ip, port, scheme)
    updated = re.sub(
        r'SITE_BASE_URL:\s*"[^"]*"',
        f'SITE_BASE_URL: "{base}"',
        content,
        count=1,
    )
    if updated != content:
        CONFIG.write_text(updated, encoding="utf-8")


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


def guest_public(guest: dict, *extra_keys: str) -> dict:
    keys = ("code", "nom", "type", "personnes", "statut", "table", "whatsapp", "date_entree") + extra_keys
    return {k: guest.get(k, "") for k in keys}


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
    table = normalize_table(payload.get("table"))
    has_table = "table" in payload
    has_whatsapp = "whatsapp" in payload
    whatsapp = normalize_whatsapp(payload.get("whatsapp"))

    invites = load_invites()
    for guest in invites:
        if str(guest.get("nom", "")).strip().lower() == nom.lower():
            if guest.get("statut") == "entree":
                return {"ok": True, "updated": True, "alreadyIn": True, "guest": guest}
            guest.update(
                {
                    "type": invite_type,
                    "personnes": personnes,
                    "statut": statut,
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
            return {"ok": True, "updated": True, "guest": guest}

    guest = {
        "code": generate_code(invites),
        "nom": nom,
        "type": invite_type,
        "personnes": personnes,
        "table": table,
        "whatsapp": whatsapp,
        "statut": statut,
        "date_entree": "",
        "notes": notes,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    invites.append(guest)
    save_invites(invites)
    return {"ok": True, "created": True, "guest": guest}


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
        save_invites(invites)
        return {"ok": True, "updated": True, "guest": guest}

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
            return self._json({"ok": True, "guests": invites, "total": len(invites)})

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

        if self._serve_file_with_range(path):
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        payload = self._read_json()

        if path in ("/api/rsvp", "/api/add"):
            if path == "/api/rsvp":
                payload["statut"] = payload.get("statut") or "confirme"
            else:
                payload["statut"] = payload.get("statut") or "invite"
            return self._json(upsert_rsvp(payload))

        if path in ("/api/update", "/api/table"):
            return self._json(update_guest(payload))

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
