import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { marked } from "marked";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Brand representative portal — plan · Gerber Furniture",
  description:
    "How brand reps update prices and product information on gerbersfurniture.com from an expiring link, without a WordPress account.",
};

const DOC = "brand-rep-portal-plan.md";

function renderDoc(): { html: string; error: string | null } {
  try {
    const md = readFileSync(join(process.cwd(), "content", DOC), "utf8");
    return { html: marked.parse(md, { async: false, gfm: true }) as string, error: null };
  } catch (e) {
    return { html: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export default function BrandRepPortalPlanPage() {
  const { html, error } = renderDoc();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="uppercase tracking-widest">Gerber Furniture · internal plan</span>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/plan" className="underline-offset-4 hover:underline">
            Image-harvest plan →
          </Link>
          <Link href="/products" className="underline-offset-4 hover:underline">
            Product catalog →
          </Link>
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Plan document not found at runtime.</p>
          <p className="mt-1">
            Expected <code className="font-mono">content/{DOC}</code> to be present. Keep it traced
            with <code className="font-mono">outputFileTracingIncludes</code>. Error: {error}
          </p>
        </div>
      ) : (
        <article className="doc" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </main>
  );
}
