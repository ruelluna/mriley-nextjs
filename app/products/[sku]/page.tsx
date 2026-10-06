import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductCard from "@/components/product-card";
import { getProduct, getRelated, money } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = Promise<{ sku: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sku } = await params;
  const p = getProduct(decodeURIComponent(sku));
  if (!p) return { title: "Product not found · Gerber Furniture" };
  return {
    title: `${p.name} · ${p.sku} · Gerber Furniture`,
    description: p.description.slice(0, 155) || `${p.name} — ${p.brand} ${p.category}`.trim(),
  };
}

/** Keys rendered in the header/spec panel, so the "all fields" table skips them. */
const SHOWN = new Set([
  "Short Description", "Brand", "Manufacturer SKU", "Display Price", "Typical Price",
  "Category", "Department", "Collection", "Type", "Subtype", "Color", "Finish",
  "Product Description", "Product Specification", "Depth", "Height", "Width",
]);

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/[.06] py-2 text-sm last:border-0 dark:border-white/[.08]">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-black dark:text-zinc-100">{value || "—"}</dd>
    </div>
  );
}

export default async function ProductPage({ params }: { params: Params }) {
  const { sku } = await params;
  const p = getProduct(decodeURIComponent(sku));
  if (!p) notFound();

  const related = getRelated(p.collection, p.sku);
  const { depth, height, width } = p.dimensions;
  const dims = [depth && `D ${depth}"`, height && `H ${height}"`, width && `W ${width}"`]
    .filter(Boolean)
    .join(" · ");
  const otherFields = Object.entries(p.raw)
    .filter(([k]) => !SHOWN.has(k))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <nav className="text-xs text-zinc-500">
        <Link href="/" className="hover:underline">Overview</Link>
        <span> / </span>
        <Link href="/products" className="hover:underline">Products</Link>
        {p.category ? (
          <>
            <span> / </span>
            <Link href={`/products?category=${encodeURIComponent(p.category)}`} className="hover:underline">
              {p.category}
            </Link>
          </>
        ) : null}
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">{p.name}</h1>
          <p className="mt-2 text-sm text-zinc-500">
            SKU {p.sku}
            {p.brand ? (
              <>
                {" · "}
                <Link href={`/products?brand=${encodeURIComponent(p.brand)}`} className="hover:underline">
                  {p.brand}
                </Link>
              </>
            ) : null}
            {p.department ? ` · ${p.department}` : ""}
          </p>
          {dims ? <p className="mt-1 text-sm text-zinc-500">{dims}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-black dark:text-zinc-50">{money(p.price)}</p>
          {p.typicalPrice && p.typicalPrice !== p.displayPrice ? (
            <p className="text-xs text-zinc-500">Typical {p.typicalPrice}</p>
          ) : null}
          <p className="mt-2 inline-block rounded-full border border-black/[.12] px-3 py-1 text-xs text-zinc-500 dark:border-white/[.2]">
            ledger: {p.ledgerStatus}
          </p>
          {p.storeUrl ? (
            <p className="mt-2">
              <a
                href={p.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={p.storeUrl}
                className="inline-block rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
              >
                View on gerbersfurniture.com ↗
              </a>
            </p>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">Not uploaded to the store yet</p>
          )}
          {p.images.length === 0 ? (
            <p className="mt-2 text-xs text-amber-600">No image attached yet</p>
          ) : null}
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.6fr_1fr]">
        <section className="space-y-6">
          {p.description ? (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Description</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">
                {p.description}
              </p>
            </div>
          ) : null}

          {p.raw["Product Specification"] ? (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Specification</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">
                {p.raw["Product Specification"]}
              </p>
            </div>
          ) : null}

          {otherFields.length > 0 ? (
            <details className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
              <summary className="cursor-pointer text-sm font-semibold">
                All source fields ({otherFields.length})
              </summary>
              <dl className="mt-3">
                {otherFields.map(([k, v]) => (
                  <Spec key={k} label={k} value={v} />
                ))}
              </dl>
            </details>
          ) : null}
        </section>

        <aside className="space-y-6">
          {p.images.length > 0 ? (
            <figure className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.145]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.images[0].fullUrl ?? p.images[0].url}
                alt={p.name || p.sku}
                className="w-full bg-white object-contain dark:bg-zinc-950"
              />
              {p.images.length > 1 ? (
                <div className="flex gap-2 border-t border-black/[.06] p-2 dark:border-white/[.08]">
                  {p.images.slice(1, 5).map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.position}
                      src={img.url}
                      alt={`${p.name} view ${img.position}`}
                      loading="lazy"
                      className="h-16 w-16 rounded object-contain"
                    />
                  ))}
                </div>
              ) : null}
            </figure>
          ) : null}

          <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">Details</h2>
            <dl>
              <Spec label="SKU" value={p.sku} />
              <Spec label="Brand" value={p.brand} />
              <Spec label="Category" value={p.category} />
              <Spec label="Department" value={p.department} />
              <Spec label="Type" value={p.type} />
              <Spec label="Subtype" value={p.subtype} />
              <Spec label="Collection" value={p.collection} />
              <Spec label="Color" value={p.raw["Color"] ?? ""} />
              <Spec label="Finish" value={p.raw["Finish"] ?? ""} />
              <Spec label="Display price" value={p.displayPrice} />
              <Spec label="Typical price" value={p.typicalPrice} />
              <Spec label="Dimensions" value={dims} />
            </dl>
          </div>

          <div className="rounded-xl border border-black/[.08] p-4 text-xs text-zinc-500 dark:border-white/[.145]">
            <p>
              Source row <code className="font-mono">{p.sku}</code> in the Gerber staging database
              (<code className="font-mono">products</code> table).
            </p>
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-lg font-semibold tracking-tight">
            More in {p.collection}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <ProductCard key={r.sku} p={r} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
