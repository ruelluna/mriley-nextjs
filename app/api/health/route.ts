import { DatabaseSync } from "node:sqlite";
import { statSync } from "node:fs";
import { catalogEnv, dbReady, getStats } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Deployment diagnostics: what runtime we are on, which database file was resolved,
 * whether it is readable, and the counts it reports.  Handy when a host (Vercel)
 * does not have the data or the runtime lacks node:sqlite.
 */
export async function GET() {
  const path = catalogEnv.dbPath;
  let size: number | null = null;
  let probe: string | null = null;

  try {
    size = statSync(path).size;
  } catch (e) {
    probe = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  let stats: ReturnType<typeof getStats> | null = null;
  let error: string | null = null;
  try {
    stats = getStats();
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  const ok = dbReady() && stats != null;

  return Response.json(
    {
      ok,
      node: process.version,
      platform: process.env.VERCEL ? "vercel" : process.platform,
      cwd: process.cwd(),
      env: { GERBER_DB: process.env.GERBER_DB ?? null, GERBER_SCOPE: process.env.GERBER_SCOPE ?? null },
      database: { resolvedPath: path, exists: size != null, sizeBytes: size, openError: probe },
      stats,
      error,
      hint: ok
        ? null
        : "Catalog database missing or unreadable. Commit data/catalog.db and keep it traced via outputFileTracingIncludes, or set GERBER_DB to a readable path.",
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

// Keep the sqlite import referenced so bundlers include the driver in this function.
void DatabaseSync;
