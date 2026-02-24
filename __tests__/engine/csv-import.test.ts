import fs from "fs";
import path from "path";
import { importCsv } from "@/engine/csv-import";
import { TransactionType } from "@/engine/types";

// Mock enrichPrices to pass through CSV unchanged (avoids real API calls)
jest.mock("@/engine/price-lookup", () => ({
  enrichPrices: jest.fn(async (csv: string) => ({
    csvContent: csv,
    warnings: [],
    pricesFilled: 0,
  })),
}));

const fixturesDir = path.join(__dirname, "..", "fixtures");

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

// 22-column CoinTracker header for inline CSV tests
const CT_HEADER =
  "Date,Type,Transaction ID,Received Quantity,Received Currency,Received Cost Basis (USD),Received Wallet,Received Address,Received Comment,Sent Quantity,Sent Currency,Sent Cost Basis (USD),Sent Wallet,Sent Address,Sent Comment,Fee Amount,Fee Currency,Fee Cost Basis (USD),Realized Return (USD),Fee Realized Return (USD),Transaction Hash,Block Explorer URL";

describe("importCsv", () => {
  describe("native CSV passthrough", () => {
    it("should detect native format and parse directly", async () => {
      const csv = readFixture("simple-buy-sell.csv");
      const result = await importCsv(csv);

      expect(result.detectedFormat).toBe("native");
      expect(result.normalizationWarnings).toHaveLength(0);
      expect(result.parseResult.transactions).toHaveLength(2);
      expect(result.parseResult.errors).toHaveLength(0);
    });
  });

  describe("CoinTracker CSV normalization", () => {
    it("should detect CoinTracker format, normalize, and parse", async () => {
      const csv = readFixture("cointracker-buy-sell.csv");
      const result = await importCsv(csv);

      expect(result.detectedFormat).toBe("cointracker");
      expect(result.parseResult.transactions).toHaveLength(2);
      expect(result.parseResult.errors).toHaveLength(0);

      const [buy, sell] = result.parseResult.transactions;
      expect(buy.type).toBe(TransactionType.BUY);
      expect(sell.type).toBe(TransactionType.SELL);
    });
  });

  describe("unknown format attempts native parse", () => {
    it("should attempt native parse for unknown formats", async () => {
      const csv = "id,amount,currency\n1,100,BTC";
      const result = await importCsv(csv);

      expect(result.detectedFormat).toBe("unknown");
      // Will fail to parse because columns don't match, but should not throw
      expect(result.parseResult.transactions).toHaveLength(0);
    });
  });

  describe("normalization warnings merged into result", () => {
    it("should merge normalization warnings into parseResult.warnings", async () => {
      // Use an unrecognized type to generate a normalization warning
      const csv =
        CT_HEADER +
        "\n" +
        "3/1/2024 12:00:00,UNKNOWN_TYPE,,15,ETH,,Binance,,,,,,,,,,,,,,,";

      const result = await importCsv(csv);

      expect(result.detectedFormat).toBe("cointracker");
      expect(result.normalizationWarnings.length).toBeGreaterThan(0);
      // Normalization warnings should also appear in parseResult.warnings
      expect(
        result.parseResult.warnings.some((w) =>
          w.message.includes("Unrecognized CoinTracker type"),
        ),
      ).toBe(true);
    });
  });

  describe("mixed CoinTracker fixture", () => {
    it("should handle a comprehensive mix of transaction types", async () => {
      const csv = readFixture("cointracker-mixed.csv");
      const result = await importCsv(csv);

      expect(result.detectedFormat).toBe("cointracker");
      // 8 rows in CSV, but 2 skipped (USD SEND/RECEIVE) and TRANSFER splits into 2
      // = 1 BUY + 1 SELL + 1 TRADE + 2 (TRANSFER→SEND+RECEIVE) + 1 STAKING + 1 STAKING = 7
      expect(result.parseResult.transactions).toHaveLength(7);
      expect(result.parseResult.errors).toHaveLength(0);
    });
  });
});
