'use strict';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(cents) {
  const amount = Number(cents);
  return Number.isFinite(amount) ? `$${amount.toLocaleString('en-US')}` : '$0';
}

function formatDate(isoLike) {
  if (!isoLike) return '';
  const d = new Date(String(isoLike).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(isoLike);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function slugCategory(cat) {
  try {
    return require('./pro-categories').categoryLabel(cat);
  } catch (_) {
    return 'Professional';
  }
}

function avgRating(reviews) {
  if (!reviews || reviews.length === 0) return null;
  const sum = reviews.reduce((a, r) => a + Number(r.rating || 0), 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function stars(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `<span class="gb-stars" aria-label="${r} out of 5 stars">${Array.from({length:5},(_,i)=>icon('star',i<r?'is-filled':'')).join('')}</span>`;
}

function icon(name, className = '') {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid icon name');
  return `<svg class="gb-icon ${escapeHtml(className)}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="/gobookr-icons.svg#${name}"></use></svg>`;
}

function initialsFrom(name) {
  const letters = String(name || '')
    .trim()
    .split(/\s+/)
    .map((p) => p.match(/[A-Za-z]/)?.[0])
    .filter(Boolean);
  return letters.slice(0, 2).join('').toUpperCase() || '?';
}

module.exports = { escapeHtml, money, formatDate, slugCategory, avgRating, stars, initialsFrom, icon };
