'use strict';
document.querySelectorAll('[data-business-banner]').forEach(image => {
  const fallback = () => { image.hidden = true; image.parentElement.classList.add('business-banner--fallback'); image.parentElement.setAttribute('aria-hidden', 'true'); };
  image.addEventListener('error', fallback);
  if (image.complete && image.naturalWidth === 0) fallback();
});
