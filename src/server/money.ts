// Pure arithmetic shared by the server and the pages. Amounts are integer
// cents, quantities thousandths, discounts hundredths of a percent.

export const VAT_RATES = [0, 7, 10, 14, 20] as const;

export interface LineInput {
  qtyMilli: number;
  unitCents: number;
  discountBp: number;
  vatRate: number;
}

/** A decimal string or number ("12.5", "12,50") in hundredths, or null. */
export function toCents(value: string | number): number | null {
  const text = String(value).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

/** A decimal string in thousandths, or null. */
export function toMilli(value: string | number): number | null {
  const text = String(value).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Math.round(Number(text) * 1000);
}

export function lineNet(line: LineInput): number {
  const gross = (line.qtyMilli * line.unitCents) / 1000;
  return Math.round((gross * (10000 - line.discountBp)) / 10000);
}

export interface Totals {
  netCents: number;
  vatCents: number;
  totalCents: number;
  byRate: { rate: number; baseCents: number; vatCents: number }[];
}

/** Net per line, VAT per rate on the summed base, and the total. */
export function computeTotals(lines: LineInput[]): Totals {
  const bases = new Map<number, number>();
  let netCents = 0;
  for (const line of lines) {
    const net = lineNet(line);
    netCents += net;
    bases.set(line.vatRate, (bases.get(line.vatRate) ?? 0) + net);
  }
  const byRate = [...bases.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, baseCents]) => ({
      rate,
      baseCents,
      vatCents: Math.round((baseCents * rate) / 100),
    }));
  const vatCents = byRate.reduce((sum, r) => sum + r.vatCents, 0);
  return { netCents, vatCents, totalCents: netCents + vatCents, byRate };
}

export function formatMoney(cents: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatQty(milli: number): string {
  return String(Number((milli / 1000).toFixed(3)));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AgingBucket = "not_due" | "1_30" | "31_60" | "61_90" | "90_plus";

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "not_due";
  if (daysOverdue <= 30) return "1_30";
  if (daysOverdue <= 60) return "31_60";
  if (daysOverdue <= 90) return "61_90";
  return "90_plus";
}
