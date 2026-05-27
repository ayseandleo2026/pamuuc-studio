(() => {
  "use strict";

  const body = document.body;
  if (!body || body.dataset.pageType !== "home") {
    return;
  }

  const studioApi = window.PamuucStudio || {};
  const currentLanguage = studioApi.currentLanguage || body.dataset.language || document.documentElement.lang || "en";
  const trackEvent = typeof studioApi.trackEvent === "function" ? studioApi.trackEvent : () => {};
  const STORAGE_COOKIE = "pamuuc_cookie_consent";
  const FORM_ENDPOINT_HOST = "formspree.io";

  const getStorageItem = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  };

  const getSafeSourcePage = () => `${window.location.origin}${window.location.pathname}`;

  const isAllowedFormEndpoint = (value) => {
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === FORM_ENDPOINT_HOST;
    } catch (_error) {
      return false;
    }
  };

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

  window.requestAnimationFrame(() => {
    if (window.PamuucStudio && window.PamuucStudio.motionControlledByGsap) {
      return;
    }

    const revealItems = document.querySelectorAll(".reveal");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.classList.add("js-motion-ready");

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
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
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

  if (!contactForm) {
    return;
  }

  const submitButton = contactForm.querySelector("button[type='submit']");
  let hasStartedForm = false;

  contactForm.addEventListener("input", () => {
    if (hasStartedForm) return;
    hasStartedForm = true;
    trackEvent("contact_form_start", { section_name: "contact" });
  });

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!contactForm.checkValidity()) {
      contactForm.reportValidity();
      return;
    }

    const endpoint = contactForm.getAttribute("action") || "";
    const sourceData = new FormData(contactForm);
    const botField = String(sourceData.get("website") || "").trim();
    const meetingDateTime = String(sourceData.get("meeting-datetime") || "").trim();
    const briefBase = String(sourceData.get("brief") || "").trim();
    const projectType = String(sourceData.get("project-type") || "").trim();
    const submissionData = new FormData();

    if (botField) {
      return;
    }

    if (!sourceData.get("consent")) {
      contactForm.reportValidity();
      return;
    }

    submissionData.set("Full name", String(sourceData.get("name") || "").trim());
    submissionData.set("Work email", String(sourceData.get("email") || "").trim());
    submissionData.set("Phone number", String(sourceData.get("phone") || "").trim());
    submissionData.set("Company", String(sourceData.get("company") || "").trim());
    submissionData.set("Team size", String(sourceData.get("team-size") || "").trim());
    submissionData.set("Project type", projectType);
    submissionData.set("Target timeline", String(sourceData.get("timeline") || "").trim());
    if (meetingDateTime) {
      submissionData.set("Preferred meeting date and time", meetingDateTime);
    }
    submissionData.set("Project brief", briefBase);
    submissionData.set("Privacy consent", "Accepted");
    submissionData.set("Language", currentLanguage);
    submissionData.set("Source page", getSafeSourcePage());
    submissionData.set("Cookie consent", getStorageItem(STORAGE_COOKIE) || "unset");
    submissionData.set("_subject", "New Pamuuc Studio project request");
    submissionData.set("_replyto", String(sourceData.get("email") || "").trim());

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = uiCopy.sendingButton;
    }
    if (formStatus) {
      formStatus.textContent = uiCopy.sendingStatus;
    }

    try {
      if (!isAllowedFormEndpoint(endpoint)) {
        throw new Error("Invalid form endpoint");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json"
        },
        body: submissionData,
        redirect: "error",
        referrerPolicy: "no-referrer"
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      if (formStatus) {
        formStatus.textContent = uiCopy.successStatus;
      }

      trackEvent("contact_form_submit", {
        section_name: "contact",
        item_name: projectType || "unknown"
      });

      contactForm.reset();
    } catch (error) {
      console.error("Homepage contact form failed", error);
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
})();
