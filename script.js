(() => {
  "use strict";

  const mobileNavBreakpoint = 860;
  const body = document.body;

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

    const toggleMenu = () => {
      const isOpen = siteNav.classList.contains("is-open");
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    menuToggle.addEventListener("click", toggleMenu);

    siteNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        closeMenu();
      });
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

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    const closeOnDesktop = () => {
      if (window.innerWidth > mobileNavBreakpoint) {
        closeMenu();
      }
    };

    window.addEventListener("resize", closeOnDesktop, { passive: true });
    window.addEventListener("orientationchange", closeOnDesktop, { passive: true });
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
      {
        threshold: 0.14,
        rootMargin: "0px 0px -48px 0px"
      }
    );

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  // Keep one details panel open per group to reduce long mobile scroll states.
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
      });
    });
  });

  const contactForm = document.querySelector("#contact-form");
  const formStatus = document.querySelector("#form-status");

  if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }

      const formData = new FormData(contactForm);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const company = String(formData.get("company") || "").trim();
      const projectType = String(formData.get("project-type") || "").trim();
      const brief = String(formData.get("brief") || "").trim();

      const subjectBits = ["Pamuuc Studio project request"];
      if (company) {
        subjectBits.push(company);
      }

      const subject = subjectBits.join(" | ");
      const bodyLines = [
        `Name: ${name}`,
        `Email: ${email}`,
        `Company: ${company || "N/A"}`,
        `Project type: ${projectType || "N/A"}`,
        "",
        "Brief:",
        brief || "N/A"
      ];

      const mailtoHref = `mailto:leo.gobbato@pamuuc.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        bodyLines.join("\n")
      )}`;

      if (formStatus) {
        formStatus.textContent = "Opening your email client...";
      }

      window.location.href = mailtoHref;
    });
  }
})();
