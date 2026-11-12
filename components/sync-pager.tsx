import Link from "next/link";
import { hrefWith } from "@/lib/sync-data";

export default function SyncPager({
  base,
  params,
  page,
  pages,
  total,
  from,
  to,
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
}) {
  const btn = "rounded-lg border border-black/[.12] px-3 py-2 text-sm dark:border-white/[.2]";
  const linkCls = `${btn} hover:border-black/[.4] dark:hover:border-white/[.5]`;
  const nums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link className={linkCls} href={hrefWith(base, params, { page: "1" })}>
          « first
        </Link>
      ) : (
        <span className={`${btn} opacity-40`}>« first</span>
      )}
      {page > 1 ? (
        <Link className={linkCls} href={hrefWith(base, params, { page: String(page - 1) })}>
          ‹ prev
        </Link>
      ) : (
        <span className={`${btn} opacity-40`}>‹ prev</span>
      )}
      {nums.map((p) => (
        <Link
          key={p}
          href={hrefWith(base, params, { page: String(p) })}
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
        <Link className={linkCls} href={hrefWith(base, params, { page: String(page + 1) })}>
          next ›
        </Link>
      ) : (
        <span className={`${btn} opacity-40`}>next ›</span>
      )}
      <span className="w-full text-center text-xs text-zinc-500 sm:w-auto sm:pl-3">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
    </nav>
  );
}
