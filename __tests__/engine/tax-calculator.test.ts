import Decimal from "decimal.js";
import { calculateTaxes } from "@/engine/tax-calculator";
import { generateReport } from "@/engine/report-generator";
import { parseCsv } from "@/engine/csv-parser";
import { CostBasisMethod, TransactionType } from "@/engine/types";
import type { Transaction } from "@/engine/types";

// Helper to create a minimal transaction
function tx(
  overrides: Partial<Transaction> & { dateTime: Date; type: TransactionType; wallet: string },
): Transaction {
  return { ...overrides };
}

describe("calculateTaxes", () => {
  it("FIFO: buy 1 BTC@30k + 1 BTC@40k, sell 1 BTC@50k → gain = $20k", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-02-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(40000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(50000),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    expect(result.disposals).toHaveLength(1);
    expect(result.disposals[0].gainOrLoss.toNumber()).toBe(20000); // 50k - 30k
    expect(result.disposals[0].isLongTerm).toBe(false);
  });

  it("LIFO: same scenario → gain = $10k (newest lot)", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-02-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(40000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(50000),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.LIFO);

    expect(result.disposals).toHaveLength(1);
    expect(result.disposals[0].gainOrLoss.toNumber()).toBe(10000); // 50k - 40k
  });

  it("HIFO: same scenario → gain = $10k (highest cost lot)", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-02-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(40000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(50000),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.HIFO);

    expect(result.disposals).toHaveLength(1);
    expect(result.disposals[0].gainOrLoss.toNumber()).toBe(10000); // 50k - 40k
  });

  it("TRADE: disposes sent asset and creates lot for received asset", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.TRADE,
        sentAsset: "BTC",
        sentAmount: new Decimal(0.5),
        sentAssetPriceUsd: new Decimal(50000),
        receivedAsset: "ETH",
        receivedAmount: new Decimal(10),
        receivedAssetPriceUsd: new Decimal(2500),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    // Disposal of 0.5 BTC: proceeds = 0.5 * 50000 = 25000, basis = 0.5 * 30000 = 15000
    expect(result.disposals).toHaveLength(1);
    expect(result.disposals[0].proceeds.toNumber()).toBe(25000);
    expect(result.disposals[0].costBasis.toNumber()).toBe(15000);
    expect(result.disposals[0].gainOrLoss.toNumber()).toBe(10000);

    // Should have remaining 0.5 BTC + 10 ETH
    const remaining = result.remainingLots;
    const btcLot = remaining.find((l) => l.asset === "BTC");
    const ethLot = remaining.find((l) => l.asset === "ETH");
    expect(btcLot?.amount.toNumber()).toBe(0.5);
    expect(ethLot?.amount.toNumber()).toBe(10);
    expect(ethLot?.costBasisPerUnit.toNumber()).toBe(2500);
  });

  it("income events create lots that can later be sold", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.STAKING,
        receivedAsset: "ETH",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(2000),
        wallet: "Kraken",
      }),
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "ETH",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(3000),
        wallet: "Kraken",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    // Income event
    expect(result.incomeEvents).toHaveLength(1);
    expect(result.incomeEvents[0].fairMarketValueUsd.toNumber()).toBe(2000);

    // Disposal: proceeds = 3000, basis = 2000 (FMV at income time)
    expect(result.disposals).toHaveLength(1);
    expect(result.disposals[0].proceeds.toNumber()).toBe(3000);
    expect(result.disposals[0].costBasis.toNumber()).toBe(2000);
    expect(result.disposals[0].gainOrLoss.toNumber()).toBe(1000);
  });

  it("SEND consumes lots from source wallet", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(2),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-03-01T00:00:00Z"),
        type: TransactionType.SEND,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(35000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-03-01T00:01:00Z"),
        type: TransactionType.RECEIVE,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "ColdWallet",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    // No tax event for transfers
    expect(result.disposals).toHaveLength(0);
    expect(result.incomeEvents).toHaveLength(0);

    // Remaining: 1 BTC in Coinbase, 1 BTC in ColdWallet
    const coinbaseLots = result.remainingLots.filter(
      (l) => l.wallet === "Coinbase",
    );
    const coldLots = result.remainingLots.filter(
      (l) => l.wallet === "ColdWallet",
    );
    expect(coinbaseLots[0].amount.toNumber()).toBe(1);
    expect(coldLots[0].amount.toNumber()).toBe(1);
  });

  it("GIFT_SENT creates disposal at $0 proceeds", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.GIFT_SENT,
        sentAsset: "BTC",
        sentAmount: new Decimal(0.5),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    expect(result.disposals).toHaveLength(1);
    expect(result.disposals[0].proceeds.toNumber()).toBe(0);
    expect(result.disposals[0].costBasis.toNumber()).toBe(15000);
    expect(result.disposals[0].gainOrLoss.toNumber()).toBe(-15000);
  });

  it("same-timestamp transactions: acquisitions processed before disposals", () => {
    const sameTime = new Date("2024-06-01T00:00:00Z");
    const transactions: Transaction[] = [
      // Sell appears first in array, but should process after buy
      tx({
        dateTime: sameTime,
        type: TransactionType.SELL,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(50000),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: sameTime,
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(30000),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    // Should succeed — buy processed before sell despite array order
    expect(result.disposals).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.disposals[0].gainOrLoss.toNumber()).toBe(20000);
  });

  it("SELL with USD received uses actual USD amount as proceeds", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "ETH",
        receivedAmount: new Decimal("0.83288708"),
        receivedAssetPriceUsd: new Decimal(1295),
        wallet: "Coinbase",
      }),
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "ETH",
        sentAmount: new Decimal("0.5"),
        sentAssetPriceUsd: new Decimal(3280), // daily close (approximation)
        receivedAsset: "USD",
        receivedAmount: new Decimal("1724.08"), // actual gross USD received
        feeUsd: new Decimal("10.34"),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    expect(result.disposals).toHaveLength(1);
    // Proceeds = actual USD received - fee = 1724.08 - 10.34 = 1713.74
    expect(result.disposals[0].proceeds.toNumber()).toBeCloseTo(1713.74, 2);
  });

  it("BUY with USD sent uses actual USD amount + fee for cost basis", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal("0.02"),
        receivedAssetPriceUsd: new Decimal(95000), // daily close (approximation)
        sentAsset: "USD",
        sentAmount: new Decimal("2069.54"), // actual USD spent
        feeUsd: new Decimal("10"),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    // Cost basis per unit = (2069.54 + 10) / 0.02 = 103977
    const lot = result.remainingLots[0];
    expect(lot.costBasisPerUnit.toNumber()).toBeCloseTo(103977, 0);
  });

  it("insufficient lots produces an error, not a crash", () => {
    const transactions: Transaction[] = [
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(50000),
        wallet: "Coinbase",
      }),
    ];

    const result = calculateTaxes(transactions, CostBasisMethod.FIFO);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Insufficient lots");
  });
});

describe("generateReport", () => {
  it("filters disposals and income by tax year", () => {
    const transactions: Transaction[] = [
      // 2023 buy
      tx({
        dateTime: new Date("2023-06-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(2),
        receivedAssetPriceUsd: new Decimal(25000),
        wallet: "Coinbase",
      }),
      // 2023 staking
      tx({
        dateTime: new Date("2023-09-01T00:00:00Z"),
        type: TransactionType.STAKING,
        receivedAsset: "ETH",
        receivedAmount: new Decimal(0.5),
        receivedAssetPriceUsd: new Decimal(1800),
        wallet: "Coinbase",
      }),
      // 2024 sell
      tx({
        dateTime: new Date("2024-03-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(50000),
        wallet: "Coinbase",
      }),
      // 2024 staking
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.STAKING,
        receivedAsset: "ETH",
        receivedAmount: new Decimal(0.3),
        receivedAssetPriceUsd: new Decimal(2500),
        wallet: "Coinbase",
      }),
    ];

    const calcResult = calculateTaxes(transactions, CostBasisMethod.FIFO);

    // Report for 2024
    const report = generateReport(
      calcResult.disposals,
      calcResult.incomeEvents,
      calcResult.remainingLots,
      2024,
      CostBasisMethod.FIFO,
      calcResult.errors,
      calcResult.warnings,
    );

    // Only 2024 disposal (BTC sell)
    expect(report.disposals).toHaveLength(1);
    expect(report.disposals[0].asset).toBe("BTC");

    // Only 2024 income (ETH staking)
    expect(report.incomeEvents).toHaveLength(1);
    expect(report.incomeEvents[0].amount.toNumber()).toBe(0.3);

    // Schedule D should show the 2024 BTC gain
    expect(report.scheduleDSummary.netShortTerm.toNumber()).toBe(25000); // 50k - 25k
  });

  it("Schedule D correctly separates short-term and long-term", () => {
    const transactions: Transaction[] = [
      // Buy BTC in Jan 2023 (>1 year before sell)
      tx({
        dateTime: new Date("2023-01-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "BTC",
        receivedAmount: new Decimal(1),
        receivedAssetPriceUsd: new Decimal(20000),
        wallet: "Coinbase",
      }),
      // Buy ETH in March 2024 (<1 year before sell)
      tx({
        dateTime: new Date("2024-03-01T00:00:00Z"),
        type: TransactionType.BUY,
        receivedAsset: "ETH",
        receivedAmount: new Decimal(10),
        receivedAssetPriceUsd: new Decimal(2000),
        wallet: "Coinbase",
      }),
      // Sell BTC in June 2024 (long-term, held >1 yr)
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "BTC",
        sentAmount: new Decimal(1),
        sentAssetPriceUsd: new Decimal(60000),
        wallet: "Coinbase",
      }),
      // Sell ETH in June 2024 (short-term, held <1 yr)
      tx({
        dateTime: new Date("2024-06-01T00:00:00Z"),
        type: TransactionType.SELL,
        sentAsset: "ETH",
        sentAmount: new Decimal(10),
        sentAssetPriceUsd: new Decimal(2500),
        wallet: "Coinbase",
      }),
    ];

    const calcResult = calculateTaxes(transactions, CostBasisMethod.FIFO);
    const report = generateReport(
      calcResult.disposals,
      calcResult.incomeEvents,
      calcResult.remainingLots,
      2024,
      CostBasisMethod.FIFO,
      calcResult.errors,
      calcResult.warnings,
    );

    // BTC: long-term gain = 60000 - 20000 = 40000
    expect(report.scheduleDSummary.longTermGains.toNumber()).toBe(40000);
    expect(report.scheduleDSummary.longTermLosses.toNumber()).toBe(0);

    // ETH: short-term gain = 25000 - 20000 = 5000
    expect(report.scheduleDSummary.shortTermGains.toNumber()).toBe(5000);
    expect(report.scheduleDSummary.shortTermLosses.toNumber()).toBe(0);

    // Net
    expect(report.scheduleDSummary.totalNetGainOrLoss.toNumber()).toBe(45000);
  });
});

describe("end-to-end: CSV → parse → calculate → report", () => {
  it("processes simple buy-sell CSV correctly", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,1.0,30000,10,USD,10,Coinbase,abc123,First BTC purchase",
      "2024-06-15T10:00:00Z,SELL,BTC,0.5,50000,,,,5,USD,5,Coinbase,def456,Partial sell",
    ].join("\n");

    const parseResult = parseCsv(csv);
    expect(parseResult.errors).toHaveLength(0);

    const calcResult = calculateTaxes(
      parseResult.transactions,
      CostBasisMethod.FIFO,
    );
    expect(calcResult.errors).toHaveLength(0);

    const report = generateReport(
      calcResult.disposals,
      calcResult.incomeEvents,
      calcResult.remainingLots,
      2024,
      CostBasisMethod.FIFO,
      calcResult.errors,
      calcResult.warnings,
    );

    // BUY cost basis per unit: ($30000 + $10 fee) / 1.0 = $30010
    // SELL 0.5 BTC: proceeds = $25000 - $5 fee = $24995
    // Cost basis = 0.5 * $30010 = $15005
    // Gain = $24995 - $15005 = $9990
    expect(report.disposals).toHaveLength(1);
    expect(report.disposals[0].proceeds.toNumber()).toBe(24995);
    expect(report.disposals[0].costBasis.toNumber()).toBe(15005);
    expect(report.scheduleDSummary.totalNetGainOrLoss.toNumber()).toBe(9990);

    // 0.5 BTC should remain
    const btcRemaining = report.remainingLots.filter(
      (l) => l.asset === "BTC",
    );
    expect(btcRemaining[0].amount.toNumber()).toBe(0.5);
  });

  it("FIFO and HIFO produce different results for same input", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-01T00:00:00Z,BUY,,,,BTC,1.0,30000,,,,Coinbase,,",
      "2024-02-01T00:00:00Z,BUY,,,,BTC,1.0,40000,,,,Coinbase,,",
      "2024-06-01T00:00:00Z,SELL,BTC,1.0,50000,,,,,,,Coinbase,,",
    ].join("\n");

    // Parse fresh copies so lot pool mutations don't interfere
    const fifoResult = calculateTaxes(parseCsv(csv).transactions, CostBasisMethod.FIFO);
    const hifoResult = calculateTaxes(parseCsv(csv).transactions, CostBasisMethod.HIFO);

    const fifoReport = generateReport(
      fifoResult.disposals,
      fifoResult.incomeEvents,
      fifoResult.remainingLots,
      2024,
      CostBasisMethod.FIFO,
      [],
      [],
    );

    const hifoReport = generateReport(
      hifoResult.disposals,
      hifoResult.incomeEvents,
      hifoResult.remainingLots,
      2024,
      CostBasisMethod.HIFO,
      [],
      [],
    );

    // FIFO uses $30k lot → gain = $20k
    expect(fifoReport.scheduleDSummary.totalNetGainOrLoss.toNumber()).toBe(
      20000,
    );

    // HIFO uses $40k lot → gain = $10k
    expect(hifoReport.scheduleDSummary.totalNetGainOrLoss.toNumber()).toBe(
      10000,
    );
  });
});
