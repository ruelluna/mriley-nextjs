import type { Metadata } from "next";
import Link from "next/link";
import SyncPager from "@/components/sync-pager";
import SyncTable from "@/components/sync-table";
import { day, loadSnapshot, money } from "@/lib/sync-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Uploaded · Sync console",
  description: "Everything the daily sync pushed to gerbersfurniture.com, newest batch first.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const PER = 50;

export default async function UploadedPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim().toLowerCase();
  const brand = one(sp.brand);
  const action = one(sp.action);
  const batch = one(sp.batch);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const { data, error } = loadSnapshot();
  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Uploaded</h1>
        <p className="mt-3 text-sm text-amber-800">No snapshot available: {error}</p>
      </main>
    );
  }

  const brands = Array.from(new Set(data.uploaded.map((r) => r.brand).filter(Boolean))).sort();
  const batches = Array.from(new Set(data.uploaded.map((r) => r.batch).filter(Boolean))).sort().reverse();
  const actions = Array.from(new Set(data.uploaded.map((r) => r.action).filter(Boolean))).sort();

  const rows = data.uploaded.filter((r) => {
    if (brand && r.brand !== brand) return false;
    if (action && r.action !== action) return false;
    if (batch && r.batch !== batch) return false;
    if (q) {
      const hay = `${r.name} ${r.sku} ${r.brand} ${r.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PER));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * PER, current * PER);
  const params = { q: q || undefined, brand: brand || undefined, action: action || undefined, batch: batch || undefined };
  const value = data.uploaded.reduce((n, r) => n + (Number(r.price) || 0), 0);

  const select = "rounded-lg border border-black/[.12] bg-transparent px-2 py-1.5 text-sm dark:border-white/[.2]";

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Uploaded to the store</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total.toLocaleString()} of {data.uploaded.length.toLocaleString()} pushed products
            {batch ? ` · batch ${day(batch)}` : ""} · {money(String(value))} of retail in this view
          </p>
        </div>
        <span className="flex flex-wrap gap-x-4 text-sm text-zinc-500">
          <Link href="/sync" className="underline-offset-4 hover:underline">
            ← Console
          </Link>
          <Link href="/sync/queue" className="underline-offset-4 hover:underline">
            Queue →
          </Link>
        </span>
      </header>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, SKU, brand…"
          className="min-w-[220px] flex-1 rounded-lg border border-black/[.12] bg-transparent px-3 py-1.5 text-sm dark:border-white/[.2]"
        />
        <select name="brand" defaultValue={brand} className={select}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={action} className={select}>
          <option value="">Any state</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select name="batch" defaultValue={batch} className={select}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {day(b)}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black">
          Filter
        </button>
        {q || brand || action || batch ? (
          <Link href="/sync/uploaded" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
            clear
          </Link>
        ) : null}
      </form>

      <SyncTable rows={slice} />

      {total > PER ? (
        <SyncPager base="/sync/uploaded" params={params} page={current} pages={pages} total={total} from={(current - 1) * PER + 1} to={(current - 1) * PER + slice.length} />
      ) : null}

      <p className="mt-8 text-xs text-zinc-500">
        Published rows link to the live product page. Draft rows are in the store but not visible to customers — see{" "}
        <Link href="/sync/queue" className="underline-offset-4 hover:underline">
          the queue
        </Link>
        .
      </p>
    </main>
  );
}
