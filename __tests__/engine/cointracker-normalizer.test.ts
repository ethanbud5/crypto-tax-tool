import fs from "fs";
import path from "path";
import { normalizeCoinTracker } from "@/engine/cointracker-normalizer";
import { parseCsv } from "@/engine/csv-parser";
import { TransactionType } from "@/engine/types";
import Decimal from "decimal.js";

const fixturesDir = path.join(__dirname, "..", "fixtures");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

// ─── Test helpers for building 22-column CoinTracker CSV inline ──────────────

const CT_COLUMNS = [
  "Date",
  "Type",
  "Transaction ID",
  "Received Quantity",
  "Received Currency",
  "Received Cost Basis (USD)",
  "Received Wallet",
  "Received Address",
  "Received Comment",
  "Sent Quantity",
  "Sent Currency",
  "Sent Cost Basis (USD)",
  "Sent Wallet",
  "Sent Address",
  "Sent Comment",
  "Fee Amount",
  "Fee Currency",
  "Fee Cost Basis (USD)",
  "Realized Return (USD)",
  "Fee Realized Return (USD)",
  "Transaction Hash",
  "Block Explorer URL",
];

const CT_HEADER = CT_COLUMNS.join(",");

function ctRow(fields: Partial<Record<string, string>>): string {
  return CT_COLUMNS.map((col) => fields[col] || "").join(",");
}

function ctCsv(...rows: Partial<Record<string, string>>[]): string {
  return [CT_HEADER, ...rows.map((r) => ctRow(r))].join("\n");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("normalizeCoinTracker", () => {
  describe("BUY: USD sent + crypto received", () => {
    it("should normalize to BUY with derived price", () => {
      const csv = ctCsv({
        Date: "1/15/2024 10:00:00",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Received Wallet": "Coinbase",
        "Received Comment": "First BTC purchase",
        "Sent Quantity": "30000",
        "Sent Currency": "USD",
        "Fee Amount": "10",
        "Fee Currency": "USD",
        "Fee Cost Basis (USD)": "10",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(1);

      const tx = parsed.transactions[0];
      expect(tx.type).toBe(TransactionType.BUY);
      expect(tx.receivedAsset).toBe("BTC");
      expect(tx.receivedAmount).toEqual(new Decimal("1"));
      // 30000 / 1.0 = 30000
      expect(tx.receivedAssetPriceUsd).toEqual(new Decimal("30000"));
      expect(tx.feeAmount).toEqual(new Decimal("10"));
      expect(tx.feeAsset).toBe("USD");
      expect(tx.feeUsd).toEqual(new Decimal("10"));
      expect(tx.wallet).toBe("Coinbase");
      expect(tx.notes).toBe("First BTC purchase");
    });
  });

  describe("SELL: crypto sent + USD received", () => {
    it("should normalize to SELL with derived price", () => {
      const csv = ctCsv({
        Date: "6/15/2024 14:00:00",
        Type: "SELL",
        "Received Quantity": "25000",
        "Received Currency": "USD",
        "Received Cost Basis (USD)": "25000",
        "Received Wallet": "Coinbase",
        "Sent Quantity": "0.5",
        "Sent Currency": "BTC",
        "Sent Cost Basis (USD)": "15000",
        "Sent Wallet": "Coinbase",
        "Fee Amount": "5",
        "Fee Currency": "USD",
        "Fee Cost Basis (USD)": "5",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(1);

      const tx = parsed.transactions[0];
      expect(tx.type).toBe(TransactionType.SELL);
      expect(tx.sentAsset).toBe("BTC");
      expect(tx.sentAmount).toEqual(new Decimal("0.5"));
      // 25000 / 0.5 = 50000
      expect(tx.sentAssetPriceUsd).toEqual(new Decimal("50000"));
      expect(tx.feeAmount).toEqual(new Decimal("5"));
      expect(tx.wallet).toBe("Coinbase");
    });
  });

  describe("TRADE: crypto-to-crypto with USD prices", () => {
    it("should normalize to TRADE with prices derived from Received Cost Basis", () => {
      const csv = ctCsv({
        Date: "3/1/2024 12:00:00",
        Type: "TRADE",
        "Received Quantity": "0.00000402",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "0.41",
        "Received Wallet": "Binance",
        "Sent Quantity": "0.374015",
        "Sent Currency": "ADA",
        "Sent Wallet": "Binance",
        "Transaction Hash": "trade123",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions).toHaveLength(1);

      const tx = parsed.transactions[0];
      expect(tx.type).toBe(TransactionType.TRADE);
      expect(tx.sentAsset).toBe("ADA");
      expect(tx.receivedAsset).toBe("BTC");
      // Received price: 0.41 / 0.00000402
      expect(tx.receivedAssetPriceUsd!.toNumber()).toBeCloseTo(
        0.41 / 0.00000402,
        0,
      );
      // Sent price: 0.41 / 0.374015
      expect(tx.sentAssetPriceUsd!.toNumber()).toBeCloseTo(
        0.41 / 0.374015,
        4,
      );
      expect(tx.wallet).toBe("Binance"); // Sent Wallet for TRADE
      expect(tx.txHash).toBe("trade123");
    });
  });

  describe("TRANSFER: emits SEND + RECEIVE pair", () => {
    it("should split into SEND and RECEIVE with fee on SEND", () => {
      const csv = ctCsv({
        Date: "4/10/2024 9:30:00",
        Type: "TRANSFER",
        "Received Quantity": "0.0161652",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "1500",
        "Received Wallet": "River",
        "Sent Quantity": "0.0161652",
        "Sent Currency": "BTC",
        "Sent Wallet": "Coinbase",
        "Fee Amount": "0.0001",
        "Fee Currency": "BTC",
        "Fee Cost Basis (USD)": "9.5",
        "Transaction Hash": "xfer789",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(2);

      const [send, receive] = parsed.transactions;

      // SEND side
      expect(send.type).toBe(TransactionType.SEND);
      expect(send.sentAsset).toBe("BTC");
      expect(send.sentAmount).toEqual(new Decimal("0.0161652"));
      expect(send.wallet).toBe("Coinbase");
      expect(send.feeAmount).toEqual(new Decimal("0.0001"));
      expect(send.feeAsset).toBe("BTC");
      expect(send.feeUsd).toEqual(new Decimal("9.5"));
      expect(send.txHash).toBe("xfer789");

      // RECEIVE side
      expect(receive.type).toBe(TransactionType.RECEIVE);
      expect(receive.receivedAsset).toBe("BTC");
      expect(receive.receivedAmount).toEqual(new Decimal("0.0161652"));
      expect(receive.wallet).toBe("River");
      // Cost basis for lot tracking: 1500 / 0.0161652
      expect(receive.receivedAssetPriceUsd!.toNumber()).toBeCloseTo(
        1500 / 0.0161652,
        0,
      );
      // No fee on RECEIVE side
      expect(receive.feeAmount).toBeUndefined();
    });
  });

  describe("STAKING_REWARD: received-only with FMV", () => {
    it("should normalize to STAKING with price from Received Cost Basis", () => {
      const csv = ctCsv({
        Date: "3/15/2024 10:00:00",
        Type: "STAKING_REWARD",
        "Received Quantity": "0.126527",
        "Received Currency": "ADA",
        "Received Cost Basis (USD)": "0.08",
        "Received Wallet": "Coinbase",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(1);

      const tx = parsed.transactions[0];
      expect(tx.type).toBe(TransactionType.STAKING);
      expect(tx.receivedAsset).toBe("ADA");
      expect(tx.receivedAmount).toEqual(new Decimal("0.126527"));
      // 0.08 / 0.126527
      expect(tx.receivedAssetPriceUsd!.toNumber()).toBeCloseTo(
        0.08 / 0.126527,
        4,
      );
      expect(tx.wallet).toBe("Coinbase");
    });
  });

  describe("INTEREST_PAYMENT: maps to STAKING", () => {
    it("should normalize to STAKING type", () => {
      const csv = ctCsv({
        Date: "5/1/2024 8:00:00",
        Type: "INTEREST_PAYMENT",
        "Received Quantity": "0.00024864",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "25.50",
        "Received Wallet": "River",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(1);

      const tx = parsed.transactions[0];
      expect(tx.type).toBe(TransactionType.STAKING);
      expect(tx.receivedAsset).toBe("BTC");
      expect(tx.wallet).toBe("River");
    });
  });

  describe("USD-only RECEIVE: fiat deposit skipped", () => {
    it("should silently skip USD RECEIVE", () => {
      const csv = ctCsv({
        Date: "2/1/2024 12:00:00",
        Type: "RECEIVE",
        "Received Quantity": "1500",
        "Received Currency": "USD",
        "Received Wallet": "Coinbase Cash",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions).toHaveLength(0);
    });
  });

  describe("USD-only SEND: fiat withdrawal skipped", () => {
    it("should silently skip USD SEND", () => {
      const csv = ctCsv({
        Date: "2/5/2024 12:00:00",
        Type: "SEND",
        "Sent Quantity": "500",
        "Sent Currency": "USD",
        "Sent Wallet": "Coinbase Cash",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions).toHaveLength(0);
    });
  });

  describe("unrecognized type", () => {
    it("should warn and skip rows with unknown types", () => {
      const csv = ctCsv({
        Date: "1/1/2024 10:00:00",
        Type: "DEPOSIT",
        "Received Quantity": "100",
        "Received Currency": "SOL",
        "Received Wallet": "Phantom",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Unrecognized CoinTracker type");
      expect(result.warnings[0]).toContain("DEPOSIT");

      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions).toHaveLength(0);
    });
  });

  describe("date conversion", () => {
    it("should convert M/D/YYYY H:MM:SS to YYYY-MM-DDThh:mm:ss", () => {
      const csv = ctCsv({
        Date: "1/15/2024 10:00:00",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Received Wallet": "Coinbase",
        "Sent Quantity": "30000",
        "Sent Currency": "USD",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.csvContent).toContain("2024-01-15T10:00:00");
    });

    it("should handle variable-width date fields (no zero-padding)", () => {
      const csv = ctCsv({
        Date: "12/2/2025 7:17:08",
        Type: "BUY",
        "Received Quantity": "0.001",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "100",
        "Received Wallet": "River",
        "Sent Quantity": "100",
        "Sent Currency": "USD",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.csvContent).toContain("2025-12-02T07:17:08");
    });

    it("should emit a warning for unparseable dates", () => {
      const csv = ctCsv({
        Date: "invalid-date",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Received Wallet": "Coinbase",
      });

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Could not parse date");
    });
  });

  describe("fee mapping", () => {
    it("should use Fee Cost Basis (USD) for fee_usd", () => {
      const csv = ctCsv({
        Date: "1/15/2024 10:00:00",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Received Wallet": "Coinbase",
        "Sent Quantity": "30000",
        "Sent Currency": "USD",
        "Fee Amount": "0.0001",
        "Fee Currency": "BTC",
        "Fee Cost Basis (USD)": "9.50",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.transactions[0].feeAmount).toEqual(new Decimal("0.0001"));
      expect(parsed.transactions[0].feeAsset).toBe("BTC");
      expect(parsed.transactions[0].feeUsd).toEqual(new Decimal("9.5"));
    });
  });

  describe("wallet selection", () => {
    it("should use Received Wallet for BUY", () => {
      const csv = ctCsv({
        Date: "1/15/2024 10:00:00",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Received Wallet": "River",
        "Sent Quantity": "30000",
        "Sent Currency": "USD",
        "Sent Wallet": "River",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions[0].wallet).toBe("River");
    });

    it('should fall back to "Unknown" when both wallets are empty', () => {
      const csv = ctCsv({
        Date: "1/15/2024 10:00:00",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Sent Quantity": "30000",
        "Sent Currency": "USD",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions[0].wallet).toBe("Unknown");
    });
  });

  describe("tx_hash from Transaction Hash", () => {
    it("should map Transaction Hash to tx_hash", () => {
      const csv = ctCsv({
        Date: "1/15/2024 10:00:00",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Received Wallet": "Coinbase",
        "Sent Quantity": "30000",
        "Sent Currency": "USD",
        "Transaction Hash": "abc123def456",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions[0].txHash).toBe("abc123def456");
    });
  });

  describe("notes combining", () => {
    it("should combine Received Comment and Sent Comment", () => {
      const csv = ctCsv({
        Date: "1/15/2024 10:00:00",
        Type: "BUY",
        "Received Quantity": "1.0",
        "Received Currency": "BTC",
        "Received Cost Basis (USD)": "30000",
        "Received Wallet": "Coinbase",
        "Received Comment": "Buy order",
        "Sent Quantity": "30000",
        "Sent Currency": "USD",
        "Sent Comment": "Bank transfer",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions[0].notes).toBe("Buy order; Bank transfer");
    });

    it("should use only Received Comment when Sent Comment is empty", () => {
      const csv = ctCsv({
        Date: "3/15/2024 10:00:00",
        Type: "STAKING_REWARD",
        "Received Quantity": "0.1",
        "Received Currency": "ETH",
        "Received Cost Basis (USD)": "250",
        "Received Wallet": "Kraken",
        "Received Comment": "Staking reward",
      });

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions[0].notes).toBe("Staking reward");
    });
  });

  describe("fixture file: cointracker-buy-sell.csv", () => {
    it("should correctly normalize the buy-sell fixture", () => {
      const csv = readFixture("cointracker-buy-sell.csv");
      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(2);

      const [buy, sell] = parsed.transactions;
      expect(buy.type).toBe(TransactionType.BUY);
      expect(buy.receivedAssetPriceUsd).toEqual(new Decimal("30000"));
      expect(sell.type).toBe(TransactionType.SELL);
      expect(sell.sentAssetPriceUsd).toEqual(new Decimal("50000"));
    });
  });

  describe("fixture file: cointracker-staking.csv", () => {
    it("should normalize buy + staking + interest with FMV", () => {
      const csv = readFixture("cointracker-staking.csv");
      const result = normalizeCoinTracker(csv);

      const parsed = parseCsv(result.csvContent);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(3);

      expect(parsed.transactions[0].type).toBe(TransactionType.BUY);
      expect(parsed.transactions[1].type).toBe(TransactionType.STAKING);
      // 250 / 0.1 = 2500
      expect(parsed.transactions[1].receivedAssetPriceUsd).toEqual(
        new Decimal("2500"),
      );
      expect(parsed.transactions[2].type).toBe(TransactionType.STAKING); // INTEREST_PAYMENT → STAKING
      // 150 / 0.05 = 3000
      expect(parsed.transactions[2].receivedAssetPriceUsd).toEqual(
        new Decimal("3000"),
      );
    });
  });

  describe("empty input", () => {
    it("should return empty CSV for header-only input", () => {
      const csv = CT_HEADER;

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions).toHaveLength(0);
    });
  });
});
