import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/sync-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/sync            → the whole snapshot
 * GET /api/sync?list=uploaded|queue
 * GET /api/sync?reason=no%20photo&brand=Tempur-Pedic&q=nightstand
 * GET /api/sync?format=csv&list=queue
 */
export async function GET(request: Request) {
  const { data, error } = loadSnapshot();
  if (error || !data) {
    return NextResponse.json({ error: "no snapshot", detail: error }, { status: 503 });
  }

  const url = new URL(request.url);
  const list = url.searchParams.get("list") ?? "";
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const brand = url.searchParams.get("brand") ?? "";
  const reason = url.searchParams.get("reason") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const format = url.searchParams.get("format") ?? "json";

  const filter = (rows: typeof data.uploaded) =>
    rows.filter((r) => {
      if (brand && r.brand !== brand) return false;
      if (reason && (r.reason ?? "") !== reason) return false;
      if (action && r.action !== action) return false;
      if (q) {
        const hay = `${r.name} ${r.sku} ${r.brand} ${r.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

  const payload =
    list === "uploaded"
      ? { generated_at: data.generated_at, uploaded: filter(data.uploaded) }
      : list === "queue"
        ? { generated_at: data.generated_at, queue: filter(data.queue) }
        : { ...data, uploaded: filter(data.uploaded), queue: filter(data.queue) };

  if (format === "csv") {
    const rows = list === "queue" ? filter(data.queue) : filter(data.uploaded);
    const cols = ["sku", "name", "brand", "category", "price", "action", "reason", "batch", "store_url"] as const;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(","))].join("\n");
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="gerber-${list || "sync"}.csv"`,
      },
    });
  }

  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
