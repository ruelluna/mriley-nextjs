import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SyncItem = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: string;
  image: string | null;
  store_url: string;
  woo_id: number | null;
  batch: string;
  action: string;
  reason?: string;
};

export type SyncSnapshot = {
  generated_at: string;
  sheet: { sha256: string; changed_at: string; rows: number; priced_rows: number };
  run: { uploaded: number; published: number; drafts: number; failed: number };
  uploaded: SyncItem[];
  queue: SyncItem[];
  totals: { live: number; drafts: number; by_reason: Record<string, number> };
};

const FILE = join(process.cwd(), "data", "gerber-sync.json");

export function loadSnapshot(): { data: SyncSnapshot | null; error: string | null } {
  try {
    const raw = readFileSync(FILE, "utf8");
    return { data: JSON.parse(raw) as SyncSnapshot, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function day(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function stamp(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date}, ${time} UTC`;
}

export function money(v: string): string {
  const n = Number(v);
  if (!v || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "3 days ago" — used for the sheet's last change, so staleness is obvious. */
export function ago(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export const REASON_STYLE: Record<string, string> = {
  "no photo": "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  "no price": "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  held: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  duplicate: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  unknown: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export const ACTION_STYLE: Record<string, string> = {
  published: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  draft: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  held: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  duplicate: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
};

export function hrefWith(base: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const merged = { ...params, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
