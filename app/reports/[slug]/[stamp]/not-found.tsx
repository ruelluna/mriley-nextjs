import Link from "next/link";
import { formatStamp, listReports } from "@/lib/reports";

/**
 * Shown when a report URL has no snapshot. Reports are immutable, so a URL that has no file is a
 * genuine 404 — but a useful one: it lists what does exist.
 */
export default function ReportNotFound() {
  const others = listReports();
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-widest text-zinc-500">Gerber Furniture · reports</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
        No report at this URL
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Reports are frozen snapshots and are only ever added, never renamed — so this URL has no
        snapshot behind it. The ones that do exist are below.
      </p>
      {others.length ? (
        <ul className="mt-6 space-y-3">
          {others.map((r) => (
            <li key={r.url} className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={r.url} className="text-sm font-medium underline-offset-4 hover:underline">
                  {r.title}
                </Link>
                <span className="text-xs text-zinc-500">{formatStamp(r.stamp)}</span>
              </div>
              <code className="mt-1 block font-mono text-xs text-zinc-500">{r.url}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-zinc-500">No reports have been published yet.</p>
      )}
      <p className="mt-8 text-sm">
        <Link href="/reports" className="underline-offset-4 hover:underline">
          ← All reports
        </Link>
      </p>
    </main>
  );
}
