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
  // Prices are stored as whole dollars in this MVP (no currency math needed).
  return `$${Number(cents).toLocaleString('en-US')}`;
}

function formatDate(isoLike) {
  if (!isoLike) return '';
  const d = new Date(isoLike.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return isoLike;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function slugCategory(cat) {
  const map = { barber: 'Barber', stylist: 'Hairstylist', colorist: 'Colorist' };
  return map[cat] || cat;
}

function avgRating(reviews) {
  if (!reviews || reviews.length === 0) return null;
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function stars(rating) {
  const r = Math.round(rating || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function initialsFrom(name) {
  const letters = String(name || '')
    .trim()
    .split(/\s+/)
    .map((p) => p.match(/[A-Za-z]/)?.[0])
    .filter(Boolean);
  return letters.slice(0, 2).join('').toUpperCase() || '?';
}

module.exports = { escapeHtml, money, formatDate, slugCategory, avgRating, stars, initialsFrom };
