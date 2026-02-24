// ─── Historical Price Enrichment ──────────────────────────────────────────────
// Fetches daily close prices from CryptoCompare and fills in missing USD price
// fields in normalized CSV output. Runs between normalization and parsing so
// that neither the sync normalizer nor the strict parser need modification.

import Papa from "papaparse";
import { CSV_HEADERS } from "@/lib/constants";

export interface EnrichmentResult {
  csvContent: string;
  warnings: string[];
  pricesFilled: number;
}

// ─── CryptoCompare API Types ─────────────────────────────────────────────────

interface HistodayDataPoint {
  time: number;
  close: number;
}

interface HistodayResponse {
  Response: string;
  Message?: string;
  Data?: {
    Data?: HistodayDataPoint[];
  };
}

// ─── Fetch Daily Prices ──────────────────────────────────────────────────────

/**
 * Fetches up to 2000 days of daily close prices ending at `toDate` for a given
 * ticker. Returns a Map keyed by "YYYY-MM-DD" → close price.
 */
export async function fetchDailyPrices(
  ticker: string,
  toDate: Date,
): Promise<Map<string, number>> {
  const toTs = Math.floor(toDate.getTime() / 1000);
  const url =
    `https://min-api.cryptocompare.com/data/v2/histoday` +
    `?fsym=${encodeURIComponent(ticker)}&tsym=USD&limit=2000&toTs=${toTs}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CryptoCompare API returned ${res.status} for ${ticker}`);
  }

  const json: HistodayResponse = await res.json();
  if (json.Response !== "Success" || !json.Data?.Data) {
    throw new Error(
      `CryptoCompare returned no data for ${ticker}: ${json.Message ?? "unknown error"}`,
    );
  }

  const priceMap = new Map<string, number>();
  for (const point of json.Data.Data) {
    if (point.close > 0) {
      const dateStr = new Date(point.time * 1000).toISOString().slice(0, 10);
      priceMap.set(dateStr, point.close);
    }
  }
  return priceMap;
}

// ─── Price Lookup with ±1 Day Fallback ───────────────────────────────────────

/**
 * Looks up a price for `ticker` on `dateStr` (YYYY-MM-DD). Falls back to the
 * day before and after if an exact match isn't found (e.g., for timezone edge
 * cases in daily OHLCV data).
 */
export function lookupPrice(
  cache: Map<string, Map<string, number>>,
  ticker: string,
  dateStr: string,
): number | null {
  const priceMap = cache.get(ticker);
  if (!priceMap) return null;

  // Exact match
  const exact = priceMap.get(dateStr);
  if (exact !== undefined) return exact;

  // ±1 day fallback
  const d = new Date(dateStr + "T00:00:00Z");
  const prev = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
  const next = new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);

  return priceMap.get(prev) ?? priceMap.get(next) ?? null;
}

// ─── Enrich Prices ───────────────────────────────────────────────────────────

/**
 * Scans a normalized CSV string for rows with missing price fields. For each
 * unique ticker, fetches daily close prices from CryptoCompare and fills in
 * blanks. Returns the enriched CSV, warnings, and count of prices filled.
 *
 * Short-circuits with zero API calls if all prices are already present.
 */
export async function enrichPrices(
  csvContent: string,
): Promise<EnrichmentResult> {
  const warnings: string[] = [];
  let pricesFilled = 0;

  if (!csvContent.trim()) {
    return { csvContent, warnings, pricesFilled };
  }

  const parsed = Papa.parse<Record<string, string>>(csvContent.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.data.length === 0) {
    return { csvContent, warnings, pricesFilled };
  }

  // ── Identify rows needing prices ───────────────────────────────────────────
  // Collect unique tickers that need price lookups and find the latest date.

  const tickersNeeded = new Set<string>();
  let latestDate = new Date(0);

  for (const row of parsed.data) {
    const dateStr = row[CSV_HEADERS.DATE_TIME] ?? "";
    const rowDate = dateStr ? new Date(dateStr) : null;
    if (rowDate && !isNaN(rowDate.getTime()) && rowDate > latestDate) {
      latestDate = rowDate;
    }

    const receivedAsset = row[CSV_HEADERS.RECEIVED_ASSET]?.trim() ?? "";
    const receivedAmount = row[CSV_HEADERS.RECEIVED_AMOUNT]?.trim() ?? "";
    const receivedPrice =
      row[CSV_HEADERS.RECEIVED_ASSET_PRICE_USD]?.trim() ?? "";

    if (
      receivedAsset &&
      receivedAsset.toUpperCase() !== "USD" &&
      receivedAmount &&
      !receivedPrice
    ) {
      tickersNeeded.add(receivedAsset.toUpperCase());
    }

    const sentAsset = row[CSV_HEADERS.SENT_ASSET]?.trim() ?? "";
    const sentAmount = row[CSV_HEADERS.SENT_AMOUNT]?.trim() ?? "";
    const sentPrice = row[CSV_HEADERS.SENT_ASSET_PRICE_USD]?.trim() ?? "";

    if (
      sentAsset &&
      sentAsset.toUpperCase() !== "USD" &&
      sentAmount &&
      !sentPrice
    ) {
      tickersNeeded.add(sentAsset.toUpperCase());
    }
  }

  // Short-circuit: nothing to do
  if (tickersNeeded.size === 0) {
    return { csvContent, warnings, pricesFilled };
  }

  // ── Fetch prices for each ticker ───────────────────────────────────────────

  const cache = new Map<string, Map<string, number>>();

  // Use the latest transaction date + 1 day buffer for the API toTs
  const toDate = new Date(latestDate.getTime() + 86_400_000);

  for (const ticker of tickersNeeded) {
    try {
      const prices = await fetchDailyPrices(ticker, toDate);
      if (prices.size === 0) {
        warnings.push(`No price data returned for ${ticker}`);
      } else {
        cache.set(ticker, prices);
      }
    } catch (err) {
      warnings.push(
        `Failed to fetch prices for ${ticker}: ${(err as Error).message}`,
      );
    }
  }

  // ── Fill in missing prices ─────────────────────────────────────────────────

  for (const row of parsed.data) {
    const dateStr = (row[CSV_HEADERS.DATE_TIME] ?? "").slice(0, 10);
    if (!dateStr) continue;

    // Received side
    const receivedAsset = row[CSV_HEADERS.RECEIVED_ASSET]?.trim() ?? "";
    const receivedAmount = row[CSV_HEADERS.RECEIVED_AMOUNT]?.trim() ?? "";
    const receivedPrice =
      row[CSV_HEADERS.RECEIVED_ASSET_PRICE_USD]?.trim() ?? "";

    if (
      receivedAsset &&
      receivedAsset.toUpperCase() !== "USD" &&
      receivedAmount &&
      !receivedPrice
    ) {
      const price = lookupPrice(
        cache,
        receivedAsset.toUpperCase(),
        dateStr,
      );
      if (price !== null) {
        row[CSV_HEADERS.RECEIVED_ASSET_PRICE_USD] = String(price);
        pricesFilled++;
      }
    }

    // Sent side
    const sentAsset = row[CSV_HEADERS.SENT_ASSET]?.trim() ?? "";
    const sentAmount = row[CSV_HEADERS.SENT_AMOUNT]?.trim() ?? "";
    const sentPrice = row[CSV_HEADERS.SENT_ASSET_PRICE_USD]?.trim() ?? "";

    if (
      sentAsset &&
      sentAsset.toUpperCase() !== "USD" &&
      sentAmount &&
      !sentPrice
    ) {
      const price = lookupPrice(cache, sentAsset.toUpperCase(), dateStr);
      if (price !== null) {
        row[CSV_HEADERS.SENT_ASSET_PRICE_USD] = String(price);
        pricesFilled++;
      }
    }
  }

  // ── Re-serialize to CSV ────────────────────────────────────────────────────

  const headers = parsed.meta.fields!;
  const enrichedCsv = Papa.unparse(parsed.data, { columns: headers });

  if (pricesFilled > 0) {
    warnings.push(
      `Auto-filled ${pricesFilled} price(s) using CryptoCompare daily close data.`,
    );
  }

  return { csvContent: enrichedCsv, warnings, pricesFilled };
}
