import fs from "fs";
import path from "path";
import { importCsv } from "@/engine/csv-import";
import { TransactionType } from "@/engine/types";

const fixturesDir = path.join(__dirname, "..", "fixtures");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

describe("importCsv", () => {
  describe("native CSV passthrough", () => {
    it("should detect native format and parse directly", () => {
      const csv = readFixture("simple-buy-sell.csv");
      const result = importCsv(csv);

      expect(result.detectedFormat).toBe("native");
      expect(result.normalizationWarnings).toHaveLength(0);
      expect(result.parseResult.transactions).toHaveLength(2);
      expect(result.parseResult.errors).toHaveLength(0);
    });
  });

  describe("CoinTracker CSV normalization", () => {
    it("should detect CoinTracker format, normalize, and parse", () => {
      const csv = readFixture("cointracker-buy-sell.csv");
      const result = importCsv(csv);

      expect(result.detectedFormat).toBe("cointracker");
      expect(result.parseResult.transactions).toHaveLength(2);
      expect(result.parseResult.errors).toHaveLength(0);

      const [buy, sell] = result.parseResult.transactions;
      expect(buy.type).toBe(TransactionType.BUY);
      expect(sell.type).toBe(TransactionType.SELL);
    });
  });

  describe("unknown format attempts native parse", () => {
    it("should attempt native parse for unknown formats", () => {
      const csv = "id,amount,currency\n1,100,BTC";
      const result = importCsv(csv);

      expect(result.detectedFormat).toBe("unknown");
      // Will fail to parse because columns don't match, but should not throw
      expect(result.parseResult.transactions).toHaveLength(0);
    });
  });

  describe("normalization warnings merged into result", () => {
    it("should merge normalization warnings into parseResult.warnings", () => {
      const csv =
        "Date,Received Quantity,Received Currency,Sent Quantity,Sent Currency,Fee Amount,Fee Currency,Exchange,Trade-Group,Comment\n" +
        "03/01/2024 12:00:00,15,ETH,0.5,BTC,,,Binance,,";

      const result = importCsv(csv);

      expect(result.detectedFormat).toBe("cointracker");
      expect(result.normalizationWarnings.length).toBeGreaterThan(0);
      // Normalization warnings should also appear in parseResult.warnings
      expect(
        result.parseResult.warnings.some((w) =>
          w.message.includes("Crypto-to-crypto"),
        ),
      ).toBe(true);
    });
  });

  describe("mixed CoinTracker fixture", () => {
    it("should handle a comprehensive mix of transaction types", () => {
      const csv = readFixture("cointracker-mixed.csv");
      const result = importCsv(csv);

      expect(result.detectedFormat).toBe("cointracker");
      // Should have some successful transactions and some errors (staking/airdrop missing FMV)
      expect(result.parseResult.transactions.length).toBeGreaterThan(0);
    });
  });
});
