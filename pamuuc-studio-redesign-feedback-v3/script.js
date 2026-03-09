(() => {
  "use strict";

  const STUDIO_ORIGIN = "https://studio.pamuuc.com";
  const GA_ID = "G-HS8HYY7LV1";
  const FORM_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbxvyqSSrvI3yGlPEk9ySbFE2yfFzirmHFz_BzdzkOAAOtk7HtiwLrdWinZdLVAy1g5p/exec";

  const STORAGE_LANGUAGE = "pamuuc_lang";
  const STORAGE_COOKIE = "pamuuc_cookie_consent";

  const supportedLanguages = ["en", "fr", "it", "es"];

  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const languageFromPath = supportedLanguages.includes(pathParts[0]) ? pathParts[0] : null;
  const currentLanguage = languageFromPath || document.body.dataset.language || document.documentElement.lang || "en";

  const body = document.body;

  let gaLoaded = false;
  let analyticsAllowed = false;
  const pendingEvents = [];

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

  const loadGa = () => {
    if (gaLoaded) {
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.onload = () => {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };

      window.gtag("js", new Date());
      window.gtag("config", GA_ID, {
        anonymize_ip: true,
        allow_google_signals: false
      });

      gaLoaded = true;
      while (pendingEvents.length) {
        const [eventName, payload] = pendingEvents.shift();
        window.gtag("event", eventName, payload);
      }
      trackEvent("page_view", {
        page_path: window.location.pathname,
        page_title: document.title
      });
    };

    document.head.appendChild(script);
  };

  const cookieBanner = document.querySelector("#cookie-banner");
  const cookieAccept = document.querySelector("#cookie-accept");
  const cookieReject = document.querySelector("#cookie-reject");
  let scrollAutoAcceptHandler = null;

  const hideCookieBanner = () => {
    if (cookieBanner) {
      cookieBanner.classList.remove("is-visible");
    }
  };

  const setCookieConsent = (value, source = "button") => {
    window.localStorage.setItem(STORAGE_COOKIE, value);
    hideCookieBanner();

    if (scrollAutoAcceptHandler) {
      window.removeEventListener("scroll", scrollAutoAcceptHandler);
      scrollAutoAcceptHandler = null;
    }

    analyticsAllowed = value === "accepted";

    if (value === "accepted") {
      loadGa();
      trackEvent("cookie_accept", { item_name: source });
    } else {
      if (gaLoaded && typeof window.gtag === "function") {
        window.gtag("event", "cookie_reject", {
          language: currentLanguage,
          item_name: source
        });
      }
      pendingEvents.length = 0;
    }
  };

  const storedCookieConsent = window.localStorage.getItem(STORAGE_COOKIE);
  if (storedCookieConsent === "accepted") {
    analyticsAllowed = true;
    loadGa();
  } else if (storedCookieConsent === "rejected") {
    analyticsAllowed = false;
  } else if (cookieBanner) {
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
  }

  const languageModal = document.querySelector("#language-modal");
  const storedLanguage = window.localStorage.getItem(STORAGE_LANGUAGE);

  const isRootPage = window.location.pathname === "/" || window.location.pathname === "/index.html";

  if (!storedLanguage && !isRootPage && currentLanguage) {
    window.localStorage.setItem(STORAGE_LANGUAGE, currentLanguage);
  }

  if (!storedLanguage && isRootPage && languageModal) {
    languageModal.classList.add("is-visible");
    languageModal.setAttribute("aria-hidden", "false");
  }

  if (storedLanguage && isRootPage && supportedLanguages.includes(storedLanguage) && storedLanguage !== "en") {
    window.location.replace(`/${storedLanguage}/`);
  }

  document.querySelectorAll("[data-lang-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.getAttribute("data-lang-choice");
      if (!selected || !supportedLanguages.includes(selected)) {
        return;
      }

      window.localStorage.setItem(STORAGE_LANGUAGE, selected);
      trackEvent("language_selected", { item_name: selected });
      window.location.href = selected === "en" ? "/en/" : `/${selected}/`;
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

    menuToggle.addEventListener("click", () => {
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
    });

    window.addEventListener(
      "resize",
      () => {
        if (window.innerWidth > mobileNavBreakpoint) {
          closeMenu();
        }
      },
      { passive: true }
    );
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
          const templateId = trigger.getAttribute("data-modal-target");
          if (templateId) {
            openModal(templateId, trigger);
          }
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
        origin: STUDIO_ORIGIN
      };

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
      }

      if (formStatus) {
        formStatus.textContent = "Sending your request...";
      }

      try {
        const response = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        if (formStatus) {
          formStatus.textContent = "Success: your request was sent. We usually reply within 1 business day.";
        }

        trackEvent("contact_form_submit", {
          section_name: "contact",
          item_name: payload.projectType || "unknown"
        });

        contactForm.reset();
      } catch (_error) {
        if (formStatus) {
          formStatus.textContent = "We could not send your request right now. Please try again or use Prefer email instead.";
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Send project request";
        }
      }
    });
  }
})();
