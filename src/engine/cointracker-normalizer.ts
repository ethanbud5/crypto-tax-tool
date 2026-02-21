// ─── CoinTracker CSV Normalizer ───────────────────────────────────────────────
// Converts CoinTracker CSV exports into the native 14-column format expected
// by csv-parser.ts. Derives USD prices where possible (USD-denominated trades)
// and emits warnings for rows where prices cannot be derived.

import Papa from "papaparse";
import { CSV_HEADERS } from "@/lib/constants";

interface NormalizerResult {
  csvContent: string;
  warnings: string[];
}

interface CoinTrackerRow {
  Date: string;
  "Received Quantity": string;
  "Received Currency": string;
  "Sent Quantity": string;
  "Sent Currency": string;
  "Fee Amount": string;
  "Fee Currency": string;
  Exchange: string;
  "Trade-Group": string;
  Comment: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === "";
}

function parseNum(value: string | undefined | null): number | null {
  if (isBlank(value)) return null;
  const n = Number(value!.trim());
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Convert CoinTracker date format (MM/DD/YYYY HH:MM:SS) to ISO-like format
 * (YYYY-MM-DDThh:mm:ss). Intentionally omits timezone suffix so the existing
 * csv-parser will emit its standard "no timezone info" warning.
 */
function convertDate(ctDate: string): string | null {
  const trimmed = ctDate.trim();
  // Match MM/DD/YYYY HH:MM:SS
  const match = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  const [, month, day, year, hours, minutes, seconds] = match;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  const hh = hours.padStart(2, "0");

  return `${year}-${mm}-${dd}T${hh}:${minutes}:${seconds}`;
}

const INCOME_COMMENTS: Record<string, string> = {
  "staking reward": "STAKING",
  staking: "STAKING",
  "mining reward": "MINING",
  mining: "MINING",
  airdrop: "AIRDROP",
  fork: "FORK",
};

// ─── Row Classification ──────────────────────────────────────────────────────

interface ClassifiedRow {
  type: string;
  sentAsset: string;
  sentAmount: string;
  sentPriceUsd: string;
  receivedAsset: string;
  receivedAmount: string;
  receivedPriceUsd: string;
  feeAmount: string;
  feeAsset: string;
  feeUsd: string;
  wallet: string;
  notes: string;
  warning?: string;
}

function classifyRow(row: CoinTrackerRow, rowNum: number): ClassifiedRow {
  const receivedQty = parseNum(row["Received Quantity"]);
  const receivedCur = row["Received Currency"]?.trim() || "";
  const sentQty = parseNum(row["Sent Quantity"]);
  const sentCur = row["Sent Currency"]?.trim() || "";
  const feeQty = parseNum(row["Fee Amount"]);
  const feeCur = row["Fee Currency"]?.trim() || "";
  const exchange = row["Exchange"]?.trim() || "Unknown";
  const comment = row["Comment"]?.trim() || "";
  const commentLower = comment.toLowerCase();

  const hasReceived = receivedQty !== null && receivedCur !== "";
  const hasSent = sentQty !== null && sentCur !== "";

  let type = "";
  let sentPriceUsd = "";
  let receivedPriceUsd = "";
  let warning: string | undefined;

  // Fee USD: only derivable if fee is in USD
  const feeUsd =
    feeQty !== null && feeCur.toUpperCase() === "USD"
      ? String(feeQty)
      : "";

  if (hasSent && hasReceived) {
    // Both sides present — determine if it's a fiat buy/sell or crypto trade
    const sentIsUsd = sentCur.toUpperCase() === "USD";
    const receivedIsUsd = receivedCur.toUpperCase() === "USD";

    if (sentIsUsd && !receivedIsUsd) {
      // USD sent, crypto received → BUY
      type = "BUY";
      receivedPriceUsd = String(sentQty! / receivedQty!);
    } else if (!sentIsUsd && receivedIsUsd) {
      // Crypto sent, USD received → SELL
      type = "SELL";
      sentPriceUsd = String(receivedQty! / sentQty!);
    } else if (!sentIsUsd && !receivedIsUsd) {
      // Crypto to crypto → TRADE
      type = "TRADE";
      warning = `Row ${rowNum}: Crypto-to-crypto trade (${sentCur} → ${receivedCur}) — USD prices not available. Cost basis will default to $0.`;
    } else {
      // USD to USD — unusual, treat as TRADE with warning
      type = "TRADE";
      warning = `Row ${rowNum}: USD-to-USD transaction — treated as TRADE.`;
    }
  } else if (hasReceived && !hasSent) {
    // Only received — could be income or a buy (deposit)
    const incomeType = INCOME_COMMENTS[commentLower];
    if (incomeType) {
      type = incomeType;
      // Income types require received_asset_price_usd which we can't derive
      // csv-parser will emit an error for missing FMV — this is correct behavior
    } else {
      // No income tag — treat as BUY (deposit/transfer in)
      type = "BUY";
    }
  } else if (hasSent && !hasReceived) {
    // Only sent — could be a transfer or sell
    if (commentLower === "transfer" || commentLower === "withdrawal") {
      type = "SEND";
    } else {
      type = "SELL";
      warning = `Row ${rowNum}: Sent-only transaction (${sentCur}) with no received side — treated as SELL. USD price not available.`;
    }
  } else {
    // Neither side — skip with warning
    type = "BUY"; // fallback
    warning = `Row ${rowNum}: No sent or received amounts found — row may be invalid.`;
  }

  // Handle non-USD fiat
  if (hasSent && hasReceived) {
    const NON_USD_FIAT = new Set(["EUR", "GBP", "CAD", "AUD", "JPY", "CHF"]);
    if (NON_USD_FIAT.has(sentCur.toUpperCase()) && receivedPriceUsd === "") {
      warning = `Row ${rowNum}: Non-USD fiat (${sentCur}) — cannot derive USD price. You may need to add prices manually.`;
    }
    if (NON_USD_FIAT.has(receivedCur.toUpperCase()) && sentPriceUsd === "") {
      warning = `Row ${rowNum}: Non-USD fiat (${receivedCur}) — cannot derive USD price. You may need to add prices manually.`;
    }
  }

  return {
    type,
    sentAsset: hasSent ? sentCur : "",
    sentAmount: hasSent ? String(sentQty) : "",
    sentPriceUsd,
    receivedAsset: hasReceived ? receivedCur : "",
    receivedAmount: hasReceived ? String(receivedQty) : "",
    receivedPriceUsd,
    feeAmount: feeQty !== null ? String(feeQty) : "",
    feeAsset: feeCur,
    feeUsd,
    wallet: exchange,
    notes: comment,
    warning,
  };
}

// ─── Main Normalizer ─────────────────────────────────────────────────────────

export function normalizeCoinTracker(csvContent: string): NormalizerResult {
  const warnings: string[] = [];

  const parsed = Papa.parse<CoinTrackerRow>(csvContent.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.data.length === 0) {
    return { csvContent: "", warnings };
  }

  // Build native CSV header
  const nativeHeaders = [
    CSV_HEADERS.DATE_TIME,
    CSV_HEADERS.TRANSACTION_TYPE,
    CSV_HEADERS.SENT_ASSET,
    CSV_HEADERS.SENT_AMOUNT,
    CSV_HEADERS.SENT_ASSET_PRICE_USD,
    CSV_HEADERS.RECEIVED_ASSET,
    CSV_HEADERS.RECEIVED_AMOUNT,
    CSV_HEADERS.RECEIVED_ASSET_PRICE_USD,
    CSV_HEADERS.FEE_AMOUNT,
    CSV_HEADERS.FEE_ASSET,
    CSV_HEADERS.FEE_USD,
    CSV_HEADERS.WALLET,
    CSV_HEADERS.TX_HASH,
    CSV_HEADERS.NOTES,
  ];

  const rows: string[] = [nativeHeaders.join(",")];

  for (let i = 0; i < parsed.data.length; i++) {
    const ctRow = parsed.data[i];
    const rowNum = i + 2; // 1-indexed, accounting for header

    // Convert date
    const dateStr = convertDate(ctRow.Date);
    if (dateStr === null) {
      warnings.push(
        `Row ${rowNum}: Could not parse date "${ctRow.Date}" — row skipped.`,
      );
      continue;
    }

    const classified = classifyRow(ctRow, rowNum);
    if (classified.warning) {
      warnings.push(classified.warning);
    }

    // Escape fields that might contain commas
    const escapeField = (field: string) =>
      field.includes(",") ? `"${field}"` : field;

    const nativeRow = [
      dateStr,
      classified.type,
      classified.sentAsset,
      classified.sentAmount,
      classified.sentPriceUsd,
      classified.receivedAsset,
      classified.receivedAmount,
      classified.receivedPriceUsd,
      classified.feeAmount,
      classified.feeAsset,
      classified.feeUsd,
      classified.wallet,
      "", // tx_hash — CoinTracker doesn't provide this
      escapeField(classified.notes),
    ].join(",");

    rows.push(nativeRow);
  }

  return { csvContent: rows.join("\n"), warnings };
}
