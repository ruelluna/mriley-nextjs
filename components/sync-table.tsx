import { type SyncItem, ACTION_STYLE, REASON_STYLE, money } from "@/lib/sync-data";

const chip = "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";

export default function SyncTable({ rows, showReason = false }: { rows: SyncItem[]; showReason?: boolean }) {
  if (rows.length === 0) {
    return <p className="py-16 text-center text-zinc-500">Nothing matches these filters.</p>;
  }
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/[.08] text-left text-[11px] uppercase tracking-widest text-zinc-500 dark:border-white/[.145]">
            <th className="w-16 px-3 py-2 font-semibold"> </th>
            <th className="px-3 py-2 font-semibold">Product</th>
            <th className="px-3 py-2 font-semibold">SKU</th>
            <th className="px-3 py-2 font-semibold">Brand</th>
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 text-right font-semibold">Price</th>
            <th className="px-3 py-2 font-semibold">State</th>
            <th className="px-3 py-2 font-semibold"> </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const style = showReason ? REASON_STYLE : ACTION_STYLE;
            const label = showReason ? r.reason ?? "unknown" : r.action;
            return (
              <tr key={`${r.sku}-${r.action}-${r.woo_id ?? ""}`} className="border-b border-black/[.05] last:border-0 dark:border-white/[.08]">
                <td className="px-3 py-2">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.image}
                      alt=""
                      width={44}
                      height={44}
                      loading="lazy"
                      className="h-11 w-11 rounded-md bg-zinc-100 object-contain dark:bg-zinc-900"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-zinc-100 text-[10px] text-zinc-400 dark:bg-zinc-900">
                      no img
                    </div>
                  )}
                </td>
                <td className="max-w-[26ch] px-3 py-2">
                  <span className="font-medium text-black dark:text-zinc-50">{r.name || "—"}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">{r.sku}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.brand || "—"}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.category || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.price)}</td>
                <td className="px-3 py-2">
                  <span className={`${chip} ${style[label] ?? style.unknown}`}>{label}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  {r.action === "published" && r.store_url ? (
                    <a href={r.store_url} target="_blank" rel="noopener" className="text-xs text-zinc-500 underline-offset-4 hover:underline">
                      store ↗
                    </a>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
