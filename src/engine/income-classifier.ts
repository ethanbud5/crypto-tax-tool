import Decimal from "decimal.js";
import { INCOME_TYPES } from "@/lib/constants";
import type { Transaction, IncomeEvent, TaxLot } from "@/engine/types";

/**
 * If the transaction is an income-type event (mining, staking, airdrop, fork, income),
 * returns an IncomeEvent with FMV. Otherwise returns null.
 */
export function classifyIncome(transaction: Transaction): IncomeEvent | null {
  if (!INCOME_TYPES.has(transaction.type)) {
    return null;
  }

  const amount = transaction.receivedAmount;
  const priceUsd = transaction.receivedAssetPriceUsd;
  const asset = transaction.receivedAsset;

  if (!amount || !priceUsd || !asset) {
    return null;
  }

  return {
    date: transaction.dateTime,
    type: transaction.type,
    asset,
    amount,
    fairMarketValueUsd: amount.mul(priceUsd),
    wallet: transaction.wallet,
  };
}

/**
 * Creates a new TaxLot from an income event.
 * The cost basis per unit equals the FMV per unit at the time of receipt.
 */
export function createIncomeLot(event: IncomeEvent, lotId: string): TaxLot {
  const costBasisPerUnit = event.fairMarketValueUsd.div(event.amount);

  return {
    id: lotId,
    asset: event.asset,
    amount: new Decimal(event.amount),
    originalAmount: new Decimal(event.amount),
    costBasisPerUnit,
    acquisitionDate: event.date,
    acquisitionType: event.type,
    wallet: event.wallet,
  };
}
