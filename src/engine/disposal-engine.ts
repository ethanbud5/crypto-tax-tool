import Decimal from "decimal.js";
import type { DisposalResult } from "@/engine/types";
import { CostBasisMethod, TransactionType } from "@/engine/types";
import { WalletLotPool } from "@/engine/lot-pool";
import {
  isLongTerm as checkIsLongTerm,
  getHoldingDays,
} from "@/engine/holding-period";

export function processDisposal(
  lotPool: WalletLotPool,
  wallet: string,
  asset: string,
  amount: Decimal,
  proceeds: Decimal,
  disposalDate: Date,
  disposalType: TransactionType,
  method: CostBasisMethod,
): DisposalResult[] {
  const consumedLots = lotPool.consumeLots(wallet, asset, amount, method);

  // Total consumed amount (sum of all consumed lot amounts)
  const totalConsumed = consumedLots.reduce(
    (sum, lot) => sum.plus(lot.amount),
    new Decimal(0),
  );

  const results: DisposalResult[] = [];

  for (const lot of consumedLots) {
    // Proportional allocation of proceeds
    const proportion = lot.amount.div(totalConsumed);
    const lotProceeds = proceeds.mul(proportion);
    const costBasis = lot.amount.mul(lot.costBasisPerUnit);
    const gainOrLoss = lotProceeds.minus(costBasis);

    results.push({
      asset,
      amount: lot.amount,
      disposalDate,
      disposalType,
      proceeds: lotProceeds,
      costBasis,
      gainOrLoss,
      isLongTerm: checkIsLongTerm(lot.acquisitionDate, disposalDate),
      holdingDays: getHoldingDays(lot.acquisitionDate, disposalDate),
      acquisitionDate: lot.acquisitionDate,
      lotId: lot.id,
    });
  }

  return results;
}
