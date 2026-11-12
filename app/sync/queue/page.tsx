import type { Metadata } from "next";
import Link from "next/link";
import SyncPager from "@/components/sync-pager";
import SyncTable from "@/components/sync-table";
import { loadSnapshot } from "@/lib/sync-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Queue · Sync console",
  description: "Products that are not live yet, each with the reason: no photo, no price, held, or duplicate.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const PER = 50;

const EXPLAIN: Record<string, string> = {
  "no photo": "Priced and in the store as a draft. The cycle re-searches the dealer sites weekly; when a photo is found it is attached and the product publishes automatically.",
  "no price": "Display Price is 0 or blank in the sheet, so it is outside the upload set.",
  held: "Listed in hold_skus.txt — deliberately not pushed until someone removes it.",
  duplicate: "SKU collides with a live product or a normalised twin; needs a human decision.",
};

export default async function QueuePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim().toLowerCase();
  const brand = one(sp.brand);
  const reason = one(sp.reason);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const { data, error } = loadSnapshot();
  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
        <p className="mt-3 text-sm text-amber-800">No snapshot available: {error}</p>
      </main>
    );
  }

  const brands = Array.from(new Set(data.queue.map((r) => r.brand).filter(Boolean))).sort();
  const reasons = Object.entries(data.totals.by_reason).sort((a, b) => b[1] - a[1]);

  const rows = data.queue.filter((r) => {
    if (reason && (r.reason ?? "unknown") !== reason) return false;
    if (brand && r.brand !== brand) return false;
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
  const params = { q: q || undefined, brand: brand || undefined, reason: reason || undefined };

  const select = "rounded-lg border border-black/[.12] bg-transparent px-2 py-1.5 text-sm dark:border-white/[.2]";
  const chip = "rounded-full border border-black/[.12] px-3 py-1 text-xs dark:border-white/[.2]";

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Not live — the queue</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total.toLocaleString()} of {data.queue.length.toLocaleString()} queued products
            {reason ? ` · ${reason}` : ""}
          </p>
        </div>
        <span className="flex flex-wrap gap-x-4 text-sm text-zinc-500">
          <Link href="/sync" className="underline-offset-4 hover:underline">
            ← Console
          </Link>
          <Link href="/sync/uploaded" className="underline-offset-4 hover:underline">
            Uploaded →
          </Link>
        </span>
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/sync/queue"
          className={`${chip} ${reason ? "" : "bg-black text-white dark:bg-white dark:text-black"}`}
        >
          all {data.queue.length.toLocaleString()}
        </Link>
        {reasons.map(([r, n]) => (
          <Link
            key={r}
            href={`/sync/queue?reason=${encodeURIComponent(r)}`}
            className={`${chip} ${reason === r ? "bg-black text-white dark:bg-white dark:text-black" : "hover:border-black/[.4]"}`}
          >
            {r} {n.toLocaleString()}
          </Link>
        ))}
      </div>

      {reason && EXPLAIN[reason] ? (
        <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          {EXPLAIN[reason]}
        </p>
      ) : null}

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
        {reason ? <input type="hidden" name="reason" value={reason} /> : null}
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
        <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black">
          Filter
        </button>
        {q || brand ? (
          <Link
            href={reason ? `/sync/queue?reason=${encodeURIComponent(reason)}` : "/sync/queue"}
            className="text-sm text-zinc-500 underline-offset-4 hover:underline"
          >
            clear
          </Link>
        ) : null}
      </form>

      <SyncTable rows={slice} showReason />

      {total > PER ? (
        <SyncPager base="/sync/queue" params={params} page={current} pages={pages} total={total} from={(current - 1) * PER + 1} to={(current - 1) * PER + slice.length} />
      ) : null}

      <p className="mt-8 text-xs text-zinc-500">
        Nothing here can be published from this page. Photos and prices come from the vendor sheet; held and duplicate
        SKUs are decisions, not data.
      </p>
    </main>
  );
}
