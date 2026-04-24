(() => {
  const menuButton = document.querySelector('.menu-button');
  const menu = document.querySelector('#site-menu');
  if (menuButton && menu) {
    menuButton.addEventListener('click', () => {
      const open = menu.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
  }

  const banner = document.querySelector('[data-cookie-banner]');
  const stored = localStorage.getItem('pamuuc_cookie_choice');
  if (banner && !stored) banner.hidden = false;
  document.querySelectorAll('[data-cookie-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem('pamuuc_cookie_choice', button.dataset.cookieChoice || 'set');
      if (banner) banner.hidden = true;
    });
  });
})();
