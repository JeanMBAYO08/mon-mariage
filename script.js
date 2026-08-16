(() => {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelectorAll(".nav-links a");
  const form = document.getElementById("rsvp-form");
  const status = document.getElementById("form-status");
  const heroVideo = document.querySelector(".hero-video");

  const setMenuOpen = (open) => {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("is-locked", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  };

  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // QR papier / liens directs → section programme
  const goToSection = () => {
    const params = new URLSearchParams(window.location.search);
    let target =
      params.get("to") ||
      params.get("section") ||
      (window.location.hash || "").replace(/^#/, "");
    if (target === "programme" || target === "program") target = "jour";
    if (target !== "jour") return;
    const el = document.getElementById("jour");
    if (!el) return;
    const offset = (nav?.offsetHeight || 72) + 12;
    const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  };
  window.addEventListener("DOMContentLoaded", goToSection);
  window.addEventListener("load", () => {
    goToSection();
    window.setTimeout(goToSection, 150);
    window.setTimeout(goToSection, 500);
  });
  goToSection();

  if (heroVideo) {
    const endAt = 43;
    const media = heroVideo.closest(".hero-media");

    heroVideo.muted = true;
    heroVideo.defaultMuted = true;
    heroVideo.loop = true;
    heroVideo.playsInline = true;
    heroVideo.setAttribute("muted", "");
    heroVideo.setAttribute("playsinline", "");
    heroVideo.setAttribute("webkit-playsinline", "");
    heroVideo.setAttribute("autoplay", "");

    const markPlaying = () => {
      if (media) media.classList.add("is-playing");
      heroVideo.classList.add("is-playing");
    };

    const tryPlay = () => {
      heroVideo.muted = true;
      const playPromise = heroVideo.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(markPlaying).catch(() => {});
      }
    };

    const keepLooping = () => {
      if (heroVideo.currentTime >= endAt) {
        heroVideo.currentTime = 0.01;
        tryPlay();
      }
    };

    heroVideo.addEventListener("loadeddata", tryPlay);
    heroVideo.addEventListener("canplay", tryPlay);
    heroVideo.addEventListener("playing", markPlaying);
    heroVideo.addEventListener("loadedmetadata", () => {
      try {
        heroVideo.currentTime = 0.01;
      } catch {
        /* ignore */
      }
      tryPlay();
    });
    heroVideo.addEventListener("timeupdate", keepLooping);
    heroVideo.addEventListener("ended", () => {
      heroVideo.currentTime = 0.01;
      tryPlay();
    });
    heroVideo.addEventListener("pause", () => {
      if (!document.hidden) tryPlay();
    });

    try {
      heroVideo.load();
    } catch {
      /* ignore */
    }
    tryPlay();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tryPlay();
    });

    const unlockMobile = () => tryPlay();
    window.addEventListener("touchstart", unlockMobile, { passive: true });
    window.addEventListener("click", unlockMobile);
    window.addEventListener("scroll", unlockMobile, { passive: true, once: true });
  }

  if (toggle && nav) {
    const backdrop = nav.querySelector(".nav-backdrop");

    toggle.addEventListener("click", () => {
      setMenuOpen(!nav.classList.contains("is-open"));
    });

    if (backdrop) {
      backdrop.addEventListener("click", () => setMenuOpen(false));
    }

    links.forEach((link) => {
      link.addEventListener("click", () => setMenuOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 720) setMenuOpen(false);
    });
  }

  const revealTargets = document.querySelectorAll(
    ".section-intro, .timeline-item, .place, .place-copy, .rsvp-form, .palette, .venues"
  );

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    revealTargets.forEach((el) => observer.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  }

  if (form && status) {
    // Numéro des organisateurs (destinataire du message de confirmation)
    const ORGANIZER_WHATSAPP = "243821377353";
    const evenement =
      (window.AccesAPI && window.AccesAPI.normalizeEvenement
        ? window.AccesAPI.normalizeEvenement(document.body.dataset.evenement)
        : String(document.body.dataset.evenement || "soiree").toLowerCase() === "civil"
          ? "civil"
          : "soiree");
    const isCivil = evenement === "civil";
    const submitBtn = form.querySelector('button[type="submit"]');
    const rsvpOpen =
      window.AccesAPI && typeof window.AccesAPI.isRsvpOpen === "function"
        ? window.AccesAPI.isRsvpOpen()
        : new Date() <= new Date("2026-08-17T23:59:59+01:00");

    if (!rsvpOpen) {
      form.querySelectorAll("input, select, button").forEach((el) => {
        el.disabled = true;
      });
      status.textContent =
        "Les confirmations sont closes depuis le 17 août 2026. Merci de votre compréhension.";
      status.classList.add("is-error");
    }
    const attendanceInputs = form.querySelectorAll('input[name="attendance"]');
    const inviteType = document.getElementById("invite-type");
    const collectifField = document.getElementById("collectif-field");
    const collectifCount = document.getElementById("collectif-count");
    const phoneField = document.getElementById("phone-field");
    const phoneInput = document.getElementById("phone");
    const formatWhatsappIntl =
      (window.AccesAPI && window.AccesAPI.formatWhatsappIntl) ||
      ((raw) => {
        let digits = String(raw || "").replace(/\D/g, "");
        if (!digits) return "";
        if (digits.startsWith("00")) digits = digits.slice(2);
        if (digits.startsWith("0") && digits.length >= 9) digits = `243${digits.slice(1)}`;
        if (digits.length === 9 && !digits.startsWith("243")) digits = `243${digits}`;
        return `+${digits}`;
      });

    if (phoneInput) {
      phoneInput.addEventListener("blur", () => {
        const formatted = formatWhatsappIntl(phoneInput.value);
        if (formatted) phoneInput.value = formatted;
      });
    }

    const inviteLabels = {
      singleton: "Singleton",
      couple: "Couple",
      collectif: "Collectif",
    };

    const syncCollectifField = () => {
      if (!inviteType || !collectifField || !collectifCount) return;
      const isCollectif = inviteType.value === "collectif";
      collectifField.hidden = !isCollectif;
      collectifField.classList.toggle("is-hidden", !isCollectif);
      collectifCount.required = isCollectif;
      if (!isCollectif) collectifCount.value = "";
    };

    const syncPhoneField = () => {
      if (!phoneField || !phoneInput) return;
      const selected = form.querySelector('input[name="attendance"]:checked');
      const yes = selected && selected.value === "yes";
      phoneField.hidden = !yes;
      phoneField.classList.toggle("is-hidden", !yes);
      phoneInput.required = Boolean(yes);
      if (!yes) phoneInput.value = "";
    };

    const syncSubmitLabel = () => {
      if (!submitBtn) return;
      const selected = form.querySelector('input[name="attendance"]:checked');
      submitBtn.textContent =
        selected && selected.value === "yes"
          ? "Confirmer"
          : "Envoyer ma réponse";
    };

    if (inviteType) {
      inviteType.addEventListener("change", syncCollectifField);
      syncCollectifField();
    }

    attendanceInputs.forEach((input) => {
      input.addEventListener("change", () => {
        syncSubmitLabel();
        syncPhoneField();
      });
    });
    syncSubmitLabel();
    syncPhoneField();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.classList.remove("is-error");

      if (
        window.AccesAPI && typeof window.AccesAPI.isRsvpOpen === "function"
          ? !window.AccesAPI.isRsvpOpen()
          : new Date() > new Date("2026-08-17T23:59:59+01:00")
      ) {
        status.textContent =
          "Les confirmations sont closes depuis le 17 août 2026. Merci de votre compréhension.";
        status.classList.add("is-error");
        return;
      }

      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const type = String(data.get("inviteType") || "singleton");
      const count = String(data.get("collectifCount") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const attendance = data.get("attendance");
      const normalizeWhatsapp =
        (window.AccesAPI && window.AccesAPI.normalizeWhatsapp) ||
        ((raw) => {
          let digits = String(raw || "").replace(/\D/g, "");
          if (!digits) return "";
          if (digits.startsWith("00")) digits = digits.slice(2);
          if (digits.startsWith("0") && digits.length >= 9) digits = `243${digits.slice(1)}`;
          return digits;
        });

      if (!name) {
        status.textContent = "Merci de renseigner votre nom.";
        status.classList.add("is-error");
        return;
      }

      if (type === "collectif") {
        const n = Number(count);
        if (!count || !Number.isFinite(n) || n < 3) {
          status.textContent = "Pour une invitation collective, indiquez un nombre d’au moins 3 personnes.";
          status.classList.add("is-error");
          return;
        }
      }

      const yes = attendance === "yes";
      const typeLabel = inviteLabels[type] || type;
      const typeLine =
        type === "collectif"
          ? `Type d’invitation : ${typeLabel} (${count} personnes)`
          : `Type d’invitation : ${typeLabel}`;
      const personnes =
        type === "singleton" ? "1" : type === "couple" ? "2" : count;

      if (yes) {
        const guestPhone = formatWhatsappIntl(phone);
        if (!guestPhone || normalizeWhatsapp(guestPhone).length < 11) {
          status.textContent = "Indiquez un numéro WhatsApp valide (ex. +243…).";
          status.classList.add("is-error");
          if (phoneInput) phoneInput.focus();
          return;
        }
        if (phoneInput) phoneInput.value = guestPhone;

        if (submitBtn) submitBtn.disabled = true;
        status.textContent = "Enregistrement de votre confirmation…";

        let sheetGuest = null;
        try {
          if (!window.AccesAPI) throw new Error("API indisponible");
          const result = await window.AccesAPI.request({
            action: "rsvp",
            nom: name,
            type,
            personnes,
            whatsapp: guestPhone,
            evenement,
            notes: isCivil ? "RSVP civil" : "RSVP site",
          });
          if (!result || !result.ok) {
            throw new Error((result && result.error) || "Enregistrement impossible");
          }
          sheetGuest = result.guest;
        } catch (err) {
          console.warn("RSVP:", err);
          status.textContent =
            err.message ||
            "Impossible d’enregistrer votre confirmation. Réessayez dans un instant.";
          status.classList.add("is-error");
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        // Message prérempli → destinataire = organisateur (+243821377353)
        const eventLine = isCivil
          ? "Événement : Cérémonie civile"
          : "Événement : Mariage (invitation complète)";
        const confirmLine = isCivil
          ? "Je confirme ma présence à votre cérémonie civile."
          : "Je confirme ma présence à votre mariage.";
        const coupleText =
          `Bonjour Parfaite & Jean,\n\n` +
          `${confirmLine}\n\n` +
          `Nom : ${name}\n` +
          `${eventLine}\n` +
          `${typeLine}\n` +
          `WhatsApp : ${guestPhone}` +
          (sheetGuest?.code ? `\nCode QR : ${sheetGuest.code}` : "") +
          (sheetGuest?.code && window.AccesAPI?.ticketUrl
            ? `\nBillet : ${window.AccesAPI.ticketUrl(sheetGuest.code, evenement)}`
            : "");

        const coupleWhatsappUrl = `https://wa.me/${ORGANIZER_WHATSAPP}?text=${encodeURIComponent(coupleText)}`;

        status.textContent = `Merci ${name.split(" ")[0]} — ouverture de WhatsApp vers les organisateurs…`;
        window.location.assign(coupleWhatsappUrl);
        return;
      }

      const sadModal = document.getElementById("sad-modal");
      if (sadModal) {
        sadModal.hidden = false;
        requestAnimationFrame(() => sadModal.classList.add("is-open"));
        document.body.classList.add("is-locked");

        window.setTimeout(() => {
          sadModal.classList.remove("is-open");
          document.body.classList.remove("is-locked");
          window.setTimeout(() => {
            sadModal.hidden = true;
          }, 300);
        }, 5000);
      }

      form.reset();
      const yesRadio = form.querySelector('input[name="attendance"][value="yes"]');
      if (yesRadio) yesRadio.checked = true;
      syncCollectifField();
      syncPhoneField();
      syncSubmitLabel();
      status.textContent = "";
      if (submitBtn) submitBtn.disabled = false;
    });
  }
})();
