import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, documents, lines, reminders } from "@/db/schema";
import type { Ctx } from "./context";
import { agingBucket, daysBetween, today, type AgingBucket } from "./money";
import { listDocuments, shownStatus } from "./documents";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const rangeInput = z.object({ from: date, to: date }).strict();
export type Range = z.infer<typeof rangeInput>;

/** Issued sales documents and recorded bills in the range, drafts left out. */
function issuedIn(ctx: Ctx, types: ("invoice" | "credit" | "bill")[], range: Range) {
  return db
    .select({
      id: documents.id,
      type: documents.type,
      date: documents.date,
      accountId: documents.accountId,
      accountName: accounts.name,
      netCents: documents.netCents,
      vatCents: documents.vatCents,
    })
    .from(documents)
    .innerJoin(accounts, eq(accounts.id, documents.accountId))
    .where(
      and(
        eq(documents.orgId, ctx.orgId),
        inArray(documents.type, types),
        ne(documents.status, "draft"),
        gte(documents.date, range.from),
        lte(documents.date, range.to),
      ),
    );
}

export async function salesByCustomer(ctx: Ctx, range: Range) {
  const docs = await issuedIn(ctx, ["invoice", "credit"], range);
  const map = new Map<string, { customer: string; invoicedCents: number; creditedCents: number; netCents: number }>();
  for (const d of docs) {
    const row = map.get(d.accountId) ?? { customer: d.accountName, invoicedCents: 0, creditedCents: 0, netCents: 0 };
    if (d.type === "invoice") row.invoicedCents += d.netCents;
    else row.creditedCents += d.netCents;
    row.netCents = row.invoicedCents - row.creditedCents;
    map.set(d.accountId, row);
  }
  return [...map.values()].sort((a, b) => b.netCents - a.netCents);
}

export async function salesByItem(ctx: Ctx, range: Range) {
  const rows = await db
    .select({
      type: documents.type,
      description: lines.description,
      qtyMilli: lines.qtyMilli,
      netCents: lines.netCents,
    })
    .from(lines)
    .innerJoin(documents, eq(documents.id, lines.documentId))
    .where(
      and(
        eq(documents.orgId, ctx.orgId),
        inArray(documents.type, ["invoice", "credit"]),
        ne(documents.status, "draft"),
        gte(documents.date, range.from),
        lte(documents.date, range.to),
      ),
    );
  const map = new Map<string, { item: string; qtyMilli: number; netCents: number }>();
  for (const r of rows) {
    const sign = r.type === "credit" ? -1 : 1;
    const row = map.get(r.description) ?? { item: r.description, qtyMilli: 0, netCents: 0 };
    row.qtyMilli += sign * r.qtyMilli;
    row.netCents += sign * r.netCents;
    map.set(r.description, row);
  }
  return [...map.values()].sort((a, b) => b.netCents - a.netCents);
}

export async function vatByMonth(ctx: Ctx, range: Range) {
  const docs = await issuedIn(ctx, ["invoice", "credit", "bill"], range);
  const map = new Map<string, { month: string; collectedCents: number; deductibleCents: number; balanceCents: number }>();
  for (const d of docs) {
    const month = d.date.slice(0, 7);
    const row = map.get(month) ?? { month, collectedCents: 0, deductibleCents: 0, balanceCents: 0 };
    if (d.type === "invoice") row.collectedCents += d.vatCents;
    if (d.type === "credit") row.collectedCents -= d.vatCents;
    if (d.type === "bill") row.deductibleCents += d.vatCents;
    row.balanceCents = row.collectedCents - row.deductibleCents;
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export const BUCKETS: AgingBucket[] = ["not_due", "1_30", "31_60", "61_90", "90_plus"];

/** Unpaid customer invoices with how late each is, as of today. */
export async function unpaidInvoices(ctx: Ctx, range?: Range) {
  const { rows } = await listDocuments(ctx, { types: ["invoice"] });
  const now = today();
  const last = await db
    .select({ documentId: reminders.documentId, at: sql<string>`max(${reminders.at})` })
    .from(reminders)
    .where(eq(reminders.orgId, ctx.orgId))
    .groupBy(reminders.documentId);
  const lastBy = new Map(last.map((r) => [r.documentId, r.at]));
  return rows
    .filter((r) => r.status !== "draft" && r.status !== "cancelled" && r.remainingCents > 0)
    .filter((r) => !range || (r.date >= range.from && r.date <= range.to))
    .map((r) => {
      const daysOverdue = r.dueDate ? Math.max(0, daysBetween(r.dueDate, now)) : 0;
      return {
        id: r.id,
        number: r.number,
        accountId: r.accountId,
        customer: r.accountName,
        date: r.date,
        dueDate: r.dueDate,
        totalCents: r.totalCents,
        remainingCents: r.remainingCents,
        daysOverdue,
        bucket: agingBucket(daysOverdue),
        lastReminder: lastBy.get(r.id) ?? null,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export async function aging(ctx: Ctx, range?: Range) {
  const unpaid = await unpaidInvoices(ctx, range);
  const map = new Map<string, Record<AgingBucket, number> & { customer: string; totalCents: number }>();
  for (const r of unpaid) {
    const row =
      map.get(r.accountId) ??
      ({ customer: r.customer, totalCents: 0, not_due: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 } as Record<AgingBucket, number> & { customer: string; totalCents: number });
    row[r.bucket] += r.remainingCents;
    row.totalCents += r.remainingCents;
    map.set(r.accountId, row);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export async function collections(ctx: Ctx) {
  const [invoices, byCustomer, log] = await Promise.all([
    unpaidInvoices(ctx),
    aging(ctx),
    db
      .select({
        id: reminders.id,
        at: reminders.at,
        sentTo: reminders.sentTo,
        sentBy: reminders.sentBy,
        number: documents.number,
        documentId: documents.id,
        customer: accounts.name,
      })
      .from(reminders)
      .innerJoin(documents, eq(documents.id, reminders.documentId))
      .innerJoin(accounts, eq(accounts.id, documents.accountId))
      .where(eq(reminders.orgId, ctx.orgId))
      .orderBy(desc(reminders.at))
      .limit(100),
  ]);
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  for (const r of invoices) buckets[r.bucket] += r.remainingCents;
  return { invoices, byCustomer, buckets, log };
}

export async function dashboard(ctx: Ctx, year: number) {
  const range = { from: `${year}-01-01`, to: `${year}-12-31` };
  const [docs, customers, items, invoices, bills, quotes] = await Promise.all([
    issuedIn(ctx, ["invoice", "credit", "bill"], range),
    salesByCustomer(ctx, range),
    salesByItem(ctx, range),
    unpaidInvoices(ctx),
    listDocuments(ctx, { types: ["bill"] }),
    listDocuments(ctx, { types: ["quote"] }),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenueCents: 0 }));
  let revenue = 0;
  let purchases = 0;
  for (const d of docs) {
    const m = months[Number(d.date.slice(5, 7)) - 1]!;
    if (d.type === "invoice") {
      revenue += d.netCents;
      m.revenueCents += d.netCents;
    } else if (d.type === "credit") {
      revenue -= d.netCents;
      m.revenueCents -= d.netCents;
    } else purchases += d.netCents;
  }
  const receivable = invoices.reduce((s, r) => s + r.remainingCents, 0);
  const overdue = invoices.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.remainingCents, 0);
  const payable = bills.rows.reduce((s, r) => s + r.remainingCents, 0);
  const waiting = quotes.rows.filter((q) => shownStatus(q) === "validated");
  return {
    year,
    revenueCents: revenue,
    purchasesCents: purchases,
    marginCents: revenue - purchases,
    receivableCents: receivable,
    overdueCents: overdue,
    overdueShare: receivable > 0 ? Math.round((overdue / receivable) * 100) : 0,
    payableCents: payable,
    quotesWaiting: waiting.length,
    quotesWaitingCents: waiting.reduce((s, q) => s + q.totalCents, 0),
    months,
    topCustomers: customers.slice(0, 5),
    topItems: items.slice(0, 5),
  };
}

/** Bills still to pay, soonest due first. */
export async function billsToPay(ctx: Ctx) {
  const { rows } = await listDocuments(ctx, { types: ["bill"], sort: "due", dir: "asc" });
  return rows.filter((r) => r.remainingCents > 0);
}

// CSV

function csv(rows: (string | number)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}
const amt = (c: number) => (c / 100).toFixed(2);

export const REPORTS = ["sales-by-customer", "sales-by-item", "vat", "aging"] as const;
export type ReportId = (typeof REPORTS)[number];

export async function reportCsv(ctx: Ctx, report: ReportId, range: Range) {
  if (report === "sales-by-customer") {
    const rows = await salesByCustomer(ctx, range);
    return csv([["Customer", "Invoiced", "Credited", "Net sales"], ...rows.map((r) => [r.customer, amt(r.invoicedCents), amt(r.creditedCents), amt(r.netCents)])]);
  }
  if (report === "sales-by-item") {
    const rows = await salesByItem(ctx, range);
    return csv([["Item", "Quantity", "Net sales"], ...rows.map((r) => [r.item, r.qtyMilli / 1000, amt(r.netCents)])]);
  }
  if (report === "vat") {
    const rows = await vatByMonth(ctx, range);
    return csv([["Month", "VAT collected", "VAT deductible", "Balance"], ...rows.map((r) => [r.month, amt(r.collectedCents), amt(r.deductibleCents), amt(r.balanceCents)])]);
  }
  const rows = await aging(ctx, range);
  return csv([["Customer", "Not due", "1-30", "31-60", "61-90", "90+", "Total"], ...rows.map((r) => [r.customer, amt(r.not_due), amt(r["1_30"]), amt(r["31_60"]), amt(r["61_90"]), amt(r["90_plus"]), amt(r.totalCents)])]);
}
