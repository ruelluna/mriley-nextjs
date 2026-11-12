import type { Metadata } from "next";
import Link from "next/link";
import { ago, day, loadSnapshot, stamp } from "@/lib/sync-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Sync console — Gerber Furniture",
  description:
    "What the daily sync uploaded to gerbersfurniture.com, what is still queued, and why each blocked product is blocked.",
  robots: { index: false, follow: false },
};

function Stat({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <>
      <div className="text-2xl font-semibold tabular-nums text-black dark:text-zinc-50">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-widest text-zinc-500">{label}</div>
      {note ? <div className="mt-1 text-xs text-zinc-500">{note}</div> : null}
    </>
  );
  const cls = "rounded-xl border border-black/[.08] px-4 py-3 dark:border-white/[.145]";
  return href ? (
    <Link href={href} className={`${cls} hover:border-black/[.35] dark:hover:border-white/[.4]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function SyncOverviewPage() {
  const { data, error } = loadSnapshot();

  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Sync console</h1>
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">No snapshot yet.</p>
          <p className="mt-1">
            Expected <code className="font-mono">data/gerber-sync.json</code>. It is written by{" "}
            <code className="font-mono">export_sync_snapshot.py</code> at the end of each sync cycle and committed to
            this repo. Error: {error}
          </p>
        </div>
      </main>
    );
  }

  const reasons = Object.entries(data.totals.by_reason).sort((a, b) => b[1] - a[1]);
  const batches = Array.from(new Set(data.uploaded.map((r) => r.batch).filter(Boolean))).sort().reverse();

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Sync console</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Snapshot taken {stamp(data.generated_at)} · sheet {day(data.sheet.changed_at)}{" "}
            <span className="text-zinc-400">({ago(data.sheet.changed_at)})</span> · sha{" "}
            <code className="font-mono">{data.sheet.sha256.slice(0, 12)}</code>
          </p>
        </div>
        <span className="flex flex-wrap gap-x-4 text-sm text-zinc-500">
          <Link href="/sync/uploaded" className="underline-offset-4 hover:underline">
            Uploaded →
          </Link>
          <Link href="/sync/queue" className="underline-offset-4 hover:underline">
            Queue →
          </Link>
          <Link href="/api/sync" className="underline-offset-4 hover:underline">
            JSON
          </Link>
        </span>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="live in store" value={data.totals.live.toLocaleString()} href="/products?store=live" />
        <Stat label="published" value={data.run.published.toLocaleString()} note="last 30 days" href="/sync/uploaded?action=published" />
        <Stat label="drafts" value={data.run.drafts.toLocaleString()} note="uploaded, not live" href="/sync/queue" />
        <Stat label="blocked" value={String(reasons.reduce((n, [, v]) => n + v, 0))} note="held + duplicates" href="/sync/queue" />
        <Stat label="sheet rows" value={data.sheet.rows.toLocaleString()} note={`${data.sheet.priced_rows.toLocaleString()} priced`} />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Why products are not live</h2>
        {reasons.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nothing is waiting — every uploaded product is live.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.145]">
            <table className="w-full text-sm">
              <tbody>
                {reasons.map(([reason, count]) => (
                  <tr key={reason} className="border-b border-black/[.05] last:border-0 dark:border-white/[.08]">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/sync/queue?reason=${encodeURIComponent(reason)}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {reason}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{count.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">
                      {reason === "no photo"
                        ? "priced and in the store as a draft; publishes automatically once a photo exists"
                        : reason === "no price"
                          ? "Display Price is 0 or blank in the sheet"
                          : reason === "held"
                            ? "listed in hold_skus.txt — deliberately not pushed"
                            : reason === "duplicate"
                              ? "SKU collides with a live product or a normalised twin"
                              : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Batches</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {batches.length === 0 ? (
            <span className="text-sm text-zinc-500">No uploads recorded in the window.</span>
          ) : (
            batches.map((b) => {
              const n = data.uploaded.filter((r) => r.batch === b).length;
              return (
                <Link
                  key={b}
                  href={`/sync/uploaded?batch=${encodeURIComponent(b)}`}
                  className="rounded-lg border border-black/[.12] px-3 py-2 text-sm hover:border-black/[.4] dark:border-white/[.2] dark:hover:border-white/[.5]"
                >
                  {day(b)} <span className="text-zinc-500">· {n}</span>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <p className="mt-10 text-xs text-zinc-500">
        Read-only. The snapshot is regenerated at the end of every sync cycle; the store itself is never written from
        this page. Data source: import ledger, run reports, and the public WooCommerce API.
      </p>
    </main>
  );
}
