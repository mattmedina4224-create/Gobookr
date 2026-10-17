'use strict';
const { escapeHtml: e } = require('./util');

function storySharingPanel({ title, label, url, style }) {
  return `<link rel="stylesheet" href="/story-sharing.css"><section class="story-sharing" id="story-sharing" aria-labelledby="story-sharing-title" data-title="${e(title)}" data-label="${e(label)}" data-url="${e(url)}" data-style="${e(style)}">
    <div class="story-sharing-heading"><div><span class="badge category">Share to socials</span><h3 id="story-sharing-title">Turn these openings into a Story</h3><p>GoBookr makes a vertical 1080 × 1920 image with your opening times. Share it from your phone, then add your GoBookr link in the social app.</p></div></div>
    <div class="story-platforms" role="group" aria-label="Choose a Story platform">
      <button type="button" class="btn secondary" data-story-platform="instagram" aria-pressed="true">Instagram</button>
      <button type="button" class="btn secondary" data-story-platform="facebook" aria-pressed="false">Facebook</button>
      <button type="button" class="btn secondary" data-story-platform="snapchat" aria-pressed="false">Snapchat</button>
    </div>
    <ol id="story-sharing-steps"><li>Prepare your Story with the button below.</li><li>Share the image and choose Instagram on your phone.</li><li>Add a Link sticker using your copied GoBookr booking link, then publish.</li></ol>
    <div class="story-sharing-actions"><button type="button" class="btn" id="story-prepare">Prepare Story</button><button type="button" class="btn secondary" id="story-share-ready" disabled>Share to socials</button><button type="button" class="btn secondary" id="story-copy-url">Copy GoBookr link</button><button type="button" class="btn secondary story-copy-secondary" id="story-copy-caption">Copy message</button></div>
    <p id="story-ready-status" role="status" aria-live="polite"></p>
    <div id="story-ready-preview" hidden><p class="muted">Ready to post · 1080 × 1920</p><img id="story-ready-image" alt="Prepared GoBookr Story"><div class="story-ready-actions"><button type="button" class="btn" id="story-share-ready-bottom">Share to socials</button><a class="btn secondary" id="story-download" download="gobookr-story.png">Save image</a></div><p class="muted">GoBookr puts the call-to-action on the artwork. Add the copied GoBookr link with the social app’s link tool so customers can tap through.</p></div>
    <details><summary>Posting from a computer or having trouble?</summary><p>Save the image and send it to your phone. If the share menu doesn’t offer the Story destination you want, open Instagram, Facebook, or Snapchat and upload the saved image. Music, stickers, and clickable links are added inside the social app.</p></details>
  </section><script src="/story-sharing.js" defer></script>`;
}
module.exports = { storySharingPanel };
