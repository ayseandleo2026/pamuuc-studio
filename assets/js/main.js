(() => {
  "use strict";

  const GA_ID = "G-HS8HYY7LV1";
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
  const isHomePage = body?.dataset.pageType === "home";
  const promoBannerCopyMap = {
    en: {
      parts: ["Fully custom uniforms", "Barcelona-led development", "Clear project request"],
      cta: "Request a first meeting"
    },
    fr: {
      parts: ["Uniformes entièrement sur mesure", "Développement piloté depuis Barcelone", "Demande projet claire"],
      cta: "Demander un premier rendez-vous"
    },
    it: {
      parts: ["Uniformi completamente su misura", "Sviluppo guidato da Barcellona", "Richiesta progetto chiara"],
      cta: "Richiedi un primo incontro"
    },
    es: {
      parts: ["Uniformes totalmente a medida", "Desarrollo coordinado desde Barcelona", "Solicitud de proyecto clara"],
      cta: "Solicitar una primera reunión"
    }
  };

  const injectPromoBanner = () => {
    const header = document.querySelector(".site-header");
    if (!header || header.querySelector(".promo-banner")) {
      return;
    }

    const copy = promoBannerCopyMap[currentLanguage] || promoBannerCopyMap.en;
    const homePath = languageFromPath ? `/${currentLanguage}/` : "/";
    const ctaHref = isHomePage ? "#contact" : getPathWithBase(`${homePath}#contact`);
    const ctaLabel = copy.cta;

    const banner = document.createElement("div");
    banner.className = "promo-banner";

    const container = document.createElement("div");
    container.className = "container promo-banner-inner";

    const copyRow = document.createElement("div");
    copyRow.className = "promo-banner-copy";

    copy.parts.forEach((part, index) => {
      const item = document.createElement(index === 0 ? "strong" : "span");
      item.textContent = part;
      copyRow.appendChild(item);

      if (index < copy.parts.length - 1) {
        const separator = document.createElement("span");
        separator.className = "promo-banner-separator";
        separator.textContent = "|";
        copyRow.appendChild(separator);
      }
    });

    const link = document.createElement("a");
    link.className = "promo-banner-link";
    link.href = ctaHref;
    link.textContent = ctaLabel;

    container.append(copyRow, link);
    banner.appendChild(container);
    header.prepend(banner);
  };

  injectPromoBanner();

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

  // Expose a minimal public API for page-specific modules.
  window.PamuucStudio = Object.assign(window.PamuucStudio || {}, {
    currentLanguage,
    getPathWithBase,
    supportedLanguages: [...supportedLanguages],
    trackEvent
  });

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
    if (analyticsAllowed) {
      bindScrollTracking();
    }

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
  let scrollTrackingBound = false;

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

  const bindScrollTracking = () => {
    if (scrollTrackingBound) {
      return;
    }

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

    scrollTrackingBound = true;
  };

  const storedCookieConsent = getStoredCookieConsent();
  analyticsAllowed = storedCookieConsent === "accepted";
  gaConsentState = analyticsAllowed ? "accepted" : "rejected";
  loadGa(gaConsentState);
  if (analyticsAllowed) {
    bindScrollTracking();
  }

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

  const mobileNavBreakpoint = 1100;
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

  const pageScriptMap = {
    home: "./pages/home.js",
    blog: "./pages/blog.js",
    "blog-post": "./pages/blog.js"
  };

  const pageScript = pageScriptMap[body?.dataset.pageType || ""];
  if (pageScript) {
    import(pageScript).catch((error) => {
      console.error(`Failed to load page script: ${pageScript}`, error);
    });
  }
})();
