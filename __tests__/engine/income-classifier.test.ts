import Decimal from "decimal.js";
import { classifyIncome, createIncomeLot } from "@/engine/income-classifier";
import { TransactionType } from "@/engine/types";
import type { Transaction } from "@/engine/types";

function makeIncomeTransaction(
  type: TransactionType,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    dateTime: new Date("2024-03-15T00:00:00Z"),
    type,
    receivedAsset: "ETH",
    receivedAmount: new Decimal(2),
    receivedAssetPriceUsd: new Decimal(3000),
    wallet: "ledger",
    ...overrides,
  };
}

describe("classifyIncome", () => {
  test("STAKING creates IncomeEvent with correct FMV", () => {
    const tx = makeIncomeTransaction(TransactionType.STAKING);
    const event = classifyIncome(tx);

    expect(event).not.toBeNull();
    expect(event!.type).toBe(TransactionType.STAKING);
    expect(event!.asset).toBe("ETH");
    expect(event!.amount.toNumber()).toBe(2);
    expect(event!.fairMarketValueUsd.toNumber()).toBe(6000); // 2 * $3000
    expect(event!.wallet).toBe("ledger");
  });

  test("MINING creates IncomeEvent", () => {
    const tx = makeIncomeTransaction(TransactionType.MINING);
    const event = classifyIncome(tx);

    expect(event).not.toBeNull();
    expect(event!.type).toBe(TransactionType.MINING);
    expect(event!.fairMarketValueUsd.toNumber()).toBe(6000);
  });

  test("AIRDROP creates IncomeEvent", () => {
    const tx = makeIncomeTransaction(TransactionType.AIRDROP);
    const event = classifyIncome(tx);

    expect(event).not.toBeNull();
    expect(event!.type).toBe(TransactionType.AIRDROP);
    expect(event!.fairMarketValueUsd.toNumber()).toBe(6000);
  });

  test("FORK creates IncomeEvent", () => {
    const tx = makeIncomeTransaction(TransactionType.FORK);
    const event = classifyIncome(tx);

    expect(event).not.toBeNull();
    expect(event!.type).toBe(TransactionType.FORK);
  });

  test("INCOME type creates IncomeEvent", () => {
    const tx = makeIncomeTransaction(TransactionType.INCOME);
    const event = classifyIncome(tx);

    expect(event).not.toBeNull();
    expect(event!.type).toBe(TransactionType.INCOME);
  });

  test("BUY returns null (not income)", () => {
    const tx = makeIncomeTransaction(TransactionType.BUY);
    const event = classifyIncome(tx);

    expect(event).toBeNull();
  });

  test("SELL returns null (not income)", () => {
    const tx = makeIncomeTransaction(TransactionType.SELL);
    const event = classifyIncome(tx);

    expect(event).toBeNull();
  });

  test("TRADE returns null (not income)", () => {
    const tx = makeIncomeTransaction(TransactionType.TRADE);
    const event = classifyIncome(tx);

    expect(event).toBeNull();
  });
});

describe("createIncomeLot", () => {
  test("creates a TaxLot with cost basis equal to FMV per unit", () => {
    const tx = makeIncomeTransaction(TransactionType.STAKING);
    const event = classifyIncome(tx)!;
    const lot = createIncomeLot(event, "lot-42");

    expect(lot.id).toBe("lot-42");
    expect(lot.asset).toBe("ETH");
    expect(lot.amount.toNumber()).toBe(2);
    expect(lot.originalAmount.toNumber()).toBe(2);
    expect(lot.costBasisPerUnit.toNumber()).toBe(3000); // FMV $6000 / 2 ETH
    expect(lot.acquisitionType).toBe(TransactionType.STAKING);
    expect(lot.wallet).toBe("ledger");
  });
});
