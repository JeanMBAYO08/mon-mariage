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

  const DRESS_PALETTES = {
    civil: {
      theme: "Civil · champagne & beige",
      names: "Ivoire · champagne · beige · or",
      colors: ["#fffdf9", "#faf6f0", "#f0e4d4", "#e2d3bc", "#c9b28f", "#b08958"],
    },
    soiree: {
      theme: "Soirée · noir & or",
      names: "Noir · charbon · or",
      colors: ["#0f0f0f", "#1c1c1c", "#2e2e2e", "#b08958", "#d4af37", "#e5c878"],
    },
  };

  function drawColorDots(ctx, colors, cx, y, radius) {
    const gap = Math.max(5, Math.round(radius * 0.55));
    const total = colors.length * (radius * 2) + (colors.length - 1) * gap;
    let x = cx - total / 2 + radius;
    colors.forEach((color) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 213, 163, 0.7)";
      ctx.lineWidth = Math.max(1, radius * 0.12);
      ctx.stroke();
      x += radius * 2 + gap;
    });
  }

  function drawDressReminder(ctx, evenement, cx, startY, scale) {
    const rows = evenement === "civil" ? ["civil"] : ["civil", "soiree"];
    const radius = Math.round(11 * scale);
    let y = startY;

    ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
    ctx.font = `500 ${Math.round(13 * scale)}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    drawCentered(ctx, "DRESS CODE · À RETENIR", cx, y);
    y += Math.round(28 * scale);

    rows.forEach((key, index) => {
      const palette = DRESS_PALETTES[key];
      ctx.fillStyle = "#e8d5a3";
      ctx.font = `500 ${Math.round(15 * scale)}px "Josefin Sans", "Helvetica Neue", sans-serif`;
      drawCentered(ctx, palette.theme, cx, y);
      y += Math.round(22 * scale);
      drawColorDots(ctx, palette.colors, cx, y, radius);
      y += Math.round(22 * scale);
      ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
      ctx.font = `400 ${Math.round(13 * scale)}px "Josefin Sans", "Helvetica Neue", sans-serif`;
      drawCentered(ctx, palette.names, cx, y);
      y += index === rows.length - 1 ? 0 : Math.round(28 * scale);
    });
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
    const scale = w / 1240;
    const panelTop = Math.round(h * (evenement === "civil" ? 0.74 : 0.655));
    const panelHeight = h - panelTop;

    ctx.save();
    const gradient = ctx.createLinearGradient(0, panelTop - 36, 0, h);
    gradient.addColorStop(0, "rgba(28, 18, 12, 0)");
    gradient.addColorStop(0.12, "rgba(28, 18, 12, 0.84)");
    gradient.addColorStop(1, "rgba(28, 18, 12, 0.97)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, panelTop - 36, w, panelHeight + 36);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = w / 2;
    const maxTextW = Math.round(w * 0.86);
    let y = panelTop + Math.round(32 * scale);

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `400 ${Math.round(16 * scale)}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    drawCentered(ctx, "INVITÉ(E)", cx, y);

    y += Math.round(36 * scale);
    ctx.fillStyle = "#ffffff";
    const nameSize = fitText(ctx, nom, maxTextW, Math.round(40 * scale), Math.round(22 * scale));
    ctx.font = `500 ${nameSize}px "Bodoni Moda", Georgia, serif`;
    drawCentered(ctx, nom, cx, y);

    y += Math.round(26 * scale);
    ctx.strokeStyle = "rgba(212, 175, 55, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 78 * scale, y);
    ctx.lineTo(cx + 78 * scale, y);
    ctx.stroke();

    y += Math.round(26 * scale);
    ctx.fillStyle = "#e8d5a3";
    const tableSize = fitText(ctx, tableLabel, maxTextW, Math.round(24 * scale), Math.round(16 * scale));
    ctx.font = `500 ${tableSize}px "Josefin Sans", "Helvetica Neue", sans-serif`;
    drawCentered(ctx, tableLabel, cx, y);

    y += Math.round(36 * scale);
    drawDressReminder(ctx, evenement, cx, y, scale);


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
    if (evenement === "civil") return "Cérémonie civile";
    if (!tableRaw) return "Table à confirmer";
    if (typeof api.tableLabel === "function") return api.tableLabel(tableRaw);
    return `Table ${tableRaw}`;
  }

  function guestInviteLinkText(guest, imageUrl) {
    const api = window.AccesAPI || {};
    const nom = String(guest?.nom || "Invité").trim() || "Invité";
    const table = guestTableLabel(guest);
    const evenement =
      typeof api.normalizeEvenement === "function"
        ? api.normalizeEvenement(guest?.evenement)
        : String(guest?.evenement || "").toLowerCase() === "civil"
          ? "civil"
          : "soiree";
    const dress =
      evenement === "civil"
        ? "Dress code civil : ivoire · champagne · beige · or"
        : "Dress code\nCivil : ivoire · champagne · beige · or\nSoirée : noir · or";
    return `Mariage Parfaite & Jean\n${nom}\n${table}\n\n${dress}\n\n${imageUrl}`;
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
