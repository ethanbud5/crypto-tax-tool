import {
  fetchDailyPrices,
  lookupPrice,
  enrichPrices,
} from "@/engine/price-lookup";

// ─── Mock fetch globally ─────────────────────────────────────────────────────

const mockFetch = jest.spyOn(global, "fetch");

beforeEach(() => {
  mockFetch.mockReset();
});

// ─── Helper: build a CryptoCompare-style response ───────────────────────────

function makeCCResponse(
  dataPoints: { time: number; close: number }[],
): Response {
  return new Response(
    JSON.stringify({
      Response: "Success",
      Data: { Data: dataPoints },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeErrorResponse(message: string): Response {
  return new Response(
    JSON.stringify({ Response: "Error", Message: message }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── Native CSV header matching the normalized CoinTracker output ────────────

const NATIVE_HEADER =
  "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes";

// ─── fetchDailyPrices ────────────────────────────────────────────────────────

describe("fetchDailyPrices", () => {
  it("should return a Map of date → close price", async () => {
    // 2024-03-15T00:00:00Z = 1710460800
    mockFetch.mockResolvedValueOnce(
      makeCCResponse([
        { time: 1710460800, close: 65000 },
        { time: 1710547200, close: 66000 },
      ]),
    );

    const result = await fetchDailyPrices("BTC", new Date("2024-03-16"));

    expect(result.size).toBe(2);
    expect(result.get("2024-03-15")).toBe(65000);
    expect(result.get("2024-03-16")).toBe(66000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should skip data points with zero close price", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCCResponse([
        { time: 1710460800, close: 0 },
        { time: 1710547200, close: 66000 },
      ]),
    );

    const result = await fetchDailyPrices("BTC", new Date("2024-03-16"));
    expect(result.size).toBe(1);
    expect(result.has("2024-03-15")).toBe(false);
  });

  it("should throw on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Server Error", { status: 500 }),
    );

    await expect(
      fetchDailyPrices("BTC", new Date("2024-03-16")),
    ).rejects.toThrow("CryptoCompare API returned 500");
  });

  it("should throw when CryptoCompare returns error response", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse("rate limit exceeded"));

    await expect(
      fetchDailyPrices("BTC", new Date("2024-03-16")),
    ).rejects.toThrow("rate limit exceeded");
  });
});

// ─── lookupPrice ─────────────────────────────────────────────────────────────

describe("lookupPrice", () => {
  const cache = new Map<string, Map<string, number>>();
  cache.set(
    "ETH",
    new Map([
      ["2024-03-14", 3900],
      ["2024-03-15", 4000],
      ["2024-03-16", 4100],
    ]),
  );

  it("should return exact date match", () => {
    expect(lookupPrice(cache, "ETH", "2024-03-15")).toBe(4000);
  });

  it("should fall back to previous day", () => {
    // 2024-03-17 is missing, should get 2024-03-16
    expect(lookupPrice(cache, "ETH", "2024-03-17")).toBe(4100);
  });

  it("should fall back to next day", () => {
    // 2024-03-13 is missing, should get 2024-03-14
    expect(lookupPrice(cache, "ETH", "2024-03-13")).toBe(3900);
  });

  it("should return null if ticker not in cache", () => {
    expect(lookupPrice(cache, "DOGE", "2024-03-15")).toBeNull();
  });

  it("should return null if date and neighbors not in cache", () => {
    expect(lookupPrice(cache, "ETH", "2024-01-01")).toBeNull();
  });
});

// ─── enrichPrices ────────────────────────────────────────────────────────────

describe("enrichPrices", () => {
  it("should fill missing received_asset_price_usd", async () => {
    // STAKING row with ETH received, no price
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,ETH,0.1,,,,,,txhash1,";

    // 2024-03-15T00:00:00Z = 1710460800
    mockFetch.mockResolvedValueOnce(
      makeCCResponse([{ time: 1710460800, close: 4000 }]),
    );

    const result = await enrichPrices(csv);

    expect(result.pricesFilled).toBe(1);
    expect(result.csvContent).toContain("4000");
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Auto-filled 1 price"),
    );
  });

  it("should fill missing sent_asset_price_usd", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,SELL,BTC,0.5,,,,,,,,Coinbase,,";

    mockFetch.mockResolvedValueOnce(
      makeCCResponse([{ time: 1710460800, close: 65000 }]),
    );

    const result = await enrichPrices(csv);

    expect(result.pricesFilled).toBe(1);
    expect(result.csvContent).toContain("65000");
  });

  it("should make zero API calls when all prices present", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,ETH,0.1,4000,,,,,txhash1,";

    const result = await enrichPrices(csv);

    expect(result.pricesFilled).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.warnings).toHaveLength(0);
  });

  it("should not enrich USD assets", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,BUY,,,,USD,100,,,,,,txhash1,";

    const result = await enrichPrices(csv);

    expect(result.pricesFilled).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should emit warning on API error and leave price blank", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,ETH,0.1,,,,,,txhash1,";

    mockFetch.mockRejectedValueOnce(new Error("network failure"));

    const result = await enrichPrices(csv);

    expect(result.pricesFilled).toBe(0);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Failed to fetch prices for ETH"),
    );
    // Price field should still be empty
    const lines = result.csvContent.split("\n");
    const dataLine = lines[1];
    expect(dataLine).toContain(",ETH,0.1,");
  });

  it("should emit warning when CryptoCompare returns no data for ticker", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,FAKECOIN,100,,,,,,txhash1,";

    // Return success but with empty data
    mockFetch.mockResolvedValueOnce(makeCCResponse([]));

    const result = await enrichPrices(csv);

    expect(result.pricesFilled).toBe(0);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No price data returned for FAKECOIN"),
    );
  });

  it("should batch multiple tickers into separate API calls", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,ETH,0.1,,,,,,," +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,ADA,100,,,,,,,";

    // ETH response
    mockFetch.mockResolvedValueOnce(
      makeCCResponse([{ time: 1710460800, close: 4000 }]),
    );
    // ADA response
    mockFetch.mockResolvedValueOnce(
      makeCCResponse([{ time: 1710460800, close: 0.6 }]),
    );

    const result = await enrichPrices(csv);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.pricesFilled).toBe(2);
    expect(result.csvContent).toContain("4000");
    expect(result.csvContent).toContain("0.6");
  });

  it("should use ±1 day fallback when exact date has no data", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,ETH,0.1,,,,,,txhash1,";

    // Return data for 2024-03-14 and 2024-03-16 but NOT 2024-03-15
    mockFetch.mockResolvedValueOnce(
      makeCCResponse([
        { time: 1710374400, close: 3900 }, // 2024-03-14
        { time: 1710547200, close: 4100 }, // 2024-03-16
      ]),
    );

    const result = await enrichPrices(csv);

    expect(result.pricesFilled).toBe(1);
    // Should pick up 2024-03-14 (previous day fallback)
    expect(result.csvContent).toContain("3900");
  });

  it("should handle empty input", async () => {
    const result = await enrichPrices("");
    expect(result.pricesFilled).toBe(0);
    expect(result.warnings).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should handle CSV with only headers", async () => {
    const result = await enrichPrices(NATIVE_HEADER);
    expect(result.pricesFilled).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should deduplicate tickers — one API call per unique ticker", async () => {
    const csv =
      NATIVE_HEADER +
      "\n" +
      "2024-03-15T10:00:00,STAKING,,,,ETH,0.1,,,,,,," +
      "\n" +
      "2024-03-16T10:00:00,STAKING,,,,ETH,0.2,,,,,,,";

    mockFetch.mockResolvedValueOnce(
      makeCCResponse([
        { time: 1710460800, close: 4000 },
        { time: 1710547200, close: 4100 },
      ]),
    );

    const result = await enrichPrices(csv);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.pricesFilled).toBe(2);
  });
});
