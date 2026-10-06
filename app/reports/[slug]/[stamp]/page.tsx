import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import RunReport from "@/components/run-report";
import { formatStamp, getReport, listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = Promise<{ slug: string; stamp: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, stamp } = await params;
  const report = getReport(slug, stamp);
  if (!report) return { title: "Report not found · Gerber Furniture" };
  return {
    title: `${report.meta.title} · ${formatStamp(stamp)} · Gerber Furniture`,
    description: `Run report: ${report.headline.productsLive} products pushed live, ${report.headline.imagesOk} images harvested, ${report.headline.uploadWallClock ?? "—"} upload wall clock.`,
  };
}

export default async function ReportDetail({ params }: { params: Params }) {
  const { slug, stamp } = await params;
  const report = getReport(slug, stamp);

  if (!report) {
    const others = listReports();
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">No report at this URL</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          <code className="font-mono text-xs">
            /reports/{slug}/{stamp}
          </code>{" "}
          has no snapshot. Reports are immutable, so they are only ever added, never renamed.
        </p>
        {others.length ? (
          <ul className="mt-6 space-y-2 text-sm">
            {others.map((r) => (
              <li key={r.url}>
                <Link href={r.url} className="underline-offset-4 hover:underline">
                  {r.title} — {formatStamp(r.stamp)}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-6 text-sm">
          <Link href="/reports" className="underline-offset-4 hover:underline">
            ← All reports
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <RunReport report={report} />
    </main>
  );
}
