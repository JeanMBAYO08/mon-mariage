(() => {
  const INVITE_CARD_SRC =
    "/images/invitation-carte.png";

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

  async function buildGuestInviteCard(guest) {
    const api = window.AccesAPI || {};
    const evenement =
      typeof api.normalizeEvenement === "function"
        ? api.normalizeEvenement(guest?.evenement)
        : String(guest?.evenement || "").toLowerCase() === "civil"
          ? "civil"
          : "soiree";
    const nom = String(guest?.nom || "Invité").trim() || "Invité";
    const tableRaw = String(guest?.table || "").trim();
    const tableLabel =
      evenement === "civil"
        ? "Cérémonie civile"
        : tableRaw
          ? typeof api.tableLabel === "function"
            ? api.tableLabel(tableRaw)
            : `Table ${tableRaw}`
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
    canvas.width = img.naturalWidth || 1240;
    canvas.height = img.naturalHeight || 1748;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const panelTop = Math.round(h * 0.805);
    const panelHeight = h - panelTop;

    // Panneau bas ordonné (remplace le pied de page vide + zone remarque)
    ctx.save();
    const gradient = ctx.createLinearGradient(0, panelTop - 30, 0, h);
    gradient.addColorStop(0, "rgba(28, 18, 12, 0)");
    gradient.addColorStop(0.18, "rgba(28, 18, 12, 0.82)");
    gradient.addColorStop(1, "rgba(28, 18, 12, 0.96)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, panelTop - 30, w, panelHeight + 30);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = w / 2;
    const maxTextW = Math.round(w * 0.86);

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = '400 20px "Josefin Sans", "Helvetica Neue", sans-serif';
    drawCentered(ctx, "INVITÉ(E)", cx, panelTop + panelHeight * 0.22);

    ctx.fillStyle = "#ffffff";
    const nameSize = fitText(ctx, nom, maxTextW, 46, 24);
    ctx.font = `500 ${nameSize}px "Bodoni Moda", Georgia, serif`;
    drawCentered(ctx, nom, cx, panelTop + panelHeight * 0.45);

    ctx.strokeStyle = "rgba(212, 175, 55, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 78, panelTop + panelHeight * 0.62);
    ctx.lineTo(cx + 78, panelTop + panelHeight * 0.62);
    ctx.stroke();

    ctx.fillStyle = "#e8d5a3";
    const tableSize = fitText(ctx, tableLabel, maxTextW, 30, 18);
    ctx.font = `500 ${tableSize}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    drawCentered(ctx, tableLabel, cx, panelTop + panelHeight * 0.78);


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
    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(imageUrl)}`;

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
