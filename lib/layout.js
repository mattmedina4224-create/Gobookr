'use strict';

const { escapeHtml } = require('./util');

function nav(currentUser, session) {
  if (!currentUser) {
    return `
      <div class="nav-links">
        <a href="/search">Find a pro</a>
        <a href="/signup?role=pro">For professionals</a>
        <a href="/login">Log in</a>
        <a class="cta" href="/signup?role=customer">Sign up</a>
      </div>`;
  }
  const dashHref = currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer';
  const csrf = session ? escapeHtml(session.csrf_token) : '';
  return `
    <div class="nav-links">
      <a href="/search">Find a pro</a>
      <a href="${dashHref}">Dashboard</a>
      <span class="muted" style="padding: 0 6px;">Hi, ${escapeHtml(currentUser.name.split(' ')[0])}</span>
      <form method="POST" action="/logout"><input type="hidden" name="_csrf" value="${csrf}" /><button type="submit">Log out</button></form>
    </div>`;
}

function layout({ title, currentUser, session, flash, body, activeNav = '' }) {
  const flashHtml = flash
    ? `<div class="container" style="padding-top:20px;"><div class="alert ${flash.type}">${escapeHtml(flash.message)}</div></div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · GoBookr</title>
  <meta name="description" content="GoBookr connects you with trusted, reviewed barbers, hairstylists, and colorists near you." />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✂️</text></svg>" />
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a class="brand" href="/"><span class="mark">G</span>GoBookr<span class="dot">.</span></a>
      ${nav(currentUser, session)}
    </div>
  </header>
  ${flashHtml}
  ${body}
  <footer class="site-footer">
    <div class="container">
      <div>© ${new Date().getUTCFullYear()} GoBookr. Find and book barbers, hairstylists &amp; colorists you can trust.</div>
      <div>Built for demo purposes — sample data, not real businesses.</div>
    </div>
  </footer>
  <script>
    (() => {
      const input = document.getElementById('image');
      if (!input || input.type !== 'file') return;

      input.setAttribute('accept', 'image/*');
      input.removeAttribute('required');

      const label = document.querySelector('label[for="image"]');
      if (label) label.textContent = 'Add from Photos or Files';

      const help = input.parentElement && input.parentElement.querySelector('.helptext');
      if (help) help.textContent = 'Choose a photo from your photo library, camera, or computer files.';

      input.style.position = 'absolute';
      input.style.width = '1px';
      input.style.height = '1px';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary';
      button.textContent = 'Add Photos';
      button.addEventListener('click', () => input.click());

      const selected = document.createElement('div');
      selected.className = 'helptext';
      selected.style.marginTop = '8px';
      selected.textContent = 'No photo selected';

      const error = document.createElement('div');
      error.className = 'helptext';
      error.style.marginTop = '8px';
      error.style.color = '#b42318';
      error.style.fontWeight = '600';
      error.hidden = true;

      input.addEventListener('change', () => {
        if (input.files && input.files.length) {
          selected.textContent = input.files[0].name + ' ready to upload';
          selected.style.fontWeight = '600';
          error.hidden = true;
          error.textContent = '';
        } else {
          selected.textContent = 'No photo selected';
          selected.style.fontWeight = '400';
        }
      });

      input.parentElement.insertBefore(button, input);
      input.parentElement.insertBefore(selected, help || input.nextSibling);
      input.parentElement.appendChild(error);

      const form = input.closest('form');
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        const captionInput = form.querySelector('[name="caption"]');
        const csrfInput = form.querySelector('[name="_csrf"]');

        form.addEventListener('submit', async (event) => {
          event.preventDefault();

          if (!input.files || !input.files.length) {
            error.textContent = 'Please add a photo first.';
            error.hidden = false;
            button.focus();
            return;
          }

          if (captionInput && !captionInput.value.trim()) {
            error.textContent = 'Please add a caption.';
            error.hidden = false;
            captionInput.focus();
            return;
          }

          const file = input.files[0];
          if (file.size > 10 * 1024 * 1024) {
            error.textContent = 'Photo must be 10 MB or smaller.';
            error.hidden = false;
            return;
          }

          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Uploading...';
          }
          button.disabled = true;
          selected.textContent = 'Uploading photo...';
          error.hidden = true;

          try {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('Could not read that photo.'));
              reader.readAsDataURL(file);
            });
            const comma = dataUrl.indexOf(',');
            if (comma === -1) throw new Error('Could not prepare that photo.');

            const response = await fetch(form.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                _csrf: csrfInput ? csrfInput.value : '',
                caption: captionInput ? captionInput.value.trim() : '',
                image_name: file.name,
                image_type: file.type,
                image_data: dataUrl.slice(comma + 1),
              }),
            });

            if (!response.ok) {
              throw new Error(response.status === 403 ? 'Your session expired. Refresh the page and try again.' : 'Upload failed. Please try again.');
            }

            window.location.href = response.redirected
              ? response.url
              : '/dashboard/pro/portfolio?success=' + encodeURIComponent('Photo uploaded.');
          } catch (err) {
            error.textContent = err && err.message ? err.message : 'Upload failed. Please try again.';
            error.hidden = false;
            selected.textContent = file.name + ' ready to upload';
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = 'Upload photo';
            }
            button.disabled = false;
          }
        });
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('success') === 'Photo uploaded.') {
        const heading = Array.from(document.querySelectorAll('h1')).find((el) => el.textContent.trim() === 'Portfolio');
        if (heading) {
          const confirmation = document.createElement('div');
          confirmation.setAttribute('role', 'status');
          confirmation.style.margin = '10px 0 16px';
          confirmation.style.padding = '12px 14px';
          confirmation.style.borderRadius = '10px';
          confirmation.style.background = '#ecfdf3';
          confirmation.style.border = '1px solid #abefc6';
          confirmation.style.color = '#067647';
          confirmation.style.fontWeight = '700';
          confirmation.textContent = '✓ Photo uploaded successfully';
          heading.insertAdjacentElement('afterend', confirmation);
        }
      }
    })();
  </script>
</body>
</html>`;
}

module.exports = { layout };
