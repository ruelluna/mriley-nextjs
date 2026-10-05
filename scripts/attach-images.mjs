#!/usr/bin/env node
/**
 * Attach image links to the deployable catalog database.
 *
 * The scraper writes images + a manifest; this is the step that teaches the web app
 * about them.  It never copies image bytes into the repo -- it stores LINKS, so the
 * same script works whether the images end up on the MicroD CDN, an object bucket, or
 * the WooCommerce media library.
 *
 * Idempotent: re-running with a newer manifest replaces the rows for those SKUs.
 *
 *   node scripts/attach-images.mjs --manifest /path/manifest.csv [--db data/catalog.db]
 *   node scripts/attach-images.mjs --manifest m.csv --source woo --url-template '{url}'
 *
 * Manifest: CSV with a header. Recognised columns (extra columns are ignored):
 *   sku (required)      hash            bytes        md5
 *   url                 full_url        position     source
 * If `url` is missing it is derived from `hash` as
 *   https://images.webfronts.com/cache/<hash>.jpg?imgeng=/w_500   (display)
 *   https://images.webfronts.com/cache/<hash>.jpg                 (master)
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const MANIFEST = arg("manifest");
const DB = arg("db", new URL("../data/catalog.db", import.meta.url).pathname);
const SOURCE = arg("source", "webfronts");
const DISPLAY_W = arg("display-width", "w_500");

if (!MANIFEST || !existsSync(MANIFEST)) {
  console.error(`manifest not found: ${MANIFEST ?? "(no --manifest given)"}`);
  process.exit(1);
}
if (!existsSync(DB)) {
  console.error(`database not found: ${DB} — run 'npm run db:build' first`);
  process.exit(1);
}

/** Minimal CSV parser: handles quoted fields and embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const rows = parseCsv(readFileSync(MANIFEST, "utf8"));
const header = rows.shift().map((h) => h.trim().toLowerCase());
const col = (r, name) => {
  const i = header.indexOf(name);
  return i >= 0 ? (r[i] ?? "").trim() : "";
};

const db = new DatabaseSync(DB);
db.exec("BEGIN");
db.exec("DELETE FROM product_images WHERE source = " + `'${SOURCE.replace(/'/g, "''")}'`);

const upsert = db.prepare(
  `INSERT OR REPLACE INTO product_images (sku, position, url, full_url, source, hash, bytes, md5)
   VALUES (?,?,?,?,?,?,?,?)`,
);

let linked = 0, skipped = 0;
const seen = new Set();
for (const r of rows) {
  const sku = col(r, "sku");
  const hash = col(r, "hash");
  if (!sku || (!hash && !col(r, "url"))) { skipped++; continue; }
  const master =
    col(r, "full_url") || (hash ? `https://images.webfronts.com/cache/${hash}.jpg` : col(r, "url"));
  const display =
    col(r, "url") || (hash ? `${master}?imgeng=/${DISPLAY_W}` : master);
  const position = Number(col(r, "position") || 1) || 1;
  const bytes = Number(col(r, "bytes") || 0) || null;
  upsert.run(sku, position, display, master, col(r, "source") || SOURCE, hash || null, bytes, col(r, "md5") || null);
  seen.add(sku);
  linked++;
}
db.exec("COMMIT");

const known = db
  .prepare(
    `SELECT COUNT(*) AS n FROM product_images pi
     WHERE EXISTS (SELECT 1 FROM products p WHERE p.sku = pi.sku)`,
  )
  .get().n;
const totalProducts = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
db.close();

console.log(`manifest rows   ${rows.length}  (linked ${linked}, skipped ${skipped})`);
console.log(`SKUs with image ${seen.size}  (rows in DB whose SKU is in the catalog: ${known})`);
console.log(`catalog size    ${totalProducts}`);
console.log(`db              ${DB}`);
