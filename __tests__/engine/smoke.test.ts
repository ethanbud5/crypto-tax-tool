import { TransactionType, CostBasisMethod } from "@/engine/types";

describe("types smoke test", () => {
  it("should have all transaction types", () => {
    expect(TransactionType.BUY).toBe("BUY");
    expect(TransactionType.SELL).toBe("SELL");
    expect(TransactionType.TRADE).toBe("TRADE");
    expect(TransactionType.STAKING).toBe("STAKING");
  });

  it("should have all cost basis methods", () => {
    expect(CostBasisMethod.FIFO).toBe("FIFO");
    expect(CostBasisMethod.LIFO).toBe("LIFO");
    expect(CostBasisMethod.HIFO).toBe("HIFO");
  });
});
