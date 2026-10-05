import { PER_PAGE_OPTIONS, getStats, searchProducts, type SortKey } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SORT_KEYS: SortKey[] = ["price_asc", "price_desc", "name", "brand", "sku"];

/**
 * GET /api/products?q=&brand=&category=&department=&min=&max=&image=1&sort=&page=&per=
 * JSON view of the same catalog the pages render (handy for n8n / other apps).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const num = (k: string) => {
    const v = sp.get(k);
    if (!v?.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sort = (sp.get("sort") ?? "price_asc") as SortKey;
  const per = Number(sp.get("per") ?? 24);

  const { rows, total, page, pages } = searchProducts({
    q: sp.get("q") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    category: sp.get("category") ?? undefined,
    department: sp.get("department") ?? undefined,
    min: num("min"),
    max: num("max"),
    image: sp.get("image") === "1",
    sort: SORT_KEYS.includes(sort) ? sort : "price_asc",
    page: num("page") ?? 1,
    per: (PER_PAGE_OPTIONS as readonly number[]).includes(per) ? per : 24,
  });

  return Response.json(
    {
      meta: { ...getStats(), total, page, pages, per, sort },
      products: rows,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
