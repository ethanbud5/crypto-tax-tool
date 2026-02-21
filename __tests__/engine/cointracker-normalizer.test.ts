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

describe("normalizeCoinTracker", () => {
  describe("BUY: USD sent + crypto received", () => {
    it("should normalize to BUY with derived price", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "01/15/2024 10:00:00,1.0,BTC,30000,USD,10,USD,Coinbase,,First BTC purchase";

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(0);

      // Parse the normalized CSV to verify it's valid
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
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "06/15/2024 14:00:00,25000,USD,0.5,BTC,5,USD,Coinbase,,Partial sell";

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

  describe("TRADE: crypto-to-crypto", () => {
    it("should normalize to TRADE with no USD price and a warning", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "03/01/2024 12:00:00,15,ETH,0.5,BTC,,,Binance,,";

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Crypto-to-crypto trade");
      expect(result.warnings[0]).toContain("BTC");
      expect(result.warnings[0]).toContain("ETH");

      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions).toHaveLength(1);

      const tx = parsed.transactions[0];
      expect(tx.type).toBe(TransactionType.TRADE);
      expect(tx.sentAsset).toBe("BTC");
      expect(tx.sentAmount).toEqual(new Decimal("0.5"));
      expect(tx.receivedAsset).toBe("ETH");
      expect(tx.receivedAmount).toEqual(new Decimal("15"));
      // No USD prices derivable
      expect(tx.sentAssetPriceUsd).toBeUndefined();
      expect(tx.receivedAssetPriceUsd).toBeUndefined();
    });
  });

  describe("STAKING: received-only + staking comment", () => {
    it("should normalize to STAKING type", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "03/15/2024 10:00:00,0.1,ETH,,,,,Kraken,,staking reward";

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      // STAKING requires received_asset_price_usd — this error is expected
      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(parsed.errors[0].message).toContain(
        "received_asset_price_usd is required for STAKING",
      );
    });
  });

  describe("MINING: received-only + mining comment", () => {
    it("should normalize to MINING type", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "03/15/2024 10:00:00,0.5,BTC,,,,,NiceHash,,mining reward";

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(parsed.errors[0].message).toContain(
        "received_asset_price_usd is required for MINING",
      );
    });
  });

  describe("AIRDROP: received-only + airdrop comment", () => {
    it("should normalize to AIRDROP type", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "05/01/2024 09:00:00,100,SOL,,,,,Phantom,,airdrop";

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(parsed.errors[0].message).toContain(
        "received_asset_price_usd is required for AIRDROP",
      );
    });
  });

  describe("SEND: sent-only + transfer comment", () => {
    it("should normalize to SEND type", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "07/01/2024 10:00:00,,,0.01,BTC,,,Coinbase,,transfer";

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.errors).toHaveLength(0);
      expect(parsed.transactions).toHaveLength(1);

      const tx = parsed.transactions[0];
      expect(tx.type).toBe(TransactionType.SEND);
      expect(tx.sentAsset).toBe("BTC");
      expect(tx.sentAmount).toEqual(new Decimal("0.01"));
    });
  });

  describe("date conversion", () => {
    it("should convert MM/DD/YYYY HH:MM:SS to YYYY-MM-DDThh:mm:ss", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "01/15/2024 10:00:00,1.0,BTC,30000,USD,,,Coinbase,,";

      const result = normalizeCoinTracker(csv);
      // The normalized CSV should contain the ISO-formatted date
      expect(result.csvContent).toContain("2024-01-15T10:00:00");
    });

    it("should emit a warning for unparseable dates", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "invalid-date,1.0,BTC,30000,USD,,,Coinbase,,";

      const result = normalizeCoinTracker(csv);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Could not parse date");
    });
  });

  describe("fee mapping", () => {
    it("should preserve fee amount and currency", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "01/15/2024 10:00:00,1.0,BTC,30000,USD,15,USD,Coinbase,,";

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.transactions[0].feeAmount).toEqual(new Decimal("15"));
      expect(parsed.transactions[0].feeAsset).toBe("USD");
      expect(parsed.transactions[0].feeUsd).toEqual(new Decimal("15"));
    });
  });

  describe("empty Exchange defaults to Unknown", () => {
    it('should use "Unknown" when Exchange is empty', () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "01/15/2024 10:00:00,1.0,BTC,30000,USD,,,,,";

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);

      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.transactions[0].wallet).toBe("Unknown");
    });
  });

  describe("non-USD fiat", () => {
    it("should emit a warning for EUR-denominated trades", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "01/15/2024 10:00:00,1.0,BTC,28000,EUR,,,Kraken,,";

      const result = normalizeCoinTracker(csv);
      expect(result.warnings.some((w) => w.includes("Non-USD fiat"))).toBe(
        true,
      );
      expect(result.warnings.some((w) => w.includes("EUR"))).toBe(true);
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
    it("should normalize buy + staking rows", () => {
      const csv = readFixture("cointracker-staking.csv");
      const result = normalizeCoinTracker(csv);

      const parsed = parseCsv(result.csvContent);
      // First row is a valid BUY, staking rows will error due to missing FMV
      expect(
        parsed.transactions.some((t) => t.type === TransactionType.BUY),
      ).toBe(true);
      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(
        parsed.errors.some((e) =>
          e.message.includes("received_asset_price_usd is required"),
        ),
      ).toBe(true);
    });
  });

  describe("empty input", () => {
    it("should return empty CSV for empty input", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment";

      const result = normalizeCoinTracker(csv);
      const parsed = parseCsv(result.csvContent);
      expect(parsed.transactions).toHaveLength(0);
    });
  });
});
