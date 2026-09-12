const db = require('../db');

module.exports = function handler(req, res) {
  try {
    const row = db.prepare('SELECT 1 AS ok').get();
    res.status(200).json({ ok: true, database: row && Number(row.ok) === 1 ? 'connected' : 'unknown' });
  } catch (error) {
    console.error('DB health check failed:', error);
    res.status(500).json({ ok: false, error: error && error.message ? error.message : 'Database health check failed' });
  }
};
