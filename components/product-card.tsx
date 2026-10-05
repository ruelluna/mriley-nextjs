import Link from "next/link";
import { money, type ProductSummary } from "@/lib/catalog-types";

function initials(s: string): string {
  const words = s.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("") || "GF";
}

export default function ProductCard({ p }: { p: ProductSummary }) {
  return (
    <Link
      href={`/products/${encodeURIComponent(p.sku)}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-black/[.08] transition hover:border-black/[.25] dark:border-white/[.145] dark:hover:border-white/[.3]"
    >
      <div className="flex h-28 items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-2xl font-semibold text-zinc-400 dark:from-zinc-900 dark:to-zinc-800 dark:text-zinc-600">
        {p.hasImage ? "🖼" : initials(p.brand)}
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
  );
}
