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

      input.addEventListener('change', () => {
        selected.textContent = input.files && input.files.length
          ? input.files[0].name
          : 'No photo selected';
      });

      input.parentElement.insertBefore(button, input);
      input.parentElement.insertBefore(selected, help || input.nextSibling);
    })();
  </script>
</body>
</html>`;
}

module.exports = { layout };
