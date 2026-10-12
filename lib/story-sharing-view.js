'use strict';
const { escapeHtml: e } = require('./util');

function storySharingPanel({ title, label, url, style }) {
  return `<link rel="stylesheet" href="/story-sharing.css"><section class="story-sharing" id="story-sharing" aria-labelledby="story-sharing-title" data-title="${e(title)}" data-label="${e(label)}" data-url="${e(url)}" data-style="${e(style)}">
    <h3 id="story-sharing-title">Share your Story</h3><p>Choose where to post. GoBookr prepares your image; you finish posting in the social app.</p>
    <div class="story-platforms" role="group" aria-label="Choose a Story platform">
      <button type="button" class="btn secondary" data-story-platform="instagram" aria-pressed="true">Instagram</button>
      <button type="button" class="btn secondary" data-story-platform="facebook" aria-pressed="false">Facebook</button>
      <button type="button" class="btn secondary" data-story-platform="snapchat" aria-pressed="false">Snapchat</button>
    </div>
    <ol id="story-sharing-steps"><li>Prepare your Story, then save or share the image.</li><li>Open Instagram on your phone, create a Story, and choose the image.</li><li>Add a Link sticker with your copied booking link, then publish.</li></ol>
    <div class="story-sharing-actions"><button type="button" class="btn" id="story-prepare">Prepare Story</button><button type="button" class="btn secondary" id="story-share-ready" disabled>Share prepared image</button><button type="button" class="btn secondary" id="story-copy-caption">Copy message</button><button type="button" class="btn secondary" id="story-copy-url">Copy booking link</button></div>
    <p id="story-ready-status" role="status" aria-live="polite"></p>
    <div id="story-ready-preview" hidden><p class="muted">Your prepared image · 1080 × 1920</p><img id="story-ready-image" alt="Prepared GoBookr Story"><p class="muted">The booking button in the image is artwork. Add your copied link in the social app to make it clickable.</p><a class="btn secondary" id="story-download" download="gobookr-story.png">Save prepared image</a></div>
    <details><summary>Sharing from a computer or having trouble?</summary><p>Save the image and send it to your phone. If the share menu doesn’t offer the right Story destination, open the social app and upload the saved image. Messages, links, music, and stickers may need to be added in the app.</p></details>
  </section><script src="/story-sharing.js" defer></script>`;
}
module.exports = { storySharingPanel };
