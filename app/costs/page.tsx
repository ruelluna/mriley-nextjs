import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Agent spend · Gerber Furniture",
  description:
    "What the Gerber Furniture data work has cost in model spend — per job, per day, per component, with the caveats.",
};

type LedgerRow = {
  tsUtc: string;
  label: string;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  cumulativeUsd: number;
  deltaUsd: number;
};

type Job = {
  id: string;
  title: string;
  detail: string;
  skus: number;
  images: number;
  misses: number;
  wallClock: string;
  imagesAttachedToSite: number;
  tokensSpent: number;
  note: string;
  startedUtc: string | null;
  endedUtc: string | null;
  costUsd: number | null;
  perThousandUsd: number | null;
};

type Spend = {
  generatedAt: string;
  currency: string;
  totals: {
    sessions: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    estimatedUsd: number;
    actualUsd: number;
  };
  byDay: { day: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number; usd: number }[];
  byComponent: { component: string; calls: number; usd: number }[];
  byModel: { model: string; provider: string; calls: number; usd: number }[];
  pricing: { status: string; source: string; rows: number }[];
  ledger: LedgerRow[];
  afterLastSnapshotUsd: number | null;
  jobs: Job[];
  projections: { work: string; basis: string; eta: string; usdLow: number | null; usdHigh: number | null }[];
  caveats: string[];
};

function load(): { spend: Spend | null; error: string | null } {
  try {
    const raw = readFileSync(join(process.cwd(), "data", "spend.json"), "utf8");
    return { spend: JSON.parse(raw) as Spend, error: null };
  } catch (e) {
    return { spend: null, error: e instanceof Error ? e.message : String(e) };
  }
}

const n = (v: number) => v.toLocaleString("en-US");
const compact = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : n(v);
/** Six decimals on purpose: a sub-cent job rendered as $0.00 reads as free and hides the signal. */
const usd = (v: number | null, dp = 6) => (v == null ? "—" : `$${v.toFixed(dp)}`);
const range = (lo: number | null, hi: number | null) =>
  lo == null || hi == null ? "not yet estimated" : `${usd(lo, 2)}–${usd(hi, 2)}`;
const stamp = (iso: string) =>
  new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");

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
      {note ? <p className="mt-3 text-sm text-zinc-500">{note}</p> : null}
      <div className="mt-4 overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 whitespace-nowrap";
const td = "px-3 py-2 text-sm tabular-nums whitespace-nowrap";
const rowOdd = "odd:bg-black/[.02] dark:odd:bg-white/[.03]";

export default function CostsPage() {
  const { spend, error } = load();

  if (!spend) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Spend snapshot not found at runtime.</p>
          <p className="mt-1">
            Expected <code className="font-mono">data/spend.json</code>. Regenerate it on the Gerber
            box with <code className="font-mono">npm run spend:build</code> and commit it. Error: {error}
          </p>
        </div>
      </main>
    );
  }

  const t = spend.totals;
  const meteredJobs = spend.jobs.filter((j) => j.costUsd != null);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span className="uppercase tracking-widest">Gerber Furniture · internal · agent spend</span>
        <span className="flex gap-4">
          <Link href="/plan" className="underline-offset-4 hover:underline">Image plan →</Link>
          <Link href="/products" className="underline-offset-4 hover:underline">Product catalog →</Link>
        </span>
      </div>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        What this data work cost
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Every API call the agent made while imaged, staged and deployed the Gerber catalog, metered by
        Hermes itself (<code className="font-mono">state.db → session_model_usage</code>) and priced
        from the provider&apos;s published rate card. Non-LLM work — downloads, database builds,
        deploys — costs no tokens at all; the dollars below are the reasoning turns around it.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card
          label="Total to date"
          value={usd(t.estimatedUsd)}
          sub={`${n(t.calls)} API calls · ${n(t.sessions)} sessions`}
        />
        <Card label="Today" value={usd(spend.byDay.at(-1)?.usd ?? null)} sub={spend.byDay.at(-1)?.day} />
        <Card
          label="Metered jobs"
          value={String(meteredJobs.length)}
          sub={`${n(spend.jobs.reduce((a, j) => a + j.images, 0))} images harvested`}
        />
        <Card
          label="Invoiced"
          value="unknown"
          sub="provider returns no billed cost — reconcile on the dashboard"
        />
      </dl>

      <Section
        title="Jobs"
        note="Each batch is wrapped in a START/END snapshot, so its cost is attributable to the job rather than to the project total."
      >
        <div className="space-y-4">
          {spend.jobs.map((j) => (
            <div
              key={j.id}
              className="rounded-xl border border-black/[.08] p-5 dark:border-white/[.145]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <h3 className="font-semibold tracking-tight">{j.title}</h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{j.detail}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">{usd(j.costUsd)}</div>
                  <div className="text-xs text-zinc-500">
                    {j.costUsd == null
                      ? "not metered — the ledger began 2026-10-06, after this run"
                      : `agent cost · ${usd(j.perThousandUsd)} per 1,000 SKUs`}
                  </div>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  {
                    k: "Result",
                    v: `${n(j.images)}/${n(j.skus)} images`,
                    s: j.misses ? `${j.misses} misses` : "0 misses",
                  },
                  { k: "Wall clock", v: j.wallClock, s: j.endedUtc ? `ended ${stamp(j.endedUtc)}` : undefined },
                  { k: "Model tokens", v: j.tokensSpent === 0 ? "none" : n(j.tokensSpent), s: j.tokensSpent === 0 ? "plain HTTP, no LLM" : undefined },
                  { k: "Images on the site", v: n(j.imagesAttachedToSite), s: "attached & deployed" },
                ].map(({ k, v, s }) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wider text-zinc-500">{k}</dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">{v}</dd>
                    {s ? <dd className="text-xs text-zinc-500">{s}</dd> : null}
                  </div>
                ))}
              </dl>

              <p className="mt-4 text-xs text-zinc-500">{j.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Ledger"
        note={`Cumulative snapshots taken on the Gerber box. ${usd(spend.afterLastSnapshotUsd)} has been spent since the last snapshot — the catalog rebuild, the attach and the deploy.`}
      >
        <table className="w-full border-collapse">
          <thead className="border-b border-black/[.08] dark:border-white/[.145]">
            <tr>
              <th className={th}>When (UTC)</th>
              <th className={th}>Snapshot</th>
              <th className={th}>Delta</th>
              <th className={th}>Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {spend.ledger.map((r) => (
              <tr key={r.tsUtc} className={`border-b border-black/[.05] dark:border-white/[.07] ${rowOdd}`}>
                <td className={td}>{r.tsUtc}</td>
                <td className={`${td} font-mono text-xs`}>{r.label}</td>
                <td className={`${td} font-medium`}>{r.deltaUsd === r.cumulativeUsd ? "— (first)" : `+${usd(r.deltaUsd)}`}</td>
                <td className={td}>{usd(r.cumulativeUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="By day">
        <table className="w-full border-collapse">
          <thead className="border-b border-black/[.08] dark:border-white/[.145]">
            <tr>
              <th className={th}>Day (UTC)</th>
              <th className={th}>Calls</th>
              <th className={th}>Input</th>
              <th className={th}>Output</th>
              <th className={th}>Cache read</th>
              <th className={th}>Reasoning</th>
              <th className={th}>Estimated</th>
            </tr>
          </thead>
          <tbody>
            {spend.byDay.map((d) => (
              <tr key={d.day} className={`border-b border-black/[.05] dark:border-white/[.07] ${rowOdd}`}>
                <td className={td}>{d.day}</td>
                <td className={td}>{n(d.calls)}</td>
                <td className={td}>{n(d.inputTokens)}</td>
                <td className={td}>{n(d.outputTokens)}</td>
                <td className={td}>{compact(d.cacheReadTokens)}</td>
                <td className={td}>{n(d.reasoningTokens)}</td>
                <td className={`${td} font-medium`}>{usd(d.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <Section title="By component" note="Hermes splits its own calls: the conversation, its background review, approvals, compression.">
          <table className="w-full border-collapse">
            <thead className="border-b border-black/[.08] dark:border-white/[.145]">
              <tr>
                <th className={th}>Component</th>
                <th className={th}>Calls</th>
                <th className={th}>Estimated</th>
              </tr>
            </thead>
            <tbody>
              {spend.byComponent.map((c) => (
                <tr key={c.component} className={`border-b border-black/[.05] dark:border-white/[.07] ${rowOdd}`}>
                  <td className={td}>{c.component}</td>
                  <td className={td}>{n(c.calls)}</td>
                  <td className={`${td} font-medium`}>{usd(c.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Model & pricing source">
          <table className="w-full border-collapse">
            <thead className="border-b border-black/[.08] dark:border-white/[.145]">
              <tr>
                <th className={th}>Model</th>
                <th className={th}>Provider</th>
                <th className={th}>Calls</th>
                <th className={th}>Estimated</th>
              </tr>
            </thead>
            <tbody>
              {spend.byModel.map((m) => (
                <tr key={`${m.model}-${m.provider}`} className={`border-b border-black/[.05] dark:border-white/[.07] ${rowOdd}`}>
                  <td className={td}>{m.model}</td>
                  <td className={td}>{m.provider}</td>
                  <td className={td}>{n(m.calls)}</td>
                  <td className={`${td} font-medium`}>{usd(m.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 space-y-1 text-xs text-zinc-500">
            {spend.pricing.map((p) => (
              <li key={`${p.status}-${p.source}`}>
                cost_status <code className="font-mono">{p.status}</code> · cost_source{" "}
                <code className="font-mono">{p.source}</code> · {n(p.rows)} rows
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="What costs nothing" note="Worth stating plainly, because it is most of the work.">
        <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <span className="font-medium text-black dark:text-zinc-100">1,000 image downloads</span> — plain
            HTTPS fetches from the MicroD CDN. No model, no tokens.
          </li>
          <li>
            <span className="font-medium text-black dark:text-zinc-100">1,000 dealer-page fetches</span> — the
            crawl that resolves each image hash. Same story.
          </li>
          <li>
            <span className="font-medium text-black dark:text-zinc-100">Catalog DB rebuild + attach + deploy</span> —
            local SQLite work and a git push. The site follows for free.
          </li>
          <li>
            <span className="font-medium text-black dark:text-zinc-100">Vercel hosting</span> — the catalog and this
            page serve from the committed snapshot.
          </li>
        </ul>
      </Section>

      <Section title="Remaining work" note="Cost tracks agent turns, not SKU count — 4.5x the SKUs is not 4.5x the money.">
        <table className="w-full border-collapse">
          <thead className="border-b border-black/[.08] dark:border-white/[.145]">
            <tr>
              <th className={th}>Work</th>
              <th className={th}>Basis</th>
              <th className={th}>Time</th>
              <th className={th}>Estimated</th>
            </tr>
          </thead>
          <tbody>
            {spend.projections.map((p) => (
              <tr key={p.work} className={`border-b border-black/[.05] dark:border-white/[.07] ${rowOdd}`}>
                <td className={`${td} font-medium`}>{p.work}</td>
                <td className={`${td} max-w-[24rem] whitespace-normal text-zinc-600 dark:text-zinc-400`}>{p.basis}</td>
                <td className={td}>{p.eta}</td>
                <td className={`${td} font-medium`}>{range(p.usdLow, p.usdHigh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Caveats">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {spend.caveats.map((c) => (
            <li key={c.slice(0, 40)}>{c}</li>
          ))}
        </ol>
      </Section>

      <p className="mt-12 border-t border-black/[.08] pt-4 text-xs text-zinc-500 dark:border-white/[.145]">
        Snapshot generated <span className="tabular-nums">{stamp(spend.generatedAt)}</span>. Refresh with{" "}
        <code className="font-mono">npm run spend:build</code> on the Gerber box, then commit{" "}
        <code className="font-mono">data/spend.json</code> — the same pattern as{" "}
        <code className="font-mono">data/catalog.db</code>. Per-job snapshots:{" "}
        <code className="font-mono">python3 cost_ledger.py report</code>.
      </p>
    </main>
  );
}
