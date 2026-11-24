'use strict';
// Storage for Merch Studio. Two implementations of one interface:
//   memoryStore() — used by the public demo (no database writes) and unit tests
//   dbStore()     — Supabase Postgres via db/index.js (tables from 20261121_merch_studio.sql)
// Reads use the FRESH prefix so the 30s read cache never shows a stale order status.
const FRESH = 'WITH fresh_read AS (SELECT 1) ';
const ITEM_FIELDS = ['product', 'supplier', 'size', 'color', 'sides', 'finish', 'pack', 'units', 'pieces', 'label', 'design_id', 'files', 'unit_cents', 'line_cents'];

function memoryStore() {
  let seq = 0; const orders = new Map(), items = new Map(), sup = new Map(), events = new Map(), hooks = new Set(), designs = new Map();
  const id = () => ++seq;
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);
  return {
    kind: 'memory',
    async createOrder(o) { const rec = { id: id(), subtotal_cents: 0, shipping_cents: 0, tax_cents: 0, total_cents: 0, refunded_cents: 0, created_at: new Date().toISOString(), ...o }; orders.set(rec.id, rec); items.set(rec.id, []); sup.set(rec.id, []); events.set(rec.id, []); return clone(rec); },
    async getOrder(oid) { return clone(orders.get(Number(oid))); },
    async getOrderByNumber(n) { return clone([...orders.values()].find((o) => o.order_number === n)); },
    async getOrderBySession(s) { return clone([...orders.values()].find((o) => o.stripe_checkout_session_id === s)); },
    async listOrders({ ownerKind, ownerId }) { return clone([...orders.values()].filter((o) => o.owner_kind === ownerKind && o.owner_id === Number(ownerId)).reverse()); },
    async updateOrder(oid, patch) { const o = orders.get(Number(oid)); Object.assign(o, patch, { updated_at: new Date().toISOString() }); return clone(o); },
    async addItems(oid, list) { const arr = items.get(Number(oid)); for (const l of list) arr.push({ row_id: id(), order_id: Number(oid), ...clone(l) }); },
    async items(oid) { return clone(items.get(Number(oid)) || []); },
    async updateItem(rowId, patch) { for (const arr of items.values()) { const it = arr.find((i) => i.row_id === rowId); if (it) Object.assign(it, patch); } },
    async upsertSupplierOrder(oid, supplier, patch) {
      const arr = sup.get(Number(oid)); let row = arr.find((r) => r.supplier === supplier);
      if (!row) { row = { id: id(), order_id: Number(oid), supplier, status: 'pending', attempts: 0, shipments: [], simulated: false }; arr.push(row); }
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) row[k] = v;
      return clone(row);
    },
    async supplierOrders(oid) { return clone(sup.get(Number(oid)) || []); },
    async supplierOrderBySupplierId(supplier, sid) { for (const arr of sup.values()) { const r = arr.find((x) => x.supplier === supplier && x.supplier_order_id === String(sid)); if (r) return clone(r); } return null; },
    async addEvent(oid, step, message, meta = {}) { events.get(Number(oid)).push({ id: id(), step, message, meta, created_at: new Date().toISOString() }); },
    async events(oid) { return clone(events.get(Number(oid)) || []); },
    async claimWebhook(provider, eid) { const k = provider + ':' + eid; if (hooks.has(k)) return false; hooks.add(k); return true; },
    // designs
    async saveDesign(d) { const rec = d.id && designs.get(Number(d.id)) ? Object.assign(designs.get(Number(d.id)), d, { updated_at: new Date().toISOString() }) : { id: id(), created_at: new Date().toISOString(), ...d }; designs.set(rec.id, rec); return clone(rec); },
    async getDesign(did) { return clone(designs.get(Number(did))); },
    async listDesigns({ ownerKind, ownerId }) { return clone([...designs.values()].filter((d) => d.owner_kind === ownerKind && d.owner_id === Number(ownerId) && !d.archived_at).reverse()); },
  };
}

function dbStore(db = require('../../db')) {
  const j = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
  const parse = (row, keys) => { if (!row) return row; for (const k of keys) if (typeof row[k] === 'string') { try { row[k] = JSON.parse(row[k]); } catch { /* keep */ } } return row; };
  const ORDER_JSON = ['ship_to', 'quote'], ITEM_JSON = ['files'], SUP_JSON = ['shipments'], DESIGN_JSON = ['front', 'back', 'files', 'preflight'];
  const order = (r) => { parse(r, ORDER_JSON); if (r) for (const k of ['subtotal_cents', 'shipping_cents', 'tax_cents', 'total_cents', 'refunded_cents', 'id', 'owner_id']) r[k] = r[k] == null ? r[k] : Number(r[k]); if (r && r.simulated != null) r.simulated = r.simulated === true || r.simulated === 't' || r.simulated === 1; return r; };
  const ORDER_COLS = new Set(['status', 'subtotal_cents', 'shipping_cents', 'tax_cents', 'total_cents', 'quote', 'quote_expires_at', 'simulated', 'stripe_checkout_session_id', 'stripe_payment_intent_id', 'paid_at', 'attention', 'refunded_cents']);
  const SUP_COLS = new Set(['external_id', 'supplier_order_id', 'status', 'simulated', 'submitted_at', 'acknowledged_at', 'shipped_at', 'attempts', 'error', 'shipments', 'refunded_cents', 'refund_id']);
  const setClause = (patch, allowed, jsonKeys) => { const keys = Object.keys(patch).filter((k) => allowed.has(k) && patch[k] !== undefined); return { sql: keys.map((k) => `${k} = ?${jsonKeys.includes(k) ? '::jsonb' : ''}`).join(', '), args: keys.map((k) => (jsonKeys.includes(k) ? j(patch[k]) : patch[k])) }; };
  return {
    kind: 'db',
    async createOrder(o) { return order(db.prepare(`INSERT INTO merch_orders (order_number, buyer_user_id, owner_kind, owner_id, business_name, ship_to, status, currency, mode) VALUES (?,?,?,?,?,?::jsonb,?,?,?) RETURNING *`).get(o.order_number, o.buyer_user_id, o.owner_kind, o.owner_id, o.business_name, j(o.ship_to), o.status, o.currency, o.mode)); },
    async getOrder(id) { return order(db.prepare(FRESH + 'SELECT * FROM merch_orders WHERE id = ?').get(id)); },
    async getOrderByNumber(n) { return order(db.prepare(FRESH + 'SELECT * FROM merch_orders WHERE order_number = ?').get(n)); },
    async getOrderBySession(s) { return order(db.prepare(FRESH + 'SELECT * FROM merch_orders WHERE stripe_checkout_session_id = ?').get(s)); },
    async listOrders({ ownerKind, ownerId }) { return db.prepare(FRESH + 'SELECT * FROM merch_orders WHERE owner_kind = ? AND owner_id = ? ORDER BY id DESC LIMIT 100').all(ownerKind, ownerId).map(order); },
    async updateOrder(id, patch) { const { sql, args } = setClause(patch, ORDER_COLS, ORDER_JSON); if (!sql) return this.getOrder(id); return order(db.prepare(`UPDATE merch_orders SET ${sql}, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`).get(...args, id)); },
    async addItems(id, list) { for (const l of list) db.prepare(`INSERT INTO merch_order_items (order_id, line_key, ${ITEM_FIELDS.join(', ')}) VALUES (?, ?, ${ITEM_FIELDS.map((f) => (f === 'files' ? '?::jsonb' : '?')).join(', ')})`).run(id, l.id, ...ITEM_FIELDS.map((f) => (f === 'files' ? j(l.files || []) : f.endsWith('_cents') ? (l[f] || 0) : l[f] ?? null))); },
    async items(id) { return db.prepare(FRESH + 'SELECT * FROM merch_order_items WHERE order_id = ? ORDER BY id').all(id).map((r) => { parse(r, ITEM_JSON); return { ...r, row_id: Number(r.id), id: r.line_key, units: Number(r.units), pack: Number(r.pack), pieces: Number(r.pieces), unit_cents: Number(r.unit_cents || 0), line_cents: Number(r.line_cents || 0), design_id: r.design_id == null ? null : Number(r.design_id) }; }); },
    async updateItem(rowId, patch) { db.prepare('UPDATE merch_order_items SET unit_cents = ?, line_cents = ? WHERE id = ?').run(patch.unit_cents, patch.line_cents, rowId); },
    async upsertSupplierOrder(orderId, supplier, patch) {
      db.prepare('INSERT INTO merch_supplier_orders (order_id, supplier, external_id) VALUES (?, ?, ?) ON CONFLICT (order_id, supplier) DO NOTHING').run(orderId, supplier, patch.external_id || `${orderId}-${supplier}`);
      const { sql, args } = setClause(patch, SUP_COLS, SUP_JSON);
      const row = sql ? db.prepare(`UPDATE merch_supplier_orders SET ${sql}, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND supplier = ? RETURNING *`).get(...args, orderId, supplier) : db.prepare(FRESH + 'SELECT * FROM merch_supplier_orders WHERE order_id = ? AND supplier = ?').get(orderId, supplier);
      return normSup(parse(row, SUP_JSON));
    },
    async supplierOrders(id) { return db.prepare(FRESH + 'SELECT * FROM merch_supplier_orders WHERE order_id = ? ORDER BY id').all(id).map((r) => normSup(parse(r, SUP_JSON))); },
    async supplierOrderBySupplierId(supplier, sid) { return normSup(parse(db.prepare(FRESH + 'SELECT * FROM merch_supplier_orders WHERE supplier = ? AND supplier_order_id = ?').get(supplier, String(sid)), SUP_JSON)); },
    async addEvent(id, step, message, meta = {}) { db.prepare('INSERT INTO merch_order_events (order_id, step, message, meta) VALUES (?, ?, ?, ?::jsonb)').run(id, step, String(message).slice(0, 1000), j(meta)); },
    async events(id) { return db.prepare(FRESH + 'SELECT * FROM merch_order_events WHERE order_id = ? ORDER BY id').all(id).map((r) => parse(r, ['meta'])); },
    async claimWebhook(provider, eid) { const r = db.prepare('INSERT INTO merch_webhook_events (provider, event_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING event_id').get(provider, String(eid)); return Boolean(r); },
    async saveDesign(d) {
      const cols = ['owner_kind', 'owner_id', 'created_by_user_id', 'product', 'supplier', 'size', 'name', 'front', 'back', 'files', 'preflight', 'print_files_ok', 'qr_target', 'qr_verified_at'];
      const jsonCols = ['front', 'back', 'files', 'preflight'];
      const vals = cols.map((c) => (jsonCols.includes(c) ? j(d[c]) : d[c] ?? null));
      const cast = (c) => (jsonCols.includes(c) ? '?::jsonb' : '?');
      const row = d.id
        ? db.prepare(`UPDATE merch_designs SET ${cols.filter((c) => !['owner_kind', 'owner_id', 'created_by_user_id'].includes(c)).map((c) => `${c} = ${cast(c)}`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_kind = ? AND owner_id = ? RETURNING *`).get(...cols.filter((c) => !['owner_kind', 'owner_id', 'created_by_user_id'].includes(c)).map((c) => (jsonCols.includes(c) ? j(d[c]) : d[c] ?? null)), d.id, d.owner_kind, d.owner_id)
        : db.prepare(`INSERT INTO merch_designs (${cols.join(', ')}) VALUES (${cols.map(cast).join(', ')}) RETURNING *`).get(...vals);
      return normDesign(parse(row, DESIGN_JSON));
    },
    async getDesign(id) { return normDesign(parse(db.prepare(FRESH + 'SELECT * FROM merch_designs WHERE id = ? AND archived_at IS NULL').get(id), DESIGN_JSON)); },
    async listDesigns({ ownerKind, ownerId }) { return db.prepare(FRESH + 'SELECT * FROM merch_designs WHERE owner_kind = ? AND owner_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 50').all(ownerKind, ownerId).map((r) => normDesign(parse(r, DESIGN_JSON))); },
  };
}
function normSup(r) { if (!r) return r; r.attempts = Number(r.attempts || 0); r.refunded_cents = Number(r.refunded_cents || 0); r.shipments = r.shipments || []; r.simulated = r.simulated === true || r.simulated === 't'; r.order_id = Number(r.order_id); return r; }
function normDesign(r) { if (!r) return r; r.id = Number(r.id); r.owner_id = Number(r.owner_id); r.print_files_ok = r.print_files_ok === true || r.print_files_ok === 't'; return r; }

module.exports = { memoryStore, dbStore, FRESH };
