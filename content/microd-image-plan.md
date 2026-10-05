# MicroD image harvest — plan

**Goal:** give every product in the upload set a real photo **before** the WooCommerce sync, so the
6,534 new products do not go live image-less.

**Scope:** the 6,582 distinct SKUs with `Display Price` > 0 (the upload set from `PLAN.md` §2).

**Status:** image source found and the pipeline proven end-to-end on a sample. Full run not yet started.

---

## 1. The blocker

`www.gerbershf.com` — the dealer site whose product pages hold the images — returns **403 for the
entire host** from this server: homepage, `robots.txt`, `sitemap.xml`, and every product page. It is
not path-specific and not user-agent specific.

Firecrawl, on every proxy tier, is blocked too:

| Attempt | Proxy | Result |
|---|---|---|
| Product page | `basic` | 403 Forbidden |
| Product page | `stealth` | 403 Forbidden (`Cluster Server: SDL71`) |
| Product page | `enhanced` | 403 Forbidden |
| Control (`example.com`) | `basic` | 200 — the block is site-specific, not an outage |

A dealer site is an edge-cached, IP-reputation-filtered target. Scraping harder is the wrong move.

## 2. What we found instead

The images are **not served from gerbershf's own origin**. Two separate hosts serve what we need, and
neither blocks us:

**1. The image CDN — `images.webfronts.com`**

```
https://images.webfronts.com/cache/<hash>.jpg            → full master, 70–850 KB, image/jpeg
https://images.webfronts.com/cache/<hash>.jpg?imgeng=/w_500   → 30 KB thumbnail
```

The `<hash>` (e.g. `meqjysvftbqo`) is **opaque** — it is not derived from the SKU, the brand, or any
sheet field. Any attempt to construct it (`<sku>.jpg`, imgix `p4dbimg/<code>/…`) returns 404. This is
why the earlier CDN brute-force probe found nothing: the name is not guessable, it has to be read.

**2. Other WebFronts dealer sites — the way to read it**

WebFronts (Retailer Web Services) gives every dealer site the *same* URL template:

```
https://<any-dealer>/products/<Brand-Slug>/<brandcode>/<sku-lowercase>.html
```

That is the exact path already stored in `microd_urls.csv` — 100% coverage of the upload set, 6,582 of
6,582 SKUs. So we only have to swap the host.

**The key property: the image hash is global to the platform, not per-dealer.** Five separate dealer
sites returned the identical `cache/meqjysvftbqo.jpg` for SKU `53245130`. Any reachable dealer that
carries the item therefore yields the *same image URL gerbershf would have returned* — we are reading
the platform's own copy, not a third party's substitute.

## 3. Measured coverage

Sampled SKUs probed against candidate hosts (path from `microd_urls.csv`, host swapped):

| Brand | SKUs in upload set | Confirmed host(s) | Sample hit rate |
|---|---|---|---|
| Sealy | 3,381 | nealshomestore.com, unclesamssupercenter.com, charliewilsons.com, ambersfurnitureusa.com | 6/6 |
| Uttermost | 2,256 | hefnerfurniture.com | 8/8 |
| Tempur-Pedic | 375 | nealshomestore.com, flagcityfurniture.com | 6/6 |
| Stearns & Foster | 264 | nealshomestore.com | 6/6 |
| Flexsteel | 91 | hefnerfurniture.com | 8/8 (2 of 3 on a random re-sample — some SKUs not stocked) |
| A America | 49 | *none found yet* — 4 candidates tested, 0/6 (mostly in Wayback) |
| Long-tail brands (~12) | ~166 | *to be resolved* | — |

**≈ 6,400 of 6,582 SKUs (97%) are reachable through two hosts.** The trick is brand-appropriate
hosts: a mattress dealer does not carry Uttermost, so each brand needs its own chain of hosts, tried
in order per SKU.

**Wayback Machine is a fallback, not a source.** The archive holds 10,376 gerbershf product URLs, but
only **286** intersect our upload set (Tempur-Pedic 204, A America 47, Uttermost 20, aspenhome 12,
Sealy 3). Archived pages render fine (`https://web.archive.org/web/2020id_/<url>`) and expose the same
webfronts URLs — useful exactly where the dealer chain fails.

## 4. Pipeline

```
microd_urls.csv  →  path
      │
      ▼
for host in hosts[brand]:  GET host + path          (dealer product page)
      │                                  ├─ 200 → regex images.webfronts.com/cache/<hash>.jpg
      │                                  └─ else → next host
      ▼
GET https://images.webfronts.com/cache/<hash>.jpg   (CDN, unblocked)
      ▼
images/<sku>_<hash>.jpg  +  manifest.csv  +  SQLite ledger (resume-safe)
```

**Proven on a 15-SKU sample:** 13 images downloaded, all valid JPEG (`\xff\xd8` magic), average
303 KB. The two misses were Flexsteel SKUs that host does not stock — expected, and why the chain
matters.

## 5. Run plan

| Phase | Work | Guardrail |
|---|---|---|
| 0. Publish | This plan, hosted at `/plan` | — |
| 1. Pilot | 200 SKUs spread across all brands | eyeball images before the full run |
| 2. Full sweep | ~6,400 SKUs × up to 3 hosts | **1 req/s per host**, 2–4 hosts in parallel, cached |
| 3. Gap fill | misses → alternate hosts → Wayback | one retry pass only; never loop |
| 4. Verify | counts vs manifest, sample check, dedupe by md5 | every file > 5 KB and valid JPEG |
| 5. Handoff | manifest → WooCommerce image pass (PLAN §P8) | images attach during the sync, not before |

**Volume:** ~7,000 page fetches + ~6,400 image downloads. At a polite 1 req/s per host spread over
4 hosts, roughly **45–60 minutes**. Storage ≈ **2 GB** at full master size (~300 KB average), or
~750 MB if we pull `w_1000` — plenty for a store page and faster to upload to WooCommerce.

**Artifacts:**

```
images/<sku>_<hash>.jpg        one file per product
images/manifest.csv            sku, brand, host, hash, file, bytes, md5, jpeg_valid
images/ledger.db               sku → status, attempts, host, last_error (resume-safe)
```

## 6. Integration with the WooCommerce sync

- Images attach in the **image pass** (`PLAN.md` §P8), after the products exist — never as a separate
  manual step, so re-runs are idempotent.
- Match on `sku`; upload via `POST /wp-json/wc/v3/products/<id>` with the image payload, or the media
  endpoint first and then attach.
- Set `alt` text from the product name (sheet `Short Description`), and keep the source hash in a
  private meta field so the same image is never uploaded twice.
- Managed-field rule from `PLAN.md` §5 still holds: the sync never *blanks* an image a staff member
  uploaded — it only fills gaps.

## 7. Guardrails

- **We are a guest on these dealer sites.** 1 request/second per host, spread across hosts, and never
  re-fetch a page or image already in the cache. A stopped run resumes from the ledger.
- **Validate every download** (JPEG magic bytes + minimum size) so an HTML error page never lands in
  `images/` as a `.jpg`.
- **The images belong to the manufacturer.** Gerber is an authorized dealer for these brands, which is
  the intended use — but at this volume the *cleanest* route is asking MicroD/Revalize for the official
  dealer image feed. This plan is the path that works today, not the only one.
- **Long-term sync health:** once images are attached, a later re-run must not re-download what is
  already in the manifest.

## 8. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| I1 | Image size | `w_1000` (~120 KB) — store-adequate, ~750 MB, faster to upload |
| I2 | Pilot first? | yes — 200 SKUs, reviewed, then the full sweep |
| I3 | A-America (49 SKUs) | Wayback, or one more dealer host |
| I4 | Long-tail brands (~166 SKUs) | hunt one host per brand; accept gaps beyond that |
| I5 | Official feed | ask Gerber's MicroD rep in parallel — it would replace this whole pipeline |
| I6 | Hosting the images | serve from the store's own media library (default), not a hotlink to the CDN |

---

*Source of truth for this plan: `content/microd-image-plan.md` in the repo. Findings, host table and
evidence: `PLAN.md` §13 in the Gerber import workspace. Measured 2026-10-05.*
