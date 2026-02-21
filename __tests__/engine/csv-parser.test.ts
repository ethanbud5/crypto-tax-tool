import fs from "fs";
import path from "path";
import Decimal from "decimal.js";
import { parseCsv } from "@/engine/csv-parser";
import { TransactionType } from "@/engine/types";

const fixturesDir = path.join(__dirname, "..", "fixtures");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

// ─── Fixture Parsing ─────────────────────────────────────────────────────────

describe("parseCsv - fixture files", () => {
  describe("simple-buy-sell.csv", () => {
    it("should parse buy and sell transactions", () => {
      const result = parseCsv(readFixture("simple-buy-sell.csv"));

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);

      const [buy, sell] = result.transactions;

      expect(buy.type).toBe(TransactionType.BUY);
      expect(buy.receivedAsset).toBe("BTC");
      expect(buy.receivedAmount).toEqual(new Decimal("1.0"));
      expect(buy.receivedAssetPriceUsd).toEqual(new Decimal("30000"));
      expect(buy.feeAmount).toEqual(new Decimal("10"));
      expect(buy.feeAsset).toBe("USD");
      expect(buy.feeUsd).toEqual(new Decimal("10"));
      expect(buy.wallet).toBe("Coinbase");
      expect(buy.txHash).toBe("abc123");
      expect(buy.notes).toBe("First BTC purchase");

      expect(sell.type).toBe(TransactionType.SELL);
      expect(sell.sentAsset).toBe("BTC");
      expect(sell.sentAmount).toEqual(new Decimal("0.5"));
      expect(sell.sentAssetPriceUsd).toEqual(new Decimal("50000"));
      expect(sell.feeAmount).toEqual(new Decimal("5"));
      expect(sell.wallet).toBe("Coinbase");
    });
  });

  describe("crypto-to-crypto.csv", () => {
    it("should parse buy and trade transactions", () => {
      const result = parseCsv(readFixture("crypto-to-crypto.csv"));

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);

      const [buy, trade] = result.transactions;

      expect(buy.type).toBe(TransactionType.BUY);
      expect(buy.receivedAsset).toBe("BTC");

      expect(trade.type).toBe(TransactionType.TRADE);
      expect(trade.sentAsset).toBe("BTC");
      expect(trade.sentAmount).toEqual(new Decimal("0.5"));
      expect(trade.sentAssetPriceUsd).toEqual(new Decimal("50000"));
      expect(trade.receivedAsset).toBe("ETH");
      expect(trade.receivedAmount).toEqual(new Decimal("10.0"));
      expect(trade.receivedAssetPriceUsd).toEqual(new Decimal("2500"));
      expect(trade.notes).toBe("Swapped BTC for ETH");
    });
  });

  describe("staking-income.csv", () => {
    it("should parse buy and staking transactions", () => {
      const result = parseCsv(readFixture("staking-income.csv"));

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(3);

      const [buy, stake1, stake2] = result.transactions;

      expect(buy.type).toBe(TransactionType.BUY);

      expect(stake1.type).toBe(TransactionType.STAKING);
      expect(stake1.receivedAsset).toBe("ETH");
      expect(stake1.receivedAmount).toEqual(new Decimal("0.1"));
      expect(stake1.receivedAssetPriceUsd).toEqual(new Decimal("2800"));

      expect(stake2.type).toBe(TransactionType.STAKING);
      expect(stake2.receivedAmount).toEqual(new Decimal("0.15"));
      expect(stake2.receivedAssetPriceUsd).toEqual(new Decimal("3000"));
    });
  });

  describe("multi-wallet.csv", () => {
    it("should parse transactions across multiple wallets", () => {
      const result = parseCsv(readFixture("multi-wallet.csv"));

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(5);

      const [buy1, buy2, send, receive, sell] = result.transactions;

      expect(buy1.wallet).toBe("Coinbase");
      expect(buy2.wallet).toBe("Kraken");

      expect(send.type).toBe(TransactionType.SEND);
      expect(send.sentAsset).toBe("BTC");
      expect(send.sentAmount).toEqual(new Decimal("1.0"));
      expect(send.feeAmount).toEqual(new Decimal("0.0001"));
      expect(send.feeAsset).toBe("BTC");
      expect(send.wallet).toBe("Coinbase");

      expect(receive.type).toBe(TransactionType.RECEIVE);
      expect(receive.receivedAsset).toBe("BTC");
      expect(receive.receivedAmount).toEqual(new Decimal("0.9999"));
      expect(receive.wallet).toBe("ColdWallet");

      expect(sell.type).toBe(TransactionType.SELL);
      expect(sell.wallet).toBe("Kraken");
    });
  });
});

// ─── Validation Errors ───────────────────────────────────────────────────────

describe("parseCsv - validation errors", () => {
  it("should error on missing required fields", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      ",,,,,,,,,,,,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("date_time");
    expect(fields).toContain("transaction_type");
    expect(fields).toContain("wallet_or_exchange");
  });

  it("should error on unknown transaction type", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,SWAP,,,,BTC,1.0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe("transaction_type");
    expect(result.errors[0].message).toContain("Unknown transaction type");
    expect(result.errors[0].message).toContain("SWAP");
  });

  it("should error on negative amounts", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,SELL,BTC,-1.0,50000,,,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    const amountError = result.errors.find(
      (e) => e.field === "sent_amount"
    );
    expect(amountError).toBeDefined();
    expect(amountError!.message).toContain("positive number");
  });

  it("should error on zero amounts", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    const amountError = result.errors.find(
      (e) => e.field === "received_amount"
    );
    expect(amountError).toBeDefined();
    expect(amountError!.message).toContain("positive number");
  });

  it("should error when SELL is missing sent_asset", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,SELL,,0.5,50000,,,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors.some((e) => e.field === "sent_asset")).toBe(true);
  });

  it("should error when BUY is missing received fields", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,,,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors.some((e) => e.field === "received_asset")).toBe(true);
    expect(result.errors.some((e) => e.field === "received_amount")).toBe(true);
  });

  it("should error when TRADE is missing sent or received fields", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,TRADE,,,,,,,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors.some((e) => e.field === "sent_asset")).toBe(true);
    expect(result.errors.some((e) => e.field === "sent_amount")).toBe(true);
    expect(result.errors.some((e) => e.field === "received_asset")).toBe(true);
    expect(result.errors.some((e) => e.field === "received_amount")).toBe(true);
  });

  it("should error when STAKING is missing received_asset_price_usd", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,STAKING,,,,ETH,0.1,,,,,Kraken,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(
      result.errors.some((e) => e.field === "received_asset_price_usd")
    ).toBe(true);
  });

  it("should error on invalid date", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "not-a-date,BUY,,,,BTC,1.0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors[0].field).toBe("date_time");
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("should report correct row numbers for errors", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,1.0,30000,,,,Coinbase,,",
      ",,,,,,,,,,,,,"
    ].join("\n");

    const result = parseCsv(csv);

    // First row (row 2) should parse fine, second row (row 3) should have errors
    expect(result.transactions).toHaveLength(1);
    expect(result.errors.every((e) => e.row === 3)).toBe(true);
  });
});

// ─── Validation Warnings ─────────────────────────────────────────────────────

describe("parseCsv - validation warnings", () => {
  it("should warn when dates lack timezone info", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00,BUY,,,,BTC,1.0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].field).toBe("date_time");
    expect(result.warnings[0].message).toContain("timezone");
  });

  it("should not warn when dates have Z timezone", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,1.0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.warnings).toHaveLength(0);
  });

  it("should not warn when dates have offset timezone", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00+05:30,BUY,,,,BTC,1.0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.warnings).toHaveLength(0);
  });
});

// ─── Decimal Conversion ──────────────────────────────────────────────────────

describe("parseCsv - Decimal handling", () => {
  it("should convert amounts to Decimal instances", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,0.00000001,30000,0.5,USD,0.5,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    const tx = result.transactions[0];
    expect(tx.receivedAmount).toBeInstanceOf(Decimal);
    expect(tx.receivedAmount!.toFixed()).toBe("0.00000001");
    expect(tx.receivedAssetPriceUsd).toBeInstanceOf(Decimal);
    expect(tx.feeAmount).toBeInstanceOf(Decimal);
    expect(tx.feeUsd).toBeInstanceOf(Decimal);
  });

  it("should handle large decimal numbers without precision loss", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,999999999.123456789,100000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.transactions[0].receivedAmount!.toString()).toBe(
      "999999999.123456789"
    );
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe("parseCsv - edge cases", () => {
  it("should return empty results for empty string", () => {
    const result = parseCsv("");

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should return empty results for whitespace-only string", () => {
    const result = parseCsv("   \n  \n  ");

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should return empty transactions for header-only CSV", () => {
    const csv =
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes";

    const result = parseCsv(csv);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should handle optional fields being empty", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,1.0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    const tx = result.transactions[0];
    expect(tx.sentAsset).toBeUndefined();
    expect(tx.sentAmount).toBeUndefined();
    expect(tx.feeAmount).toBeUndefined();
    expect(tx.feeAsset).toBeUndefined();
    expect(tx.feeUsd).toBeUndefined();
    expect(tx.txHash).toBeUndefined();
    expect(tx.notes).toBeUndefined();
  });

  it("should handle all income types (MINING, STAKING, AIRDROP, FORK, INCOME)", () => {
    const incomeTypes = ["MINING", "STAKING", "AIRDROP", "FORK", "INCOME"];
    for (const type of incomeTypes) {
      const csv = [
        "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
        `2024-01-15T10:00:00Z,${type},,,,ETH,1.0,2500,,,,Kraken,,`
      ].join("\n");

      const result = parseCsv(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions[0].type).toBe(type);
    }
  });

  it("should parse dates into Date objects", () => {
    const csv = [
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes",
      "2024-01-15T10:00:00Z,BUY,,,,BTC,1.0,30000,,,,Coinbase,,"
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.transactions[0].dateTime).toBeInstanceOf(Date);
    expect(result.transactions[0].dateTime.toISOString()).toBe(
      "2024-01-15T10:00:00.000Z"
    );
  });
});
