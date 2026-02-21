import Decimal from "decimal.js";
import {
  type Transaction,
  type DisposalResult,
  type IncomeEvent,
  type TaxLot,
  type ValidationError,
  type ValidationWarning,
  TransactionType,
  CostBasisMethod,
} from "@/engine/types";
import { INCOME_TYPES, ACQUISITION_TYPES } from "@/lib/constants";
import { WalletLotPool } from "@/engine/lot-pool";
import { processDisposal } from "@/engine/disposal-engine";
import { classifyIncome, createIncomeLot } from "@/engine/income-classifier";

export interface CalculationResult {
  disposals: DisposalResult[];
  incomeEvents: IncomeEvent[];
  remainingLots: TaxLot[];
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Sort transactions chronologically. When timestamps are equal,
 * acquisitions come before disposals so lots exist before they're consumed.
 */
function sortTransactions(transactions: Transaction[]): Transaction[] {
  const acquisitionPriority = new Set<TransactionType>([
    ...ACQUISITION_TYPES,
    ...INCOME_TYPES,
    TransactionType.RECEIVE,
  ]);

  return [...transactions].sort((a, b) => {
    const timeDiff = a.dateTime.getTime() - b.dateTime.getTime();
    if (timeDiff !== 0) return timeDiff;

    // Same timestamp: acquisitions before disposals
    const aIsAcq = acquisitionPriority.has(a.type) ? 0 : 1;
    const bIsAcq = acquisitionPriority.has(b.type) ? 0 : 1;
    return aIsAcq - bIsAcq;
  });
}

/**
 * Process all transactions and compute disposals, income events,
 * and remaining lots. This processes ALL years — filtering by tax year
 * is done by the report generator.
 */
export function calculateTaxes(
  transactions: Transaction[],
  method: CostBasisMethod,
): CalculationResult {
  const lotPool = new WalletLotPool();
  const disposals: DisposalResult[] = [];
  const incomeEvents: IncomeEvent[] = [];
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const sorted = sortTransactions(transactions);

  for (const tx of sorted) {
    try {
      switch (tx.type) {
        // ── Acquisitions: create tax lots ──────────────────────────────
        case TransactionType.BUY:
        case TransactionType.GIFT_RECEIVED: {
          const asset = tx.receivedAsset!;
          const amount = tx.receivedAmount!;
          const priceUsd = tx.receivedAssetPriceUsd ?? new Decimal(0);

          lotPool.addLot({
            id: lotPool.generateLotId(),
            asset,
            amount: new Decimal(amount),
            originalAmount: new Decimal(amount),
            costBasisPerUnit: priceUsd,
            acquisitionDate: tx.dateTime,
            acquisitionType: tx.type,
            wallet: tx.wallet,
          });
          break;
        }

        case TransactionType.RECEIVE: {
          // Wallet transfer receive — lots should be moved via
          // SEND/RECEIVE pairing. If there's no matching SEND
          // (e.g., from an external source), treat as acquisition.
          const asset = tx.receivedAsset!;
          const amount = tx.receivedAmount!;
          const priceUsd = tx.receivedAssetPriceUsd ?? new Decimal(0);

          lotPool.addLot({
            id: lotPool.generateLotId(),
            asset,
            amount: new Decimal(amount),
            originalAmount: new Decimal(amount),
            costBasisPerUnit: priceUsd,
            acquisitionDate: tx.dateTime,
            acquisitionType: tx.type,
            wallet: tx.wallet,
          });
          break;
        }

        // ── Income events: ordinary income + new lot ──────────────────
        case TransactionType.MINING:
        case TransactionType.STAKING:
        case TransactionType.AIRDROP:
        case TransactionType.FORK:
        case TransactionType.INCOME: {
          const incomeEvent = classifyIncome(tx);
          if (incomeEvent) {
            incomeEvents.push(incomeEvent);
            const lot = createIncomeLot(incomeEvent, lotPool.generateLotId());
            lotPool.addLot(lot);
          }
          break;
        }

        // ── Disposals: sell for USD ───────────────────────────────────
        case TransactionType.SELL: {
          const asset = tx.sentAsset!;
          const amount = tx.sentAmount!;
          const priceUsd = tx.sentAssetPriceUsd ?? new Decimal(0);
          const proceeds = amount.mul(priceUsd);

          const results = processDisposal(
            lotPool,
            tx.wallet,
            asset,
            amount,
            proceeds,
            tx.dateTime,
            tx.type,
            method,
          );
          disposals.push(...results);
          break;
        }

        // ── Spend: use crypto to buy goods/services ───────────────────
        case TransactionType.SPEND: {
          const asset = tx.sentAsset!;
          const amount = tx.sentAmount!;
          const priceUsd = tx.sentAssetPriceUsd ?? new Decimal(0);
          const proceeds = amount.mul(priceUsd);

          const results = processDisposal(
            lotPool,
            tx.wallet,
            asset,
            amount,
            proceeds,
            tx.dateTime,
            tx.type,
            method,
          );
          disposals.push(...results);
          break;
        }

        // ── Trade: dispose sent asset + acquire received asset ────────
        case TransactionType.TRADE: {
          const sentAsset = tx.sentAsset!;
          const sentAmount = tx.sentAmount!;
          const sentPriceUsd = tx.sentAssetPriceUsd ?? new Decimal(0);
          const proceeds = sentAmount.mul(sentPriceUsd);

          // Dispose sent asset
          const results = processDisposal(
            lotPool,
            tx.wallet,
            sentAsset,
            sentAmount,
            proceeds,
            tx.dateTime,
            tx.type,
            method,
          );
          disposals.push(...results);

          // Acquire received asset with FMV as basis
          const recvAsset = tx.receivedAsset!;
          const recvAmount = tx.receivedAmount!;
          const recvPriceUsd = tx.receivedAssetPriceUsd ?? new Decimal(0);

          lotPool.addLot({
            id: lotPool.generateLotId(),
            asset: recvAsset,
            amount: new Decimal(recvAmount),
            originalAmount: new Decimal(recvAmount),
            costBasisPerUnit: recvPriceUsd,
            acquisitionDate: tx.dateTime,
            acquisitionType: tx.type,
            wallet: tx.wallet,
          });
          break;
        }

        // ── Send: wallet transfer (remove lots from source) ──────────
        case TransactionType.SEND: {
          const asset = tx.sentAsset!;
          const amount = tx.sentAmount!;

          // For SEND, we consume lots from the wallet.
          // The corresponding RECEIVE on the destination wallet
          // will add them back. We use transferLots-style logic
          // but since SEND and RECEIVE are separate CSV rows,
          // we handle them independently.
          // SEND removes lots; RECEIVE adds them as new lots
          // preserving basis from the CSV price.

          // Just consume the lots (no tax event for transfers)
          lotPool.consumeLots(tx.wallet, asset, amount, CostBasisMethod.FIFO);

          // Handle fee as a separate disposal if fee exists
          if (tx.feeAmount && tx.feeAsset && tx.feeAsset === asset) {
            // Network fee in the same asset — this IS a disposal
            const feeUsd = tx.feeUsd ?? new Decimal(0);
            if (tx.feeAmount.gt(0)) {
              try {
                const feeResults = processDisposal(
                  lotPool,
                  tx.wallet,
                  asset,
                  tx.feeAmount,
                  feeUsd,
                  tx.dateTime,
                  TransactionType.SPEND,
                  method,
                );
                disposals.push(...feeResults);
              } catch {
                // If not enough lots for fee, just warn
                warnings.push({
                  row: 0,
                  field: "",
                  message: `Could not account for ${tx.feeAmount.toString()} ${asset} transfer fee from ${tx.wallet}`,
                });
              }
            }
          }
          break;
        }

        // ── Gift sent: disposal at $0 proceeds ───────────────────────
        case TransactionType.GIFT_SENT: {
          const asset = tx.sentAsset!;
          const amount = tx.sentAmount!;

          const results = processDisposal(
            lotPool,
            tx.wallet,
            asset,
            amount,
            new Decimal(0), // $0 proceeds — donor recognizes no gain
            tx.dateTime,
            tx.type,
            method,
          );
          disposals.push(...results);
          break;
        }
      }
    } catch (err) {
      errors.push({
        row: 0,
        field: "",
        message: `Error processing ${tx.type} on ${tx.dateTime.toISOString()}: ${(err as Error).message}`,
      });
    }
  }

  return {
    disposals,
    incomeEvents,
    remainingLots: lotPool.getAllRemainingLots(),
    errors,
    warnings,
  };
}
