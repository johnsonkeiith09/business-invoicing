import { describe, expect, it } from "vitest";
import { agingBucket, computeTotals, lineNet, toCents, toMilli } from "./money";

describe("document arithmetic", () => {
  it("applies quantity, price and discount in integer cents", () => {
    expect(lineNet({ qtyMilli: 3000, unitCents: 1999, discountBp: 1000, vatRate: 20 })).toBe(5397);
    expect(lineNet({ qtyMilli: 1500, unitCents: 1000, discountBp: 0, vatRate: 20 })).toBe(1500);
  });

  it("sums VAT per rate", () => {
    const totals = computeTotals([
      { qtyMilli: 2000, unitCents: 10000, discountBp: 0, vatRate: 20 },
      { qtyMilli: 1000, unitCents: 5000, discountBp: 0, vatRate: 10 },
      { qtyMilli: 1000, unitCents: 333, discountBp: 0, vatRate: 20 },
    ]);
    expect(totals.netCents).toBe(25333);
    expect(totals.byRate).toEqual([
      { rate: 10, baseCents: 5000, vatCents: 500 },
      { rate: 20, baseCents: 20333, vatCents: 4067 },
    ]);
    expect(totals.totalCents).toBe(25333 + 4567);
  });

  it("parses decimals and buckets ages", () => {
    expect(toCents("12,5")).toBe(1250);
    expect(toCents("abc")).toBeNull();
    expect(toMilli("0.25")).toBe(250);
    expect(agingBucket(0)).toBe("not_due");
    expect(agingBucket(45)).toBe("31_60");
    expect(agingBucket(91)).toBe("90_plus");
  });
});
