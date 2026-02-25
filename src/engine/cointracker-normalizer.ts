// ─── CoinTracker CSV Normalizer ───────────────────────────────────────────────
// Converts CoinTracker CSV exports (22-column real format) into the native
// 14-column format expected by csv-parser.ts. Uses the explicit Type column
// and USD cost basis columns from CoinTracker's actual export format.

import Papa from "papaparse";
import { CSV_HEADERS } from "@/lib/constants";

interface NormalizerResult {
  csvContent: string;
  warnings: string[];
}

interface CoinTrackerRow {
  Date: string;
  Type: string;
  "Transaction ID": string;
  "Received Quantity": string;
  "Received Currency": string;
  "Received Cost Basis (USD)": string;
  "Received Wallet": string;
  "Received Address": string;
  "Received Comment": string;
  "Sent Quantity": string;
  "Sent Currency": string;
  "Sent Cost Basis (USD)": string;
  "Sent Wallet": string;
  "Sent Address": string;
  "Sent Comment": string;
  "Fee Amount": string;
  "Fee Currency": string;
  "Fee Cost Basis (USD)": string;
  "Realized Return (USD)": string;
  "Fee Realized Return (USD)": string;
  "Transaction Hash": string;
  "Block Explorer URL": string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === "";
}

function isObfuscated(value: string | undefined | null): boolean {
  if (isBlank(value)) return false;
  return value!.trim() === "...";
}

function parseNum(value: string | undefined | null): number | null {
  if (isBlank(value)) return null;
  const n = Number(value!.trim());
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Convert CoinTracker date format (M/D/YYYY H:MM:SS) to ISO 8601 UTC format
 * (YYYY-MM-DDThh:mm:ssZ). CoinTracker doesn't specify timezone; treating as
 * UTC is the standard assumption.
 */
function convertDate(ctDate: string): string | null {
  const trimmed = ctDate.trim();
  const match = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  const [, month, day, year, hours, minutes, seconds] = match;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  const hh = hours.padStart(2, "0");

  return `${year}-${mm}-${dd}T${hh}:${minutes}:${seconds}Z`;
}

function escapeField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function combineNotes(
  receivedComment: string | undefined,
  sentComment: string | undefined,
): string {
  const r = receivedComment?.trim() || "";
  const s = sentComment?.trim() || "";
  if (r && s) return `${r}; ${s}`;
  return r || s;
}

// ─── Type Mapping ─────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
  BUY: "BUY",
  SELL: "SELL",
  TRADE: "TRADE",
  STAKING_REWARD: "STAKING",
  INTEREST_PAYMENT: "STAKING",
  RECEIVE: "RECEIVE",
  SEND: "SEND",
  // TRANSFER is handled separately (emits two rows)
};

// ─── Native Row Builder ──────────────────────────────────────────────────────

interface NativeRowFields {
  dateStr: string;
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
  txHash: string;
  notes: string;
}

function buildNativeRow(fields: NativeRowFields): string {
  return [
    fields.dateStr,
    fields.type,
    fields.sentAsset,
    fields.sentAmount,
    fields.sentPriceUsd,
    fields.receivedAsset,
    fields.receivedAmount,
    fields.receivedPriceUsd,
    fields.feeAmount,
    fields.feeAsset,
    fields.feeUsd,
    escapeField(fields.wallet),
    fields.txHash,
    escapeField(fields.notes),
  ].join(",");
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

  // Detect obfuscated cost basis ("...") — common in free-tier CoinTracker exports.
  // Emit a single warning rather than per-row errors from the csv-parser.
  const hasObfuscatedCostBasis = parsed.data.some(
    (row) =>
      isObfuscated(row["Received Cost Basis (USD)"]) ||
      isObfuscated(row["Sent Cost Basis (USD)"]),
  );
  if (hasObfuscatedCostBasis) {
    warnings.push(
      'CoinTracker export contains obfuscated cost basis values ("..."). ' +
        "USD prices cannot be derived — income rows (STAKING, INTEREST) will be missing fair market values. " +
        "Re-export from CoinTracker with a paid plan, or manually add received_asset_price_usd values to the generated CSV.",
    );
  }

  for (let i = 0; i < parsed.data.length; i++) {
    const ct = parsed.data[i];
    const rowNum = i + 2; // 1-indexed, accounting for header

    // Convert date
    const dateStr = convertDate(ct.Date);
    if (dateStr === null) {
      warnings.push(
        `Row ${rowNum}: Could not parse date "${ct.Date}" — row skipped.`,
      );
      continue;
    }

    const ctType = ct.Type?.trim().toUpperCase() || "";
    const receivedQty = parseNum(ct["Received Quantity"]);
    const receivedCur = ct["Received Currency"]?.trim() || "";
    const receivedCostBasis = parseNum(ct["Received Cost Basis (USD)"]);
    const sentQty = parseNum(ct["Sent Quantity"]);
    const sentCur = ct["Sent Currency"]?.trim() || "";
    const feeQty = parseNum(ct["Fee Amount"]);
    const feeCur = ct["Fee Currency"]?.trim() || "";
    const feeCostBasis = parseNum(ct["Fee Cost Basis (USD)"]);
    const receivedWallet = ct["Received Wallet"]?.trim() || "";
    const sentWallet = ct["Sent Wallet"]?.trim() || "";
    const txHash = ct["Transaction Hash"]?.trim() || "";
    const notes = combineNotes(ct["Received Comment"], ct["Sent Comment"]);

    // Common fee fields — when fee is in USD, the amount IS the USD value
    const feeAmount = feeQty !== null ? String(feeQty) : "";
    const feeAsset = feeCur;
    const feeUsd =
      feeCur.toUpperCase() === "USD" && feeQty !== null
        ? String(feeQty)
        : feeCostBasis !== null
          ? String(feeCostBasis)
          : "";

    // ── Skip USD-only SEND/RECEIVE (fiat deposits/withdrawals) ──
    if (ctType === "RECEIVE" && receivedCur.toUpperCase() === "USD") continue;
    if (ctType === "SEND" && sentCur.toUpperCase() === "USD") continue;

    // ── TRANSFER → emit SEND + RECEIVE pair ──
    if (ctType === "TRANSFER") {
      // SEND side — from Sent Wallet, carries the fee
      rows.push(
        buildNativeRow({
          dateStr,
          type: "SEND",
          sentAsset: sentCur,
          sentAmount: sentQty !== null ? String(sentQty) : "",
          sentPriceUsd: "",
          receivedAsset: "",
          receivedAmount: "",
          receivedPriceUsd: "",
          feeAmount,
          feeAsset,
          feeUsd,
          wallet: sentWallet || receivedWallet || "Unknown",
          txHash,
          notes,
        }),
      );

      // RECEIVE side — at Received Wallet, with cost basis for lot tracking
      const recvPriceUsd =
        receivedCostBasis !== null && receivedQty !== null
          ? String(receivedCostBasis / receivedQty)
          : "";
      rows.push(
        buildNativeRow({
          dateStr,
          type: "RECEIVE",
          sentAsset: "",
          sentAmount: "",
          sentPriceUsd: "",
          receivedAsset: receivedCur,
          receivedAmount: receivedQty !== null ? String(receivedQty) : "",
          receivedPriceUsd: recvPriceUsd,
          feeAmount: "",
          feeAsset: "",
          feeUsd: "",
          wallet: receivedWallet || sentWallet || "Unknown",
          txHash,
          notes,
        }),
      );
      continue;
    }

    // ── Map type ──
    const nativeType = TYPE_MAP[ctType];
    if (!nativeType) {
      warnings.push(
        `Row ${rowNum}: Unrecognized CoinTracker type "${ct.Type}" — row skipped.`,
      );
      continue;
    }

    // ── Derive USD prices (only for the sides relevant to each type) ──
    let receivedPriceUsd = "";
    let sentPriceUsd = "";

    switch (nativeType) {
      case "BUY":
      case "STAKING":
      case "RECEIVE":
        if (receivedCostBasis !== null && receivedQty !== null) {
          receivedPriceUsd = String(receivedCostBasis / receivedQty);
        }
        break;
      case "SELL":
        if (receivedCostBasis !== null && sentQty !== null) {
          sentPriceUsd = String(receivedCostBasis / sentQty);
        }
        break;
      case "TRADE":
        if (receivedCostBasis !== null && receivedQty !== null) {
          receivedPriceUsd = String(receivedCostBasis / receivedQty);
        }
        if (receivedCostBasis !== null && sentQty !== null) {
          sentPriceUsd = String(receivedCostBasis / sentQty);
        }
        break;
      // SEND: no prices needed
    }

    // ── Select wallet ──
    let wallet: string;
    switch (nativeType) {
      case "BUY":
      case "RECEIVE":
      case "STAKING":
        wallet = receivedWallet || sentWallet || "Unknown";
        break;
      case "SELL":
      case "SEND":
      case "TRADE":
        wallet = sentWallet || receivedWallet || "Unknown";
        break;
      default:
        wallet = receivedWallet || sentWallet || "Unknown";
    }

    rows.push(
      buildNativeRow({
        dateStr,
        type: nativeType,
        sentAsset: sentQty !== null ? sentCur : "",
        sentAmount: sentQty !== null ? String(sentQty) : "",
        sentPriceUsd,
        receivedAsset: receivedQty !== null ? receivedCur : "",
        receivedAmount: receivedQty !== null ? String(receivedQty) : "",
        receivedPriceUsd,
        feeAmount,
        feeAsset,
        feeUsd,
        wallet,
        txHash,
        notes,
      }),
    );
  }

  return { csvContent: rows.join("\n"), warnings };
}
