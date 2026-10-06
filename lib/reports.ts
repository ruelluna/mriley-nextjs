import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Report artefacts live as frozen JSON snapshots, one file per report:
 *
 *   data/reports/index.json                     newest-first index of every report
 *   data/reports/<slug>/<stamp>.json            one immutable report
 *
 * The URL mirrors the file path — /reports/<slug>/<stamp> — so a report link always
 * shows the numbers as they were when that report was generated, even after later
 * runs. `npm run report:build` appends a new file rather than overwriting one.
 */

export type ReportMeta = {
  slug: string;
  stamp: string;
  title: string;
  topics: string[];
  url: string;
  generatedAt: string;
};

export type Phase = {
  id: string;
  kind: string;
  title: string;
  when: string;
  what: string;
  scope: string;
  requests: string;
  startedUtc: string | null;
  endedUtc: string | null;
  wallClock: string | null;
  seconds: number | null;
  agentCostUsd: number | null;
  tokensSpent: number;
  status: string;
};

export type Report = {
  meta: ReportMeta;
  generatedAt: string;
  baseUrl: string;
  currency: string;
  headline: {
    productsLive: number;
    storeTotal: number | null;
    storeTotalBefore: number | null;
    imagesOk: number;
    imagesMiss: number;
    imagesBytes: number;
    uploadWallClock: string | null;
    harvestWallClock: string | null;
    agentCostUsd: number;
    scriptTokenCostUsd: number;
    failures: number;
  };
  phases: Phase[];
  images: {
    ok: number;
    miss: number;
    attempted: number;
    coveragePct: number;
    bytes: number;
    avgKb: number;
    distinctSkus: number;
    firstWriteUtc: string;
    lastWriteUtc: string;
    byBrand: { brand: string; ok: number; miss: number; attempted: number; coveragePct: number; bytes: number }[];
    byHost: { host: string; images: number; bytes: number }[];
    missReasons: { reason: string; n: number }[];
  };
  upload: {
    productsLive: number;
    createdByUs?: number;
    alreadyOnStore?: number;
    created: number;
    skipped: number;
    failed: number;
    bulkWallClock: string | null;
    staged: { rows: number; pricedDistinctSkus: number };
    runs: {
      runId: string;
      created: number;
      skipped: number;
      failed: number;
      targetSkus: number | null;
      aborted: boolean;
      startedUtc: string | null;
      finishedUtc: string | null;
      wallClock: string | null;
    }[];
  };
  store:
    | {
        available: true;
        baseUrl: string;
        totalProducts: number;
        mediaItems: number;
        ours: number;
        confirmed: number;
        published: number;
        images: number;
        noCategory: number;
        duplicateSkus: { sku: string; n: number }[];
        priceMin: number | null;
        priceMax: number | null;
        priceMedian: number | null;
        checkedAt: string;
      }
    | { available: false; reason: string };
  spend: {
    sessions: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    reasoningTokens: number;
    totalUsd: number;
    attributedToJobsUsd: number;
    sinceLastSnapshotUsd: number | null;
    scriptTokenCostUsd: number;
    perThousandProductsUsd: number | null;
    byDay: { day: string; calls: number; usd: number }[];
    ledgerSnapshotCount: number;
  };
  gaps: { what: string; detail: string }[];
  reproduce: string[];
  caveats: string[];
};

export type ReportIndexEntry = {
  slug: string;
  stamp: string;
  title: string;
  topics: string[];
  generatedAt: string;
  url: string;
  headline: {
    productsLive: number;
    imagesOk: number;
    imagesMiss: number;
    coveragePct: number;
    uploadWallClock: string | null;
    harvestWallClock: string | null;
    agentCostUsd: number;
    scriptTokenCostUsd: number;
    failures: number;
  };
};

const ROOT = join(process.cwd(), "data", "reports");

export function listReports(): ReportIndexEntry[] {
  const file = join(ROOT, "index.json");
  if (!existsSync(file)) return [];
  try {
    const list = JSON.parse(readFileSync(file, "utf8")) as ReportIndexEntry[];
    return Array.isArray(list) ? [...list].sort((a, b) => (a.stamp < b.stamp ? 1 : -1)) : [];
  } catch {
    return [];
  }
}

export function getReport(slug: string, stamp: string): Report | null {
  // Reject anything that could climb out of data/reports before touching the filesystem.
  if (!/^[a-z0-9-]+$/.test(slug) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}(am|pm)$/.test(stamp)) return null;
  const file = join(ROOT, slug, `${stamp}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Report;
  } catch {
    return null;
  }
}

export function latestReport(): ReportIndexEntry | null {
  return listReports()[0] ?? null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-06-0830am` → `Oct 6, 2026 · 8:30 AM` */
export function formatStamp(stamp: string): string {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})-([0-9]{2})([0-9]{2})(am|pm)$/.exec(stamp);
  if (!m) return stamp;
  const [, y, mo, d, hh, mm, ap] = m;
  const hour12 = Number(hh) % 12 === 0 ? 12 : Number(hh) % 12;
  return `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y} · ${hour12}:${mm} ${ap.toUpperCase()}`;
}

/** `image-harvest-and-woocommerce-push` → `Image harvest and WooCommerce push` (title-cased enough) */
export function humanizeSlug(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
