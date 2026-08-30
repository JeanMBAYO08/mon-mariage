(() => {
  const INVITE_CARD_SRC =
    "/images/invitation-carte.png?v=20260830i";

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
    const evenement =
      typeof api.normalizeEvenement === "function"
        ? api.normalizeEvenement(guest?.evenement)
        : String(guest?.evenement || "").toLowerCase() === "civil"
          ? "civil"
          : "soiree";
    const nom = String(guest?.nom || "Invité").trim() || "Invité";
    const typeLabel = guestTypeLabel(guest);
    const tableRaw = String(guest?.table || "").trim();
    const tableLabel = tableRaw
      ? typeof api.tableLabel === "function"
        ? api.tableLabel(tableRaw)
        : `Table ${tableRaw}`
      : evenement === "civil"
        ? "Cérémonie civile"
        : "Table à confirmer";

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
    const panelTop = Math.round(h * 0.86);
    const fadeH = Math.round(40 * scale);

    ctx.save();
    const fade = ctx.createLinearGradient(0, panelTop - fadeH, 0, panelTop);
    fade.addColorStop(0, "rgba(86, 66, 41, 0)");
    fade.addColorStop(1, "rgba(86, 66, 41, 0.96)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, panelTop - fadeH, w, fadeH);
    ctx.fillStyle = "rgba(86, 66, 41, 0.96)";
    ctx.fillRect(0, panelTop, w, h - panelTop);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = w / 2;
    const maxTextW = Math.round(w * 0.9);
    let y = panelTop + Math.round(36 * scale);

    ctx.fillStyle = "#ffffff";
    const nameSize = fitText(ctx, nom, maxTextW, Math.round(36 * scale), Math.round(20 * scale));
    ctx.font = `500 ${nameSize}px "Bodoni Moda", Georgia, serif`;
    drawCentered(ctx, nom, cx, y);

    y += Math.round(32 * scale);
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = `500 ${Math.round(18 * scale)}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    drawCentered(ctx, typeLabel, cx, y);

    y += Math.round(28 * scale);
    ctx.fillStyle = "#e8d5a3";
    const tableSize = fitText(ctx, tableLabel, maxTextW, Math.round(20 * scale), Math.round(15 * scale));
    ctx.font = `500 ${tableSize}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    drawCentered(ctx, tableLabel, cx, y);


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
      evenement === "civil"
        ? "Événement : Cérémonie civile"
        : tableRaw
          ? `Votre place est à la ${
              typeof api.tableLabel === "function" ? api.tableLabel(tableRaw) : `Table ${tableRaw}`
            }`
          : "Votre table vous sera communiquée très bientôt";
    const qrUrl =
      typeof api.ticketUrl === "function" ? api.ticketUrl(guest?.code, evenement) : "";

    return (
      `Bonjour ${first},\n\n` +
      `Merci d’avoir confirmé 💛\n` +
      `${tableLine}.\n\n` +
      (qrUrl ? `Votre QR d’accès : ${qrUrl}\n\n` : "") +
      `On a hâte de vous retrouver.\n` +
      `Parfaite & Jean`
    );
  }

  function guestTableLabel(guest) {
    const api = window.AccesAPI || {};
    const evenement =
      typeof api.normalizeEvenement === "function"
        ? api.normalizeEvenement(guest?.evenement)
        : String(guest?.evenement || "").toLowerCase() === "civil"
          ? "civil"
          : "soiree";
    const tableRaw = String(guest?.table || "").trim();
    if (tableRaw) {
      if (typeof api.tableLabel === "function") return api.tableLabel(tableRaw);
      return `Table ${tableRaw}`;
    }
    if (evenement === "civil") return "Cérémonie civile";
    return "Table à confirmer";
  }

  function guestInviteLinkText(guest, imageUrl) {
    const nom = String(guest?.nom || "Invité").trim() || "Invité";
    const type = guestTypeLabel(guest);
    const table = guestTableLabel(guest);
    return `Mariage Parfaite & Jean\n${nom}\n${type}\n${table}\n\n${imageUrl}`;
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

    const { dataUrl } = await buildGuestInviteCard(guest);
    const imageUrl = await uploadInviteCard(guest, dataUrl);
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
    shareGuestInviteCard,
    openWhatsappChat,
    downloadBlob,
  };

  loadBaseImage().catch(() => {
    baseImagePromise = null;
  });
})();
