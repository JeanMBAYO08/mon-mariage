(() => {
  const INVITE_CARD_SRC =
    "/images/invitation-final.png?v=20260831a";

  let baseImagePromise = null;

  function loadBaseImage() {
    if (baseImagePromise) return baseImagePromise;
    baseImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de charger l’image d’invitation."));
      img.src = INVITE_CARD_SRC;
    });
    return baseImagePromise;
  }

  function fitText(ctx, text, maxWidth, maxSize, minSize = 22) {
    let size = maxSize;
    ctx.font = `500 ${size}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
      size -= 1;
      ctx.font = `500 ${size}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    }
    return size;
  }

  function drawCentered(ctx, text, x, y) {
    ctx.fillText(text, x, y);
  }

  function guestTypeLabel(guest) {
    const type = String(guest?.type || "").toLowerCase();
    if (type === "couple") return "Couple";
    if (type === "collectif") return "Collectif";
    if (type === "singleton") return "Singleton";
    return type ? String(guest.type) : "Invitation";
  }

  async function buildGuestInviteCard(guest) {
    const api = window.AccesAPI || {};
    const nom = String(guest?.nom || "Invité").trim() || "Invité";
    const typeLabel = guestTypeLabel(guest);
    const tableRaw = String(guest?.table || "").trim();
    const tableLabel = tableRaw
      ? typeof api.tableLabel === "function"
        ? api.tableLabel(tableRaw)
        : `Table ${tableRaw}`
      : "";

    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
    }

    const img = await loadBaseImage();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 1080;
    canvas.height = img.naturalHeight || 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const scale = w / 1080;
    const panelTop = Math.round(h * 0.785);
    const remakeTop = Math.round(h * 0.954);
    const panelH = remakeTop - panelTop;

    ctx.save();
    const fade = ctx.createLinearGradient(0, panelTop, 0, remakeTop);
    fade.addColorStop(0, "rgba(28, 22, 16, 0)");
    fade.addColorStop(0.22, "rgba(28, 22, 16, 0.55)");
    fade.addColorStop(1, "rgba(28, 22, 16, 0.78)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, panelTop, w, panelH);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = w / 2;
    const maxTextW = Math.round(w * 0.88);
    const nameSize = fitText(ctx, nom, maxTextW, Math.round(42 * scale), Math.round(22 * scale));
    const typeSize = Math.round(24 * scale);
    const showTable = Boolean(tableLabel);
    const tableSize = showTable
      ? fitText(ctx, tableLabel, maxTextW, Math.round(26 * scale), Math.round(16 * scale))
      : 0;
    const blockH = nameSize + typeSize + tableSize + Math.round(showTable ? 36 : 22) * scale;
    let y = panelTop + Math.round((panelH - blockH) / 2) + nameSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.font = `500 ${nameSize}px "Bodoni Moda", Georgia, serif`;
    drawCentered(ctx, nom, cx, y);

    y += nameSize / 2 + Math.round(22 * scale);
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.font = `500 ${typeSize}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    drawCentered(ctx, typeLabel, cx, y);

    if (showTable) {
      y += typeSize + Math.round(16 * scale);
      ctx.fillStyle = "#e8d5a3";
      ctx.font = `500 ${tableSize}px "Josefin Sans", "Helvetica Neue", sans-serif`;
      drawCentered(ctx, tableLabel, cx, y);
    }


    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Export image impossible"))),
        "image/jpeg",
        0.9
      );
    });

    const safeName = nom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const filename = `invitation-${safeName || guest?.code || "invite"}.jpg`;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return { blob, filename, canvas, dataUrl };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function guestConfirmCardMessage(guest) {
    const api = window.AccesAPI || {};
    const evenement =
      typeof api.normalizeEvenement === "function"
        ? api.normalizeEvenement(guest?.evenement)
        : "soiree";
    const first = String(guest?.nom || "invité").trim().split(/\s+/)[0] || "invité";
    const tableRaw = String(guest?.table || "").trim();
    const tableLine =
      tableRaw
        ? `Votre place est à la ${
            typeof api.tableLabel === "function" ? api.tableLabel(tableRaw) : `Table ${tableRaw}`
          }.`
        : "";
    const qrUrl =
      typeof api.ticketUrl === "function" ? api.ticketUrl(guest?.code, evenement) : "";

    return (
      `Bonjour ${first},\n\n` +
      `Merci d’avoir confirmé 💛\n` +
      (tableLine ? `${tableLine}\n\n` : `\n`) +
      (qrUrl ? `Votre QR d’accès : ${qrUrl}\n\n` : "") +
      `On a hâte de vous retrouver.\n` +
      `Parfaite & Jean`
    );
  }

  function guestTableLabel(guest) {
    const api = window.AccesAPI || {};
    const tableRaw = String(guest?.table || "").trim();
    if (!tableRaw || /^(sans table|à confirmer|a confirmer|-)$/i.test(tableRaw)) return "";
    if (typeof api.tableLabel === "function") return api.tableLabel(tableRaw);
    return `Table ${tableRaw}`;
  }

  function guestInviteLinkText(guest, imageUrl) {
    const nom = String(guest?.nom || "Invité").trim() || "Invité";
    const type = guestTypeLabel(guest);
    const table = guestTableLabel(guest);
    const lines = ["Mariage Parfaite & Jean", nom, type];
    if (table) lines.push(table);
    return `${lines.join("\n")}\n\n${imageUrl}`;
  }

  function isMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "")
      || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.userAgent || ""));
  }

  function openWhatsappChat(phone) {
    const api = window.AccesAPI || {};
    const digits =
      typeof api.normalizeWhatsapp === "function"
        ? api.normalizeWhatsapp(phone)
        : String(phone || "").replace(/\D/g, "");
    if (!digits) return false;
    const url = `https://wa.me/${digits}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.assign(url);
    return true;
  }

  async function uploadInviteCard(guest, dataUrl) {
    const res = await fetch("/api/invite-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: guest?.code || "",
        image: dataUrl,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Envoi du lien impossible");
    }
    return `${window.location.origin}${data.imageUrl}`;
  }

  function inviteOrigin() {
    const api = window.AccesAPI || {};
    const base = String(api.cfg?.SITE_BASE_URL || window.location.origin || "").replace(/\/$/, "");
    return base || window.location.origin;
  }

  function guestInviteUrl(guestOrCode) {
    const code = String(
      typeof guestOrCode === "string" ? guestOrCode : guestOrCode?.code || ""
    )
      .trim()
      .toUpperCase();
    return `${inviteOrigin()}/api/invite-card?code=${encodeURIComponent(code)}`;
  }

  async function copyText(value) {
    const text = String(value || "");
    if (!text) throw new Error("Lien vide");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return text;
    }
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
    return text;
  }

  async function copyGuestInviteLink(guest) {
    return copyText(guestInviteUrl(guest));
  }

  async function shareGuestInviteCard(guest, phoneOverride) {
    const api = window.AccesAPI || {};
    const phone =
      typeof api.formatWhatsappIntl === "function"
        ? api.formatWhatsappIntl(phoneOverride ?? guest?.whatsapp)
        : String(phoneOverride ?? guest?.whatsapp ?? "");
    const digits =
      typeof api.normalizeWhatsapp === "function"
        ? api.normalizeWhatsapp(phone)
        : String(phone || "").replace(/\D/g, "");
    if (!digits) {
      throw new Error("Ajoutez d’abord le numéro WhatsApp de l’invité (ex. +243…).");
    }

    const imageUrl = guestInviteUrl(guest);
    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(
      guestInviteLinkText(guest, imageUrl)
    )}`;

    if (isMobileDevice()) {
      window.location.assign(waUrl);
    } else {
      const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(waUrl);
    }
    return { shared: true, phone: `+${digits}`, imageUrl };
  }

  window.InviteCard = {
    INVITE_CARD_SRC,
    buildGuestInviteCard,
    guestConfirmCardMessage,
    guestInviteUrl,
    copyGuestInviteLink,
    shareGuestInviteCard,
    openWhatsappChat,
    downloadBlob,
  };

  loadBaseImage().catch(() => {
    baseImagePromise = null;
  });
})();
