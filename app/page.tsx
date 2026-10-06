import Link from "next/link";
import { getStats } from "@/lib/catalog";

/** Stats come from SQLite, so always render per request. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function Home() {
  let s: ReturnType<typeof getStats> | null = null;
  let error: string | null = null;
  try {
    s = getStats();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">Gerber Furniture</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Product catalog
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Every product staged for gerbersfurniture.com, served straight out of the SQLite
        staging database — searchable, filterable, and linked to a page per SKU.
      </p>

      {error ? (
        <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Catalog database not reachable.</p>
          <p className="mt-1">
            Set <code className="font-mono">GERBER_DB</code> to the path of <code className="font-mono">gerber.db</code>{" "}
            and restart. Current error: {error}
          </p>
        </div>
      ) : null}

      {s ? (
        <>
          <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(
              [
                { k: "Products staged", v: s.products.toLocaleString(), sub: "priced scope — the upload set" },
                {
                  k: "Pushed to WooCommerce",
                  v: s.pushed.toLocaleString(),
                  sub: `${s.created.toLocaleString()} created · ${s.alreadyPresent.toLocaleString()} already live`,
                },
                { k: "With an image", v: s.imagesLinked.toLocaleString(), sub: "harvested, linked to a SKU" },
                { k: "Brands", v: s.brands.toLocaleString(), sub: "" },
                { k: "Categories", v: s.categories.toLocaleString(), sub: "" },
                { k: "Collections", v: s.collections.toLocaleString(), sub: "" },
              ] as { k: string; v: string; sub: string }[]
            ).map(({ k, v, sub }) => (
              <div
                key={k}
                className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]"
              >
                <dt className="text-xs uppercase tracking-wider text-zinc-500">{k}</dt>
                <dd className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{v}</dd>
                {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
              </div>
            ))}
          </dl>

          <p className="mt-4 text-sm text-zinc-500">
            Scope <code className="font-mono">{s.scope}</code> · prices{" "}
            {s.minPrice != null ? `$${s.minPrice.toFixed(2)}` : "—"} –{" "}
            {s.maxPrice != null ? `$${s.maxPrice.toFixed(2)}` : "—"} ·{" "}
            {s.imagesLinked.toLocaleString()} with an image linked ·{" "}
            <Link href="/reports" className="underline-offset-4 hover:underline">
              run reports →
            </Link>
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white dark:bg-white dark:text-black"
              href="/products"
            >
              Browse all {s.products.toLocaleString()} products
            </Link>
            <Link
              className="rounded-full border border-black/[.12] px-6 py-3 text-sm font-medium dark:border-white/[.2]"
              href="/api/products?per=5"
            >
              JSON API
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
