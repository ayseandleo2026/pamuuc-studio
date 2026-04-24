import { installWebVitalsReporter } from "./web-vitals.js";

(() => {
  "use strict";

  const GA_ID = "G-HS8HYY7LV1";
  const STORAGE_LANGUAGE = "pamuuc_lang";
  const STORAGE_COOKIE = "pamuuc_cookie_consent";
  const STORAGE_COOKIE_TIMESTAMP = "pamuuc_cookie_consent_timestamp";
  const COOKIE_CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const COOKIE_BANNER_VISIBLE_CLASS = "cookie-banner-visible";

  const supportedLanguages = ["en", "fr", "it", "es", "de"];

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
  const getLanguageHomePath = (language) => (!language || language === "en" ? "/" : `/${language}/`);
  const getLegalPath = (language, slug) => (!language || language === "en" ? `/${slug}/` : `/${language}/${slug}/`);
  const legalTermsPath = getLegalPath(currentLanguage, "terms-and-conditions");

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
    },
    de: {
      sendingButton: "Wird gesendet...",
      sendingStatus: "Ihre Anfrage wird gesendet...",
      successStatus: "Ihre Anfrage wurde gesendet. Wir antworten in der Regel innerhalb eines Werktags.",
      errorStatus: "Anfrage konnte nicht gesendet werden. Bitte erneut versuchen oder per E-Mail schreiben.",
      submitButton: "Projektanfrage senden"
    }
  };
  const uiCopy = uiCopyMap[currentLanguage] || uiCopyMap.en;
  const cookieTermsLinkCopyMap = {
    en: "Read terms and conditions.",
    fr: "Lire les conditions générales.",
    it: "Leggi termini e condizioni.",
    es: "Leer términos y condiciones.",
    de: "AGB lesen."
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
    },
    de: {
      parts: ["Vollständig maßgefertigte Uniformen", "Entwicklung aus Barcelona", "Klare Projektanfrage"],
      cta: "Erstgespräch anfragen"
    }
  };

  const injectPromoBanner = () => {
    const header = document.querySelector(".site-header");
    if (!header || header.querySelector(".promo-banner")) {
      return;
    }

    const copy = promoBannerCopyMap[currentLanguage] || promoBannerCopyMap.en;
    const homePath = getLanguageHomePath(currentLanguage);
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
  const pendingVitalMetrics = new Map();
  const getStorageItem = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  };

  const setStorageItem = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const removeStorageItem = (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (_error) {
      // Ignore storage errors in restricted environments.
    }
  };

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

  const getVitalDebugTarget = (metric) => {
    const target =
      metric.attribution?.interactionTarget ||
      metric.attribution?.largestShiftTarget ||
      metric.attribution?.target ||
      metric.attribution?.element ||
      "";

    if (!target) {
      return undefined;
    }

    return String(target).replace(/\s+/g, " ").trim().slice(0, 120);
  };

  const buildVitalPayload = (metric) => {
    const payload = {
      value: Number(metric.delta.toFixed(metric.name === "CLS" ? 4 : 0)),
      metric_id: metric.id,
      metric_value: Number(metric.value.toFixed(metric.name === "CLS" ? 4 : 0)),
      metric_delta: Number(metric.delta.toFixed(metric.name === "CLS" ? 4 : 0)),
      metric_rating: metric.rating,
      metric_navigation_type: metric.navigationType,
      page_path: window.location.pathname,
      page_type: body?.dataset.pageType || "page"
    };

    const debugTarget = getVitalDebugTarget(metric);
    if (debugTarget) {
      payload.debug_target = debugTarget;
    }

    return payload;
  };

  const flushPendingVitalMetrics = () => {
    if (!analyticsAllowed || pendingVitalMetrics.size === 0) {
      return;
    }

    pendingVitalMetrics.forEach(({ name, payload }) => {
      trackEvent(name, payload);
    });
    pendingVitalMetrics.clear();
  };

  installWebVitalsReporter((metric) => {
    const payload = buildVitalPayload(metric);
    const metricKey = `${metric.name}:${metric.id}`;

    if (!analyticsAllowed) {
      pendingVitalMetrics.set(metricKey, { name: metric.name, payload });
      return;
    }

    trackEvent(metric.name, payload);
  });

  // Expose a minimal public API for page-specific modules.
  window.PamuucStudio = Object.assign(window.PamuucStudio || {}, {
    currentLanguage,
    getPathWithBase,
    isRootPage: contentPathParts.length === 0 || (contentPathParts.length === 1 && contentPathParts[0] === "index.html"),
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
      flushPendingVitalMetrics();
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

  const getStoredCookieConsent = () => {
    const storedValue = getStorageItem(STORAGE_COOKIE);
    const storedTimestampRaw = getStorageItem(STORAGE_COOKIE_TIMESTAMP);
    const storedTimestamp = Number.parseInt(storedTimestampRaw || "", 10);

    if (storedValue !== "accepted" && storedValue !== "rejected") {
      removeStorageItem(STORAGE_COOKIE);
      removeStorageItem(STORAGE_COOKIE_TIMESTAMP);
      return null;
    }

    if (!Number.isFinite(storedTimestamp)) {
      removeStorageItem(STORAGE_COOKIE);
      removeStorageItem(STORAGE_COOKIE_TIMESTAMP);
      return null;
    }

    if (Date.now() - storedTimestamp >= COOKIE_CONSENT_TTL_MS) {
      removeStorageItem(STORAGE_COOKIE);
      removeStorageItem(STORAGE_COOKIE_TIMESTAMP);
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
      termsLink.href = getPathWithBase(legalTermsPath);
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
    body?.classList.remove(COOKIE_BANNER_VISIBLE_CLASS);
  };

  const showCookieBanner = () => {
    if (!cookieBanner) {
      return;
    }

    cookieBanner.classList.add("is-visible");
    body?.classList.add(COOKIE_BANNER_VISIBLE_CLASS);
  };

  const setCookieConsent = (value, source = "button") => {
    const normalizedValue = value === "accepted" ? "accepted" : "rejected";
    const current = getStoredCookieConsent();
    if (current === normalizedValue) {
      hideCookieBanner();
      applyGaConsent(normalizedValue);
      if (normalizedValue === "accepted") {
        analyticsAllowed = true;
        loadGa(normalizedValue);
        bindScrollTracking();
        flushPendingVitalMetrics();
      }
      return;
    }

    setStorageItem(STORAGE_COOKIE, normalizedValue);
    setStorageItem(STORAGE_COOKIE_TIMESTAMP, String(Date.now()));
    hideCookieBanner();

    analyticsAllowed = normalizedValue === "accepted";
    applyGaConsent(normalizedValue);
    if (analyticsAllowed) {
      loadGa(normalizedValue);
      bindScrollTracking();
      flushPendingVitalMetrics();
    }

    if (normalizedValue === "accepted") {
      trackEvent("cookie_accept", { item_name: source });
    } else {
      pendingVitalMetrics.clear();
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
  if (analyticsAllowed) {
    loadGa(gaConsentState);
    bindScrollTracking();
    flushPendingVitalMetrics();
  }

  if (!storedCookieConsent && cookieBanner) {
    showCookieBanner();

    if (cookieAccept) {
      cookieAccept.addEventListener("click", () => setCookieConsent("accepted", "accept_button"));
    }

    if (cookieReject) {
      cookieReject.addEventListener("click", () => setCookieConsent("rejected", "reject_button"));
    }
  }

  const storedLanguage = getStorageItem(STORAGE_LANGUAGE);
  const isRootPage = contentPathParts.length === 0 || (contentPathParts.length === 1 && contentPathParts[0] === "index.html");

  if (!storedLanguage && !isRootPage && currentLanguage) {
    setStorageItem(STORAGE_LANGUAGE, currentLanguage);
  }

  document.querySelectorAll("[data-lang-switch]").forEach((link) => {
    link.addEventListener("click", () => {
      const selected = link.getAttribute("data-lang-switch");
      if (!selected) {
        return;
      }

      setStorageItem(STORAGE_LANGUAGE, selected);
      trackEvent("language_switch", { item_name: selected });
    });
  });

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
