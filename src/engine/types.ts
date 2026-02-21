import Decimal from "decimal.js";

// ─── Transaction Types from CSV ───────────────────────────────────────────────

export enum TransactionType {
  BUY = "BUY",
  SELL = "SELL",
  TRADE = "TRADE",
  SEND = "SEND",
  RECEIVE = "RECEIVE",
  MINING = "MINING",
  STAKING = "STAKING",
  AIRDROP = "AIRDROP",
  FORK = "FORK",
  SPEND = "SPEND",
  GIFT_SENT = "GIFT_SENT",
  GIFT_RECEIVED = "GIFT_RECEIVED",
  INCOME = "INCOME",
}

// ─── Cost Basis Method Selection ──────────────────────────────────────────────

export enum CostBasisMethod {
  FIFO = "FIFO", // Default — oldest lots first
  LIFO = "LIFO", // Newest lots first
  HIFO = "HIFO", // Highest cost lots first (minimizes gains)
}

// ─── Parsed CSV Row ───────────────────────────────────────────────────────────

export interface Transaction {
  dateTime: Date;
  type: TransactionType;
  sentAsset?: string;
  sentAmount?: Decimal;
  sentAssetPriceUsd?: Decimal;
  receivedAsset?: string;
  receivedAmount?: Decimal;
  receivedAssetPriceUsd?: Decimal;
  feeAmount?: Decimal;
  feeAsset?: string;
  feeUsd?: Decimal;
  wallet: string;
  txHash?: string;
  notes?: string;
}

// ─── Tax Lot: Represents Acquired Crypto ──────────────────────────────────────

export interface TaxLot {
  id: string;
  asset: string;
  amount: Decimal; // Remaining quantity (decrements on partial sales)
  originalAmount: Decimal;
  costBasisPerUnit: Decimal; // USD cost basis per unit
  acquisitionDate: Date;
  acquisitionType: TransactionType;
  wallet: string;
}

// ─── Result of Matching Lots to a Disposal ────────────────────────────────────

export interface DisposalResult {
  asset: string;
  disposalDate: Date;
  disposalType: TransactionType;
  proceeds: Decimal;
  costBasis: Decimal;
  gainOrLoss: Decimal;
  isLongTerm: boolean;
  holdingDays: number;
  acquisitionDate: Date;
  lotId: string;
}

// ─── Ordinary Income Event ────────────────────────────────────────────────────

export interface IncomeEvent {
  date: Date;
  type: TransactionType;
  asset: string;
  amount: Decimal;
  fairMarketValueUsd: Decimal; // This is both income AND new lot basis
  wallet: string;
}

// ─── Form 8949 Row (one row per lot consumed in a disposal) ───────────────────

export interface Form8949Row {
  description: string; // e.g., "1.5 BTC"
  dateAcquired: Date;
  dateSold: Date;
  proceeds: Decimal;
  costBasis: Decimal;
  gainOrLoss: Decimal;
  isLongTerm: boolean;
  holdingDays: number;
}

// ─── Schedule D Summary ───────────────────────────────────────────────────────

export interface ScheduleDSummary {
  shortTermGains: Decimal;
  shortTermLosses: Decimal;
  longTermGains: Decimal;
  longTermLosses: Decimal;
  netShortTerm: Decimal;
  netLongTerm: Decimal;
  totalNetGainOrLoss: Decimal;
}

// ─── Validation Types ─────────────────────────────────────────────────────────

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ValidationWarning {
  row: number;
  field: string;
  message: string;
}

export interface ParseResult {
  transactions: Transaction[];
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ─── Full Tax Report ──────────────────────────────────────────────────────────

export interface TaxReport {
  taxYear: number;
  costBasisMethod: CostBasisMethod;
  disposals: DisposalResult[];
  incomeEvents: IncomeEvent[];
  remainingLots: TaxLot[];
  form8949Rows: Form8949Row[];
  scheduleDSummary: ScheduleDSummary;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
