import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RunReport from "@/components/run-report";
import { formatStamp, getReport } from "@/lib/reports";

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
    // A URL with no snapshot is a real 404 — not-found.tsx lists what does exist.
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <RunReport report={report} />
    </main>
  );
}
