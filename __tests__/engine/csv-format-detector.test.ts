import { detectCsvFormat } from "@/engine/csv-format-detector";

describe("detectCsvFormat", () => {
  it("should detect native format headers", () => {
    const csv =
      "date_time,transaction_type,sent_asset,sent_amount,sent_asset_price_usd,received_asset,received_amount,received_asset_price_usd,fee_amount,fee_asset,fee_usd,wallet_or_exchange,tx_hash,notes\n" +
      "2024-01-15T10:00:00Z,BUY,,,,BTC,1.0,30000,10,USD,10,Coinbase,abc123,test";
    expect(detectCsvFormat(csv)).toBe("native");
  });

  it("should detect CoinTracker format headers", () => {
    const csv =
      "Date,Type,Transaction ID,Received Quantity,Received Currency,Received Cost Basis (USD),Received Wallet,Received Address,Received Comment,Sent Quantity,Sent Currency,Sent Cost Basis (USD),Sent Wallet,Sent Address,Sent Comment,Fee Amount,Fee Currency,Fee Cost Basis (USD),Realized Return (USD),Fee Realized Return (USD),Transaction Hash,Block Explorer URL\n" +
      "1/15/2024 10:00:00,BUY,,1.0,BTC,30000,Coinbase,,,30000,USD,,Coinbase,,,10,USD,10,,,,";
    expect(detectCsvFormat(csv)).toBe("cointracker");
  });

  it('should return "unknown" for unrecognized headers', () => {
    const csv = "id,amount,currency,timestamp\n1,100,BTC,2024-01-15";
    expect(detectCsvFormat(csv)).toBe("unknown");
  });

  it('should return "unknown" for empty input', () => {
    expect(detectCsvFormat("")).toBe("unknown");
  });

  it('should return "unknown" for whitespace-only input', () => {
    expect(detectCsvFormat("   \n  \n")).toBe("unknown");
  });

  it("should handle extra columns beyond the required set for native", () => {
    const csv =
      "date_time,transaction_type,wallet_or_exchange,extra_column,another_extra\ndata";
    expect(detectCsvFormat(csv)).toBe("native");
  });

  it("should handle extra columns beyond the required set for CoinTracker", () => {
    const csv =
      "Date,Type,Received Quantity,Received Currency,Received Cost Basis (USD),Sent Quantity,Sent Currency,Extra Field\ndata";
    expect(detectCsvFormat(csv)).toBe("cointracker");
  });

  it("should handle headers with extra whitespace", () => {
    const csv =
      " Date , Type , Received Quantity , Received Currency , Received Cost Basis (USD) , Sent Quantity , Sent Currency \ndata";
    expect(detectCsvFormat(csv)).toBe("cointracker");
  });

  it("should handle Windows-style line endings (CRLF)", () => {
    const csv =
      "date_time,transaction_type,wallet_or_exchange\r\n2024-01-15,BUY,Coinbase";
    expect(detectCsvFormat(csv)).toBe("native");
  });
});
