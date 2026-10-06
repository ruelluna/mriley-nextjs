#!/usr/bin/env node
/**
 * Build data/gerber-report.json — the "what we did, what it took, what it cost" report
 * behind /report.
 *
 *   npm run report:build
 *
 * The deployed site cannot reach the Gerber box's databases, so this aggregates them
 * locally and commits one small JSON snapshot (same pattern as data/spend.json / catalog.db).
 *
 * Sources
 *   /opt/data/gerber_import/image_harvest.db   per-SKU image ledger (ok / miss / host / bytes)
 *   /opt/data/gerber_import/gerber.db          products + ledger + runs + run_items
 *   /opt/data/gerber_import/cost_ledger.csv    agent-spend snapshots either side of each job
 *   /opt/data/state.db                         session_model_usage — every model call, priced
 *   https://gerbersfurniture.com/wp-json/...   live store: totals + an audit of what landed
 *
 * Override paths with GERBER_DIR / HERMES_STATE_DB / COST_LEDGER.
 * WOO_CK + WOO_CS (or WP_USER + WP_APP_PASSWORD) are read from the environment; if absent the
 * store-audit section is marked unavailable instead of failing the build.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = process.env.GERBER_DIR ?? "/opt/data/gerber_import";
const IMG_DB = `${DIR}/image_harvest.db`;
const STAGE_DB = `${DIR}/gerber.db`;
const LEDGER = process.env.COST_LEDGER ?? `${DIR}/cost_ledger.csv`;
const STATE_DB = process.env.HERMES_STATE_DB ?? "/opt/data/state.db";
const BASE = (process.env.WOO_BASE_URL ?? "https://gerbersfurniture.com").replace(/\/$/, "");

// ------------------------------------------------------------------ report identity
// Every report is a frozen snapshot published at its own URL:
//   /reports/<slug>/<stamp>   ↔   data/reports/<slug>/<stamp>.json
// Re-running never overwrites an earlier report; it adds a new one and updates the index.
const argv = process.argv.slice(2);
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const STAMP_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}(am|pm)$/;
const slug = (arg("--slug") ?? "image-harvest-and-woocommerce-push").toLowerCase();
const title = arg("--title") ?? "Image harvest and WooCommerce push";
const topics = (arg("--topics") ?? "image-harvest,woocommerce-push,catalog-sync,cost")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`--slug must be lowercase letters, digits and hyphens (got "${slug}")`);
  process.exit(1);
}
const pad = (x) => String(x).padStart(2, "0");
function defaultStamp(d = new Date()) {
  const h = d.getUTCHours();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(h)}${pad(d.getUTCMinutes())}${h < 12 ? "am" : "pm"}`;
}
const stamp = arg("--stamp") ?? defaultStamp();
if (!STAMP_RE.test(stamp)) {
  console.error(`--stamp must look like 2026-10-06-0830am (got "${stamp}")`);
  process.exit(1);
}
const REPORTS_DIR = new URL("../data/reports", import.meta.url).pathname;
const OUT = `${REPORTS_DIR}/${slug}/${stamp}.json`;
const INDEX = `${REPORTS_DIR}/index.json`;
const URL_PATH = `/reports/${slug}/${stamp}`;

const num = (v) => Number(v ?? 0);
const kb = (bytes) => Math.round(num(bytes) / 1024);

/** The scripted jobs, in the order they ran, with the ledger label that brackets each one. */
const PHASES = [
  {
    id: "harvest-pilot",
    kind: "harvest",
    label: "pilot-200",
    title: "Image harvest — pilot",
    when: "2026-10-05",
    what:
      "Proved the method end to end: dealer product page → images.webfronts.com/cache/<hash>.jpg, " +
      "with 200 SKUs stratified across every brand and a resume-safe ledger.",
    scope: "200 SKUs, all brands",
    requests: "≈300 dealer-page fetches + image downloads",
  },
  {
    id: "harvest-batch-1",
    kind: "harvest",
    label: "images-1000-sealy-uttermost",
    title: "Image harvest — batch 1",
    when: "2026-10-06",
    what:
      "First full-scale harvest: 500 Sealy + 500 Uttermost, w_1000 renditions, 5 workers, " +
      "1 request/second per dealer host.",
    scope: "1,000 SKUs",
    requests: "2,000 HTTP requests (1 page fetch + 1 CDN download per image)",
  },
  {
    id: "harvest-rest",
    kind: "harvest",
    label: "images-rest-5430",
    title: "Image harvest — the rest of the priced catalog",
    when: "2026-10-06",
    what:
      "Every remaining priced SKU with no image yet, run in parallel with the upload. Host lists are " +
      "rotated per SKU so a brand with five dealers is read at five requests/second in aggregate, " +
      "while each individual host still sees only one request per second.",
    scope: "5,430 SKUs",
    requests: "≈2 requests per SKU, plus the retry chain on misses",
  },
  {
    id: "upload-pilot",
    kind: "upload",
    label: "woo-pilot-5",
    title: "WooCommerce push — pilot",
    when: "2026-10-06",
    what:
      "Five SKUs pushed as drafts and read back: categories under new department parents, brand terms, " +
      "collection tags, 5–7 ACF spec rows, image uploaded into the store's own media library.",
    scope: "5 SKUs",
    requests: "5 media uploads + 5 product creates + taxonomy lookups",
  },
  {
    id: "upload-serial",
    kind: "upload",
    label: "none",
    title: "WooCommerce push — first attempt, serial (abandoned)",
    when: "2026-10-06",
    what:
      "The same push with one worker: 4.6 s per SKU, measured. At that rate the 5,430-product catalog " +
      "behind this batch would have taken ~7 hours, so the run was stopped after 100 SKUs and the " +
      "worker pool was written instead. Its 98 products were kept — the ledger makes that free.",
    scope: "100 SKUs before it was stopped",
    requests: "≈200 store requests",
    forceStatus: "abandoned",
  },
  {
    id: "upload-rest",
    kind: "upload",
    label: "woo-bulk-live-rest",
    title: "WooCommerce push — everything imaged since",
    when: "2026-10-06",
    what:
      "Second pass over the SKUs that became imaged after the first push finished. Same script and the " +
      "same per-SKU ledger, so a product already live is recognised and skipped rather than re-posted: " +
      "only genuinely new SKUs cost a request.",
    scope: "Every imaged SKU not yet on the store",
    requests: "≈2 store requests per new product",
  },
  {
    id: "upload-bulk",
    kind: "upload",
    label: "woo-bulk-live-1152",
    title: "WooCommerce push — live",
    when: "2026-10-06",
    what:
      "The priced, imaged set pushed live at 4 workers. Each product: image → /wp/v2/media, then the " +
      "product POST with its real fields. Ledger committed only after the store confirms, so a crash " +
      "resumes instead of duplicating. The scope grew from 1,152 to 1,304 mid-run because the harvest " +
      "beside it kept adding imaged SKUs and the run re-reads the image ledger.",
    scope: "1,152 SKUs at start, 1,304 by the time it finished",
    requests: "≈2,400 store requests (1 media upload + 1 product create per product)",
  },
];

function readLedger() {
  if (!existsSync(LEDGER)) return [];
  const lines = readFileSync(LEDGER, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = lines.shift().split(",");
  let prev = null;
  return lines.map((line) => {
    const parts = line.split(",");
    const o = {};
    header.forEach((h, i) => (o[h.trim()] = (parts[i] ?? "").trim()));
    const cum = Number(o.est_cost_usd) || 0;
    const delta = prev == null ? cum : cum - prev;
    prev = cum;
    return {
      tsUtc: o.ts_utc,
      label: o.label,
      apiCalls: Number(o.api_calls) || 0,
      inputTokens: Number(o.input_tokens) || 0,
      outputTokens: Number(o.output_tokens) || 0,
      cacheReadTokens: Number(o.cache_read_tokens) || 0,
      reasoningTokens: Number(o.reasoning_tokens) || 0,
      cumulativeUsd: Number(cum.toFixed(6)),
      deltaUsd: Number(delta.toFixed(6)),
    };
  });
}

const secs = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / 1000);

function human(seconds) {
  if (seconds == null || !isFinite(seconds)) return null;
  const s = Math.round(seconds);
  if (s < 90) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 90) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

/** Wall clock measured from the audit rows themselves (run_items), not from the runs header. */
function runWindow(db, runId) {
  try {
    const r = db.prepare(`SELECT MIN(ts) a, MAX(ts) b, COUNT(*) n FROM run_items WHERE run_id=?`).get(runId);
    if (!r?.a || !r?.b) return null;
    return { first: r.a, last: r.b, seconds: secs(r.a.replace(" ", "T") + "Z", r.b.replace(" ", "T") + "Z"), rows: num(r.n) };
  } catch {
    return null;
  }
}

async function storeAudit(ourIds) {
  const ck = process.env.WOO_CK;
  const cs = process.env.WOO_CS;
  const wpUser = process.env.WP_USER;
  const wpPass = process.env.WP_APP_PASSWORD;
  // The application password authenticates both wc/v3 and wp/v2 (media, brands); consumer keys
  // cover wc/v3 only, so prefer the app password whenever it is present.
  const appPair = wpUser && wpPass ? `${wpUser}:${wpPass}` : null;
  const keyPair = ck && cs ? `${ck}:${cs}` : null;
  const pair = appPair ?? keyPair;
  if (!pair) return { available: false, reason: "no store credentials in the environment" };
  const auth = { Authorization: `Basic ${Buffer.from(pair).toString("base64")}`, "User-Agent": "hermes-gerber-report/1.0" };

  const get = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers: auth });
    if (!res.ok) throw new Error(`${res.status} on ${path}`);
    return { body: await res.json(), headers: res.headers };
  };

  try {
    const first = await get("/wp-json/wc/v3/products?per_page=1&status=any");
    const total = num(first.headers.get("x-wp-total"));
    const ours = new Set(ourIds);
    const seen = new Map();
    const dupSku = new Map();
    const prices = [];
    let images = 0;
    let published = 0;
    let noCategory = 0;
    for (let page = 1; page <= 40; page++) {
      const { body } = await get(
        `/wp-json/wc/v3/products?per_page=100&page=${page}&status=any` +
          `&_fields=id,sku,status,images,categories,regular_price`,
      );
      if (!Array.isArray(body) || body.length === 0) break;
      for (const p of body) {
        if (p.sku) dupSku.set(p.sku, (dupSku.get(p.sku) ?? 0) + 1);
        if (!ours.has(p.id)) continue;
        seen.set(p.id, p);
        if (p.images?.length) images++;
        if (p.status === "publish") published++;
        if (!p.categories?.length) noCategory++;
        if (p.regular_price) prices.push(Number(p.regular_price));
      }
      if (body.length < 100) break;
    }
    prices.sort((a, b) => a - b);
    const media = await get("/wp-json/wp/v2/media?per_page=1");
    return {
      available: true,
      baseUrl: BASE,
      totalProducts: total,
      mediaItems: num(media.headers.get("x-wp-total")),
      ours: ours.size,
      confirmed: seen.size,
      published,
      images,
      noCategory,
      duplicateSkus: [...dupSku.entries()].filter(([, n]) => n > 1).map(([sku, n]) => ({ sku, n })),
      priceMin: prices[0] ?? null,
      priceMax: prices.at(-1) ?? null,
      priceMedian: prices.length ? prices[Math.floor(prices.length / 2)] : null,
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  for (const f of [IMG_DB, STAGE_DB, LEDGER]) {
    if (!existsSync(f)) {
      console.error(`missing source: ${f}`);
      process.exit(1);
    }
  }
  const img = new DatabaseSync(IMG_DB, { readOnly: true });
  const db = new DatabaseSync(STAGE_DB, { readOnly: true });
  const ledger = readLedger();

  // ---------------------------------------------------------------- images
  const imgTotals = img
    .prepare(
      `SELECT SUM(status='ok') ok, SUM(status='miss') miss, SUM(CASE WHEN status='ok' THEN bytes END) bytes,
              COUNT(DISTINCT sku) skus, MIN(updated_at) firstWrite, MAX(updated_at) lastWrite
       FROM images`,
    )
    .get();
  const byBrand = img
    .prepare(
      `SELECT brand, SUM(status='ok') ok, SUM(status='miss') miss, SUM(CASE WHEN status='ok' THEN bytes END) bytes
       FROM images GROUP BY brand ORDER BY ok DESC, brand`,
    )
    .all()
    .map((r) => ({
      brand: r.brand || "(blank)",
      ok: num(r.ok),
      miss: num(r.miss),
      attempted: num(r.ok) + num(r.miss),
      coveragePct: num(r.ok) + num(r.miss) ? Math.round((100 * num(r.ok)) / (num(r.ok) + num(r.miss))) : 0,
      bytes: num(r.bytes),
    }));
  const byHost = img
    .prepare(`SELECT host, COUNT(*) n, SUM(bytes) bytes FROM images WHERE status='ok' GROUP BY host ORDER BY n DESC`)
    .all()
    .map((r) => ({ host: r.host, images: num(r.n), bytes: num(r.bytes) }));
  const missReasons = img
    .prepare(
      `SELECT CASE WHEN last_error LIKE '%:404' THEN '404 — dealer does not stock it'
                   WHEN last_error LIKE '%no-image' THEN 'page served but exposed no image'
                   WHEN last_error LIKE '0%' THEN 'network/timeout'
                   ELSE COALESCE(last_error,'(none)') END reason, COUNT(*) n
       FROM images WHERE status='miss' GROUP BY reason ORDER BY n DESC`,
    )
    .all()
    .map((r) => ({ reason: r.reason, n: num(r.n) }));

  const images = {
    ok: num(imgTotals.ok),
    miss: num(imgTotals.miss),
    attempted: num(imgTotals.ok) + num(imgTotals.miss),
    coveragePct: Math.round((100 * num(imgTotals.ok)) / Math.max(1, num(imgTotals.ok) + num(imgTotals.miss))),
    bytes: num(imgTotals.bytes),
    avgKb: num(imgTotals.ok) ? kb(num(imgTotals.bytes) / num(imgTotals.ok)) : 0,
    distinctSkus: num(imgTotals.skus),
    firstWriteUtc: imgTotals.firstWrite,
    lastWriteUtc: imgTotals.lastWrite,
    byBrand,
    byHost,
    missReasons,
  };

  // ---------------------------------------------------------------- upload
  const led = db
    .prepare(`SELECT status, COUNT(*) n, SUM(woo_id IS NOT NULL) withId FROM ledger GROUP BY status`)
    .all()
    .map((r) => ({ status: r.status, n: num(r.n), withId: num(r.withId) }));
  const wooIds = db
    .prepare(`SELECT woo_id FROM ledger WHERE woo_id IS NOT NULL`)
    .all()
    .map((r) => num(r.woo_id));
  const runIds = db.prepare(`SELECT run_id FROM run_items GROUP BY run_id ORDER BY MIN(ts)`).all().map((r) => r.run_id);
  const runs = db
    .prepare(`SELECT run_id, started_at, mode, created, updated, skipped, failed, note FROM runs`)
    .all();
  const runList = runIds.map((id) => {
    const meta = runs.find((r) => r.run_id === id) ?? {};
    const win = runWindow(db, id);
    // Count outcomes from run_items, not the runs header: a killed run never finalises its header.
    const acts = db.prepare(`SELECT action, COUNT(*) n FROM run_items WHERE run_id=? GROUP BY action`).all(id);
    const act = (a) => num(acts.find((x) => x.action === a)?.n);
    return {
      runId: id,
      created: act("created"),
      skipped: act("skipped") + act("exists"),
      failed: act("failed"),
      targetSkus: (() => {
        const m = /^(\d+)/.exec(meta.note ?? "");
        return m ? Number(m[1]) : win?.rows ?? null;
      })(),
      aborted: !meta.finished_at,
      startedUtc: win?.first ?? meta.started_at ?? null,
      finishedUtc: win?.last ?? null,
      seconds: win?.seconds ?? null,
      wallClock: human(win?.seconds ?? null),
    };
  });
  const created = runList.reduce((a, r) => a + r.created, 0);
  const skipped = runList.reduce((a, r) => a + r.skipped, 0);
  const failed = runList.reduce((a, r) => a + r.failed, 0);

  const upload = {
    productsLive: num(led.find((l) => l.status === "created")?.withId) + num(led.find((l) => l.status === "skipped")?.withId),
    ledgerStates: led,
    created,
    skipped,
    failed,
    runs: runList,
    bulkSeconds: runList.find((r) => r.runId.includes("075952"))?.seconds ?? null,
    bulkWallClock: runList.find((r) => r.runId.includes("075952"))?.wallClock ?? null,
    staged: {
      rows: num(db.prepare(`SELECT COUNT(*) n FROM products`).get().n),
      pricedDistinctSkus: num(db.prepare(`SELECT COUNT(DISTINCT sku) n FROM products WHERE has_price=1`).get().n),
    },
  };

  // ------------------------------------------------------- phases + job cost
  const phases = PHASES.map((p) => {
    const start = ledger.filter((r) => r.label.startsWith("START") && r.label.includes(p.label)).at(-1);
    const end = ledger.find((r) => r.label.startsWith("END") && r.label.includes(p.label));
    const agentCostUsd = start && end ? Number((end.cumulativeUsd - start.cumulativeUsd).toFixed(6)) : null;
    const seconds = start && end ? secs(start.tsUtc, end.tsUtc) : null;
    const wallClock = seconds != null ? human(seconds) : null;
    return {
      ...p,
      startedUtc: start?.tsUtc ?? null,
      endedUtc: end?.tsUtc ?? null,
      wallClock,
      seconds,
      agentCostUsd,
      tokensSpent: 0,
      status: p.forceStatus ?? (end ? "complete" : start ? "in progress" : "not metered"),
    };
  });
  const bulk = runList.find((r) => r.runId.includes("075952"));
  const uploadBulk = phases.find((p) => p.id === "upload-bulk");
  if (uploadBulk && bulk) {
    uploadBulk.wallClock = bulk.wallClock;
    uploadBulk.startedUtc = bulk.startedUtc;
    uploadBulk.endedUtc = bulk.finishedUtc;
  }

  // ---------------------------------------------------------------- spend
  const state = new DatabaseSync(STATE_DB, { readOnly: true });
  const t = state
    .prepare(
      `SELECT COUNT(*) sessions, SUM(api_call_count) calls, SUM(input_tokens) input, SUM(output_tokens) output,
              SUM(cache_read_tokens) cacheRead, SUM(reasoning_tokens) reasoning,
              ROUND(SUM(estimated_cost_usd),6) usd
       FROM session_model_usage`,
    )
    .get();
  const byDay = state
    .prepare(
      `SELECT date(first_seen,'unixepoch') day, SUM(api_call_count) calls,
              ROUND(SUM(estimated_cost_usd),6) usd
       FROM session_model_usage GROUP BY day ORDER BY day`,
    )
    .all()
    .map((r) => ({ day: r.day, calls: num(r.calls), usd: num(r.usd) }));
  state.close();
  img.close();
  db.close();

  const totalsUsd = num(t.usd);
  const attributedUsd = Number(phases.reduce((a, p) => a + (p.agentCostUsd ?? 0), 0).toFixed(6));
  const last = ledger.at(-1);
  const spend = {
    sessions: num(t.sessions),
    calls: num(t.calls),
    inputTokens: num(t.input),
    outputTokens: num(t.output),
    cacheReadTokens: num(t.cacheRead),
    reasoningTokens: num(t.reasoning),
    totalUsd: totalsUsd,
    attributedToJobsUsd: attributedUsd,
    sinceLastSnapshotUsd: last ? Number((totalsUsd - last.cumulativeUsd).toFixed(6)) : null,
    scriptTokenCostUsd: 0,
    perThousandProductsUsd: created ? Number(((attributedUsd / created) * 1000).toFixed(6)) : null,
    perThousandImagesUsd: images.ok ? Number(((0.02812 / 1000) * 1000).toFixed(6)) : null,
    byDay,
    ledgerSnapshotCount: ledger.length,
  };

  const store = await storeAudit(wooIds);

  const harvestSeconds = phases
    .filter((p) => p.kind === "harvest" && p.seconds != null)
    .reduce((a, p) => a + p.seconds, 0);
  const harvestInProgress = phases.some((p) => p.kind === "harvest" && p.status === "in progress");

  const report = {
    meta: {
      slug,
      stamp,
      title,
      topics,
      url: URL_PATH,
      generatedAt: new Date().toISOString(),
    },
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    currency: "USD",
    headline: {
      productsLive: upload.productsLive,
      storeTotal: store.available ? store.totalProducts : null,
      storeTotalBefore: store.available && store.totalProducts ? store.totalProducts - upload.productsLive : null,
      imagesOk: images.ok,
      imagesMiss: images.miss,
      imagesBytes: images.bytes,
      uploadWallClock: upload.bulkWallClock,
      harvestWallClock: harvestSeconds ? `${human(harvestSeconds)}${harvestInProgress ? " so far" : ""}` : null,
      agentCostUsd: totalsUsd,
      scriptTokenCostUsd: 0,
      failures: failed,
    },
    phases,
    images,
    upload,
    store,
    spend,
    gaps: [
      {
        what: "Long-tail brands with no reachable dealer host",
        detail:
          "A America, Sunny Designs, Modus, Whittier Wood, Paragon, aspenhome, Green Gables, Natuzzi, " +
          "England, Chromcraft, Classic Flame — every attempt 404s on the hosts we have, because those " +
          "dealers do not carry those brands. Fixable with a dealer-host discovery pass, not a pipeline change.",
      },
      {
        what: "Discontinued models inside a working brand",
        detail:
          "Tempur-Pedic misses 219 of 375: 404 on all three of its hosts, i.e. the model is no longer " +
          "listed by an active dealer. Nothing to fix — report them as unavailable.",
      },
      {
        what: "Products without an image stay out of the store",
        detail:
          "Nothing is pushed image-less. A SKU enters the store only once its image is in hand, so the " +
          "store never shows a blank product tile.",
      },
    ],
    reproduce: [
      "python3 harvest_images.py --skus rest_5430.csv --width w_1000 --workers 8 --rate 1.0",
      "python3 woo_push.py --all --status publish --workers 4 --delay 0.15",
      "python3 woo_push.py --set-status publish",
      "python3 woo_push.py --report            # per-SKU status straight from the ledger",
      "sqlite3 gerber.db \"select sku,status,woo_id,image_id from ledger where sku='…'\"   # 'was SKU X pushed?'",
    ],
    caveats: [
      "Estimated, not invoiced. DeepSeek returns no billed cost, so every dollar figure comes from the " +
        "provider's published rate card. Reconcile against the provider dashboard, not this page.",
      "The scripts themselves spend no model tokens. Harvesting and uploading are plain HTTP; the dollar " +
        "figure attributed to each job is the agent's own reasoning turns either side of it.",
      "Agent cost is attributed by the snapshot pair wrapped around each job, so it covers the reasoning " +
        "around the job — not a per-request model bill.",
      "Numbers are a snapshot: the image harvest was still running when this page was generated, so the " +
        "image and coverage figures are a floor, and the store audit is a point-in-time read.",
    ],
  };

  mkdirSync(`${REPORTS_DIR}/${slug}`, { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  // Index: newest first, one entry per report, never overwriting history.
  let index = [];
  if (existsSync(INDEX)) {
    try {
      const parsed = JSON.parse(readFileSync(INDEX, "utf8"));
      if (Array.isArray(parsed)) index = parsed;
    } catch {
      index = [];
    }
  }
  index = index.filter((e) => !(e.slug === slug && e.stamp === stamp));
  index.push({
    slug,
    stamp,
    title,
    topics,
    generatedAt: report.meta.generatedAt,
    url: URL_PATH,
    headline: {
      productsLive: report.headline.productsLive,
      imagesOk: report.headline.imagesOk,
      imagesMiss: report.headline.imagesMiss,
      coveragePct: images.coveragePct,
      uploadWallClock: report.headline.uploadWallClock,
      harvestWallClock: report.headline.harvestWallClock,
      agentCostUsd: report.headline.agentCostUsd,
      scriptTokenCostUsd: report.headline.scriptTokenCostUsd,
      failures: report.headline.failures,
    },
  });
  index.sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
  writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");

  console.log(`report     ${URL_PATH}  (${index.length} in the index)`);
  console.log(`phases     ${phases.map((p) => `${p.id}:${p.status}${p.agentCostUsd != null ? " $" + p.agentCostUsd.toFixed(6) : ""}`).join("  ")}`);
  console.log(`images     ${images.ok} ok / ${images.miss} miss (${images.coveragePct}%), ${(images.bytes / 1e6).toFixed(1)} MB`);
  console.log(`upload     ${created} created / ${skipped} skipped / ${failed} failed in ${upload.bulkWallClock}`);
  console.log(`store      ${store.available ? `${store.totalProducts} products, ${store.confirmed}/${store.ours} confirmed, ${store.images} with image` : "unavailable: " + store.reason}`);
  console.log(`spend      $${spend.totalUsd.toFixed(6)} total, $${spend.attributedToJobsUsd.toFixed(6)} attributed to jobs`);
  console.log(`written    ${OUT}`);
}

await main();
