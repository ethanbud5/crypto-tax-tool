import Decimal from "decimal.js";
import { WalletLotPool } from "@/engine/lot-pool";
import { processDisposal } from "@/engine/disposal-engine";
import { CostBasisMethod, TransactionType } from "@/engine/types";

function makeDate(daysAgo: number): Date {
  const d = new Date("2024-06-01T00:00:00Z");
  d.setDate(d.getDate() - daysAgo);
  return d;
}

const SELL_DATE = new Date("2024-06-01T00:00:00Z");

function setupTwoLotPool(): WalletLotPool {
  const pool = new WalletLotPool();
  // Lot 1: 1 BTC @ $30,000 — bought 200 days ago
  pool.addLot({
    id: pool.generateLotId(),
    asset: "BTC",
    amount: new Decimal(1),
    originalAmount: new Decimal(1),
    costBasisPerUnit: new Decimal(30000),
    acquisitionDate: makeDate(200),
    acquisitionType: TransactionType.BUY,
    wallet: "coinbase",
  });
  // Lot 2: 1 BTC @ $40,000 — bought 100 days ago
  pool.addLot({
    id: pool.generateLotId(),
    asset: "BTC",
    amount: new Decimal(1),
    originalAmount: new Decimal(1),
    costBasisPerUnit: new Decimal(40000),
    acquisitionDate: makeDate(100),
    acquisitionType: TransactionType.BUY,
    wallet: "coinbase",
  });
  return pool;
}

describe("processDisposal", () => {
  test("FIFO: uses oldest lot first, gain = $20k", () => {
    const pool = setupTwoLotPool();
    const results = processDisposal(
      pool,
      "coinbase",
      "BTC",
      new Decimal(1),
      new Decimal(50000),
      SELL_DATE,
      TransactionType.SELL,
      CostBasisMethod.FIFO,
    );

    expect(results).toHaveLength(1);
    expect(results[0].costBasis.toNumber()).toBe(30000);
    expect(results[0].proceeds.toNumber()).toBe(50000);
    expect(results[0].gainOrLoss.toNumber()).toBe(20000);
  });

  test("LIFO: uses newest lot first, gain = $10k", () => {
    const pool = setupTwoLotPool();
    const results = processDisposal(
      pool,
      "coinbase",
      "BTC",
      new Decimal(1),
      new Decimal(50000),
      SELL_DATE,
      TransactionType.SELL,
      CostBasisMethod.LIFO,
    );

    expect(results).toHaveLength(1);
    expect(results[0].costBasis.toNumber()).toBe(40000);
    expect(results[0].proceeds.toNumber()).toBe(50000);
    expect(results[0].gainOrLoss.toNumber()).toBe(10000);
  });

  test("HIFO: uses highest-cost lot first, gain = $10k", () => {
    const pool = setupTwoLotPool();
    const results = processDisposal(
      pool,
      "coinbase",
      "BTC",
      new Decimal(1),
      new Decimal(50000),
      SELL_DATE,
      TransactionType.SELL,
      CostBasisMethod.HIFO,
    );

    expect(results).toHaveLength(1);
    expect(results[0].costBasis.toNumber()).toBe(40000);
    expect(results[0].proceeds.toNumber()).toBe(50000);
    expect(results[0].gainOrLoss.toNumber()).toBe(10000);
  });

  test("Partial lot: sell 0.5 BTC from 1 BTC lot, 0.5 remains", () => {
    const pool = new WalletLotPool();
    pool.addLot({
      id: pool.generateLotId(),
      asset: "BTC",
      amount: new Decimal(1),
      originalAmount: new Decimal(1),
      costBasisPerUnit: new Decimal(30000),
      acquisitionDate: makeDate(100),
      acquisitionType: TransactionType.BUY,
      wallet: "coinbase",
    });

    const results = processDisposal(
      pool,
      "coinbase",
      "BTC",
      new Decimal("0.5"),
      new Decimal(25000), // 0.5 * $50k
      SELL_DATE,
      TransactionType.SELL,
      CostBasisMethod.FIFO,
    );

    expect(results).toHaveLength(1);
    expect(results[0].costBasis.toNumber()).toBe(15000); // 0.5 * $30k
    expect(results[0].gainOrLoss.toNumber()).toBe(10000); // $25k - $15k

    // Check remaining lot
    const remaining = pool.getLots("coinbase", "BTC");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].amount.toNumber()).toBe(0.5);
  });

  test("Multi-wallet isolation: lots in wallet A not used for wallet B", () => {
    const pool = new WalletLotPool();
    pool.addLot({
      id: pool.generateLotId(),
      asset: "BTC",
      amount: new Decimal(1),
      originalAmount: new Decimal(1),
      costBasisPerUnit: new Decimal(30000),
      acquisitionDate: makeDate(100),
      acquisitionType: TransactionType.BUY,
      wallet: "walletA",
    });

    expect(() =>
      processDisposal(
        pool,
        "walletB",
        "BTC",
        new Decimal(1),
        new Decimal(50000),
        SELL_DATE,
        TransactionType.SELL,
        CostBasisMethod.FIFO,
      ),
    ).toThrow(/insufficient lots/i);

    // walletA lot should be untouched
    const lotsA = pool.getLots("walletA", "BTC");
    expect(lotsA).toHaveLength(1);
    expect(lotsA[0].amount.toNumber()).toBe(1);
  });

  test("Insufficient lots: throws error", () => {
    const pool = new WalletLotPool();
    pool.addLot({
      id: pool.generateLotId(),
      asset: "BTC",
      amount: new Decimal("0.5"),
      originalAmount: new Decimal("0.5"),
      costBasisPerUnit: new Decimal(30000),
      acquisitionDate: makeDate(100),
      acquisitionType: TransactionType.BUY,
      wallet: "coinbase",
    });

    expect(() =>
      processDisposal(
        pool,
        "coinbase",
        "BTC",
        new Decimal(1),
        new Decimal(50000),
        SELL_DATE,
        TransactionType.SELL,
        CostBasisMethod.FIFO,
      ),
    ).toThrow(/insufficient lots/i);
  });

  test("Holding period: 365 days exactly = short-term", () => {
    const pool = new WalletLotPool();
    pool.addLot({
      id: pool.generateLotId(),
      asset: "BTC",
      amount: new Decimal(1),
      originalAmount: new Decimal(1),
      costBasisPerUnit: new Decimal(30000),
      acquisitionDate: makeDate(365), // exactly 365 days
      acquisitionType: TransactionType.BUY,
      wallet: "coinbase",
    });

    const results = processDisposal(
      pool,
      "coinbase",
      "BTC",
      new Decimal(1),
      new Decimal(50000),
      SELL_DATE,
      TransactionType.SELL,
      CostBasisMethod.FIFO,
    );

    expect(results[0].isLongTerm).toBe(false);
    expect(results[0].holdingDays).toBe(365);
  });

  test("Holding period: 366 days = long-term", () => {
    const pool = new WalletLotPool();
    pool.addLot({
      id: pool.generateLotId(),
      asset: "BTC",
      amount: new Decimal(1),
      originalAmount: new Decimal(1),
      costBasisPerUnit: new Decimal(30000),
      acquisitionDate: makeDate(366), // 366 days
      acquisitionType: TransactionType.BUY,
      wallet: "coinbase",
    });

    const results = processDisposal(
      pool,
      "coinbase",
      "BTC",
      new Decimal(1),
      new Decimal(50000),
      SELL_DATE,
      TransactionType.SELL,
      CostBasisMethod.FIFO,
    );

    expect(results[0].isLongTerm).toBe(true);
    expect(results[0].holdingDays).toBe(366);
  });
});
