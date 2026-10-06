#!/usr/bin/env node
/**
 * Capture the real store permalink for every pushed SKU.
 *
 *   npm run store:sync                    # data/catalog.db <- gerbersfurniture.com
 *   STORE_DB=/tmp/catalog.db node scripts/sync-store-links.mjs
 *
 * Reads ledger.woo_id out of the catalog DB, asks the store for those products, and writes the
 * permalink it reports back into ledger.woo_url (plus the store's status into ledger.woo_status).
 *
 * The link the app shows is therefore the one the store itself returns — not one guessed from a
 * slug — and a product id the store no longer knows about is left blank instead of pointing at a
 * 404. Requires WOO_CK/WOO_CS or WP_USER/WP_APP_PASSWORD in the environment.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const DB = arg("db", process.env.STORE_DB ?? "data/catalog.db");
const BASE = (process.env.WOO_BASE_URL ?? "https://gerbersfurniture.com").replace(/\/$/, "");

const ck = process.env.WOO_CK;
const cs = process.env.WOO_CS;
const wpUser = process.env.WP_USER;
const wpPass = process.env.WP_APP_PASSWORD;
// The application password covers wc/v3 and wp/v2; consumer keys cover wc/v3 only.
const pair =
  wpUser && wpPass ? `${wpUser}:${wpPass}` : ck && cs ? `${ck}:${cs}` : null;

if (!pair) {
  console.error("no store credentials in the environment (WOO_CK/WOO_CS or WP_USER/WP_APP_PASSWORD)");
  process.exit(1);
}
if (!existsSync(DB)) {
  console.error(`database not found: ${DB} — run 'npm run db:build' first`);
  process.exit(1);
}

const auth = {
  Authorization: `Basic ${Buffer.from(pair).toString("base64")}`,
  "User-Agent": "hermes-gerber-store-sync/1.0",
};

const db = new DatabaseSync(DB);
const pushed = db
  .prepare(`SELECT sku, woo_id FROM ledger WHERE woo_id IS NOT NULL`)
  .all();

if (pushed.length === 0) {
  console.log("nothing to sync: no ledger row carries a woo_id yet");
  db.close();
  process.exit(0);
}

// Ask the store about the whole catalog once: 100 products per request is the API maximum.
const byId = new Map();
let pages = 0;
let storeTotal = 0;
for (let page = 1; page <= 80; page++) {
  const url = `${BASE}/wp-json/wc/v3/products?per_page=100&page=${page}&status=any&_fields=id,sku,permalink,status`;
  const res = await fetch(url, { headers: auth });
  if (!res.ok) {
    console.error(`store refused page ${page}: HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  if (page === 1) storeTotal = Number(res.headers.get("x-wp-total") ?? 0);
  const body = await res.json();
  if (!Array.isArray(body) || body.length === 0) break;
  pages++;
  for (const p of body) byId.set(Number(p.id), p);
  if (body.length < 100) break;
}

const update = db.prepare(`UPDATE ledger SET woo_url = ?, woo_status = ? WHERE sku = ?`);
let matched = 0;
const missing = [];
db.exec("BEGIN");
for (const r of pushed) {
  const p = byId.get(Number(r.woo_id));
  if (p?.permalink) {
    update.run(p.permalink, p.status ?? null, r.sku);
    matched++;
  } else {
    missing.push({ sku: r.sku, wooId: r.woo_id });
  }
}
db.exec("COMMIT");

const withUrl = db
  .prepare(`SELECT COUNT(*) AS n FROM ledger WHERE woo_url IS NOT NULL AND woo_url <> ''`)
  .get().n;
db.close();

console.log(`store products   ${storeTotal.toLocaleString()} (read over ${pages} page(s))`);
console.log(`ledger pushed    ${pushed.length.toLocaleString()}`);
console.log(`links captured   ${matched.toLocaleString()}  (${withUrl.toLocaleString()} rows now carry a permalink)`);
if (missing.length) {
  console.log(`not on store     ${missing.length.toLocaleString()} — left blank rather than linked:`);
  for (const m of missing.slice(0, 10)) console.log(`                   sku ${m.sku} (id ${m.wooId})`);
  if (missing.length > 10) console.log(`                   … and ${missing.length - 10} more`);
}
console.log(`db               ${DB}`);
