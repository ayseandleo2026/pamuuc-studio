/* PAMUUC | STUDIOS — site.js
   Every behaviour on the site, in one deferred file. No framework, no CDN.
   Nothing here blocks render; nothing third-party loads before consent. */
(() => {
  'use strict';

  /* --- Apply the deferred stylesheet -----------------------------------
     The full stylesheet is preloaded in <head> and promoted here, so the
     page needs no inline event handler and the CSP can stay strict.     */
  const css = document.querySelector('link[data-css]');
  if (css) css.rel = 'stylesheet';

  /* --- Mobile navigation ------------------------------------------------ */
  const burger = document.querySelector('[data-burger]');
  const nav = document.getElementById('nav');
  if (burger && nav) {
    const wide = () => innerWidth > 900;
    const setNav = (open) => {
      nav.hidden = !open;
      burger.setAttribute('aria-expanded', String(open));
    };
    setNav(wide());
    burger.addEventListener('click', () => setNav(nav.hidden));
    nav.addEventListener('click', (e) => { if (e.target.closest('a') && !wide()) setNav(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wide()) setNav(false); });
    addEventListener('resize', () => setNav(wide() ? true : burger.getAttribute('aria-expanded') === 'true'));
  }

  /* --- Language menu ---------------------------------------------------- */
  const langBtn = document.querySelector('[data-lang-btn]');
  const langMenu = document.getElementById('lang-menu');
  if (langBtn && langMenu) {
    const setLang = (open) => { langMenu.hidden = !open; langBtn.setAttribute('aria-expanded', String(open)); };
    langBtn.addEventListener('click', (e) => { e.stopPropagation(); setLang(langMenu.hidden); });
    document.addEventListener('click', (e) => { if (!langMenu.contains(e.target)) setLang(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setLang(false); });
    /* Remember the choice, never auto-redirect: redirecting by Accept-Language
       breaks crawling and makes the hreflang cluster unreliable. */
    langMenu.addEventListener('click', (e) => {
      const a = e.target.closest('a[hreflang]');
      if (a) { try { localStorage.setItem('pamuuc-lang', a.hreflang); } catch (_) {} }
    });
  }

  /* --- Article table of contents --------------------------------------- */
  const toc = document.querySelector('[data-toc]');
  if (toc && 'IntersectionObserver' in window) {
    const links = new Map([...toc.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const a = links.get(en.target.id);
        if (a && en.isIntersecting) {
          links.forEach((l) => l.classList.remove('is-active'));
          a.classList.add('is-active');
        }
      });
    }, { rootMargin: '-15% 0px -70% 0px' });
    links.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
  }

  /* --- Contact form ----------------------------------------------------- */
  const form = document.querySelector('[data-form]');
  if (form) {
    const status = form.querySelector('[data-form-status]');
    const submit = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      if (!form.checkValidity()) return;               // let the browser report it
      if (form.querySelector('[name="website"]').value) { e.preventDefault(); return; } // honeypot
      e.preventDefault();
      submit.disabled = true;
      const label = submit.textContent;
      submit.textContent = form.dataset.sending || label;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        status.textContent = form.dataset.ok;
        status.dataset.state = 'ok';
      } catch (_) {
        status.textContent = form.dataset.error;
        status.dataset.state = 'error';
      } finally {
        status.hidden = false;
        submit.disabled = false;
        submit.textContent = label;
      }
    });
  }

  /* --- Consent-gated analytics -----------------------------------------
     No external request is made until the visitor opts in.               */
  const KEY = 'pamuuc-consent';
  const bar = document.querySelector('[data-consent]');
  const loadAnalytics = () => {
    const id = document.body.dataset.ga;
    if (window.__ga || !id) return;
    window.__ga = 1;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', id, { anonymize_ip: true });
  };
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch (_) {}
  if (stored === 'granted') loadAnalytics();
  if (bar) {
    if (!stored) bar.hidden = false;
    bar.addEventListener('click', (e) => {
      const act = e.target.closest('[data-consent-action]');
      if (!act) return;
      const v = act.dataset.consentAction;
      try { localStorage.setItem(KEY, v); } catch (_) {}
      if (v === 'granted') loadAnalytics();
      bar.hidden = true;
    });
  }
})();
