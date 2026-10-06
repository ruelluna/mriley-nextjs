#!/usr/bin/env node
/**
 * Export the harvested-image ledger to a manifest CSV that scripts/attach-images.mjs can read.
 *
 *   node scripts/export-image-manifest.mjs [--db /opt/data/gerber_import/image_harvest.db] [--out /tmp/images_manifest.csv]
 *   npm run db:images        # export + attach, in one shot
 *
 * Only rows with status = 'ok' are exported — a miss has no file to link. `has_image` on the
 * products table is refreshed by attach-images.mjs, so the catalog snapshot always agrees with
 * the manifest.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const SRC = arg("db", "/opt/data/gerber_import/image_harvest.db");
// Derived artefact: kept out of the repo, and out of data/ so a rebuild never ships it.
const OUT = arg("out", process.env.IMAGE_MANIFEST ?? "/opt/data/cache/scratch/images-manifest.csv");
mkdirSync(dirname(OUT), { recursive: true });

const db = new DatabaseSync(SRC, { readOnly: true });
const rows = db
  .prepare(
    `SELECT sku, hash, bytes, md5, url, full_url
     FROM images WHERE status = 'ok' AND hash IS NOT NULL AND hash <> ''
     ORDER BY sku`,
  )
  .all();
db.close();

const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = ["sku,hash,bytes,md5,url,full_url,position"];
for (const r of rows) {
  lines.push([r.sku, r.hash, r.bytes ?? "", r.md5 ?? "", r.url ?? "", r.full_url ?? "", 1].map(esc).join(","));
}
writeFileSync(OUT, lines.join("\n") + "\n");

console.log(`manifest rows   ${rows.length} (status=ok)`);
console.log(`written         ${OUT}`);
