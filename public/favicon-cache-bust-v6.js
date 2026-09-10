(() => {
  document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((link) => link.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = '/gobookr-favicon-v6.svg';
  document.head.appendChild(icon);
  const shortcut = document.createElement('link');
  shortcut.rel = 'shortcut icon';
  shortcut.href = '/gobookr-favicon-v6.svg';
  document.head.appendChild(shortcut);
})();
