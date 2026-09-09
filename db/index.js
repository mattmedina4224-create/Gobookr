// GoBookr database layer.
//
// Uses Node's built-in `node:sqlite` module (no external dependency needed).
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
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK (role IN ('customer','pro')),name TEXT NOT NULL,phone TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pro_profiles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,business_name TEXT NOT NULL,category TEXT NOT NULL CHECK (category IN ('barber','stylist','colorist')),bio TEXT NOT NULL DEFAULT '',city TEXT NOT NULL,state TEXT NOT NULL,
 workplace_name TEXT NOT NULL DEFAULT '',street_address TEXT NOT NULL DEFAULT '',suite TEXT NOT NULL DEFAULT '',zip_code TEXT NOT NULL DEFAULT '',
 license_number TEXT,license_state TEXT,license_verified INTEGER NOT NULL DEFAULT 0,latitude REAL,longitude REAL,instagram_url TEXT NOT NULL DEFAULT '',tiktok_url TEXT NOT NULL DEFAULT '',facebook_url TEXT NOT NULL DEFAULT '',website_url TEXT NOT NULL DEFAULT '',booking_url TEXT NOT NULL DEFAULT '',onboarding_completed INTEGER NOT NULL DEFAULT 0,price_min INTEGER NOT NULL DEFAULT 0,price_max INTEGER NOT NULL DEFAULT 0,years_experience INTEGER NOT NULL DEFAULT 0,accent TEXT NOT NULL DEFAULT 'violet',initials TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pro_categories (
 pro_id INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
 category TEXT NOT NULL CHECK (category IN ('barber','stylist','colorist','nail_technician')),
 PRIMARY KEY (pro_id, category)
);
CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY AUTOINCREMENT,pro_id INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,name TEXT NOT NULL,price INTEGER NOT NULL,duration_minutes INTEGER NOT NULL DEFAULT 30);
CREATE TABLE IF NOT EXISTS portfolio_items (id INTEGER PRIMARY KEY AUTOINCREMENT,pro_id INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,accent TEXT NOT NULL DEFAULT 'violet',caption TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT,pro_id INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),comment TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS booking_requests (id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,pro_id INTEGER NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,service_name TEXT NOT NULL,preferred_date TEXT NOT NULL DEFAULT '',message TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','completed')),created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS subscriptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 pro_id INTEGER NOT NULL UNIQUE REFERENCES pro_profiles(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled','incomplete','unpaid')),
 trial_started_at TEXT NOT NULL DEFAULT (datetime('now')),
 trial_ends_at TEXT NOT NULL DEFAULT (datetime('now','+30 days')),
 stripe_customer_id TEXT NOT NULL DEFAULT '',
 stripe_subscription_id TEXT NOT NULL DEFAULT '',
 stripe_price_id TEXT NOT NULL DEFAULT '',
 current_period_end TEXT,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf_token TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pro_profiles_category ON pro_profiles(category); CREATE INDEX IF NOT EXISTS idx_pro_profiles_city ON pro_profiles(city); CREATE INDEX IF NOT EXISTS idx_pro_categories_category ON pro_categories(category); CREATE INDEX IF NOT EXISTS idx_services_pro ON services(pro_id); CREATE INDEX IF NOT EXISTS idx_portfolio_pro ON portfolio_items(pro_id); CREATE INDEX IF NOT EXISTS idx_reviews_pro ON reviews(pro_id); CREATE INDEX IF NOT EXISTS idx_bookings_pro ON booking_requests(pro_id); CREATE INDEX IF NOT EXISTS idx_bookings_customer ON booking_requests(customer_id); CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status); CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);
const portfolioColumns=db.prepare('PRAGMA table_info(portfolio_items)').all(); if(!portfolioColumns.some(c=>c.name==='image_url')) db.exec("ALTER TABLE portfolio_items ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
const profileColumns=db.prepare('PRAGMA table_info(pro_profiles)').all(); const addProfileColumn=(name,sql)=>{if(!profileColumns.some(c=>c.name===name)) db.exec(sql);};
addProfileColumn('latitude','ALTER TABLE pro_profiles ADD COLUMN latitude REAL'); addProfileColumn('longitude','ALTER TABLE pro_profiles ADD COLUMN longitude REAL');
addProfileColumn('workplace_name',"ALTER TABLE pro_profiles ADD COLUMN workplace_name TEXT NOT NULL DEFAULT ''"); addProfileColumn('street_address',"ALTER TABLE pro_profiles ADD COLUMN street_address TEXT NOT NULL DEFAULT ''"); addProfileColumn('suite',"ALTER TABLE pro_profiles ADD COLUMN suite TEXT NOT NULL DEFAULT ''"); addProfileColumn('zip_code',"ALTER TABLE pro_profiles ADD COLUMN zip_code TEXT NOT NULL DEFAULT ''");
addProfileColumn('instagram_url',"ALTER TABLE pro_profiles ADD COLUMN instagram_url TEXT NOT NULL DEFAULT ''"); addProfileColumn('tiktok_url',"ALTER TABLE pro_profiles ADD COLUMN tiktok_url TEXT NOT NULL DEFAULT ''"); addProfileColumn('facebook_url',"ALTER TABLE pro_profiles ADD COLUMN facebook_url TEXT NOT NULL DEFAULT ''"); addProfileColumn('website_url',"ALTER TABLE pro_profiles ADD COLUMN website_url TEXT NOT NULL DEFAULT ''"); addProfileColumn('booking_url',"ALTER TABLE pro_profiles ADD COLUMN booking_url TEXT NOT NULL DEFAULT ''"); addProfileColumn('onboarding_completed','ALTER TABLE pro_profiles ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0');

db.exec(`
INSERT OR IGNORE INTO pro_categories (pro_id, category)
SELECT id, category FROM pro_profiles
WHERE category IN ('barber','stylist','colorist');

INSERT OR IGNORE INTO subscriptions (pro_id, status, trial_started_at, trial_ends_at)
SELECT id, 'trialing', datetime('now'), datetime('now','+30 days') FROM pro_profiles;
`);

module.exports=db;
