import { TransactionType } from "@/engine/types";

// ─── Income Transaction Types ─────────────────────────────────────────────────
// These transaction types are treated as ordinary income at fair market value
// and also create a new tax lot with basis = FMV (dual event).

export const INCOME_TYPES: ReadonlySet<TransactionType> = new Set([
  TransactionType.MINING,
  TransactionType.STAKING,
  TransactionType.AIRDROP,
  TransactionType.FORK,
  TransactionType.INCOME,
]);

// ─── Disposal Transaction Types ───────────────────────────────────────────────
// These transaction types trigger a capital gain/loss calculation.

export const DISPOSAL_TYPES: ReadonlySet<TransactionType> = new Set([
  TransactionType.SELL,
  TransactionType.SPEND,
  TransactionType.TRADE,
  TransactionType.GIFT_SENT,
]);

// ─── Acquisition Transaction Types ───────────────────────────────────────────
// These create new tax lots without triggering income or disposals.

export const ACQUISITION_TYPES: ReadonlySet<TransactionType> = new Set([
  TransactionType.BUY,
  TransactionType.RECEIVE,
  TransactionType.GIFT_RECEIVED,
]);

// ─── Holding Period Threshold ─────────────────────────────────────────────────
// Assets held for more than this many days qualify as long-term capital gains.
// IRS rule: must hold for MORE than one year (>365 days).

export const LONG_TERM_HOLDING_DAYS = 365;

// ─── CSV Column Headers ──────────────────────────────────────────────────────
// Expected column names in the uploaded CSV file.

export const CSV_HEADERS = {
  DATE_TIME: "date_time",
  TRANSACTION_TYPE: "transaction_type",
  SENT_ASSET: "sent_asset",
  SENT_AMOUNT: "sent_amount",
  SENT_ASSET_PRICE_USD: "sent_asset_price_usd",
  RECEIVED_ASSET: "received_asset",
  RECEIVED_AMOUNT: "received_amount",
  RECEIVED_ASSET_PRICE_USD: "received_asset_price_usd",
  FEE_AMOUNT: "fee_amount",
  FEE_ASSET: "fee_asset",
  FEE_USD: "fee_usd",
  WALLET: "wallet_or_exchange",
  TX_HASH: "tx_hash",
  NOTES: "notes",
} as const;
