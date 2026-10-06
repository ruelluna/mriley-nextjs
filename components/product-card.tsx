import Link from "next/link";
import { money, type ProductSummary } from "@/lib/catalog-types";

function initials(s: string): string {
  const words = s.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("") || "GF";
}

/**
 * Card for one staged product. The store link sits outside the card's own Link — an <a> inside an
 * <a> is invalid, and it needs to open the live product, not this catalog page.
 */
export default function ProductCard({ p }: { p: ProductSummary }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-black/[.08] transition hover:border-black/[.25] dark:border-white/[.145] dark:hover:border-white/[.3]">
      <Link href={`/products/${encodeURIComponent(p.sku)}`} className="flex flex-1 flex-col">
        <div className="flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800">
          {p.imageUrl ? (
            // Links come from the catalog DB (MicroD/WebFronts CDN, already resized), so a
            // plain <img> avoids spending Vercel image-optimization quota on 6k products.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.imageUrl}
              alt={p.name || p.sku}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain p-2 transition duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="text-2xl font-semibold text-zinc-400 dark:text-zinc-600">
              {initials(p.brand)}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-black dark:text-zinc-50">
            {p.name}
          </p>
          <p className="text-xs text-zinc-500">
            {p.sku}
            {p.brand ? ` · ${p.brand}` : ""}
          </p>
          <p className="text-xs text-zinc-500">
            {p.category || "—"}
            {p.collection ? ` · ${p.collection}` : ""}
          </p>
          {p.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{p.description}</p>
          ) : null}
          <p className="mt-auto pt-2 text-base font-semibold text-black dark:text-zinc-50">
            {money(p.price)}
          </p>
        </div>
      </Link>

      {p.storeUrl ? (
        <a
          href={p.storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={p.storeUrl}
          className="flex items-center justify-between gap-2 border-t border-emerald-200/70 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
        >
          <span className="truncate">Live on gerbersfurniture.com</span>
          <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <p className="flex items-center justify-between gap-2 border-t border-black/[.06] px-4 py-2 text-xs text-zinc-400 dark:border-white/[.08] dark:text-zinc-500">
          Not uploaded yet
        </p>
      )}
    </div>
  );
}
