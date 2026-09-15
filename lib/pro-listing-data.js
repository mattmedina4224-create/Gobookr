'use strict';

const db = require('../db');
const { isPubliclyVisibleSubscription } = require('./subscription');

function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

function hydratePros(profiles, { includeServices = true } = {}) {
  if (!Array.isArray(profiles) || profiles.length === 0) return [];

  const ids = profiles.map((pro) => Number(pro.id)).filter(Number.isInteger);
  if (!ids.length) return [];
  const inClause = placeholders(ids.length);

  const subscriptions = db.prepare(`SELECT * FROM subscriptions WHERE pro_id IN (${inClause})`).all(...ids);
  const reviewStats = db.prepare(`SELECT pro_id, AVG(rating) AS rating, COUNT(*) AS review_count FROM reviews WHERE pro_id IN (${inClause}) GROUP BY pro_id`).all(...ids);
  const categories = db.prepare(`SELECT pro_id, category FROM pro_categories WHERE pro_id IN (${inClause}) ORDER BY pro_id, category`).all(...ids);
  const portfolio = db.prepare(`SELECT DISTINCT ON (pro_id) pro_id, image_url, caption FROM portfolio_items WHERE pro_id IN (${inClause}) AND image_url IS NOT NULL AND image_url != ? ORDER BY pro_id, id DESC`).all(...ids, '');
  const services = includeServices
    ? db.prepare(`SELECT * FROM (
        SELECT services.*, ROW_NUMBER() OVER (PARTITION BY pro_id ORDER BY price ASC, id ASC) AS listing_rank
        FROM services
        WHERE pro_id IN (${inClause})
      ) ranked
      WHERE listing_rank <= 3
      ORDER BY pro_id, price ASC, id ASC`).all(...ids)
    : [];

  const subscriptionByPro = new Map(subscriptions.map((row) => [Number(row.pro_id), row]));
  const reviewStatsByPro = new Map(reviewStats.map((row) => [Number(row.pro_id), row]));
  const categoriesByPro = new Map();
  const portfolioByPro = new Map(portfolio.map((row) => [Number(row.pro_id), row]));
  const servicesByPro = new Map();

  for (const row of categories) {
    const proId = Number(row.pro_id);
    if (!categoriesByPro.has(proId)) categoriesByPro.set(proId, []);
    categoriesByPro.get(proId).push(row.category);
  }
  for (const row of services) {
    const proId = Number(row.pro_id);
    if (!servicesByPro.has(proId)) servicesByPro.set(proId, []);
    servicesByPro.get(proId).push(row);
  }

  return profiles.map((pro) => {
    const proId = Number(pro.id);
    const subscription = subscriptionByPro.get(proId) || null;
    if (!isPubliclyVisibleSubscription(subscription)) return null;

    const stats = reviewStatsByPro.get(proId);
    const proCategories = categoriesByPro.get(proId) || [];
    const rawRating = stats ? Number(stats.rating) : NaN;
    return {
      ...pro,
      categories: proCategories.length ? proCategories : [pro.category],
      reviewCount: stats ? Number(stats.review_count) || 0 : 0,
      rating: Number.isFinite(rawRating) ? Math.round(rawRating * 10) / 10 : null,
      services: includeServices ? (servicesByPro.get(proId) || []) : [],
      coverPhoto: portfolioByPro.get(proId) || null,
    };
  }).filter(Boolean);
}

module.exports = { hydratePros };
