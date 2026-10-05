/**
 * Client-safe catalog shapes and constants.
 *
 * This module must stay free of server-only imports (node:sqlite) -- Client
 * Components import it, and anything they touch gets bundled for the browser.
 */

export type Scope = "priced" | "imaged" | "all";

export type ProductSummary = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  department: string;
  type: string;
  subtype: string;
  collection: string;
  price: number | null;
  displayPrice: string;
  hasImage: boolean;
  ledgerStatus: string;
  description: string;
};

export type ProductDetail = ProductSummary & {
  typicalPrice: string;
  dimensions: { depth: string; height: string; width: string };
  raw: Record<string, string>;
};

export type SortKey = "price_asc" | "price_desc" | "name" | "brand" | "sku";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "price_asc", label: "Price: low → high" },
  { key: "price_desc", label: "Price: high → low" },
  { key: "name", label: "Name A–Z" },
  { key: "brand", label: "Brand A–Z" },
  { key: "sku", label: "SKU A–Z" },
];

export const PER_PAGE_OPTIONS = [24, 48, 96] as const;

export type Facet = { value: string; n: number };

export type Stats = {
  scope: Scope;
  products: number;
  brands: number;
  categories: number;
  collections: number;
  withImage: number;
  minPrice: number | null;
  maxPrice: number | null;
};

export function money(v: number | null | undefined): string {
  return v == null
    ? "—"
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
