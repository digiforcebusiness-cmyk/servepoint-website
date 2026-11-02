document.documentElement.classList.add('js');
const menu = document.querySelector('[data-menu]');
const toggle = document.querySelector('[data-menu-toggle]');
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  menu.classList.toggle('is-open', open);
});
menu?.addEventListener('click', event => {
  if (event.target.closest('a')) {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.classList.contains('is-open')) {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
});
// Events are available to an installed analytics collector; no visitor data is sent here.
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-conversion]');
  if (!link) return;
  const detail = { event: 'servepoint_conversion', action: link.dataset.conversion,
    placement: link.dataset.placement || 'page', destination: link.href,
    page: location.pathname };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(detail);
  window.dispatchEvent(new CustomEvent('servepoint:conversion', { detail }));
});
