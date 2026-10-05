#!/usr/bin/env node
/**
 * Prepare the staging database for the catalog app.
 *
 * The app reads gerber.db directly and read-only.  Without indexes every query
 * is a full scan of the ~540 MB file (~230 ms each, several per page render),
 * so this adds the covering indexes once.  Safe to re-run.
 *
 *   node scripts/prepare-db.mjs            # uses $GERBER_DB or the default path
 *   GERBER_DB=/path/gerber.db node scripts/prepare-db.mjs
 */
import { DatabaseSync } from "node:sqlite";

const DB = process.env.GERBER_DB ?? "/opt/data/gerber_import/gerber.db";

const INDEXES = [
  ["idx_products_sku", "products(sku)"],
  ["idx_products_price", "products(has_price, price_value)"],
  ["idx_products_brand", "products(brand)"],
  ["idx_products_cat", "products(category)"],
  ["idx_products_dept", "products(department)"],
  ["idx_products_img", "products(has_image)"],
];

const db = new DatabaseSync(DB);
for (const [name, target] of INDEXES) {
  const t = Date.now();
  db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${target}`);
  console.log(`ok  ${name.padEnd(20)} ${target.padEnd(36)} ${Date.now() - t} ms`);
}

const counts = db
  .prepare(
    `SELECT COUNT(*) AS staged,
            SUM(has_price) AS priced,
            SUM(has_image) AS imaged
     FROM products`,
  )
  .get();
console.log(
  `\nstaged ${counts.staged.toLocaleString()} · priced ${Number(counts.priced).toLocaleString()} · imaged ${Number(counts.imaged).toLocaleString()}`,
);
console.log("indexes:", db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => r.name).join(", "));
db.close();
