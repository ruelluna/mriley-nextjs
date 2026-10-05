import Link from "next/link";

export type ParamMap = Record<string, string | undefined>;

export function hrefWith(params: ParamMap, patch: ParamMap): string {
  const merged = { ...params, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/products?${s}` : "/products";
}

export default function Pagination({
  page,
  pages,
  total,
  shownFrom,
  shownTo,
  params,
}: {
  page: number;
  pages: number;
  total: number;
  shownFrom: number;
  shownTo: number;
  params: ParamMap;
}) {
  const btn =
    "rounded-lg border border-black/[.12] px-3 py-2 text-sm disabled:opacity-40 dark:border-white/[.2]";
  const linkCls = `${btn} hover:border-black/[.4] dark:hover:border-white/[.5]`;
  const nums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link className={linkCls} href={hrefWith(params, { page: "1" })}>« first</Link>
      ) : (
        <span className={btn}>« first</span>
      )}
      {page > 1 ? (
        <Link className={linkCls} href={hrefWith(params, { page: String(page - 1) })}>‹ prev</Link>
      ) : (
        <span className={btn}>‹ prev</span>
      )}
      {nums.map((p) => (
        <Link
          key={p}
          href={hrefWith(params, { page: String(p) })}
          className={
            p === page
              ? "rounded-lg bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              : linkCls
          }
        >
          {p}
        </Link>
      ))}
      {page < pages ? (
        <Link className={linkCls} href={hrefWith(params, { page: String(page + 1) })}>next ›</Link>
      ) : (
        <span className={btn}>next ›</span>
      )}
      {page < pages ? (
        <Link className={linkCls} href={hrefWith(params, { page: String(pages) })}>last »</Link>
      ) : (
        <span className={btn}>last »</span>
      )}
      <span className="w-full text-center text-xs text-zinc-500 sm:w-auto sm:pl-3">
        {shownFrom.toLocaleString()}–{shownTo.toLocaleString()} of {total.toLocaleString()}
      </span>
    </nav>
  );
}
