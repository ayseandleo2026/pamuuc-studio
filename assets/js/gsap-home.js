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

  const hasTarget = (target) => gsap.utils.toArray(target).length > 0;

  const timelineFromIfPresent = (timeline, target, vars, position) => {
    if (hasTarget(target)) {
      timeline.from(target, vars, position);
    }

    return timeline;
  };

  const fromIfPresent = (target, vars) => {
    if (hasTarget(target)) {
      gsap.from(target, vars);
    }
  };

  const fromToIfPresent = (target, fromVars, toVars) => {
    if (hasTarget(target)) {
      gsap.fromTo(target, fromVars, toVars);
    }
  };

  const toIfPresent = (target, vars) => {
    if (hasTarget(target)) {
      gsap.to(target, vars);
    }
  };

  const initMotion = () => {
    root.classList.remove("gsap-pending");
    body.classList.add("gsap-motion-ready");

    const heroTimeline = gsap.timeline({
      defaults: {
        ease: "power3.out",
        duration: 0.9
      }
    });

    timelineFromIfPresent(heroTimeline, ".promo-banner", { y: -18, autoAlpha: 0, duration: 0.55 }, 0);
    timelineFromIfPresent(heroTimeline, ".site-header", { y: -20, autoAlpha: 0, duration: 0.7 }, 0.05);
    timelineFromIfPresent(heroTimeline, ".hero-copy .eyebrow", { y: 18, autoAlpha: 0 }, 0.14);
    timelineFromIfPresent(heroTimeline, ".hero-copy h1", { y: 34, autoAlpha: 0, duration: 1.05 }, 0.2);
    timelineFromIfPresent(heroTimeline, ".hero-copy .hero-lead", { y: 20, autoAlpha: 0 }, 0.32);
    timelineFromIfPresent(
      heroTimeline,
      ".hero-pill-row .pill",
      { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.55 },
      0.4
    );
    timelineFromIfPresent(
      heroTimeline,
      ".hero-actions .button",
      { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.55 },
      0.48
    );
    timelineFromIfPresent(
      heroTimeline,
      ".hero-visual .visual-card-main",
      { y: 26, autoAlpha: 0, scale: 0.97, duration: 1 },
      0.28
    );
    timelineFromIfPresent(
      heroTimeline,
      ".hero-visual .floating-proof",
      { y: 18, autoAlpha: 0, stagger: 0.1, duration: 0.65 },
      0.62
    );

    fromToIfPresent(
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

    toIfPresent(".floating-proof-top", {
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

    toIfPresent(".floating-proof-bottom", {
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
        fromIfPresent(element, {
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

    fromIfPresent(".logo-band-points span", {
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
