# mriley-nextjs

Next.js app that serves the **Gerber Furniture product catalog** straight out of the SQLite
staging database (`gerber.db`) — a searchable, filterable catalog plus a page per SKU.

## Routes

| Route | What it is |
|---|---|
| `/` | Catalog overview: counts, price range, entry points |
| `/products` | The catalog — search, brand/category/department facets, price range, has-image filter, sort, pagination |
| `/products/[sku]` | Product page: description, specification, dimensions, every source field, details panel, same-collection cards |
| `/api/products` | JSON, same query params as `/products`: `q, brand, category, department, min, max, image, sort, page, per` |
| `/api/products/[sku]` | One product with all source fields; `404` when the SKU is not in scope |

All routes are server-rendered on demand (`ƒ`) — nothing is prerendered, so the data is never stale.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `GERBER_DB` | `/opt/data/gerber_import/gerber.db` | Path to the staging SQLite database |
| `GERBER_SCOPE` | `priced` | Which rows are browsable: `priced` (`Display Price` > 0 — the 6,583-product upload set), `imaged` (rows with an image), `all` (every staged row) |

```bash
npm run dev      # http://localhost:3000
npm run build && npm run start
```

## Data source

`gerber.db` holds the mirror of the *Non-Custom Products* sheet plus the import ledger:

- `products` — one row per sheet row: `sku, brand, category, department, ptype, subtype, collection, display_price, price_value, has_price, has_image, avail` and `raw` (the full 145-column sheet row as JSON).
- `ledger` — per-SKU import state (`pending`, `created`, …), surfaced on product pages as `ledger: …`.

The app opens the database **read-only** and never writes to it.

### Prepare the database (indexes)

Every query is a full scan of the ~540 MB file without indexes, so run this once after
changing `GERBER_DB` (idempotent, safe to re-run):

```bash
npm run db:prepare        # or: GERBER_DB=/path/gerber.db node scripts/prepare-db.mjs
```

## Layout

```
app/page.tsx                 overview
app/products/page.tsx        catalog (server component, reads searchParams)
app/products/[sku]/page.tsx  product detail + generateMetadata
app/api/products/…           JSON endpoints
components/                  ProductCard, FilterForm (client), Pagination
lib/catalog.ts               SQLite access — server only
lib/catalog-types.ts         client-safe types/constants (no node:sqlite)
scripts/prepare-db.mjs       index creation
```

Two rules keep the build working:

1. **`node:sqlite` must never reach a Client Component.** Client Components import from
   `lib/catalog-types.ts`; anything that imports `lib/catalog.ts` stays server-side.
2. **Rows from `node:sqlite` have a null prototype** and cannot be passed to a Client
   Component — map them to plain objects first (`db.prepare().all()` returns them directly).

## Known gaps

- **No images.** 0 of the 6,583 priced products have an image in the source sheet; cards show a
  brand-initial placeholder and product pages say "No image in source data". An image pass is a
  separate piece of work.
- **Product pages are not the store.** Prices are source display prices; confirm on
  gerbersfurniture.com before anything is published.
- **Deploy target.** The app needs `gerber.db` at runtime, so it belongs on a host that has the
  file (this VPS / Hostinger). Vercel cannot read it unless the database ships with the deploy.
