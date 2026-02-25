import Decimal from "decimal.js";
import {
  type DisposalResult,
  type IncomeEvent,
  type TaxLot,
  type Form8949Row,
  type ScheduleDSummary,
  type TaxReport,
  type ValidationError,
  type ValidationWarning,
  CostBasisMethod,
} from "@/engine/types";
import { formatCryptoAmount } from "@/lib/format";

/**
 * Convert a single DisposalResult into a Form 8949 row.
 * The description shows the disposed amount and asset (e.g., "1.5 BTC").
 */
function disposalToForm8949Row(d: DisposalResult): Form8949Row {
  return {
    description: `${formatCryptoAmount(d.amount)} ${d.asset}`,
    dateAcquired: d.acquisitionDate,
    dateSold: d.disposalDate,
    proceeds: d.proceeds,
    costBasis: d.costBasis,
    gainOrLoss: d.gainOrLoss,
    isLongTerm: d.isLongTerm,
    holdingDays: d.holdingDays,
  };
}

/**
 * Convert disposal results into Form 8949 rows.
 * Each DisposalResult (one per consumed lot) becomes one Form 8949 line item.
 */
export function generateForm8949(disposals: DisposalResult[]): Form8949Row[] {
  return disposals.map(disposalToForm8949Row);
}

/**
 * Aggregate Form 8949 rows into a Schedule D summary.
 */
export function generateScheduleD(rows: Form8949Row[]): ScheduleDSummary {
  let shortTermGains = new Decimal(0);
  let shortTermLosses = new Decimal(0);
  let longTermGains = new Decimal(0);
  let longTermLosses = new Decimal(0);

  for (const row of rows) {
    if (row.isLongTerm) {
      if (row.gainOrLoss.gte(0)) {
        longTermGains = longTermGains.plus(row.gainOrLoss);
      } else {
        longTermLosses = longTermLosses.plus(row.gainOrLoss);
      }
    } else {
      if (row.gainOrLoss.gte(0)) {
        shortTermGains = shortTermGains.plus(row.gainOrLoss);
      } else {
        shortTermLosses = shortTermLosses.plus(row.gainOrLoss);
      }
    }
  }

  const netShortTerm = shortTermGains.plus(shortTermLosses);
  const netLongTerm = longTermGains.plus(longTermLosses);

  return {
    shortTermGains,
    shortTermLosses,
    longTermGains,
    longTermLosses,
    netShortTerm,
    netLongTerm,
    totalNetGainOrLoss: netShortTerm.plus(netLongTerm),
  };
}

/**
 * Generate a complete tax report for a specific tax year.
 * Filters disposals and income events to only include those in the target year.
 */
export function generateReport(
  disposals: DisposalResult[],
  incomeEvents: IncomeEvent[],
  remainingLots: TaxLot[],
  taxYear: number,
  costBasisMethod: CostBasisMethod,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): TaxReport {
  // Filter to tax year
  const yearDisposals = disposals.filter(
    (d) => d.disposalDate.getFullYear() === taxYear,
  );
  const yearIncome = incomeEvents.filter(
    (e) => e.date.getFullYear() === taxYear,
  );

  const form8949Rows = generateForm8949(yearDisposals);
  const scheduleDSummary = generateScheduleD(form8949Rows);

  return {
    taxYear,
    costBasisMethod,
    disposals: yearDisposals,
    incomeEvents: yearIncome,
    remainingLots,
    form8949Rows,
    scheduleDSummary,
    errors,
    warnings,
  };
}
