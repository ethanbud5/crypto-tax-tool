import { LONG_TERM_HOLDING_DAYS } from "@/lib/constants";

/**
 * Returns the number of calendar days between acquisition and disposal.
 */
export function getHoldingDays(
  acquisitionDate: Date,
  disposalDate: Date,
): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(
    (disposalDate.getTime() - acquisitionDate.getTime()) / msPerDay,
  );
}

/**
 * IRS rule: an asset must be held for MORE than one year (>365 days)
 * to qualify for long-term capital gains treatment.
 */
export function isLongTerm(
  acquisitionDate: Date,
  disposalDate: Date,
): boolean {
  return getHoldingDays(acquisitionDate, disposalDate) > LONG_TERM_HOLDING_DAYS;
}
