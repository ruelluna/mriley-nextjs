#!/usr/bin/env node
/**
 * Build data/spend.json — the agent-spend snapshot behind /costs.
 *
 * The deployed site cannot reach the Hermes state database (it lives on the Gerber box at
 * /opt/data/state.db), so this script aggregates it locally and commits a small JSON
 * snapshot, exactly like data/catalog.db works for products.
 *
 *   npm run spend:build
 *
 * Sources
 *   /opt/data/state.db → session_model_usage   every API call Hermes made, with
 *                                              estimated_cost_usd priced from the provider's
 *                                              published rate card
 *   /opt/data/gerber_import/cost_ledger.csv    per-job START/END snapshots (cost_ledger.py)
 *
 * Override with HERMES_STATE_DB / COST_LEDGER env vars.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STATE_DB = process.env.HERMES_STATE_DB ?? "/opt/data/state.db";
const LEDGER = process.env.COST_LEDGER ?? "/opt/data/gerber_import/cost_ledger.csv";
const OUT = new URL("../data/spend.json", import.meta.url).pathname;

/** Non-LLM batches, attributed from the ledger rows whose label matches `label`. */
const JOBS = [
  {
    id: "images-batch-1",
    label: "images-1000-sealy-uttermost",
    title: "Image harvest — batch 1",
    detail: "1,000 SKUs (500 Sealy + 500 Uttermost) · width w_1000 · 5 workers · 1 req/s per host",
    skus: 1000,
    images: 1000,
    misses: 0,
    wallClock: "16m36s",
    imagesAttachedToSite: 1152,
    bytes: 82.9e6,
    tokensSpent: 0,
    note:
      "The harvest is plain HTTP: 1,000 dealer-page fetches + 1,000 CDN downloads. It spends no " +
      "tokens at all — the dollar figure is the agent turns around a 16-minute job.",
  },
  {
    id: "images-pilot",
    label: "pilot-200",
    title: "Image harvest — pilot (200 SKUs, all brands)",
    detail: "200 SKUs stratified across every brand · the run that proved the method",
    skus: 200,
    images: 152,
    misses: 48,
    wallClock: "48s (48-SKU second pass)",
    imagesAttachedToSite: 152,
    bytes: 0,
    tokensSpent: 0,
    note:
      "100% on every brand whose dealer host was known; 0% on the long-tail brands whose host is " +
      "still unresolved — the misses are host discovery, not a broken pipeline.",
  },
];

function readLedger() {
  if (!existsSync(LEDGER)) return [];
  const lines = readFileSync(LEDGER, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = lines.shift().split(",");
  const rows = lines
    .map((line) => {
      const parts = line.split(",");
      const o = {};
      header.forEach((h, i) => (o[h.trim()] = (parts[i] ?? "").trim()));
      return o;
    })
    .filter((r) => r.ts_utc);
  let prev = null;
  return rows.map((r) => {
    const cum = Number(r.est_cost_usd) || 0;
    const delta = prev == null ? cum : cum - prev;
    prev = cum;
    return {
      tsUtc: r.ts_utc,
      label: r.label,
      apiCalls: Number(r.api_calls) || 0,
      inputTokens: Number(r.input_tokens) || 0,
      outputTokens: Number(r.output_tokens) || 0,
      cacheReadTokens: Number(r.cache_read_tokens) || 0,
      reasoningTokens: Number(r.reasoning_tokens) || 0,
      cumulativeUsd: Number(cum.toFixed(6)),
      deltaUsd: Number(delta.toFixed(6)),
    };
  });
}

function buildJobs(ledger) {
  return JOBS.map((job) => {
    const start = ledger.find((r) => r.label.startsWith("START") && r.label.includes(job.label));
    const end = ledger.find((r) => r.label.startsWith("END") && r.label.includes(job.label));
    const costUsd = start && end ? Number((end.cumulativeUsd - start.cumulativeUsd).toFixed(6)) : null;
    return {
      ...job,
      startedUtc: start?.tsUtc ?? null,
      endedUtc: end?.tsUtc ?? null,
      costUsd,
      perThousandUsd: costUsd != null && job.skus ? Number(((costUsd / job.skus) * 1000).toFixed(6)) : null,
    };
  });
}

function main() {
  if (!existsSync(STATE_DB)) {
    console.error(`state database not found: ${STATE_DB}`);
    process.exit(1);
  }
  const db = new DatabaseSync(STATE_DB, { readOnly: true });
  const num = (v) => Number(v ?? 0);

  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) sessions, SUM(api_call_count) calls, SUM(input_tokens) input,
              SUM(output_tokens) output, SUM(cache_read_tokens) cacheRead,
              SUM(cache_write_tokens) cacheWrite, SUM(reasoning_tokens) reasoning,
              ROUND(SUM(estimated_cost_usd),6) usd, ROUND(SUM(actual_cost_usd),6) actualUsd
       FROM session_model_usage`,
    )
    .get();

  const totals = {
    sessions: num(totalsRow.sessions),
    calls: num(totalsRow.calls),
    inputTokens: num(totalsRow.input),
    outputTokens: num(totalsRow.output),
    cacheReadTokens: num(totalsRow.cacheRead),
    cacheWriteTokens: num(totalsRow.cacheWrite),
    reasoningTokens: num(totalsRow.reasoning),
    estimatedUsd: num(totalsRow.usd),
    actualUsd: num(totalsRow.actualUsd),
  };

  const byDay = db
    .prepare(
      `SELECT date(first_seen,'unixepoch') day, SUM(api_call_count) calls,
              SUM(input_tokens) input, SUM(output_tokens) output,
              SUM(cache_read_tokens) cacheRead, SUM(reasoning_tokens) reasoning,
              ROUND(SUM(estimated_cost_usd),6) usd
       FROM session_model_usage GROUP BY day ORDER BY day`,
    )
    .all()
    .map((r) => ({
      day: r.day,
      calls: num(r.calls),
      inputTokens: num(r.input),
      outputTokens: num(r.output),
      cacheReadTokens: num(r.cacheRead),
      reasoningTokens: num(r.reasoning),
      usd: num(r.usd),
    }));

  const byComponent = db
    .prepare(
      `SELECT COALESCE(NULLIF(task,''),'(main turns)') component, SUM(api_call_count) calls,
              ROUND(SUM(estimated_cost_usd),6) usd
       FROM session_model_usage GROUP BY component ORDER BY usd DESC`,
    )
    .all()
    .map((r) => ({ component: r.component, calls: num(r.calls), usd: num(r.usd) }));

  const byModel = db
    .prepare(
      `SELECT model, billing_provider provider, SUM(api_call_count) calls,
              ROUND(SUM(estimated_cost_usd),6) usd
       FROM session_model_usage GROUP BY model, billing_provider ORDER BY usd DESC`,
    )
    .all()
    .map((r) => ({
      model: r.model,
      provider: r.provider || "—",
      calls: num(r.calls),
      usd: num(r.usd),
    }));

  const pricing = db
    .prepare(
      `SELECT COALESCE(cost_status,'(none)') status, COALESCE(cost_source,'(none)') source,
              COUNT(*) rows
       FROM session_model_usage GROUP BY status, source ORDER BY rows DESC`,
    )
    .all()
    .map((r) => ({ status: r.status, source: r.source, rows: num(r.rows) }));

  db.close();

  const ledger = readLedger();
  const jobs = buildJobs(ledger);

  const lastSnapshot = ledger.length ? ledger[ledger.length - 1] : null;
  const afterLastSnapshotUsd = lastSnapshot
    ? Number((totals.estimatedUsd - lastSnapshot.cumulativeUsd).toFixed(6))
    : null;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: { stateDb: STATE_DB, ledger: LEDGER },
    currency: "USD",
    totals,
    byDay,
    byComponent,
    byModel,
    pricing,
    ledger,
    afterLastSnapshotUsd,
    jobs,
    projections: [
      {
        work: "Image harvest — remaining Sealy + Uttermost (4,504 SKUs)",
        basis: "Hosts already proven; same script, no new groundwork",
        eta: "~75 min at the measured 60 SKUs/min",
        usdLow: 0.03,
        usdHigh: 0.05,
      },
      {
        work: "Image harvest — 926 SKUs on brands with no host yet",
        basis: "Per-brand dealer-host discovery: search-heavy, not download-heavy",
        eta: "depends on how many hosts resolve",
        usdLow: 0.1,
        usdHigh: 0.2,
      },
      {
        work: "WooCommerce bulk create (6,534 products)",
        basis: "Scripted REST writes — model spend is only the agent turns around the run",
        eta: "not yet estimated",
        usdLow: null,
        usdHigh: null,
      },
    ],
    caveats: [
      "Estimated, not invoiced. DeepSeek returns no billed cost, so actual_cost_usd stays 0 and " +
        "every figure comes from the provider's published rate card (cost_source " +
        "official_docs_snapshot). Reconcile against the DeepSeek dashboard, not this page.",
      "Off-peak rates. DeepSeek charges up to 2x inside its peak windows (weekdays ~01–04 and " +
        "~06–10 UTC), so a run that straddles one can cost up to double what is shown here.",
      "Cache-read tokens dominate the raw token counts but not the price — 48M cache-read tokens " +
        "bill at a fraction of the input rate. Never read them as billable input.",
      "Non-LLM work costs nothing in tokens. Downloads, database builds and deploys have no model " +
        "spend of their own; the dollar figure around them is the agent's own reasoning turns.",
    ],
  };

  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`total          $${totals.estimatedUsd.toFixed(6)}  over ${totals.calls.toLocaleString()} calls`);
  console.log(`days           ${byDay.map((d) => `${d.day} $${d.usd.toFixed(4)}`).join("  ")}`);
  console.log(`jobs           ${jobs.map((j) => `${j.title} ${j.costUsd == null ? "n/a" : "$" + j.costUsd.toFixed(6)}`).join(" | ")}`);
  console.log(`written        ${OUT}`);
}

main();
