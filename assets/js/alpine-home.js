(() => {
  "use strict";

  const STORAGE_LANGUAGE = "pamuuc_lang";
  const supportedLanguages = ["en", "fr", "it", "es"];
  const mobileTabDefaultOpen = new Set(["categories", "process", "contact"]);
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

  const getBasePathContext = () => {
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

    return { basePath, contentPathParts };
  };

  const getPathWithBase = (basePath, path) => {
    if (!path || !path.startsWith("/")) {
      return path;
    }

    return `${basePath}${path}`;
  };

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

  document.addEventListener("alpine:init", () => {
    window.Alpine.data("pamuucHome", () => ({
      basePath: "",
      contentPathParts: [],
      currentLanguage: document.body?.dataset.language || document.documentElement.lang || "en",
      isRootPage: false,
      menuOpen: false,
      mobileLanguageOpen: false,
      languageModalOpen: false,
      modalOpen: false,
      lastFocusedElement: null,
      mobileTabsQuery: null,

      init() {
        const { basePath, contentPathParts } = getBasePathContext();
        this.basePath = basePath;
        this.contentPathParts = contentPathParts;
        this.isRootPage = contentPathParts.length === 0 || (contentPathParts.length === 1 && contentPathParts[0] === "index.html");
        this.currentLanguage = document.body?.dataset.language || document.documentElement.lang || "en";
        this.modal = document.querySelector("#site-modal");
        this.modalContent = document.querySelector("#modal-content");
        this.modalPanel = document.querySelector(".modal-panel");
        this.languageModal = document.querySelector("#language-modal");
        this.mobileTabsQuery = window.matchMedia("(max-width: 780px)");

        const storedLanguage = this.getStoredLanguage();
        if (!storedLanguage && !this.isRootPage && this.currentLanguage) {
          this.storeLanguage(this.currentLanguage);
        }

        if (storedLanguage && this.isRootPage && supportedLanguages.includes(storedLanguage) && storedLanguage !== "en") {
          window.location.replace(this.getPathWithBase(`/${storedLanguage}/`));
          return;
        }

        this.initAccordions();
        this.syncMobileTabs();
        this.openHashSectionTab();

        const tabSyncHandler = () => {
          this.syncMobileTabs();
          this.openHashSectionTab();
        };

        if (typeof this.mobileTabsQuery.addEventListener === "function") {
          this.mobileTabsQuery.addEventListener("change", tabSyncHandler);
        } else if (typeof this.mobileTabsQuery.addListener === "function") {
          this.mobileTabsQuery.addListener(tabSyncHandler);
        }

        window.addEventListener("hashchange", () => this.openHashSectionTab());
        window.addEventListener(
          "resize",
          () => {
            if (window.innerWidth > 1100) {
              this.closeMenu();
              this.closeMobileLanguage();
            }
          },
          { passive: true }
        );
      },

      getPathWithBase(path) {
        return getPathWithBase(this.basePath, path);
      },

      getStoredLanguage() {
        try {
          return window.localStorage.getItem(STORAGE_LANGUAGE);
        } catch (_error) {
          return null;
        }
      },

      storeLanguage(selected) {
        try {
          window.localStorage.setItem(STORAGE_LANGUAGE, selected);
        } catch (_error) {
          // Ignore storage errors in private browsing or restricted environments.
        }
      },

      trackEvent(name, params = {}) {
        if (window.PamuucStudio && typeof window.PamuucStudio.trackEvent === "function") {
          window.PamuucStudio.trackEvent(name, params);
        }
      },

      rememberLanguage(selected) {
        if (!selected || !supportedLanguages.includes(selected)) {
          return;
        }

        this.storeLanguage(selected);
      },

      selectLanguage(selected) {
        if (!selected || !supportedLanguages.includes(selected)) {
          return;
        }

        this.storeLanguage(selected);
        this.trackEvent("language_selected", { item_name: selected });
        const targetPath = selected === "en" ? "/" : `/${selected}/`;
        window.location.href = this.getPathWithBase(targetPath);
      },

      toggleMenu() {
        this.mobileLanguageOpen = false;
        this.menuOpen = !this.menuOpen;
      },

      closeMenu() {
        this.menuOpen = false;
        this.mobileLanguageOpen = false;
      },

      toggleMobileLanguage() {
        this.menuOpen = false;
        this.mobileLanguageOpen = !this.mobileLanguageOpen;
      },

      closeMobileLanguage() {
        this.mobileLanguageOpen = false;
      },

      handleClick(event) {
        const closeTarget = event.target.closest("[data-modal-close]");
        if (closeTarget) {
          event.preventDefault();
          this.closeModal();
          return;
        }

        const trigger = event.target.closest("[data-modal-target]");
        if (!trigger) {
          return;
        }

        event.preventDefault();
        this.openModalFromTrigger(trigger);
      },

      handleKeydown(event) {
        const trigger = event.target.closest("[data-modal-target][role='button']");
        if (trigger && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          this.openModalFromTrigger(trigger);
          return;
        }

        if (event.key === "Escape") {
          if (this.modalOpen) {
            this.closeModal();
            return;
          }

          if (this.mobileLanguageOpen) {
            this.closeMobileLanguage();
            return;
          }

          if (this.menuOpen) {
            this.closeMenu();
          }

          return;
        }

        if (event.key !== "Tab" || !this.modalOpen) {
          return;
        }

        const focusable = this.getFocusableElements(this.modalPanel || this.modal);
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
      },

      getFocusableElements(container) {
        if (!container) {
          return [];
        }

        const focusableSelector = [
          "a[href]",
          "button:not([disabled])",
          "textarea:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "[tabindex]:not([tabindex='-1'])"
        ].join(",");

        return Array.from(container.querySelectorAll(focusableSelector)).filter((element) => {
          return element.offsetParent !== null || element === document.activeElement;
        });
      },

      openModalFromTrigger(trigger) {
        const templateId = trigger.getAttribute("data-modal-target");
        if (!templateId) {
          return;
        }

        this.openModal(templateId, trigger);

        const eventName = trigger.getAttribute("data-track-event");
        if (eventName) {
          this.trackEvent(eventName, {
            section_name: trigger.closest("section")?.id || "unknown",
            item_name: trigger.getAttribute("data-item-name") || templateId
          });
        }
      },

      openModal(templateId, trigger) {
        if (!this.modalContent) {
          return;
        }

        const template = document.getElementById(templateId);
        if (!template || template.tagName !== "TEMPLATE") {
          return;
        }

        this.modalContent.replaceChildren(template.content.cloneNode(true));
        this.modalContent.querySelectorAll(".modal-article").forEach((article) => formatModalArticle(article));
        this.lastFocusedElement = trigger || document.activeElement;
        this.modalOpen = true;

        this.$nextTick(() => {
          const focusable = this.getFocusableElements(this.modalPanel || this.modal);
          if (focusable.length) {
            focusable[0].focus({ preventScroll: true });
          } else if (this.modalContent) {
            this.modalContent.focus({ preventScroll: true });
          }
        });
      },

      closeModal() {
        if (!this.modalContent) {
          return;
        }

        this.modalOpen = false;
        this.modalContent.replaceChildren();
        if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === "function") {
          this.lastFocusedElement.focus({ preventScroll: true });
        }
        this.lastFocusedElement = null;
      },

      initAccordions() {
        document.querySelectorAll("[data-accordion-group]").forEach((group) => {
          const detailsNodes = group.querySelectorAll("details");
          detailsNodes.forEach((detail) => {
            if (detail.dataset.alpineBound === "true") {
              return;
            }

            detail.dataset.alpineBound = "true";
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
              this.trackEvent("faq_open", { item_name: title });
            });
          });
        });
      },

      getMobileTabKey(section) {
        if (section.id) return section.id;
        if (section.classList.contains("logo-band")) return "logo-band";
        return "";
      },

      getMobileTabLabel(section) {
        const kicker = section.querySelector(".section-kicker")?.textContent?.trim();
        if (kicker) return kicker;
        const key = this.getMobileTabKey(section);
        const mapped = mobileTabLabelMap[this.currentLanguage]?.[key];
        if (mapped) return mapped;
        const heading = section.querySelector("h2")?.textContent?.trim();
        if (heading) return heading;
        return section.id ? section.id.replace(/-/g, " ") : "Section";
      },

      wrapSectionsInMobileTabs() {
        document.querySelectorAll("main > section").forEach((section) => {
          if (section.classList.contains("hero-section") || section.dataset.mobileTabbed === "true") {
            return;
          }

          const shell = document.createElement("details");
          shell.className = "mobile-tab-shell";
          shell.open = mobileTabDefaultOpen.has(section.id);

          const summary = document.createElement("summary");
          summary.className = "mobile-tab-toggle";
          summary.textContent = this.getMobileTabLabel(section);

          const panel = document.createElement("div");
          panel.className = "mobile-tab-panel";

          while (section.firstChild) {
            panel.appendChild(section.firstChild);
          }

          shell.append(summary, panel);
          section.appendChild(shell);
          section.dataset.mobileTabbed = "true";
        });
      },

      unwrapSectionsFromMobileTabs() {
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
      },

      syncMobileTabs() {
        if (!this.mobileTabsQuery) {
          return;
        }

        if (this.mobileTabsQuery.matches) this.wrapSectionsInMobileTabs();
        else this.unwrapSectionsFromMobileTabs();
      },

      openHashSectionTab() {
        if (!this.mobileTabsQuery || !this.mobileTabsQuery.matches || !window.location.hash) return;
        const targetId = decodeURIComponent(window.location.hash.slice(1));
        if (!targetId) return;
        const targetSection = document.getElementById(targetId);
        if (!targetSection) return;
        const firstChild = targetSection.firstElementChild;
        const tabShell = firstChild && firstChild.classList.contains("mobile-tab-shell") ? firstChild : targetSection.querySelector(".mobile-tab-shell");
        if (tabShell && !tabShell.open) {
          tabShell.open = true;
        }
      }
    }));
  });
})();
