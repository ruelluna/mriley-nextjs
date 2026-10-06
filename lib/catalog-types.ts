/**
 * Client-safe catalog shapes and constants.
 *
 * This module must stay free of server-only imports (node:sqlite) -- Client
 * Components import it, and anything they touch gets bundled for the browser.
 */

export type Scope = "priced" | "imaged" | "all";

export type ProductImage = {
  position: number;
  url: string;
  fullUrl: string | null;
};

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
  /** Display-size URL, or null when no image has been attached yet. */
  imageUrl: string | null;
  ledgerStatus: string;
  /** WooCommerce product id, once the SKU has been pushed (null while it hasn't). */
  wooId: number | null;
  /** Permalink captured from the store's API — the real product URL, null when not pushed. */
  storeUrl: string | null;
  description: string;
};

export type ProductDetail = ProductSummary & {
  typicalPrice: string;
  dimensions: { depth: string; height: string; width: string };
  images: ProductImage[];
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
  /** Products with a WooCommerce product id on the ledger — the pushed set. */
  pushed: number;
  /** Of those, created by the sync and already on the store when it ran. */
  created: number;
  alreadyPresent: number;
  /** Distinct SKUs with an image link attached (not the same as the staged count). */
  imagesLinked: number;
  /** Ledger rows carrying a store permalink captured from the WooCommerce API. */
  storeLinked: number;
  minPrice: number | null;
  maxPrice: number | null;
};

export function money(v: number | null | undefined): string {
  return v == null
    ? "—"
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
