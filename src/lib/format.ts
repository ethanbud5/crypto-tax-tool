import Decimal from "decimal.js";

/**
 * Format a Decimal or number as USD currency string.
 * e.g., 1234.56 → "$1,234.56"
 */
export function formatUsd(value: Decimal | number): string {
  const num = value instanceof Decimal ? value.toNumber() : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a crypto amount with up to 8 decimal places, trimming trailing zeros.
 * e.g., 1.50000000 → "1.5", 0.00012345 → "0.00012345"
 */
export function formatCryptoAmount(value: Decimal | number): string {
  const d = value instanceof Decimal ? value : new Decimal(value);
  return d.toDecimalPlaces(8).toFixed().replace(/\.?0+$/, "");
}

/**
 * Format a date as MM/DD/YYYY for Form 8949.
 */
export function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Format a date as a readable string for display.
 * e.g., "Jan 15, 2025"
 */
export function formatDateReadable(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a gain/loss with sign and color class name.
 * Returns { text: string, className: string }
 */
export function formatGainLoss(value: Decimal): {
  text: string;
  className: string;
} {
  const formatted = formatUsd(value.abs());
  if (value.isZero()) {
    return { text: formatted, className: "text-gray-500" };
  }
  if (value.isNegative()) {
    return { text: `-${formatted}`, className: "text-red-500" };
  }
  return { text: `+${formatted}`, className: "text-green-500" };
}
