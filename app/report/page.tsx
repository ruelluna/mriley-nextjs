import { notFound, redirect } from "next/navigation";
import { listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The original flat link. Reports are immutable and each one lives at its own
 * /reports/<slug>/<stamp> URL, so this forwards to the newest.
 */
export default function LegacyReportLink() {
  const latest = listReports()[0];
  if (!latest) notFound();
  redirect(latest.url);
}
