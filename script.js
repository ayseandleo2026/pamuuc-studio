(() => {
  "use strict";

  const STUDIO_ORIGIN = "https://studio.pamuuc.com";
  const GA_ID = "G-HS8HYY7LV1";
  const FORM_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbxvyqSSrvI3yGlPEk9ySbFE2yfFzirmHFz_BzdzkOAAOtk7HtiwLrdWinZdLVAy1g5p/exec";

  const STORAGE_LANGUAGE = "pamuuc_lang";
  const STORAGE_COOKIE = "pamuuc_cookie_consent";
  const STORAGE_COOKIE_TIMESTAMP = "pamuuc_cookie_consent_timestamp";
  const COOKIE_CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const COOKIE_AUTO_ACCEPT_MS = 15 * 1000;

  const supportedLanguages = ["en", "fr", "it", "es"];

  // Support both custom-domain root deploys and GitHub Pages project subpaths.
  const rawPathParts = window.location.pathname.split("/").filter(Boolean);
  const isGithubProjectHost = /\.github\.io$/i.test(window.location.hostname);
  let basePath = "";
  let contentPathParts = rawPathParts;

  if (isGithubProjectHost && rawPathParts.length > 0) {
    const firstPart = rawPathParts[0];
    const isLanguageFolder = supportedLanguages.includes(firstPart);
    const isFileName = firstPart.includes(".");

    if (!isLanguageFolder && !isFileName) {
      basePath = `/${firstPart}`;
      contentPathParts = rawPathParts.slice(1);
    }
  }

  const getPathWithBase = (path) => {
    if (!path || !path.startsWith("/")) {
      return path;
    }

    return `${basePath}${path}`;
  };

  const languageFromPath = supportedLanguages.includes(contentPathParts[0]) ? contentPathParts[0] : null;
  const currentLanguage = languageFromPath || document.body.dataset.language || document.documentElement.lang || "en";

  const uiCopyMap = {
    en: {
      sendingButton: "Sending...",
      sendingStatus: "Sending your request...",
      successStatus: "Success: your request was sent. We usually reply within 1 business day.",
      errorStatus: "We could not send your request right now. Please try again or use Prefer email instead.",
      submitButton: "Send project request"
    },
    fr: {
      sendingButton: "Envoi...",
      sendingStatus: "Envoi de votre demande...",
      successStatus: "Succès : votre demande a été envoyée. Nous répondons généralement sous 1 jour ouvré.",
      errorStatus: "Nous ne pouvons pas envoyer votre demande pour le moment. Réessayez ou utilisez l'option e-mail.",
      submitButton: "Envoyer la demande projet"
    },
    it: {
      sendingButton: "Invio...",
      sendingStatus: "Invio della richiesta...",
      successStatus: "Richiesta inviata con successo. Di solito rispondiamo entro 1 giorno lavorativo.",
      errorStatus: "Non riusciamo a inviare la richiesta ora. Riprova o usa l'opzione e-mail.",
      submitButton: "Invia richiesta progetto"
    },
    es: {
      sendingButton: "Enviando...",
      sendingStatus: "Enviando tu solicitud...",
      successStatus: "Solicitud enviada correctamente. Normalmente respondemos en 1 día laborable.",
      errorStatus: "No hemos podido enviar la solicitud ahora. Inténtalo de nuevo o usa la opción por e-mail.",
      submitButton: "Enviar solicitud de proyecto"
    }
  };
  const uiCopy = uiCopyMap[currentLanguage] || uiCopyMap.en;
  const cookieTermsLinkCopyMap = {
    en: "Read terms and conditions.",
    fr: "Lire les conditions générales.",
    it: "Leggi termini e condizioni.",
    es: "Leer términos y condiciones."
  };

  const body = document.body;

  const normalizeRootAbsoluteLinks = () => {
    if (!basePath) {
      return;
    }

    document.querySelectorAll("a[href^='/']").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("//")) {
        return;
      }

      if (href === basePath || href.startsWith(`${basePath}/`)) {
        return;
      }

      link.setAttribute("href", getPathWithBase(href));
    });
  };

  normalizeRootAbsoluteLinks();

  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith(".local");

  if (window.location.protocol === "http:" && !isLocalHost) {
    window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
    return;
  }

  let gaLoaded = false;
  let gaLoading = false;
  let analyticsAllowed = false;
  let gaConsentState = "rejected";
  const pendingEvents = [];

  const getGaConsentPayload = (value) => {
    const analyticsState = value === "accepted" ? "granted" : "denied";
    return {
      analytics_storage: analyticsState,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "granted",
      security_storage: "granted"
    };
  };

  const applyGaConsent = (value, mode = "update") => {
    gaConsentState = value === "accepted" ? "accepted" : "rejected";

    if (!gaLoaded || typeof window.gtag !== "function") {
      return;
    }

    window.gtag("consent", mode, getGaConsentPayload(gaConsentState));
  };

  const trackEvent = (name, params = {}) => {
    if (!analyticsAllowed) {
      return;
    }

    const payload = {
      language: currentLanguage,
      ...params
    };

    if (!gaLoaded || typeof window.gtag !== "function") {
      pendingEvents.push([name, payload]);
      return;
    }

    window.gtag("event", name, payload);
  };

  const loadGa = (initialConsent = gaConsentState) => {
    if (gaLoaded || gaLoading) {
      return;
    }
    gaLoading = true;

    const onGaReady = () => {
      window.dataLayer = window.dataLayer || [];
      if (typeof window.gtag !== "function") {
        window.gtag = function gtag() {
          window.dataLayer.push(arguments);
        };
      }

      const hasConfigCall = window.dataLayer.some((entry) => {
        return Array.isArray(entry) && entry[0] === "config" && entry[1] === GA_ID;
      });
      const hasConsentDefaultCall = window.dataLayer.some((entry) => {
        return Array.isArray(entry) && entry[0] === "consent" && entry[1] === "default";
      });

      if (!hasConsentDefaultCall) {
        window.gtag("consent", "default", getGaConsentPayload(initialConsent));
      }

      if (!hasConfigCall) {
        window.gtag("js", new Date());
        window.gtag("config", GA_ID, {
          anonymize_ip: true,
          allow_google_signals: false,
          allow_ad_personalization_signals: false
        });
      }

      gaLoaded = true;
      gaLoading = false;
      applyGaConsent(gaConsentState);
      while (pendingEvents.length) {
        const [eventName, payload] = pendingEvents.shift();
        window.gtag("event", eventName, payload);
      }
    };

    const existingGaScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${GA_ID}"]`);
    if (existingGaScript) {
      if (typeof window.gtag === "function") {
        onGaReady();
      } else {
        existingGaScript.addEventListener("load", onGaReady, { once: true });
        existingGaScript.addEventListener(
          "error",
          () => {
            gaLoading = false;
          },
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.addEventListener("load", onGaReady, { once: true });
    script.addEventListener(
      "error",
      () => {
        gaLoading = false;
      },
      { once: true }
    );
    document.head.appendChild(script);
  };

  const cookieBanner = document.querySelector("#cookie-banner");
  const cookieAccept = document.querySelector("#cookie-accept");
  const cookieReject = document.querySelector("#cookie-reject");
  let scrollAutoAcceptHandler = null;
  let cookieAutoAcceptTimerId = null;

  const clearCookieAutoAcceptTimer = () => {
    if (cookieAutoAcceptTimerId) {
      window.clearTimeout(cookieAutoAcceptTimerId);
      cookieAutoAcceptTimerId = null;
    }
  };

  const clearCookieAutoAcceptTriggers = () => {
    clearCookieAutoAcceptTimer();
    if (scrollAutoAcceptHandler) {
      window.removeEventListener("scroll", scrollAutoAcceptHandler);
      scrollAutoAcceptHandler = null;
    }
  };

  const getStoredCookieConsent = () => {
    const storedValue = window.localStorage.getItem(STORAGE_COOKIE);
    const storedTimestampRaw = window.localStorage.getItem(STORAGE_COOKIE_TIMESTAMP);
    const storedTimestamp = Number.parseInt(storedTimestampRaw || "", 10);

    if (storedValue !== "accepted" && storedValue !== "rejected") {
      window.localStorage.removeItem(STORAGE_COOKIE);
      window.localStorage.removeItem(STORAGE_COOKIE_TIMESTAMP);
      return null;
    }

    if (!Number.isFinite(storedTimestamp)) {
      window.localStorage.removeItem(STORAGE_COOKIE);
      window.localStorage.removeItem(STORAGE_COOKIE_TIMESTAMP);
      return null;
    }

    if (Date.now() - storedTimestamp >= COOKIE_CONSENT_TTL_MS) {
      window.localStorage.removeItem(STORAGE_COOKIE);
      window.localStorage.removeItem(STORAGE_COOKIE_TIMESTAMP);
      return null;
    }

    return storedValue;
  };

  const decorateCookieBanner = () => {
    if (!cookieBanner) {
      return;
    }

    const copy = cookieTermsLinkCopyMap[currentLanguage] || cookieTermsLinkCopyMap.en;
    const cookieText = cookieBanner.querySelector("p");
    if (cookieText && !cookieText.querySelector(".cookie-terms-link")) {
      const termsLink = document.createElement("a");
      termsLink.href = "terms-and-conditions.html";
      termsLink.className = "cookie-terms-link";
      termsLink.textContent = copy;
      cookieText.append(document.createTextNode(" "), termsLink);
    }

    if (cookieAccept) {
      cookieAccept.classList.add("cookie-accept-cta");
    }

    if (cookieReject) {
      cookieReject.classList.remove("button", "button-secondary");
      cookieReject.classList.add("cookie-reject-link");
    }
  };

  decorateCookieBanner();

  const hideCookieBanner = () => {
    if (cookieBanner) {
      cookieBanner.classList.remove("is-visible");
    }
    clearCookieAutoAcceptTriggers();
  };

  const setCookieConsent = (value, source = "button") => {
    const normalizedValue = value === "accepted" ? "accepted" : "rejected";
    const current = getStoredCookieConsent();
    if (current === normalizedValue) {
      hideCookieBanner();
      applyGaConsent(normalizedValue);
      return;
    }

    window.localStorage.setItem(STORAGE_COOKIE, normalizedValue);
    window.localStorage.setItem(STORAGE_COOKIE_TIMESTAMP, String(Date.now()));
    hideCookieBanner();

    analyticsAllowed = normalizedValue === "accepted";
    applyGaConsent(normalizedValue);
    loadGa(normalizedValue);

    if (normalizedValue === "accepted") {
      trackEvent("cookie_accept", { item_name: source });
    } else {
      if (gaLoaded && typeof window.gtag === "function") {
        window.gtag("event", "cookie_reject", {
          non_interaction: true
        });
      }
      pendingEvents.length = 0;
    }
  };

  const scrollThresholds = [25, 50, 75, 100];
  const trackedScrollThresholds = new Set();
  let scrollTrackingTicking = false;

  const handleScrollTracking = () => {
    scrollTrackingTicking = false;
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) {
      return;
    }

    const percent = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
    scrollThresholds.forEach((threshold) => {
      if (percent >= threshold && !trackedScrollThresholds.has(threshold)) {
        trackedScrollThresholds.add(threshold);
        trackEvent("scroll_depth", { item_name: `${threshold}%` });
      }
    });
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!analyticsAllowed || scrollTrackingTicking) {
        return;
      }
      scrollTrackingTicking = true;
      window.requestAnimationFrame(handleScrollTracking);
    },
    { passive: true }
  );

  const storedCookieConsent = getStoredCookieConsent();
  analyticsAllowed = storedCookieConsent === "accepted";
  gaConsentState = analyticsAllowed ? "accepted" : "rejected";
  loadGa(gaConsentState);

  if (!storedCookieConsent && cookieBanner) {
    cookieBanner.classList.add("is-visible");

    if (cookieAccept) {
      cookieAccept.addEventListener("click", () => setCookieConsent("accepted", "accept_button"));
    }

    if (cookieReject) {
      cookieReject.addEventListener("click", () => setCookieConsent("rejected", "reject_button"));
    }

    scrollAutoAcceptHandler = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) {
        return;
      }

      const progress = (window.scrollY / scrollable) * 100;
      if (progress >= 5) {
        setCookieConsent("accepted", "scroll_5_percent");
      }
    };

    window.addEventListener("scroll", scrollAutoAcceptHandler, { passive: true });
    cookieAutoAcceptTimerId = window.setTimeout(() => {
      setCookieConsent("accepted", "timeout_15_seconds");
    }, COOKIE_AUTO_ACCEPT_MS);
  }

  const languageModal = document.querySelector("#language-modal");
  const storedLanguage = window.localStorage.getItem(STORAGE_LANGUAGE);

  const isRootPage = contentPathParts.length === 0 || (contentPathParts.length === 1 && contentPathParts[0] === "index.html");

  if (!storedLanguage && !isRootPage && currentLanguage) {
    window.localStorage.setItem(STORAGE_LANGUAGE, currentLanguage);
  }

  if (!storedLanguage && isRootPage && languageModal) {
    languageModal.classList.add("is-visible");
    languageModal.setAttribute("aria-hidden", "false");
  }

  if (storedLanguage && isRootPage && supportedLanguages.includes(storedLanguage) && storedLanguage !== "en") {
    window.location.replace(getPathWithBase(`/${storedLanguage}/`));
  }

  document.querySelectorAll("[data-lang-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.getAttribute("data-lang-choice");
      if (!selected || !supportedLanguages.includes(selected)) {
        return;
      }

      window.localStorage.setItem(STORAGE_LANGUAGE, selected);
      trackEvent("language_selected", { item_name: selected });
      window.location.href = getPathWithBase(`/${selected}/`);
    });
  });

  document.querySelectorAll("[data-lang-switch]").forEach((link) => {
    link.addEventListener("click", () => {
      const selected = link.getAttribute("data-lang-switch");
      if (!selected) {
        return;
      }

      window.localStorage.setItem(STORAGE_LANGUAGE, selected);
      trackEvent("language_switch", { item_name: selected });
    });
  });

  const mobileNavBreakpoint = 860;
  const menuToggle = document.querySelector(".menu-toggle");
  const siteNav = document.querySelector(".site-nav");
  const headerLanguageSwitcher = document.querySelector(".language-switcher");

  if (menuToggle && siteNav && body) {
    body.classList.add("nav-ready");

    const closeMenu = () => {
      siteNav.classList.remove("is-open");
      body.classList.remove("menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
    };

    const openMenu = () => {
      siteNav.classList.add("is-open");
      body.classList.add("menu-open");
      menuToggle.setAttribute("aria-expanded", "true");
    };

    let mobileLanguageDropdown = null;
    const closeLanguageDropdown = () => {
      if (mobileLanguageDropdown) {
        mobileLanguageDropdown.open = false;
      }
    };

    if (headerLanguageSwitcher && menuToggle.parentElement && !menuToggle.parentElement.querySelector(".mobile-language-dropdown")) {
      const languageLabel = headerLanguageSwitcher.getAttribute("aria-label") || "Language selector";
      mobileLanguageDropdown = document.createElement("details");
      mobileLanguageDropdown.className = "mobile-language-dropdown";

      const languageTrigger = document.createElement("summary");
      languageTrigger.className = "mobile-language-trigger";
      languageTrigger.setAttribute("aria-label", languageLabel);
      languageTrigger.textContent = currentLanguage.toUpperCase();

      const languageMenu = document.createElement("nav");
      languageMenu.className = "mobile-language-menu";
      languageMenu.setAttribute("aria-label", languageLabel);

      headerLanguageSwitcher.querySelectorAll("[data-lang-switch]").forEach((link) => {
        const mobileLink = link.cloneNode(true);
        const selected = (mobileLink.getAttribute("data-lang-switch") || "").toLowerCase();
        mobileLink.classList.toggle("is-active", selected === currentLanguage.toLowerCase());
        mobileLink.addEventListener("click", () => {
          const nextLanguage = mobileLink.getAttribute("data-lang-switch");
          if (!nextLanguage) {
            return;
          }

          window.localStorage.setItem(STORAGE_LANGUAGE, nextLanguage);
          trackEvent("language_switch", { item_name: nextLanguage });
          closeLanguageDropdown();
          closeMenu();
        });
        languageMenu.appendChild(mobileLink);
      });

      mobileLanguageDropdown.append(languageTrigger, languageMenu);
      menuToggle.insertAdjacentElement("beforebegin", mobileLanguageDropdown);
    }

    menuToggle.addEventListener("click", () => {
      closeLanguageDropdown();
      if (siteNav.classList.contains("is-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    siteNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("click", (event) => {
      if (
        window.innerWidth <= mobileNavBreakpoint &&
        siteNav.classList.contains("is-open") &&
        !siteNav.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        closeMenu();
      }

      if (
        mobileLanguageDropdown &&
        mobileLanguageDropdown.open &&
        !mobileLanguageDropdown.contains(event.target)
      ) {
        closeLanguageDropdown();
      }
    });

    window.addEventListener(
      "resize",
      () => {
        if (window.innerWidth > mobileNavBreakpoint) {
          closeMenu();
          closeLanguageDropdown();
        }
      },
      { passive: true }
    );

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeLanguageDropdown();
      }
    });
  }

  const revealItems = document.querySelectorAll(".reveal");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!revealItems.length || prefersReducedMotion) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -48px 0px" }
    );

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const isLikelyModalSubheading = (text) => {
    const value = (text || "").trim();
    if (!value || value.length > 72) {
      return false;
    }

    if (/[.!?]$/.test(value)) {
      return false;
    }

    const words = value.split(/\s+/);
    return words.length <= 9;
  };

  const formatModalArticle = (article) => {
    if (!article || article.dataset.formatted === "true") {
      return;
    }

    // Merge hard-wrapped PDF lines back into readable paragraphs.
    const paragraphsToMerge = Array.from(article.querySelectorAll("p"));
    paragraphsToMerge.forEach((current) => {
      if (!current.isConnected) {
        return;
      }

      let next = current.nextElementSibling;
      while (
        next &&
        next.tagName === "P" &&
        !/[.!?:;]$/.test((current.textContent || "").trim()) &&
        !isLikelyModalSubheading(next.textContent || "")
      ) {
        current.textContent = `${(current.textContent || "").trim()} ${(next.textContent || "").trim()}`.trim();
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }
    });

    const paragraphs = Array.from(article.querySelectorAll("p"));
    const firstBodyParagraph = paragraphs.find((p) => !isLikelyModalSubheading(p.textContent || ""));
    if (firstBodyParagraph) {
      firstBodyParagraph.classList.add("modal-lead");
    }

    paragraphs.forEach((paragraph) => {
      const text = (paragraph.textContent || "").trim();
      if (!isLikelyModalSubheading(text)) {
        return;
      }

      if (paragraph.classList.contains("modal-lead")) {
        return;
      }

      paragraph.classList.add("modal-subheading");
    });

    article.dataset.formatted = "true";
  };

  document.querySelectorAll("template .modal-article").forEach((article) => {
    formatModalArticle(article);
  });

  const mobileTabDefaultOpen = new Set(["categories", "process", "contact"]);
  const mobileTabsQuery = window.matchMedia("(max-width: 780px)");
  const mobileTabLabelMap = {
    en: {
      "logo-band": "Built for teams",
      services: "Services",
      sectors: "Who this is for",
      approach: "How we design",
      categories: "What can be built",
      process: "Process",
      personalised: "Everything is personalised",
      parameters: "Production parameters",
      continuity: "Continuity model",
      projects: "Selected projects",
      team: "Team",
      faq: "FAQ",
      contact: "Start the conversation"
    },
    es: {
      "logo-band": "Principios",
      services: "Servicios",
      sectors: "Para quién está pensado",
      approach: "Cómo diseñamos",
      categories: "Qué se puede fabricar",
      process: "Proceso",
      personalised: "Todo es personalizado",
      parameters: "Parámetros de producción",
      continuity: "Modelo de continuidad",
      projects: "Proyectos seleccionados",
      team: "Equipo",
      faq: "FAQ",
      contact: "Empecemos la conversación"
    },
    fr: {
      "logo-band": "Principes",
      services: "Services",
      sectors: "À qui s’adresse cette offre",
      approach: "Notre méthode",
      categories: "Ce que nous pouvons produire",
      process: "Processus",
      personalised: "Tout est personnalisé",
      parameters: "Paramètres de production",
      continuity: "Modèle de continuité",
      projects: "Projets sélectionnés",
      team: "Équipe",
      faq: "FAQ",
      contact: "Lancer la discussion"
    },
    it: {
      "logo-band": "Principi",
      services: "Servizi",
      sectors: "Per chi è pensato",
      approach: "Come progettiamo",
      categories: "Cosa possiamo realizzare",
      process: "Processo",
      personalised: "Tutto è personalizzato",
      parameters: "Parametri di produzione",
      continuity: "Modello di continuità",
      projects: "Progetti selezionati",
      team: "Squadra",
      faq: "FAQ",
      contact: "Inizia la conversazione"
    }
  };

  const getMobileTabKey = (section) => {
    if (section.id) {
      return section.id;
    }

    if (section.classList.contains("logo-band")) {
      return "logo-band";
    }

    return "";
  };

  const getMobileTabLabel = (section) => {
    const kicker = section.querySelector(".section-kicker")?.textContent?.trim();
    if (kicker) {
      return kicker;
    }

    const key = getMobileTabKey(section);
    const mappedLabel = mobileTabLabelMap[currentLanguage]?.[key];
    if (mappedLabel) {
      return mappedLabel;
    }

    const heading = section.querySelector("h2")?.textContent?.trim();
    if (heading) {
      return heading;
    }

    if (section.id) {
      return section.id.replace(/-/g, " ");
    }

    return "Section";
  };

  const wrapSectionsInMobileTabs = () => {
    document.querySelectorAll("main > section").forEach((section) => {
      if (section.classList.contains("hero-section")) {
        return;
      }

      if (section.dataset.mobileTabbed === "true") {
        return;
      }

      const shell = document.createElement("details");
      shell.className = "mobile-tab-shell";
      shell.open = mobileTabDefaultOpen.has(section.id);

      const summary = document.createElement("summary");
      summary.className = "mobile-tab-toggle";
      summary.textContent = getMobileTabLabel(section);

      const panel = document.createElement("div");
      panel.className = "mobile-tab-panel";

      while (section.firstChild) {
        panel.appendChild(section.firstChild);
      }

      shell.append(summary, panel);
      section.appendChild(shell);
      section.dataset.mobileTabbed = "true";
    });
  };

  const unwrapSectionsFromMobileTabs = () => {
    document.querySelectorAll("main > section[data-mobile-tabbed='true']").forEach((section) => {
      const shell = section.querySelector(".mobile-tab-shell");
      if (!shell) {
        section.dataset.mobileTabbed = "false";
        return;
      }

      const panel = shell.querySelector(".mobile-tab-panel");
      if (!panel) {
        shell.remove();
        section.dataset.mobileTabbed = "false";
        return;
      }

      while (panel.firstChild) {
        section.insertBefore(panel.firstChild, shell);
      }

      shell.remove();
      section.dataset.mobileTabbed = "false";
    });
  };

  const syncMobileTabs = () => {
    if (mobileTabsQuery.matches) {
      wrapSectionsInMobileTabs();
    } else {
      unwrapSectionsFromMobileTabs();
    }
  };

  const openHashSectionTab = () => {
    if (!mobileTabsQuery.matches || !window.location.hash) {
      return;
    }

    const targetId = decodeURIComponent(window.location.hash.slice(1));
    if (!targetId) {
      return;
    }

    const targetSection = document.getElementById(targetId);
    if (!targetSection) {
      return;
    }

    const firstChild = targetSection.firstElementChild;
    const tabShell =
      firstChild && firstChild.classList.contains("mobile-tab-shell")
        ? firstChild
        : targetSection.querySelector(".mobile-tab-shell");
    if (tabShell && !tabShell.open) {
      tabShell.open = true;
    }
  };

  syncMobileTabs();
  openHashSectionTab();

  if (typeof mobileTabsQuery.addEventListener === "function") {
    mobileTabsQuery.addEventListener("change", () => {
      syncMobileTabs();
      openHashSectionTab();
    });
  } else if (typeof mobileTabsQuery.addListener === "function") {
    mobileTabsQuery.addListener(() => {
      syncMobileTabs();
      openHashSectionTab();
    });
  }

  window.addEventListener("hashchange", openHashSectionTab);

  const modal = document.querySelector("#site-modal");
  const modalContent = document.querySelector("#modal-content");
  const modalPanel = document.querySelector(".modal-panel");
  let lastFocusedElement = null;

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  const getFocusableElements = (container) => {
    if (!container) {
      return [];
    }

    return Array.from(container.querySelectorAll(focusableSelector)).filter((el) => {
      return el.offsetParent !== null || el === document.activeElement;
    });
  };

  const closeModal = () => {
    if (!modal || !modalContent) {
      return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    body.classList.remove("modal-open");
    modalContent.replaceChildren();

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus({ preventScroll: true });
    }

    lastFocusedElement = null;
  };

  const openModal = (templateId, trigger) => {
    if (!modal || !modalContent) {
      return;
    }

    const template = document.getElementById(templateId);
    if (!template || template.tagName !== "TEMPLATE") {
      return;
    }

    modalContent.replaceChildren(template.content.cloneNode(true));
    modalContent.querySelectorAll(".modal-article").forEach((article) => {
      formatModalArticle(article);
    });

    lastFocusedElement = trigger || document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    body.classList.add("modal-open");

    trackEvent("popup_open", { popup_name: templateId });

    const focusable = getFocusableElements(modalPanel || modal);
    if (focusable.length) {
      focusable[0].focus({ preventScroll: true });
    } else {
      modalContent.focus({ preventScroll: true });
    }
  };

  if (modal && modalContent) {
    document.addEventListener("click", (event) => {
      const closeTarget = event.target.closest("[data-modal-close]");
      if (closeTarget) {
        closeModal();
        return;
      }

      const trigger = event.target.closest("[data-modal-target]");
      if (!trigger) {
        return;
      }

      const templateId = trigger.getAttribute("data-modal-target");
      if (templateId) {
        openModal(templateId, trigger);

        const eventName = trigger.getAttribute("data-track-event");
        if (eventName) {
          trackEvent(eventName, {
            section_name: trigger.closest("section")?.id || "unknown",
            item_name: trigger.getAttribute("data-item-name") || templateId
          });
        }
      }
    });

    document.querySelectorAll("[data-modal-target][role='button']").forEach((trigger) => {
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          trigger.click();
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
        return;
      }

      if (event.key !== "Tab" || !modal.classList.contains("is-open")) {
        return;
      }

      const focusable = getFocusableElements(modalPanel || modal);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  document.querySelectorAll("[data-accordion-group]").forEach((group) => {
    const detailsNodes = group.querySelectorAll("details");

    detailsNodes.forEach((detail) => {
      detail.addEventListener("toggle", () => {
        if (!detail.open) {
          return;
        }

        detailsNodes.forEach((otherDetail) => {
          if (otherDetail !== detail) {
            otherDetail.open = false;
          }
        });

        const title = detail.querySelector("summary")?.textContent?.trim() || "faq_item";
        trackEvent("faq_open", { item_name: title });
      });
    });
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) {
      return;
    }

    const href = link.getAttribute("href") || "";

    if (href.startsWith("mailto:")) {
      trackEvent("email_click", { item_name: href });
      return;
    }

    if (href.startsWith("http://") || href.startsWith("https://")) {
      try {
        const targetUrl = new URL(href);
        if (targetUrl.host !== window.location.host) {
          trackEvent("outbound_click", { item_name: targetUrl.hostname });
        }
      } catch (_error) {
        // Ignore malformed URLs.
      }
    }
  });

  const contactForm = document.querySelector("#contact-form");
  const formStatus = document.querySelector("#form-status");

  if (contactForm) {
    const submitButton = contactForm.querySelector("button[type='submit']");
    let hasStartedForm = false;

    contactForm.addEventListener("input", () => {
      if (hasStartedForm) {
        return;
      }

      hasStartedForm = true;
      trackEvent("contact_form_start", { section_name: "contact" });
    });

    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }

      const formData = new FormData(contactForm);
      const meetingDateTime = String(formData.get("meeting-datetime") || "").trim();
      const briefBase = String(formData.get("brief") || "").trim();
      const consentAccepted = Boolean(formData.get("consent"));

      const payload = {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        company: String(formData.get("company") || "").trim(),
        teamSize: String(formData.get("team-size") || "").trim(),
        projectType: String(formData.get("project-type") || "").trim(),
        language: currentLanguage,
        pageUrl: window.location.href,
        source: "contact_form",
        brief: meetingDateTime
          ? `${briefBase}\n\nPreferred meeting date/time: ${meetingDateTime}`.trim()
          : briefBase,
        consent: consentAccepted,
        cookieConsent: window.localStorage.getItem(STORAGE_COOKIE) || "unset",
        userAgent: window.navigator.userAgent,
        origin: window.location.origin || STUDIO_ORIGIN
      };

      const encodedPayload = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        encodedPayload.append(key, String(value));
      });

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = uiCopy.sendingButton;
      }

      if (formStatus) {
        formStatus.textContent = uiCopy.sendingStatus;
      }

      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 12000);

        const response = await fetch(FORM_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
          },
          body: encodedPayload.toString(),
          signal: controller.signal
        });
        window.clearTimeout(timeoutId);

        // Apps Script endpoints are frequently opaque in browsers (no readable CORS body),
        // even when the submission is correctly received and written to Sheets.
        const isOpaqueSuccess = response.type === "opaque";
        const isRegularSuccess = response.ok;
        if (!isOpaqueSuccess && !isRegularSuccess) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        if (formStatus) {
          formStatus.textContent = uiCopy.successStatus;
        }

        trackEvent("contact_form_submit", {
          section_name: "contact",
          item_name: payload.projectType || "unknown"
        });

        contactForm.reset();
      } catch (_error) {
        if (formStatus) {
          formStatus.textContent = uiCopy.errorStatus;
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = uiCopy.submitButton;
        }
      }
    });
  }
})();
