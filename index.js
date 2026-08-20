// GoBookr database layer.
//
// Uses Node's built-in `node:sqlite` module (no external dependency needed).
// This keeps the whole app runnable with nothing but `node server.js` —
// no npm install, no separate database server.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'gobookr.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('customer','pro')),
  name          TEXT NOT NULL,
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pro_profiles (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name     TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('barber','stylist','colorist')),
  bio               TEXT NOT NULL DEFAULT '',
  city              TEXT NOT NULL,
  state             TEXT NOT NULL,
  price_min         INTEGER NOT NULL DEFAULT 0,
  price_max         INTEGER NOT NULL DEFAULT 0,
  years_experience  INTEGER NOT NULL DEFAULT 0,
  accent            TEXT NOT NULL DEFAULT 'violet',
  initials          TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  pro_id            INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  price             INTEGER NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  pro_id   INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  accent   TEXT NOT NULL DEFAULT 'violet',
  caption  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pro_id       INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  customer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pro_id          INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  service_name    TEXT NOT NULL,
  preferred_date  TEXT NOT NULL DEFAULT '',
  message         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','completed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pro_profiles_category ON pro_profiles(category);
CREATE INDEX IF NOT EXISTS idx_pro_profiles_city ON pro_profiles(city);
CREATE INDEX IF NOT EXISTS idx_services_pro ON services(pro_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_pro ON portfolio_items(pro_id);
CREATE INDEX IF NOT EXISTS idx_reviews_pro ON reviews(pro_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pro ON booking_requests(pro_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON booking_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

module.exports = db;
