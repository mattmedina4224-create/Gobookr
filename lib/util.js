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
  const map = {
    barber: 'Barber',
    stylist: 'Hairstylist',
    colorist: 'Colorist',
    nail_technician: 'Nail Technician',
    eyelash_technician: 'Eyelash Technician',
    eyebrow_technician: 'Eyebrow Technician',
    waxing_specialist: 'Waxing Specialist',
  };
  return map[cat] || 'Professional';
}

function avgRating(reviews) {
  if (!reviews || reviews.length === 0) return null;
  const sum = reviews.reduce((a, r) => a + Number(r.rating || 0), 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function stars(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
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
