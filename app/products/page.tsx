import type { Metadata } from "next";
import Link from "next/link";
import FilterForm from "@/components/filter-form";
import Pagination from "@/components/pagination";
import ProductCard from "@/components/product-card";
import { getFacets, getStats, searchProducts, SORTS, type SortKey } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Products · Gerber Furniture catalog",
  description: "Browse and filter the Gerber Furniture product catalog by brand, category and price.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const num = (v: string | string[] | undefined): number | null => {
  const s = one(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const q = one(sp.q);
  const brand = one(sp.brand);
  const category = one(sp.category);
  const department = one(sp.department);
  const min = one(sp.min);
  const max = one(sp.max);
  const sort = (one(sp.sort) || "price_asc") as SortKey;
  const per = Number(one(sp.per)) || 24;
  const page = Number(one(sp.page)) || 1;
  const image = one(sp.image) === "1";

  const stats = getStats();
  const { brands, categories, departments } = getFacets();
  const { rows, total, pages, page: current } = searchProducts({
    q, brand, category, department,
    min: num(min), max: num(max), image, sort, page, per,
  });

  const params = {
    q: q || undefined,
    brand: brand || undefined,
    category: category || undefined,
    department: department || undefined,
    min: min || undefined,
    max: max || undefined,
    sort: sort === "price_asc" ? undefined : sort,
    per: per === 24 ? undefined : String(per),
    image: image ? "1" : undefined,
  };

  const filtered = Object.values(params).some(Boolean);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Products</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total.toLocaleString()} matching of {stats.products.toLocaleString()} staged
            {filtered ? " (filtered)" : ""}
            {" · "}
            <Link href="/reports" className="underline-offset-4 hover:underline">
              {stats.pushed.toLocaleString()} pushed to WooCommerce
            </Link>
            {" · "}
            {stats.imagesLinked.toLocaleString()} with an image
            {" · "}scope <code className="font-mono">{stats.scope}</code>
          </p>
        </div>
        <Link href="/" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
          ← Overview
        </Link>
      </header>

      <div className="mt-6 rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
        <FilterForm
          brands={brands}
          categories={categories}
          departments={departments}
          sorts={SORTS}
          values={{ q, brand, category, department, min, max, sort, per: String(per), image }}
        />
      </div>

      {rows.length === 0 ? (
        <p className="py-20 text-center text-zinc-500">No products match these filters.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => (
            <ProductCard key={p.sku} p={p} />
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <Pagination
          page={current}
          pages={pages}
          total={total}
          shownFrom={(current - 1) * per + 1}
          shownTo={(current - 1) * per + rows.length}
          params={params}
        />
      ) : null}
    </main>
  );
}
