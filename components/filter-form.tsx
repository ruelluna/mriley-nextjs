"use client";

import Link from "next/link";
import type { Facet } from "@/lib/catalog-types";
import { PER_PAGE_OPTIONS } from "@/lib/catalog-types";

export type FilterValues = {
  q: string;
  brand: string;
  category: string;
  department: string;
  min: string;
  max: string;
  sort: string;
  per: string;
  image: boolean;
  /** "", "live" (pushed to WooCommerce) or "none" (not pushed). */
  store: string;
};

/** Server-rendered search form; selects auto-submit, no client state needed. */
export default function FilterForm({
  brands,
  categories,
  departments,
  sorts,
  values,
  storeCounts,
}: {
  brands: Facet[];
  categories: Facet[];
  departments: Facet[];
  sorts: { key: string; label: string }[];
  values: FilterValues;
  storeCounts: { all: number; live: number; none: number };
}) {
  const submitOnChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    e.currentTarget.form?.requestSubmit();
  const input =
    "rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/[.4] dark:border-white/[.2] dark:focus:border-white/[.5]";

  return (
    <form method="get" action="/products" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={values.q}
          placeholder="Search name, SKU, collection, description…"
          className={`${input} min-w-[16rem] flex-1`}
        />
        <input
          type="number"
          name="min"
          defaultValue={values.min}
          placeholder="min $"
          step="1"
          className={`${input} w-24`}
        />
        <input
          type="number"
          name="max"
          defaultValue={values.max}
          placeholder="max $"
          step="1"
          className={`${input} w-24`}
        />
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Search
        </button>
        <Link
          href="/products"
          className="rounded-lg border border-black/[.12] px-4 py-2 text-sm dark:border-white/[.2]"
        >
          Reset
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <select name="brand" defaultValue={values.brand} onChange={submitOnChange} className={input}>
          <option value="">All brands ({brands.length})</option>
          {brands.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value} ({f.n})
            </option>
          ))}
        </select>

        <select name="category" defaultValue={values.category} onChange={submitOnChange} className={input}>
          <option value="">All categories ({categories.length})</option>
          {categories.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value} ({f.n})
            </option>
          ))}
        </select>

        <select name="department" defaultValue={values.department} onChange={submitOnChange} className={input}>
          <option value="">All departments ({departments.length})</option>
          {departments.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value} ({f.n})
            </option>
          ))}
        </select>

        <select name="store" defaultValue={values.store} onChange={submitOnChange} className={input}>
          <option value="">Uploaded or not ({storeCounts.all.toLocaleString()})</option>
          <option value="live">Uploaded to WooCommerce ({storeCounts.live.toLocaleString()})</option>
          <option value="none">Not uploaded ({storeCounts.none.toLocaleString()})</option>
        </select>

        <select name="sort" defaultValue={values.sort} onChange={submitOnChange} className={input}>
          {sorts.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <select name="per" defaultValue={values.per} onChange={submitOnChange} className={input}>
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 rounded-lg border border-black/[.12] px-3 py-2 text-sm dark:border-white/[.2]">
          <input type="checkbox" name="image" value="1" defaultChecked={values.image} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
          Has image
        </label>
      </div>
    </form>
  );
}
