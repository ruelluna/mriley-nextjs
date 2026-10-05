import { getProduct } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/products/:sku -- one product with every source field. */
export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = getProduct(decodeURIComponent(sku));
  if (!product) {
    return Response.json({ error: "not_found", sku }, { status: 404 });
  }
  return Response.json(product, { headers: { "cache-control": "no-store" } });
}
