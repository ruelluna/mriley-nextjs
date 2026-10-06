#!/usr/bin/env node
/**
 * Build the deployable catalog database: data/catalog.db
 *
 * The full staging database (gerber.db, ~540 MB, 128k sheet rows) lives outside the
 * repo and cannot ship to a serverless host.  This writes a pruned, read-only copy
 * containing only the products the site shows (Display Price > 0) with the empty
 * sheet fields stripped out of the `raw` JSON -- roughly 40x smaller.
 *
 * Schema is identical to gerber.db (products + ledger), so the app needs no changes.
 *
 *   node scripts/build-catalog-db.mjs                     # staging DB -> data/catalog.db
 *   GERBER_DB=/path/gerber.db OUT_DB=/tmp/catalog.db node scripts/build-catalog-db.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";

const SRC = process.env.GERBER_DB ?? "/opt/data/gerber_import/gerber.db";
const OUT = process.env.OUT_DB ?? new URL("../data/catalog.db", import.meta.url).pathname;

mkdirSync(dirname(OUT), { recursive: true });
rmSync(OUT, { force: true });

const src = new DatabaseSync(SRC, { readOnly: true });
const out = new DatabaseSync(OUT);

out.exec(`
  CREATE TABLE products (
    row_id INTEGER PRIMARY KEY,
    sku TEXT, new_sku TEXT,
    brand TEXT, category TEXT, department TEXT, ptype TEXT, subtype TEXT, collection TEXT,
    display_price TEXT, price3 TEXT, price_value REAL, has_price INTEGER,
    has_image INTEGER, sell_online TEXT, show TEXT, avail TEXT,
    raw TEXT
  );
  CREATE TABLE ledger (
    sku TEXT PRIMARY KEY, row_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    woo_id INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT, updated_at TEXT,
    -- filled by scripts/sync-store-links.mjs from the store's own API, so the app links to a
    -- verified permalink rather than one assembled from a slug guess
    woo_url TEXT, woo_status TEXT
  );
  -- Image links live in their own table (filled by scripts/attach-images.mjs) so a
  -- full rebuild never has to know about them, and so a product can carry several.
  CREATE TABLE IF NOT EXISTS product_images (
    sku TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 1,
    url TEXT NOT NULL,            -- what the page loads (display size)
    full_url TEXT,                -- master / original
    source TEXT,                  -- webfronts | woo | bucket | ...
    hash TEXT, bytes INTEGER, md5 TEXT,
    PRIMARY KEY (sku, position)
  );
  CREATE INDEX IF NOT EXISTS idx_product_images_sku ON product_images(sku);
`);

const rows = src
  .prepare(
    `SELECT row_id, sku, new_sku, brand, category, department, ptype, subtype, collection,
            display_price, price3, price_value, has_price, has_image, sell_online, show,
            avail, raw
     FROM products WHERE has_price = 1`,
  )
  .all();

const insert = out.prepare(
  `INSERT INTO products (row_id, sku, new_sku, brand, category, department, ptype, subtype,
                         collection, display_price, price3, price_value, has_price, has_image,
                         sell_online, show, avail, raw)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

let rawBefore = 0;
let rawAfter = 0;
out.exec("BEGIN");
for (const r of rows) {
  const parsed = JSON.parse(r.raw);
  const kept = {};
  for (const [k, v] of Object.entries(parsed)) {
    const s = v == null ? "" : String(v).trim();
    if (s) kept[k] = s;
  }
  const raw = JSON.stringify(kept);
  rawBefore += r.raw.length;
  rawAfter += raw.length;
  insert.run(
    r.row_id, r.sku, r.new_sku, r.brand, r.category, r.department, r.ptype, r.subtype,
    r.collection, r.display_price, r.price3, r.price_value, r.has_price, r.has_image,
    r.sell_online, r.show, r.avail, raw,
  );
}
out.exec("COMMIT");

// Ledger state only for the SKUs we kept (the staging ledger covers all 127k sheet SKUs;
// this is a per-SKU primary-key lookup on the source).
const ledgerRows = rows
  .map((r) =>
    src
      .prepare(
        `SELECT sku, row_id, status, woo_id, attempts, last_error, updated_at
         FROM ledger WHERE sku = ?`,
      )
      .get(r.sku),
  )
  .filter(Boolean);
const led = out.prepare(
  `INSERT OR REPLACE INTO ledger (sku, row_id, status, woo_id, attempts, last_error, updated_at)
   VALUES (?,?,?,?,?,?,?)`,
);
out.exec("BEGIN");
for (const r of ledgerRows) {
  led.run(r.sku, r.row_id, r.status, r.woo_id, r.attempts, r.last_error, r.updated_at);
}
out.exec("COMMIT");

// Same covering indexes the app relies on, then compact.
for (const sql of [
  "CREATE INDEX idx_products_sku ON products(sku)",
  "CREATE INDEX idx_products_price ON products(has_price, price_value)",
  "CREATE INDEX idx_products_brand ON products(brand)",
  "CREATE INDEX idx_products_cat ON products(category)",
  "CREATE INDEX idx_products_dept ON products(department)",
  "CREATE INDEX idx_products_img ON products(has_image)",
]) {
  out.exec(sql);
}
out.exec("VACUUM");
out.close();

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`products        ${rows.length.toLocaleString()} (priced set)`);
console.log(`ledger rows     ${ledgerRows.length.toLocaleString()}`);
console.log(`raw JSON        ${mb(rawBefore)} -> ${mb(rawAfter)} (empty fields stripped)`);
console.log(`source DB       ${mb(statSync(SRC).size)}`);
console.log(`written         ${OUT}  ${mb(statSync(OUT).size)}`);
