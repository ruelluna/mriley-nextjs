/**
 * Read-only data access for the Gerber Furniture catalog staged in SQLite
 * (gerber.db).  Server-only -- never import this from a Client Component;
 * Client Components import ./catalog-types instead (no node:sqlite there).
 *
 * Env:
 *   GERBER_DB     absolute path to gerber.db  (default /opt/data/gerber_import/gerber.db)
 *   GERBER_SCOPE  priced | imaged | all       (default priced = the upload set)
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PER_PAGE_OPTIONS,
  money,
  type Facet,
  type ProductDetail,
  type ProductImage,
  type ProductSummary,
  type Scope,
  type SortKey,
  type Stats,
} from "./catalog-types";

export * from "./catalog-types";

const STAGING_DB = "/opt/data/gerber_import/gerber.db";

/**
 * Which database to read, in order of preference:
 *   1. GERBER_DB                      -- explicit override (full staging DB in dev)
 *   2. ./data/catalog.db              -- the pruned copy committed for deploys
 *   3. the staging path               -- local fallback when no pruned copy exists
 */
function resolveDbPath(): string {
  if (process.env.GERBER_DB) return process.env.GERBER_DB;
  const bundled = join(process.cwd(), "data", "catalog.db");
  return existsSync(bundled) ? bundled : STAGING_DB;
}

const DB_PATH = resolveDbPath();
const SCOPE = (process.env.GERBER_SCOPE ?? "priced") as Scope;

const SCOPE_SQL: Record<Scope, string> = {
  priced: "p.has_price = 1",
  imaged: "p.has_image = 1",
  all: "1 = 1",
};

/** Raw sheet keys that are pricing mechanics / noise in a UI. */
const NOISE_KEYS = new Set([
  "Price Type", "Price Markup", "Price Formula", "Price Point", "Item Rank",
  "New SKU", "View Type", "SKU Status", "Condition", "Photo1", "Photo2", "Photo3",
  "Photo4", "Photo5", "Roomplan Template", "PDF File Name", "Sale Price Start Date",
  "Sale Price End Date", "Availability Date", "Incomplete Pricing", "Is Taxable",
  "Availability Message", "Location", "Qualified for Free Shipping", "Video Label",
  "Custom Type", "Show", "Sale Price",
]);

const NAME_SQL = `COALESCE(NULLIF(TRIM(json_extract(p.raw,'$."Short Description"')),''), p.sku)`;
const DESC_SQL = `IFNULL(json_extract(p.raw,'$."Product Description"'),'')`;
const SPEC_SQL = `IFNULL(json_extract(p.raw,'$."Product Specification"'),'')`;

let handle: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (!handle) {
    handle = new DatabaseSync(DB_PATH, { readOnly: true });
  }
  return handle;
}

/** True when the staged DB is reachable (lets pages degrade instead of 500). */
export function dbReady(): boolean {
  try {
    db().prepare("SELECT 1 FROM products LIMIT 1").get();
    return true;
  } catch {
    return false;
  }
}

const ORDER_SQL: Record<SortKey, string> = {
  price_asc: "p.price_value IS NULL, p.price_value ASC",
  price_desc: "p.price_value IS NULL, p.price_value DESC",
  name: "name COLLATE NOCASE ASC",
  brand: "p.brand COLLATE NOCASE ASC, name COLLATE NOCASE ASC",
  sku: "p.sku ASC",
};

export type Query = {
  q?: string;
  brand?: string;
  category?: string;
  department?: string;
  min?: number | null;
  max?: number | null;
  image?: boolean;
  sort?: SortKey;
  page?: number;
  per?: number;
};

/** LIKE with wildcards the user typed neutralised. */
function like(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function whereFor(q: Query): { sql: string; params: (string | number)[] } {
  const parts: string[] = [SCOPE_SQL[SCOPE]];
  const params: (string | number)[] = [];

  const term = q.q?.trim();
  if (term) {
    const p = like(term);
    parts.push(`(p.sku LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\'
       OR p.collection LIKE ? ESCAPE '\\' OR ${NAME_SQL} LIKE ? ESCAPE '\\'
       OR ${DESC_SQL} LIKE ? ESCAPE '\\' OR ${SPEC_SQL} LIKE ? ESCAPE '\\')`);
    params.push(p, p, p, p, p, p);
  }
  if (q.brand) { parts.push("p.brand = ?"); params.push(q.brand); }
  if (q.category) { parts.push("p.category = ?"); params.push(q.category); }
  if (q.department) { parts.push("p.department = ?"); params.push(q.department); }
  if (q.min != null) { parts.push("p.price_value >= ?"); params.push(q.min); }
  if (q.max != null) { parts.push("p.price_value <= ?"); params.push(q.max); }
  if (q.image) {
    parts.push(
      "(p.has_image = 1 OR EXISTS (SELECT 1 FROM product_images pi2 WHERE pi2.sku = p.sku))",
    );
  }

  return { sql: parts.join(" AND "), params };
}

type Row = {
  sku: string; name: string; brand: string; category: string; department: string;
  ptype: string; subtype: string; collection: string; price_value: number | null;
  display_price: string; has_image: number; ledger_status: string; description: string;
  image_url: string | null;
};

function toSummary(r: Row): ProductSummary {
  return {
    sku: r.sku,
    name: r.name,
    brand: r.brand ?? "",
    category: r.category ?? "",
    department: r.department ?? "",
    type: r.ptype ?? "",
    subtype: r.subtype ?? "",
    collection: r.collection ?? "",
    price: r.price_value,
    displayPrice: r.display_price ?? "",
    hasImage: !!r.has_image || !!r.image_url,
    imageUrl: r.image_url ?? null,
    ledgerStatus: r.ledger_status,
    description: (r.description ?? "").replace(/\s+/g, " ").trim(),
  };
}

const IMAGE_JOIN = "LEFT JOIN product_images pi ON pi.sku = p.sku AND pi.position = 1";

export function searchProducts(q: Query): {
  rows: ProductSummary[];
  total: number;
  page: number;
  pages: number;
  per: number;
} {
  const per = (PER_PAGE_OPTIONS as readonly number[]).includes(q.per ?? 24) ? (q.per ?? 24) : 24;
  const { sql: where, params } = whereFor(q);
  const order = ORDER_SQL[q.sort ?? "price_asc"] ?? ORDER_SQL.price_asc;

  const total = (
    db().prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${where}`).get(...params) as { n: number }
  ).n;

  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, q.page ?? 1), pages);

  const rows = db()
    .prepare(
      `SELECT p.sku, ${NAME_SQL} AS name, p.brand, p.category, p.department, p.ptype,
              p.subtype, p.collection, p.price_value, p.display_price, p.has_image,
              COALESCE(l.status,'untracked') AS ledger_status,
              ${DESC_SQL} AS description, pi.url AS image_url
       FROM products p LEFT JOIN ledger l ON l.sku = p.sku
       ${IMAGE_JOIN}
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, per, (page - 1) * per) as unknown as Row[];

  return { rows: rows.map(toSummary), total, page, pages, per };
}

export function getProduct(sku: string): ProductDetail | null {
  const r = db()
    .prepare(
      `SELECT p.sku, ${NAME_SQL} AS name, p.brand, p.category, p.department, p.ptype,
              p.subtype, p.collection, p.price_value, p.display_price, p.has_image,
              COALESCE(l.status,'untracked') AS ledger_status,
              ${DESC_SQL} AS description, p.raw, pi.url AS image_url
       FROM products p LEFT JOIN ledger l ON l.sku = p.sku
       ${IMAGE_JOIN}
       WHERE p.sku = ? AND ${SCOPE_SQL[SCOPE]}
       LIMIT 1`,
    )
    .get(sku) as unknown as (Row & { raw: string }) | undefined;
  if (!r) return null;

  const parsed = JSON.parse(r.raw) as Record<string, unknown>;
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const val = v == null ? "" : String(v).trim();
    if (val && !NOISE_KEYS.has(k)) raw[k] = val;
  }
  const dim = (k: string) => raw[k] ?? "";

  return {
    ...toSummary(r),
    typicalPrice: raw["Typical Price"] ?? "",
    dimensions: { depth: dim("Depth"), height: dim("Height"), width: dim("Width") },
    images: getImages(r.sku),
    raw,
  };
}

/** All attached images for a SKU, in display order. */
export function getImages(sku: string): ProductImage[] {
  const rows = db()
    .prepare(
      `SELECT position, url, full_url FROM product_images WHERE sku = ? ORDER BY position ASC`,
    )
    .all(sku) as unknown as { position: number; url: string; full_url: string | null }[];
  return rows.map((r) => ({ position: r.position, url: r.url, fullUrl: r.full_url }));
}

/** Other products in the same collection, cheapest first. */
export function getRelated(collection: string, sku: string, limit = 8): ProductSummary[] {
  if (!collection) return [];
  return (
    db()
      .prepare(
        `SELECT p.sku, ${NAME_SQL} AS name, p.brand, p.category, p.department, p.ptype,
                p.subtype, p.collection, p.price_value, p.display_price, p.has_image,
                'untracked' AS ledger_status, '' AS description, pi.url AS image_url
         FROM products p
         ${IMAGE_JOIN}
         WHERE ${SCOPE_SQL[SCOPE]} AND p.collection = ? AND p.sku <> ?
         ORDER BY p.price_value IS NULL, p.price_value ASC, name COLLATE NOCASE ASC
         LIMIT ?`,
      )
      .all(collection, sku, limit) as unknown as Row[]
  ).map(toSummary);
}

/** node:sqlite returns null-prototype rows, which cannot cross into a Client Component. */
function facet(column: string): Facet[] {
  const rows = db()
    .prepare(
      `SELECT ${column} AS value, COUNT(*) AS n FROM products p
       WHERE ${SCOPE_SQL[SCOPE]} AND ${column} IS NOT NULL AND TRIM(${column}) <> ''
       GROUP BY ${column} ORDER BY n DESC, value COLLATE NOCASE ASC`,
    )
    .all() as unknown as { value: string; n: number }[];
  return rows.map((r) => ({ value: r.value, n: r.n }));
}

export function getFacets(): { brands: Facet[]; categories: Facet[]; departments: Facet[] } {
  return { brands: facet("p.brand"), categories: facet("p.category"), departments: facet("p.department") };
}

export function getStats(): Stats {
  const s = db()
    .prepare(
      `SELECT COUNT(*) AS products,
              COUNT(DISTINCT NULLIF(TRIM(p.brand),''))    AS brands,
              COUNT(DISTINCT NULLIF(TRIM(p.category),'')) AS categories,
              COUNT(DISTINCT NULLIF(TRIM(p.collection),'')) AS collections,
              SUM(p.has_image) AS with_image,
              MIN(p.price_value) AS min_price,
              MAX(p.price_value) AS max_price
       FROM products p WHERE ${SCOPE_SQL[SCOPE]}`,
    )
    .get() as unknown as {
    products: number; brands: number; categories: number; collections: number;
    with_image: number | null; min_price: number | null; max_price: number | null;
  };
  // Sync state lives on the ledger: a product counts as pushed once it carries a WooCommerce id.
  // Read separately from the product scan above so a missing ledger degrades to zeros.
  let sync = { pushed: 0, created: 0, already_present: 0, images: 0 };
  try {
    const l = db()
      .prepare(
        `SELECT SUM(l.woo_id IS NOT NULL) AS pushed,
                SUM(l.status = 'created')  AS created,
                SUM(l.status = 'skipped')  AS already_present
         FROM ledger l WHERE EXISTS (SELECT 1 FROM products p WHERE p.sku = l.sku)`,
      )
      .get() as unknown as { pushed: number | null; created: number | null; already_present: number | null };
    const i = db()
      .prepare(
        `SELECT COUNT(DISTINCT pi.sku) AS n FROM product_images pi
         WHERE EXISTS (SELECT 1 FROM products p WHERE p.sku = pi.sku)`,
      )
      .get() as unknown as { n: number | null };
    sync = {
      pushed: l?.pushed ?? 0,
      created: l?.created ?? 0,
      already_present: l?.already_present ?? 0,
      images: i?.n ?? 0,
    };
  } catch {
    /* ledger or image table absent — leave the zeros */
  }
  return {
    scope: SCOPE,
    products: s.products,
    brands: s.brands,
    categories: s.categories,
    collections: s.collections,
    withImage: s.with_image ?? 0,
    pushed: sync.pushed,
    created: sync.created,
    alreadyPresent: sync.already_present,
    imagesLinked: sync.images,
    minPrice: s.min_price,
    maxPrice: s.max_price,
  };
}

export const catalogEnv = { dbPath: DB_PATH, scope: SCOPE };
export { money };
