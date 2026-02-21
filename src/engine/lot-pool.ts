import Decimal from "decimal.js";
import type { TaxLot } from "@/engine/types";
import { CostBasisMethod } from "@/engine/types";

export class WalletLotPool {
  private pools: Map<string, Map<string, TaxLot[]>> = new Map();
  private nextLotId = 1;

  generateLotId(): string {
    return `lot-${this.nextLotId++}`;
  }

  addLot(lot: TaxLot): void {
    if (!this.pools.has(lot.wallet)) {
      this.pools.set(lot.wallet, new Map());
    }
    const walletMap = this.pools.get(lot.wallet)!;
    if (!walletMap.has(lot.asset)) {
      walletMap.set(lot.asset, []);
    }
    walletMap.get(lot.asset)!.push(lot);
  }

  getLots(wallet: string, asset: string): TaxLot[] {
    return this.pools.get(wallet)?.get(asset) ?? [];
  }

  consumeLots(
    wallet: string,
    asset: string,
    amount: Decimal,
    method: CostBasisMethod,
  ): TaxLot[] {
    const lots = this.getLots(wallet, asset);
    if (lots.length === 0) {
      throw new Error(
        `Insufficient lots: no ${asset} lots in wallet "${wallet}"`,
      );
    }

    // Sort according to cost basis method
    const sorted = [...lots];
    switch (method) {
      case CostBasisMethod.FIFO:
        sorted.sort(
          (a, b) => a.acquisitionDate.getTime() - b.acquisitionDate.getTime(),
        );
        break;
      case CostBasisMethod.LIFO:
        sorted.sort(
          (a, b) => b.acquisitionDate.getTime() - a.acquisitionDate.getTime(),
        );
        break;
      case CostBasisMethod.HIFO:
        sorted.sort((a, b) => b.costBasisPerUnit.cmp(a.costBasisPerUnit));
        break;
    }

    let remaining = new Decimal(amount);
    const consumed: TaxLot[] = [];

    for (const lot of sorted) {
      if (remaining.lte(0)) break;

      if (lot.amount.lte(remaining)) {
        // Consume entire lot
        consumed.push({
          ...lot,
          amount: new Decimal(lot.amount),
        });
        remaining = remaining.minus(lot.amount);
        lot.amount = new Decimal(0);
      } else {
        // Partial consumption
        consumed.push({
          ...lot,
          amount: new Decimal(remaining),
        });
        lot.amount = lot.amount.minus(remaining);
        remaining = new Decimal(0);
      }
    }

    if (remaining.gt(0)) {
      throw new Error(
        `Insufficient lots: need ${amount.toString()} ${asset} but only found ${amount.minus(remaining).toString()} in wallet "${wallet}"`,
      );
    }

    // Remove fully consumed lots from the pool
    const walletMap = this.pools.get(wallet)!;
    walletMap.set(
      asset,
      lots.filter((l) => l.amount.gt(0)),
    );

    return consumed;
  }

  transferLots(
    fromWallet: string,
    toWallet: string,
    asset: string,
    amount: Decimal,
  ): void {
    // Consume lots from source wallet using FIFO
    const consumed = this.consumeLots(
      fromWallet,
      asset,
      amount,
      CostBasisMethod.FIFO,
    );

    // Add consumed lots to destination wallet, preserving cost basis and acquisition date
    for (const lot of consumed) {
      this.addLot({
        ...lot,
        id: this.generateLotId(),
        wallet: toWallet,
      });
    }
  }

  getAllRemainingLots(): TaxLot[] {
    const result: TaxLot[] = [];
    for (const walletMap of this.pools.values()) {
      for (const lots of walletMap.values()) {
        for (const lot of lots) {
          if (lot.amount.gt(0)) {
            result.push(lot);
          }
        }
      }
    }
    return result;
  }
}
