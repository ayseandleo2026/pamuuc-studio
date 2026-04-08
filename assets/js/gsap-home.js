(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  if (!body || body.dataset.pageType !== "home") {
    root.classList.remove("gsap-pending");
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const prefersDesktopMotion = window.matchMedia("(min-width: 781px)").matches;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;

  if (!gsap || !ScrollTrigger || prefersReducedMotion || !prefersDesktopMotion) {
    root.classList.remove("gsap-pending");
    return;
  }

  window.PamuucStudio = Object.assign(window.PamuucStudio || {}, {
    motionControlledByGsap: true
  });

  gsap.registerPlugin(ScrollTrigger);

  const initMotion = () => {
    root.classList.remove("gsap-pending");
    body.classList.add("gsap-motion-ready");

    const heroTimeline = gsap.timeline({
      defaults: {
        ease: "power3.out",
        duration: 0.9
      }
    });

    heroTimeline
      .from(".promo-banner", { y: -18, autoAlpha: 0, duration: 0.55 }, 0)
      .from(".site-header", { y: -20, autoAlpha: 0, duration: 0.7 }, 0.05)
      .from(".hero-copy .eyebrow", { y: 18, autoAlpha: 0 }, 0.14)
      .from(".hero-copy h1", { y: 34, autoAlpha: 0, duration: 1.05 }, 0.2)
      .from(".hero-copy .hero-lead", { y: 20, autoAlpha: 0 }, 0.32)
      .from(".hero-pill-row .pill", { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.55 }, 0.4)
      .from(".hero-actions .button", { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.55 }, 0.48)
      .from(".hero-visual .visual-card-main", { y: 26, autoAlpha: 0, scale: 0.97, duration: 1 }, 0.28)
      .from(".hero-visual .floating-proof", { y: 18, autoAlpha: 0, stagger: 0.1, duration: 0.65 }, 0.62);

    gsap.fromTo(
      ".hero-visual .visual-card-main",
      { yPercent: -2, scale: 0.985 },
      {
        yPercent: 4,
        scale: 1.02,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero-section",
          start: "top top",
          end: "bottom top",
          scrub: true
        }
      }
    );

    gsap.to(".floating-proof-top", {
      yPercent: -10,
      xPercent: 3,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero-section",
        start: "top top",
        end: "bottom top",
        scrub: true
      }
    });

    gsap.to(".floating-proof-bottom", {
      yPercent: 12,
      xPercent: -4,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero-section",
        start: "top top",
        end: "bottom top",
        scrub: true
      }
    });

    gsap.utils
      .toArray(".reveal")
      .filter((element) => !element.closest(".hero-section"))
      .forEach((element) => {
        gsap.from(element, {
          y: 24,
          autoAlpha: 0,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: element,
            start: "top 84%",
            once: true
          }
        });
      });

    gsap.from(".logo-band-points span", {
      y: 18,
      autoAlpha: 0,
      duration: 0.55,
      ease: "power2.out",
      stagger: 0.06,
      scrollTrigger: {
        trigger: ".logo-band",
        start: "top 82%",
        once: true
      }
    });

    ScrollTrigger.refresh();
  };

  if (document.readyState === "complete") {
    window.requestAnimationFrame(initMotion);
  } else {
    window.addEventListener(
      "load",
      () => {
        window.requestAnimationFrame(initMotion);
      },
      { once: true }
    );
  }
})();
