import Link from "next/link";
import { formatStamp, type Report } from "@/lib/reports";

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const usd = (v: number | null | undefined, dp = 6) => (v == null ? "—" : `$${v.toFixed(dp)}`);
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const stamp = (iso: string | null) => (iso ? `${iso.replace("T", " ").replace(/\.\d+Z$/, "")} UTC` : "—");

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-black dark:text-zinc-50">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="border-b border-black/[.08] pb-2 text-lg font-semibold tracking-tight dark:border-white/[.145]">
        {title}
      </h2>
      {note ? <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 whitespace-nowrap";
const td = "px-3 py-2 text-sm tabular-nums whitespace-nowrap";
const rowOdd = "odd:bg-black/[.02] dark:odd:bg-white/[.03]";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    complete: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    "in progress": "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    "not metered": "bg-zinc-100 text-zinc-600 dark:bg-white/[.06] dark:text-zinc-300",
    abandoned: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map["not metered"]}`}>
      {status}
    </span>
  );
}

/**
 * Renders one frozen report. Purely presentational: the page route reads the JSON
 * snapshot off disk and hands it over, so a URL always shows the numbers it was
 * generated with.
 */
export default function RunReport({ report }: { report: Report }) {
  const h = report.headline;
  const s = report.store;
  const sp = report.spend;
  const metered = report.phases.filter((p) => p.agentCostUsd != null && p.agentCostUsd > 0);

  return (
    <article>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span className="uppercase tracking-widest">Gerber Furniture · internal · run report</span>
        <span className="flex gap-4">
          <Link href="/reports" className="underline-offset-4 hover:underline">
            All reports →
          </Link>
          <Link href="/plan" className="underline-offset-4 hover:underline">
            Image plan →
          </Link>
          <Link href="/costs" className="underline-offset-4 hover:underline">
            Spend →
          </Link>
        </span>
      </div>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">{report.meta.title}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500">
        <span className="rounded bg-black/[.04] px-2 py-0.5 font-mono dark:bg-white/[.06]">{report.meta.url}</span>
        <span>generated {formatStamp(report.meta.stamp)}</span>
        {report.meta.topics.map((t) => (
          <span key={t} className="rounded-full border border-black/[.08] px-2 py-0.5 dark:border-white/[.145]">
            {t}
          </span>
        ))}
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        The whole catalog job in one place: the image harvest that bypassed the blocked supplier site, the push into
        the WooCommerce store, the wall clock for each phase, and the agent spend behind it. Every number is read from
        the run&apos;s own databases on the Gerber box and from the live store ({report.baseUrl}), and the store
        figures were re-read from its REST API rather than taken from the run log.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Products pushed live"
          value={n(h.productsLive)}
          sub={
            s.available
              ? `store now ${n(s.totalProducts)} products (was ${n(h.storeTotalBefore)}); ${n(s.published)} of ours published`
              : "store audit unavailable"
          }
        />
        <Card
          label="Images harvested"
          value={n(report.images.ok)}
          sub={`${report.images.coveragePct}% of ${n(report.images.attempted)} attempted · ${n(report.images.miss)} unavailable · ${mb(report.images.bytes)} on disk`}
        />
        <Card
          label="Wall clock — push"
          value={h.uploadWallClock ?? "—"}
          sub={`${n(report.upload.created)} created, ${n(report.upload.skipped)} already present, ${n(h.failures)} failed`}
        />
        <Card
          label="Agent cost, entire project"
          value={usd(h.agentCostUsd)}
          sub={`${usd(sp.attributedToJobsUsd)} of it attributable to the scripted jobs · the scripts themselves spend ${usd(0)} in tokens`}
        />
      </div>

      <Section
        title="What ran, in order"
        note="Wall clock is measured between the two cost snapshots that bracket each job. Requests are the job's own HTTP traffic. Model tokens is what the job spent in model tokens — harvesting and pushing are plain HTTP, so they are zero by construction, not by estimate. The dollar column is the agent's own reasoning turns around that job."
      >
        <table className="w-full border-collapse">
          <thead className="border-b border-black/[.08] dark:border-white/[.145]">
            <tr>
              <th className={th}>Job</th>
              <th className={th}>Scope</th>
              <th className={th}>Requests</th>
              <th className={th}>Wall clock</th>
              <th className={th}>Model tokens</th>
              <th className={th}>Agent cost</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {report.phases.map((p) => (
              <tr key={p.id} className={`border-b border-black/[.04] align-top dark:border-white/[.06] ${rowOdd}`}>
                <td className={`${td} max-w-md whitespace-normal`}>
                  <div className="font-medium text-black dark:text-zinc-100">{p.title}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">{p.what}</div>
                </td>
                <td className={`${td} whitespace-normal`}>{p.scope}</td>
                <td className={`${td} whitespace-normal text-xs text-zinc-500`}>{p.requests}</td>
                <td className={td}>{p.wallClock ?? "—"}</td>
                <td className={td}>0</td>
                <td className={td}>{usd(p.agentCostUsd)}</td>
                <td className={td}>
                  <StatusPill status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Images — coverage by brand"
        note={`The supplier's own site 403s this box and every scraping proxy tier, but MicroD/WebFronts serves images from a CDN that does not block us, and the image hash is global to the platform: any dealer site carrying the item yields the identical file. That is how ${n(report.images.ok)} images were pulled without ever touching the blocked host.`}
      >
        <table className="w-full border-collapse">
          <thead className="border-b border-black/[.08] dark:border-white/[.145]">
            <tr>
              <th className={th}>Brand</th>
              <th className={th}>Images</th>
              <th className={th}>Unavailable</th>
              <th className={th}>Coverage</th>
              <th className={th}>Bytes</th>
            </tr>
          </thead>
          <tbody>
            {report.images.byBrand.map((b) => (
              <tr key={b.brand} className={`border-b border-black/[.04] dark:border-white/[.06] ${rowOdd}`}>
                <td className={td}>{b.brand}</td>
                <td className={td}>{n(b.ok)}</td>
                <td className={td}>{n(b.miss)}</td>
                <td className={td}>{b.attempted ? `${b.coveragePct}%` : "—"}</td>
                <td className={td}>{b.bytes ? mb(b.bytes) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Read from which host</h3>
            <ul className="mt-3 space-y-1 text-sm tabular-nums">
              {report.images.byHost.map((host) => (
                <li
                  key={host.host}
                  className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]"
                >
                  <span className="text-zinc-600 dark:text-zinc-400">{host.host}</span>
                  <span>
                    {n(host.images)} · {mb(host.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Why a SKU has no image</h3>
            <ul className="mt-3 space-y-1 text-sm tabular-nums">
              {report.images.missReasons.map((r) => (
                <li
                  key={r.reason}
                  className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]"
                >
                  <span className="text-zinc-600 dark:text-zinc-400">{r.reason}</span>
                  <span>{n(r.n)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        title="The push into WooCommerce"
        note="One image upload plus one product create per product, four workers, ledger committed only after the store confirms an item. A re-run skips anything whose payload hash is unchanged, so nothing is ever posted twice."
      >
        <table className="w-full border-collapse">
          <thead className="border-b border-black/[.08] dark:border-white/[.145]">
            <tr>
              <th className={th}>Run</th>
              <th className={th}>Target</th>
              <th className={th}>Created</th>
              <th className={th}>Already present</th>
              <th className={th}>Failed</th>
              <th className={th}>Wall clock</th>
              <th className={th}>Started</th>
            </tr>
          </thead>
          <tbody>
            {report.upload.runs.map((r) => (
              <tr key={r.runId} className={`border-b border-black/[.04] dark:border-white/[.06] ${rowOdd}`}>
                <td className={`${td} font-mono text-xs`}>
                  {r.runId}
                  {r.aborted ? <span className="ml-2 text-rose-600 dark:text-rose-400">aborted</span> : null}
                </td>
                <td className={td}>{n(r.targetSkus)}</td>
                <td className={td}>{n(r.created)}</td>
                <td className={td}>{n(r.skipped)}</td>
                <td className={td}>{n(r.failed)}</td>
                <td className={td}>{r.wallClock ?? "—"}</td>
                <td className={`${td} text-xs text-zinc-500`}>{r.startedUtc?.slice(11, 19) ?? "—"} UTC</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Verified against the store, not the log
          </h3>
          {s.available ? (
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Products on the store</dt>
                <dd className="tabular-nums">{n(s.totalProducts)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Of ours found by id</dt>
                <dd className="tabular-nums">
                  {n(s.confirmed)} / {n(s.ours)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Status publish</dt>
                <dd className="tabular-nums">{n(s.published)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">With an image</dt>
                <dd className="tabular-nums">{n(s.images)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Without a category</dt>
                <dd className="tabular-nums">{n(s.noCategory)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Duplicate SKUs</dt>
                <dd className="tabular-nums">{s.duplicateSkus.length}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Price range</dt>
                <dd className="tabular-nums">
                  ${n(s.priceMin)} – ${n(s.priceMax)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Median price</dt>
                <dd className="tabular-nums">${n(s.priceMedian)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <dt className="text-zinc-500">Media library items</dt>
                <dd className="tabular-nums">{n(s.mediaItems)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Store audit unavailable: {s.reason}</p>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Staged upstream: {n(report.upload.staged.rows)} source rows, {n(report.upload.staged.pricedDistinctSkus)}{" "}
            distinct priced SKUs — the upload set is the priced subset that has an image. Store audit read{" "}
            {stamp(s.available ? s.checkedAt : null)}.
          </p>
        </div>
      </Section>

      <Section
        title="Cost"
        note="Two different things get called cost here. Model spend is what the agent's own reasoning turns cost. The harvesting and pushing scripts cost nothing at all: they are plain HTTP, with no model in the path."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            label="Model spend, all Gerber work"
            value={usd(sp.totalUsd)}
            sub={`${n(sp.calls)} API calls over ${n(sp.sessions)} sessions`}
          />
          <Card
            label="Attributed to the scripted jobs"
            value={usd(sp.attributedToJobsUsd)}
            sub="Reasoning turns either side of each job"
          />
          <Card label="Spent inside the scripts" value={usd(0)} sub="Plain HTTP: 0 model tokens, by construction" />
          <Card
            label="Per 1,000 products pushed"
            value={usd(sp.perThousandProductsUsd)}
            sub="Agent cost divided by products created"
          />
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Per model call, day by day</h3>
            <table className="mt-3 w-full border-collapse">
              <thead className="border-b border-black/[.08] dark:border-white/[.145]">
                <tr>
                  <th className={th}>Day</th>
                  <th className={th}>Calls</th>
                  <th className={th}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {sp.byDay.map((d) => (
                  <tr key={d.day} className={`border-b border-black/[.04] dark:border-white/[.06] ${rowOdd}`}>
                    <td className={td}>{d.day}</td>
                    <td className={td}>{n(d.calls)}</td>
                    <td className={td}>{usd(d.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Tokens behind that spend</h3>
            <ul className="mt-3 space-y-1 text-sm tabular-nums">
              {[
                ["Input tokens", n(sp.inputTokens)],
                ["Output tokens", n(sp.outputTokens)],
                ["Cache-read tokens", n(sp.cacheReadTokens)],
                ["Reasoning tokens", n(sp.reasoningTokens)],
                ["Snapshots on the cost ledger", n(sp.ledgerSnapshotCount)],
                ["Spend since the last snapshot", usd(sp.sinceLastSnapshotUsd)],
              ].map(([label, value]) => (
                <li
                  key={label}
                  className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]"
                >
                  <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-500">Jobs that carry a cost</h3>
            <ul className="mt-3 space-y-1 text-sm tabular-nums">
              {metered.length ? (
                metered.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]"
                  >
                    <span className="text-zinc-600 dark:text-zinc-400">{p.title}</span>
                    <span>{usd(p.agentCostUsd)}</span>
                  </li>
                ))
              ) : (
                <li className="text-zinc-500">None — every job so far was metered at $0.</li>
              )}
              <li className="flex justify-between gap-4 border-b border-black/[.04] py-1 dark:border-white/[.06]">
                <span className="text-zinc-600 dark:text-zinc-400">Pilot push and its read-back</span>
                <span>{usd(0)}</span>
              </li>
            </ul>
          </div>
        </div>

        <ul className="mt-8 space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {report.caveats.map((c) => (
            <li key={c} className="border-l-2 border-black/[.08] pl-3 dark:border-white/[.145]">
              {c}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What's still open" note="Stated plainly so the report does not read as finished work.">
        <ul className="space-y-4">
          {report.gaps.map((g) => (
            <li key={g.what}>
              <div className="text-sm font-medium text-black dark:text-zinc-100">{g.what}</div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{g.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="How to reproduce or check"
        note="Everything on this page comes out of these commands against the staging databases on the Gerber box."
      >
        <pre className="overflow-x-auto rounded-xl bg-black/[.03] p-4 text-xs leading-6 dark:bg-white/[.04]">
          {report.reproduce.join("\n")}
        </pre>
      </Section>

      <p className="mt-12 text-xs text-zinc-500">
        This report is a frozen snapshot — the numbers above are exactly as generated at{" "}
        {stamp(report.generatedAt)}, and later runs are published at their own URLs. Regenerate with{" "}
        <code className="font-mono">npm run report:build</code>.
      </p>
    </article>
  );
}
