import type { Metadata } from "next";
import Link from "next/link";
import { formatStamp, humanizeSlug, listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Reports · Gerber Furniture",
  description: "Every run report, each at its own permanent URL: /reports/<topic>/<date-timeAM/PM>.",
};

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => `$${v.toFixed(6)}`;

export default function ReportsIndex() {
  const reports = listReports();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span className="uppercase tracking-widest">Gerber Furniture · internal · reports</span>
        <span className="flex gap-4">
          <Link href="/products" className="underline-offset-4 hover:underline">Catalog →</Link>
          <Link href="/plan" className="underline-offset-4 hover:underline">Image plan →</Link>
          <Link href="/costs" className="underline-offset-4 hover:underline">Spend →</Link>
        </span>
      </div>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">Run reports</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        One report per run, each at its own permanent URL — <code className="font-mono text-xs">/reports/&lt;topic&gt;/&lt;date-timeAM/PM&gt;</code>.
        A report is a frozen snapshot: re-running the job publishes a new report at a new URL rather than rewriting
        the old one, so a link always shows the numbers it was generated with.
      </p>

      {reports.length === 0 ? (
        <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">No reports published yet.</p>
          <p className="mt-1">
            Generate one on the Gerber box with <code className="font-mono">npm run report:build</code>, then commit{" "}
            <code className="font-mono">data/reports/</code>.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {reports.map((r) => (
            <li key={r.url} className="rounded-xl border border-black/[.08] p-5 dark:border-white/[.145]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  <Link href={r.url} className="underline-offset-4 hover:underline">
                    {r.title || humanizeSlug(r.slug)}
                  </Link>
                </h2>
                <span className="text-xs text-zinc-500">{formatStamp(r.stamp)}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <Link
                  href={r.url}
                  className="rounded bg-black/[.04] px-2 py-0.5 font-mono underline-offset-4 hover:underline dark:bg-white/[.06]"
                >
                  {r.url}
                </Link>
                {r.topics.map((t) => (
                  <span key={t} className="rounded-full border border-black/[.08] px-2 py-0.5 dark:border-white/[.145]">
                    {t}
                  </span>
                ))}
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                  <dt className="text-zinc-500">Products live</dt>
                  <dd className="tabular-nums">{n(r.headline.productsLive)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                  <dt className="text-zinc-500">Images</dt>
                  <dd className="tabular-nums">
                    {n(r.headline.imagesOk)} ok · {n(r.headline.imagesMiss)} miss ({r.headline.coveragePct}%)
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                  <dt className="text-zinc-500">Wall clock</dt>
                  <dd className="tabular-nums">
                    {r.headline.harvestWallClock ?? "—"} harvest · {r.headline.uploadWallClock ?? "—"} push
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                  <dt className="text-zinc-500">Agent cost</dt>
                  <dd className="tabular-nums">
                    {usd(r.headline.agentCostUsd)} · scripts {usd(r.headline.scriptTokenCostUsd)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
