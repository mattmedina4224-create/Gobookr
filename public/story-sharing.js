'use strict';

(function () {
  // No social credentials or automatic posting. Native sharing needs a fresh
  // user gesture, so image generation and sharing are separate actions.
  function wrapText(context, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text || '').split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        for (const char of (line ? ' ' : '') + word) {
          if (line && context.measureText(line + char).width > maxWidth) { lines.push(line.trimEnd()); line = char.trimStart(); }
          else line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  async function render({ image, title, label, message, slots = [], style = 'classic' }) {
    if (image?.complete && !image.naturalWidth) throw new Error('photo');
    if (image && (!image.complete || !image.naturalWidth)) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('photo')), 10000);
        image.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
        image.addEventListener('error', () => { clearTimeout(timer); reject(new Error('photo')); }, { once: true });
      });
    }
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
    const c = canvas.getContext('2d'); if (!c) throw new Error('canvas');
    c.fillStyle = '#0b1f3a'; c.fillRect(0, 0, 1080, 1920);
    if (image) {
      const scale = Math.max(1080 / image.naturalWidth, 1920 / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      c.drawImage(image, (1080 - w) / 2, (1920 - h) / 2, w, h);
      const gradient = c.createLinearGradient(0, 0, 0, 1920);
      gradient.addColorStop(0, 'rgba(0,0,0,.18)'); gradient.addColorStop(.35, 'rgba(0,0,0,.12)');
      gradient.addColorStop(.55, style === 'clean' ? 'rgba(0,0,0,.7)' : 'rgba(0,0,0,.82)'); gradient.addColorStop(1, 'rgba(0,0,0,.95)');
      c.fillStyle = gradient; c.fillRect(0, 0, 1080, 1920);
    }
    c.fillStyle = '#fff'; c.font = '700 32px sans-serif'; c.fillText('GOBOOKR', 70, 130);
    c.font = '600 34px sans-serif'; c.fillText(String(label || '').slice(0, 60), 70, 810, 940);
    let y = 905;
    let titleFont = 68, titleLines;
    do { c.font = `700 ${titleFont}px sans-serif`; titleLines = wrapText(c, String(title || '').slice(0, 120), 940); if (titleLines.length <= 3) break; titleFont -= 2; } while (titleFont >= 30);
    for (const line of titleLines) { c.fillText(line, 70, y); y += titleFont + 10; }
    y += 24;
    let font = 42, lines;
    do { c.font = `500 ${font}px sans-serif`; lines = wrapText(c, String(message || '').slice(0, 500), 940); if (y + lines.length * (font + 12) <= 1650) break; font -= 2; } while (font >= 24);
    if (y + lines.length * (font + 12) > 1650) throw new Error('length');
    for (const line of lines) { c.fillText(line, 70, y); y += font + 12; }
    c.font = '700 28px sans-serif';
    slots.slice(0, 3).forEach((line, i) => c.fillText(String(line), 70, 1660 + i * 36, 940));
    c.fillStyle = '#fff'; c.fillRect(70, 1780, 420, 72); c.fillStyle = '#0b1f3a'; c.font = '700 32px sans-serif'; c.fillText('Book on GoBookr', 95, 1826);
    return new Promise((resolve, reject) => { try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('render')), 'image/png'); } catch (_) { reject(new Error('photo')); } });
  }

  const root = document.getElementById('story-sharing');
  let prepared = null, objectUrl = null;
  let previewNeedsUpdate = false;
  const status = message => { for (const id of ['story-ready-status','marketing-share-status']) { const el = document.getElementById(id); if (el) el.textContent = message; } };
  const shareButtons = () => ['story-share-ready','story-share-ready-bottom','marketing-share'].map(id=>document.getElementById(id)).filter(Boolean);
  function inputs() {
    return { image: document.querySelector('#marketing-story-preview img'), title: root.dataset.title, label: root.dataset.label,
      message: document.getElementById('copy')?.value || '', style: root.dataset.style,
      slots: (document.getElementById('available_slots')?.value || '').split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean) };
  }
  function invalidate() {
    prepared = null;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    const ready = document.getElementById('story-ready-preview'); if (ready) ready.hidden = true;
    shareButtons().forEach(button => button.disabled = true);
    status('Content changed. Prepare your Story again before sharing.');
  }
  async function prepare() {
    if (!root) throw new Error('preview');
    if (previewNeedsUpdate) throw new Error('previewChanged');
    const data = inputs();
    if (!data.message.trim()) throw new Error('message');
    const blob = await render(data);
    if (previewNeedsUpdate || data.message !== inputs().message || data.slots.join('\n') !== inputs().slots.join('\n')) throw new Error('changed');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob); prepared = blob;
    document.getElementById('story-ready-image').src = objectUrl;
    document.getElementById('story-download').href = objectUrl;
    document.getElementById('story-ready-preview').hidden = false;
    shareButtons().forEach(button => button.disabled = false);
    status('Story ready. Tap Share to socials on your phone, choose the app, then add your copied GoBookr link.' + (data.slots.length > 3 ? ' The image includes your first three opening times; customers can view all posted times on GoBookr.' : ''));
    return blob;
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
    const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select();
    const success = document.execCommand('copy'); area.remove(); if (!success) throw new Error('copy');
  }
  function messageFor(error) {
    return { photo: 'This photo could not be exported. Choose Text only or upload the photo to your GoBookr portfolio, update the preview, and try again.',
      message: 'Add your message before preparing the Story.', changed: 'Content changed. Prepare your Story again.', previewChanged: 'Choose Update preview to apply your photo or style, then prepare the Story.', length: 'This message needs more room. Shorten it before preparing your Story.' }[error?.message] || 'Could not prepare the Story. Please try again.';
  }
  let sharing = false;
  async function share() {
    if (sharing) return;
    if (!prepared) { status('Choose Prepare Story first.'); document.getElementById('story-prepare')?.focus(); return; }
    const file = new File([prepared], 'gobookr-openings-story.png', { type: 'image/png' });
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) { status('Direct sharing is unavailable here. Choose Save image, then upload it in Instagram, Facebook, or Snapchat.'); return; }
    sharing = true;
    const buttons = shareButtons();
    buttons.forEach(button=>{button.disabled = true;button.setAttribute('aria-busy','true');});
    try { await navigator.share({ files: [file], title: root.dataset.title, text: 'Openings available — book through GoBookr.' }); status('Shared to your chosen app. Add your GoBookr link there and finish posting.'); }
    catch (err) { status(err?.name === 'AbortError' ? 'Sharing cancelled. Your prepared image is still ready.' : 'Sharing could not open. Save the image and upload it in your social app.'); }
    finally { sharing = false;buttons.forEach(button=>{button.disabled = !prepared;button.removeAttribute('aria-busy');}); }
  }
  window.GoBookrStories = { render, wrapText, prepare, share };
  if (!root) return;
  const prepareButton = document.getElementById('story-prepare');
  prepareButton.addEventListener('click', async () => { prepareButton.disabled = true; prepareButton.setAttribute('aria-busy','true'); try { await prepare(); } catch(err) { status(messageFor(err)); } finally { prepareButton.disabled = false; prepareButton.removeAttribute('aria-busy'); } });
  for (const id of ['story-share-ready','story-share-ready-bottom']) document.getElementById(id)?.addEventListener('click', share);
  for (const id of ['copy', 'available_slots']) document.getElementById(id)?.addEventListener('input', invalidate);
  for (const id of ['photo', 'style']) document.getElementById(id)?.addEventListener('change', () => { previewNeedsUpdate = true; invalidate(); status('Choose Update preview to apply your photo or style, then prepare the Story.'); });
  for (const [id, value, success] of [['story-copy-caption', ()=>inputs().message, 'Message copied. Paste it in the social app if needed.'], ['story-copy-url', ()=>root.dataset.url, 'GoBookr link copied. Add it with your social app’s link tool.']]) {
    document.getElementById(id)?.addEventListener('click', async ()=> { try { await copyText(value()); status(success); } catch (_) { status('Could not copy. Select the message or tracked link in the editor and copy it manually.'); } });
  }
  const steps = {
    instagram: ['Prepare your Story with the button below.', 'Tap Share to socials and choose Instagram.', 'Add a Link sticker with your copied GoBookr link, then publish to your Story.'],
    facebook: ['Prepare your Story with the button below.', 'Tap Share to socials and choose Facebook.', 'Choose Story, add your GoBookr link if Facebook offers the link tool, then publish.'],
    snapchat: ['Prepare your Story with the button below.', 'Tap Share to socials and choose Snapchat.', 'Attach your copied GoBookr link with Snapchat’s link tool, choose your Story, and publish.'],
  };
  root.querySelectorAll('[data-story-platform]').forEach(button => button.addEventListener('click', ()=> {
    const platform = button.dataset.storyPlatform;
    root.querySelectorAll('[data-story-platform]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    const list = document.getElementById('story-sharing-steps'); list.replaceChildren();
    steps[platform].forEach(text => { const li = document.createElement('li'); li.textContent = text; list.appendChild(li); });
  }));
})();
