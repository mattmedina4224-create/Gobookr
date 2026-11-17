'use strict';
(() => {
  const input = document.getElementById('home-q');
  const list = document.getElementById('home-specialty-suggestions');
  const status = document.getElementById('home-specialty-status');
  if (!input || !list || !status || !window.SpecialtySuggestions) return;

  let catalogPromise;
  let items = [];
  let active = -1;
  let revision = 0;

  function catalog() {
    if (!catalogPromise) catalogPromise = fetch('/service-catalog.json')
      .then(response => {
        if (!response.ok) throw new Error('Service catalog unavailable');
        return response.json();
      })
      .then(data => Array.isArray(data.entries) ? data.entries : [])
      .catch(() => []);
    return catalogPromise;
  }

  function hide() {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    status.textContent = '';
  }

  function select(index) {
    if (!items[index]) return;
    input.value = items[index];
    revision++;
    hide();
    input.focus({ preventScroll: true });
  }

  function highlight() {
    Array.from(list.children).forEach((option, index) => {
      option.setAttribute('aria-selected', String(index === active));
    });
    if (active >= 0) input.setAttribute('aria-activedescendant', 'home-specialty-option-' + active);
    else input.removeAttribute('aria-activedescendant');
  }

  async function render() {
    const current = ++revision;
    const query = input.value.trim();
    if (query.length < 2) { hide(); return; }

    const entries = await catalog();
    if (current !== revision || document.activeElement !== input) return;
    items = window.SpecialtySuggestions.suggest(entries, query, 8);
    active = -1;
    list.replaceChildren();
    if (!items.length) { hide(); return; }

    items.forEach((label, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = 'home-specialty-option-' + index;
      option.className = 'home-specialty-option';
      option.tabIndex = -1;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = label;
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => select(index));
      list.append(option);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.removeAttribute('aria-activedescendant');
    status.textContent = items.length + ' matching specialties. Use arrow keys to choose.';
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => { revision++; hide(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing || list.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = active < 0
        ? (event.key === 'ArrowDown' ? 0 : items.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      highlight();
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      select(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      revision++;
      hide();
    } else if (event.key === 'Tab') {
      revision++;
      hide();
    }
  });
  input.form?.addEventListener('submit', () => { revision++; hide(); });
})();
