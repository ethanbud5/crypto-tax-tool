// ─── CSV Format Detector ──────────────────────────────────────────────────────
// Inspects the header row of a CSV to determine its format.
// Returns "native" for our custom format, "cointracker" for CoinTracker exports,
// or "unknown" for anything else.

export type CsvFormat = "native" | "cointracker" | "unknown";

const NATIVE_REQUIRED_HEADERS = [
  "date_time",
  "transaction_type",
  "wallet_or_exchange",
];

const COINTRACKER_REQUIRED_HEADERS = [
  "Date",
  "Type",
  "Received Quantity",
  "Received Currency",
  "Received Cost Basis (USD)",
  "Sent Quantity",
  "Sent Currency",
];

export function detectCsvFormat(csvContent: string): CsvFormat {
  const firstLine = csvContent.trim().split(/\r?\n/)[0];
  if (!firstLine || !firstLine.trim()) return "unknown";

  // Split by comma and normalize whitespace on each header
  const headers = firstLine.split(",").map((h) => h.trim());
  const headerSet = new Set(headers);

  if (NATIVE_REQUIRED_HEADERS.every((h) => headerSet.has(h))) {
    return "native";
  }

  if (COINTRACKER_REQUIRED_HEADERS.every((h) => headerSet.has(h))) {
    return "cointracker";
  }

  return "unknown";
}
