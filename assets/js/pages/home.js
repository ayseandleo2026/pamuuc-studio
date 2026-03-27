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
    window.setTimeout(() => {
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

        Array.from(article.querySelectorAll("p")).forEach((current) => {
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
            const removeNode = next;
            next = next.nextElementSibling;
            removeNode.remove();
          }
        });

        const paragraphs = Array.from(article.querySelectorAll("p"));
        const firstBodyParagraph = paragraphs.find((paragraph) => !isLikelyModalSubheading(paragraph.textContent || ""));
        if (firstBodyParagraph) {
          firstBodyParagraph.classList.add("modal-lead");
        }

        paragraphs.forEach((paragraph) => {
          const text = (paragraph.textContent || "").trim();
          if (!isLikelyModalSubheading(text) || paragraph.classList.contains("modal-lead")) {
            return;
          }
          paragraph.classList.add("modal-subheading");
        });

        article.dataset.formatted = "true";
      };

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
        if (section.id) return section.id;
        if (section.classList.contains("logo-band")) return "logo-band";
        return "";
      };

      const getMobileTabLabel = (section) => {
        const kicker = section.querySelector(".section-kicker")?.textContent?.trim();
        if (kicker) return kicker;
        const key = getMobileTabKey(section);
        const mapped = mobileTabLabelMap[currentLanguage]?.[key];
        if (mapped) return mapped;
        const heading = section.querySelector("h2")?.textContent?.trim();
        if (heading) return heading;
        return section.id ? section.id.replace(/-/g, " ") : "Section";
      };

      const wrapSectionsInMobileTabs = () => {
        document.querySelectorAll("main > section").forEach((section) => {
          if (section.classList.contains("hero-section") || section.dataset.mobileTabbed === "true") {
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
        if (mobileTabsQuery.matches) wrapSectionsInMobileTabs();
        else unwrapSectionsFromMobileTabs();
      };

      const openHashSectionTab = () => {
        if (!mobileTabsQuery.matches || !window.location.hash) return;
        const targetId = decodeURIComponent(window.location.hash.slice(1));
        if (!targetId) return;
        const targetSection = document.getElementById(targetId);
        if (!targetSection) return;
        const firstChild = targetSection.firstElementChild;
        const tabShell = firstChild && firstChild.classList.contains("mobile-tab-shell") ? firstChild : targetSection.querySelector(".mobile-tab-shell");
        if (tabShell && !tabShell.open) {
          tabShell.open = true;
        }
      };

      syncMobileTabs();
      openHashSectionTab();

      const tabSyncHandler = () => {
        syncMobileTabs();
        openHashSectionTab();
      };

      if (typeof mobileTabsQuery.addEventListener === "function") {
        mobileTabsQuery.addEventListener("change", tabSyncHandler);
      } else if (typeof mobileTabsQuery.addListener === "function") {
        mobileTabsQuery.addListener(tabSyncHandler);
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
        if (!container) return [];
        return Array.from(container.querySelectorAll(focusableSelector)).filter((element) => element.offsetParent !== null || element === document.activeElement);
      };

      const closeModal = () => {
        if (!modal || !modalContent) return;
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
        if (!modal || !modalContent) return;
        const template = document.getElementById(templateId);
        if (!template || template.tagName !== "TEMPLATE") return;
        modalContent.replaceChildren(template.content.cloneNode(true));
        modalContent.querySelectorAll(".modal-article").forEach((article) => formatModalArticle(article));
        lastFocusedElement = trigger || document.activeElement;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        body.classList.add("modal-open");
        trackEvent("popup_open", { popup_name: templateId });
        const focusable = getFocusableElements(modalPanel || modal);
        if (focusable.length) focusable[0].focus({ preventScroll: true });
        else modalContent.focus({ preventScroll: true });
      };

      if (modal && modalContent) {
        document.addEventListener("click", (event) => {
          const closeTarget = event.target.closest("[data-modal-close]");
          if (closeTarget) {
            closeModal();
            return;
          }

          const trigger = event.target.closest("[data-modal-target]");
          if (!trigger) return;
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
          if (event.key !== "Tab" || !modal.classList.contains("is-open")) return;
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
            if (!detail.open) return;
            detailsNodes.forEach((otherDetail) => {
              if (otherDetail !== detail) otherDetail.open = false;
            });
            const title = detail.querySelector("summary")?.textContent?.trim() || "faq_item";
            trackEvent("faq_open", { item_name: title });
          });
        });
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

      if (contactForm) {
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
          const meetingDateTime = String(sourceData.get("meeting-datetime") || "").trim();
          const briefBase = String(sourceData.get("brief") || "").trim();
          const projectType = String(sourceData.get("project-type") || "").trim();
          const submissionData = new FormData();

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
          submissionData.set("Privacy consent", sourceData.get("consent") ? "Accepted" : "Not accepted");
          submissionData.set("Language", currentLanguage);
          submissionData.set("Source page", window.location.href);
          submissionData.set("Cookie consent", window.localStorage.getItem(STORAGE_COOKIE) || "unset");
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
            if (!endpoint) {
              throw new Error("Missing Formspree endpoint");
            }

            const response = await fetch(endpoint, {
              method: "POST",
              headers: {
                Accept: "application/json"
              },
              body: submissionData
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
      }
    }, 0);
  });
})();
