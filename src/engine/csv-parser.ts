import Papa from "papaparse";
import Decimal from "decimal.js";
import {
  Transaction,
  TransactionType,
  ParseResult,
  ValidationError,
  ValidationWarning,
} from "@/engine/types";
import { CSV_HEADERS, INCOME_TYPES } from "@/lib/constants";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_TRANSACTION_TYPES = new Set(Object.values(TransactionType));

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

function toDecimalOrNull(value: unknown): Decimal | null {
  if (isBlank(value)) return null;
  try {
    return new Decimal(String(value).trim());
  } catch {
    return null;
  }
}

function hasTimezoneInfo(dateStr: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})\s*$/.test(dateStr.trim());
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseCsv(csvContent: string): ParseResult {
  const transactions: Transaction[] = [];
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const trimmed = csvContent.trim();
  if (trimmed === "") {
    return { transactions, errors, warnings };
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: true,
  });

  // Surface PapaParse-level errors
  for (const err of parsed.errors) {
    errors.push({
      row: (err.row ?? -1) + 2,
      field: "",
      message: err.message,
    });
  }

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2; // 1-indexed, accounting for header row

    const rowErrors: ValidationError[] = [];
    const rowWarnings: ValidationWarning[] = [];

    // ── Required: date_time ──────────────────────────────────────────────
    const rawDateTime = row[CSV_HEADERS.DATE_TIME];
    let dateTime: Date | null = null;

    if (isBlank(rawDateTime)) {
      rowErrors.push({
        row: rowNum,
        field: CSV_HEADERS.DATE_TIME,
        message: "date_time is required",
      });
    } else {
      const dt = new Date(rawDateTime.trim());
      if (isNaN(dt.getTime())) {
        rowErrors.push({
          row: rowNum,
          field: CSV_HEADERS.DATE_TIME,
          message: `Invalid date: "${rawDateTime}"`,
        });
      } else {
        dateTime = dt;
        if (!hasTimezoneInfo(rawDateTime.trim())) {
          rowWarnings.push({
            row: rowNum,
            field: CSV_HEADERS.DATE_TIME,
            message:
              "Date has no timezone info; UTC will be assumed. Consider adding Z or +00:00.",
          });
        }
      }
    }

    // ── Required: transaction_type ───────────────────────────────────────
    const rawType = row[CSV_HEADERS.TRANSACTION_TYPE];
    let txType: TransactionType | null = null;

    if (isBlank(rawType)) {
      rowErrors.push({
        row: rowNum,
        field: CSV_HEADERS.TRANSACTION_TYPE,
        message: "transaction_type is required",
      });
    } else {
      const upper = rawType.trim().toUpperCase();
      if (!VALID_TRANSACTION_TYPES.has(upper as TransactionType)) {
        rowErrors.push({
          row: rowNum,
          field: CSV_HEADERS.TRANSACTION_TYPE,
          message: `Unknown transaction type: "${rawType}"`,
        });
      } else {
        txType = upper as TransactionType;
      }
    }

    // ── Required: wallet_or_exchange ─────────────────────────────────────
    const rawWallet = row[CSV_HEADERS.WALLET];
    if (isBlank(rawWallet)) {
      rowErrors.push({
        row: rowNum,
        field: CSV_HEADERS.WALLET,
        message: "wallet_or_exchange is required",
      });
    }

    // ── Parse numeric fields ─────────────────────────────────────────────
    const sentAmount = toDecimalOrNull(row[CSV_HEADERS.SENT_AMOUNT]);
    const sentAssetPriceUsd = toDecimalOrNull(
      row[CSV_HEADERS.SENT_ASSET_PRICE_USD]
    );
    const receivedAmount = toDecimalOrNull(row[CSV_HEADERS.RECEIVED_AMOUNT]);
    const receivedAssetPriceUsd = toDecimalOrNull(
      row[CSV_HEADERS.RECEIVED_ASSET_PRICE_USD]
    );
    const feeAmount = toDecimalOrNull(row[CSV_HEADERS.FEE_AMOUNT]);
    const feeUsd = toDecimalOrNull(row[CSV_HEADERS.FEE_USD]);

    // ── Validate amounts are positive ────────────────────────────────────
    const amountFields = [
      { name: CSV_HEADERS.SENT_AMOUNT, value: sentAmount },
      { name: CSV_HEADERS.RECEIVED_AMOUNT, value: receivedAmount },
      { name: CSV_HEADERS.FEE_AMOUNT, value: feeAmount },
      { name: CSV_HEADERS.FEE_USD, value: feeUsd },
    ];

    for (const { name, value } of amountFields) {
      if (value !== null && value.lte(0)) {
        rowErrors.push({
          row: rowNum,
          field: name,
          message: `${name} must be a positive number, got ${value.toString()}`,
        });
      }
    }

    // Check non-blank values that failed numeric parsing
    if (!isBlank(row[CSV_HEADERS.SENT_AMOUNT]) && sentAmount === null) {
      rowErrors.push({
        row: rowNum,
        field: CSV_HEADERS.SENT_AMOUNT,
        message: `Invalid number for sent_amount: "${row[CSV_HEADERS.SENT_AMOUNT]}"`,
      });
    }
    if (!isBlank(row[CSV_HEADERS.RECEIVED_AMOUNT]) && receivedAmount === null) {
      rowErrors.push({
        row: rowNum,
        field: CSV_HEADERS.RECEIVED_AMOUNT,
        message: `Invalid number for received_amount: "${row[CSV_HEADERS.RECEIVED_AMOUNT]}"`,
      });
    }

    // ── Type-specific validation ─────────────────────────────────────────
    if (txType !== null) {
      const sentAsset = row[CSV_HEADERS.SENT_ASSET]?.trim() || "";
      const receivedAsset = row[CSV_HEADERS.RECEIVED_ASSET]?.trim() || "";

      // SELL, SPEND, SEND, GIFT_SENT require sent fields
      if (
        txType === TransactionType.SELL ||
        txType === TransactionType.SPEND ||
        txType === TransactionType.SEND ||
        txType === TransactionType.GIFT_SENT
      ) {
        if (!sentAsset) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.SENT_ASSET,
            message: `sent_asset is required for ${txType}`,
          });
        }
        if (sentAmount === null) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.SENT_AMOUNT,
            message: `sent_amount is required for ${txType}`,
          });
        }
      }

      // BUY, RECEIVE, GIFT_RECEIVED require received fields
      if (
        txType === TransactionType.BUY ||
        txType === TransactionType.RECEIVE ||
        txType === TransactionType.GIFT_RECEIVED
      ) {
        if (!receivedAsset) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.RECEIVED_ASSET,
            message: `received_asset is required for ${txType}`,
          });
        }
        if (receivedAmount === null) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.RECEIVED_AMOUNT,
            message: `received_amount is required for ${txType}`,
          });
        }
      }

      // TRADE requires both sides
      if (txType === TransactionType.TRADE) {
        if (!sentAsset) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.SENT_ASSET,
            message: "sent_asset is required for TRADE",
          });
        }
        if (sentAmount === null) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.SENT_AMOUNT,
            message: "sent_amount is required for TRADE",
          });
        }
        if (!receivedAsset) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.RECEIVED_ASSET,
            message: "received_asset is required for TRADE",
          });
        }
        if (receivedAmount === null) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.RECEIVED_AMOUNT,
            message: "received_amount is required for TRADE",
          });
        }
      }

      // Income types require received fields + price
      if (INCOME_TYPES.has(txType)) {
        if (!receivedAsset) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.RECEIVED_ASSET,
            message: `received_asset is required for ${txType}`,
          });
        }
        if (receivedAmount === null) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.RECEIVED_AMOUNT,
            message: `received_amount is required for ${txType}`,
          });
        }
        if (receivedAssetPriceUsd === null) {
          rowErrors.push({
            row: rowNum,
            field: CSV_HEADERS.RECEIVED_ASSET_PRICE_USD,
            message: `received_asset_price_usd is required for ${txType}`,
          });
        }
      }
    }

    // ── Collect errors/warnings ──────────────────────────────────────────
    errors.push(...rowErrors);
    warnings.push(...rowWarnings);

    // Only build transaction if no errors on this row
    if (rowErrors.length === 0 && dateTime !== null && txType !== null) {
      const tx: Transaction = {
        dateTime,
        type: txType,
        wallet: rawWallet.trim(),
      };

      const sentAsset = row[CSV_HEADERS.SENT_ASSET]?.trim();
      if (sentAsset) tx.sentAsset = sentAsset;
      if (sentAmount !== null) tx.sentAmount = sentAmount;
      if (sentAssetPriceUsd !== null) tx.sentAssetPriceUsd = sentAssetPriceUsd;

      const receivedAsset = row[CSV_HEADERS.RECEIVED_ASSET]?.trim();
      if (receivedAsset) tx.receivedAsset = receivedAsset;
      if (receivedAmount !== null) tx.receivedAmount = receivedAmount;
      if (receivedAssetPriceUsd !== null)
        tx.receivedAssetPriceUsd = receivedAssetPriceUsd;

      if (feeAmount !== null) tx.feeAmount = feeAmount;
      const feeAsset = row[CSV_HEADERS.FEE_ASSET]?.trim();
      if (feeAsset) tx.feeAsset = feeAsset;
      if (feeUsd !== null) tx.feeUsd = feeUsd;

      const txHash = row[CSV_HEADERS.TX_HASH]?.trim();
      if (txHash) tx.txHash = txHash;
      const notes = row[CSV_HEADERS.NOTES]?.trim();
      if (notes) tx.notes = notes;

      transactions.push(tx);
    }
  }

  return { transactions, errors, warnings };
}
