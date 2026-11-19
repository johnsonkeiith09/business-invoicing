import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  accounts,
  activity,
  documents,
  lines,
  payments,
  reminders,
  type DocType,
} from "@/db/schema";
import { getCompany } from "./company";
import { fail, logEntry, type Ctx } from "./context";
import { addDays, computeTotals, formatMoney, today, toCents, toMilli, VAT_RATES } from "./money";

export const SALES_TYPES = ["quote", "delivery", "invoice", "credit"] as const;
export const PURCHASE_TYPES = ["order", "bill"] as const;
const docType = z.enum(["quote", "delivery", "invoice", "credit", "order", "bill"]);

export const TYPE_LABEL: Record<DocType, string> = {
  quote: "Quote",
  delivery: "Delivery note",
  invoice: "Invoice",
  credit: "Credit note",
  order: "Purchase order",
  bill: "Bill",
};

/** The status a document takes when it is validated. */
const VALIDATED_STATUS: Record<DocType, string> = {
  quote: "validated",
  delivery: "validated",
  invoice: "issued",
  credit: "issued",
  order: "sent",
  bill: "issued",
};

const side = (type: DocType) =>
  (PURCHASE_TYPES as readonly string[]).includes(type) ? "supplier" : "customer";

type DocRow = typeof documents.$inferSelect;

/** Expired and overdue are never stored: they follow from the date. */
export function shownStatus(doc: Pick<DocRow, "type" | "status" | "dueDate">, on = today()) {
  const late = !!doc.dueDate && doc.dueDate < on;
  if (doc.type === "quote" && doc.status === "validated" && late) return "expired";
  if (
    (doc.type === "invoice" || doc.type === "bill") &&
    (doc.status === "issued" || doc.status === "partly_paid") &&
    late
  )
    return "overdue";
  return doc.status;
}

const amount = z.union([z.string(), z.number()]);

export const lineInput = z
  .object({
    itemId: z.string().uuid().nullable(),
    description: z.string().trim().min(1, "Every line needs a description").max(500),
    quantity: amount,
    unitPrice: amount,
    discount: amount,
    vatRate: z.coerce.number(),
  })
  .strict();

export const draftInput = z
  .object({
    id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    notes: z.string().max(4000),
    supplierRef: z.string().trim().max(100),
    lines: z.array(lineInput).max(200),
  })
  .strict();

export const listInput = z
  .object({
    types: z.array(docType).min(1),
    status: z.string().max(30).optional(),
    q: z.string().trim().max(200).optional(),
    sort: z.enum(["date", "number", "account", "total", "due"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
  })
  .strict();

/** Rows the caller may see: everything validated, and their own drafts. */
function visible(ctx: Ctx) {
  return and(
    eq(documents.orgId, ctx.orgId),
    or(ne(documents.status, "draft"), eq(documents.createdBy, ctx.userId)),
  );
}

async function settledFor(orgId: string, ids: string[]) {
  const paid = new Map<string, number>();
  const credited = new Map<string, number>();
  if (ids.length === 0) return { paid, credited };
  const [p, c] = await Promise.all([
    db
      .select({ id: payments.documentId, sum: sql<number>`sum(${payments.amountCents})` })
      .from(payments)
      .where(and(eq(payments.orgId, orgId), inArray(payments.documentId, ids)))
      .groupBy(payments.documentId),
    db
      .select({ id: documents.sourceId, sum: sql<number>`sum(${documents.totalCents})` })
      .from(documents)
      .where(
        and(
          eq(documents.orgId, orgId),
          eq(documents.type, "credit"),
          ne(documents.status, "draft"),
          inArray(documents.sourceId, ids),
        ),
      )
      .groupBy(documents.sourceId),
  ]);
  for (const r of p) paid.set(r.id, Number(r.sum));
  for (const r of c) if (r.id) credited.set(r.id, Number(r.sum));
  return { paid, credited };
}

export async function listDocuments(ctx: Ctx, input: z.infer<typeof listInput>) {
  const rows = await db
    .select({
      id: documents.id,
      type: documents.type,
      number: documents.number,
      status: documents.status,
      date: documents.date,
      dueDate: documents.dueDate,
      totalCents: documents.totalCents,
      netCents: documents.netCents,
      accountId: documents.accountId,
      accountName: accounts.name,
      supplierRef: documents.supplierRef,
    })
    .from(documents)
    .innerJoin(accounts, eq(accounts.id, documents.accountId))
    .where(and(visible(ctx), inArray(documents.type, input.types)))
    .orderBy(desc(documents.date), desc(documents.createdAt));
  const { paid, credited } = await settledFor(ctx.orgId, rows.map((r) => r.id));
  const now = today();
  let shown = rows.map((r) => {
    const settled = (paid.get(r.id) ?? 0) + (credited.get(r.id) ?? 0);
    return {
      ...r,
      shownStatus: shownStatus(r, now),
      paidCents: paid.get(r.id) ?? 0,
      remainingCents:
        r.type === "invoice" || r.type === "bill"
          ? r.status === "draft" || r.status === "cancelled"
            ? 0
            : r.totalCents - settled
          : 0,
    };
  });
  const byStatus = new Map<string, { count: number; totalCents: number }>();
  for (const r of shown) {
    const s = byStatus.get(r.shownStatus) ?? { count: 0, totalCents: 0 };
    s.count += 1;
    s.totalCents += r.totalCents;
    byStatus.set(r.shownStatus, s);
  }
  if (input.status) shown = shown.filter((r) => r.shownStatus === input.status);
  if (input.q) {
    const q = input.q.toLowerCase();
    shown = shown.filter(
      (r) =>
        r.accountName.toLowerCase().includes(q) ||
        (r.number ?? "").toLowerCase().includes(q) ||
        r.supplierRef.toLowerCase().includes(q),
    );
  }
  const sort = input.sort ?? "date";
  const dir = input.dir === "asc" ? 1 : -1;
  const key = (r: (typeof shown)[number]): string | number =>
    sort === "number"
      ? (r.number ?? "")
      : sort === "account"
        ? r.accountName.toLowerCase()
        : sort === "total"
          ? r.totalCents
          : sort === "due"
            ? (r.dueDate ?? "9999")
            : r.date;
  shown.sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : 0));
  return {
    rows: shown,
    totals: [...byStatus.entries()].map(([status, s]) => ({ status, ...s })),
  };
}

async function loadDoc(ctx: Ctx, id: string) {
  const doc = await db.query.documents.findFirst({ where: and(eq(documents.id, id), visible(ctx)) });
  return doc ?? fail("Document not found");
}

async function loadDraft(ctx: Ctx, id: string) {
  const doc = await loadDoc(ctx, id);
  if (doc.status !== "draft") fail("Only drafts can be changed");
  if (doc.createdBy !== ctx.userId) fail("Document not found");
  return doc;
}

export async function remainingOf(ctx: Ctx, doc: DocRow) {
  const { paid, credited } = await settledFor(ctx.orgId, [doc.id]);
  const p = paid.get(doc.id) ?? 0;
  const c = credited.get(doc.id) ?? 0;
  return { paid: p, credited: c, remaining: doc.totalCents - p - c };
}

export async function getDocument(ctx: Ctx, id: string) {
  const doc = await loadDoc(ctx, id);
  const [account, docLines, docPayments, log, related, company, settled, reminder] =
    await Promise.all([
      db.query.accounts.findFirst({
        where: and(eq(accounts.id, doc.accountId), eq(accounts.orgId, ctx.orgId)),
      }),
      db
        .select()
        .from(lines)
        .where(and(eq(lines.orgId, ctx.orgId), eq(lines.documentId, id)))
        .orderBy(asc(lines.position)),
      db
        .select()
        .from(payments)
        .where(and(eq(payments.orgId, ctx.orgId), eq(payments.documentId, id)))
        .orderBy(asc(payments.date)),
      db
        .select({ id: activity.id, at: activity.at, actor: activity.actor, message: activity.message })
        .from(activity)
        .where(and(eq(activity.orgId, ctx.orgId), eq(activity.documentId, id)))
        .orderBy(asc(activity.at)),
      db
        .select({ id: documents.id, type: documents.type, number: documents.number, status: documents.status })
        .from(documents)
        .where(
          and(
            visible(ctx),
            or(eq(documents.sourceId, id), doc.sourceId ? eq(documents.id, doc.sourceId) : sql`0`),
          ),
        ),
      getCompany(ctx.orgId),
      remainingOf(ctx, doc),
      db
        .select({ at: reminders.at })
        .from(reminders)
        .where(and(eq(reminders.orgId, ctx.orgId), eq(reminders.documentId, id)))
        .orderBy(desc(reminders.at))
        .limit(1),
    ]);
  return {
    doc: { ...doc, shownStatus: shownStatus(doc) },
    mine: doc.createdBy === ctx.userId,
    account: account ?? fail("Account not found"),
    lines: docLines,
    totals: computeTotals(docLines),
    payments: docPayments,
    activity: log,
    related,
    company,
    settled,
    lastReminder: reminder[0]?.at ?? null,
  };
}

export async function createDraft(
  ctx: Ctx,
  input: { type: DocType; accountId: string },
  from?: { sourceId: string; lines: (typeof lines.$inferSelect)[]; notes?: string },
) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, input.accountId), eq(accounts.orgId, ctx.orgId)),
  });
  if (!account || account.archived) fail("Pick an active account");
  const wanted = side(input.type);
  if (account.kind !== "both" && account.kind !== wanted) {
    fail(wanted === "supplier" ? "Pick a supplier" : "Pick a customer");
  }
  const id = crypto.randomUUID();
  const date = today();
  const dueDate = input.type === "delivery" ? null : addDays(date, account.paymentTerms || 30);
  const copied = from?.lines ?? [];
  const totals = computeTotals(copied);
  await db.batch([
    db.insert(documents).values({
      id,
      orgId: ctx.orgId,
      type: input.type,
      accountId: account.id,
      date,
      dueDate,
      notes: from?.notes ?? "",
      sourceId: from?.sourceId ?? null,
      netCents: totals.netCents,
      vatCents: totals.vatCents,
      totalCents: totals.totalCents,
      createdBy: ctx.userId,
    }),
    ...copied.map((l) =>
      db.insert(lines).values({ ...l, id: crypto.randomUUID(), documentId: id }),
    ),
    logEntry(ctx.orgId, ctx.email, "Draft created", { documentId: id }),
  ]);
  return { id };
}

export async function saveDraft(ctx: Ctx, input: z.infer<typeof draftInput>) {
  const doc = await loadDraft(ctx, input.id);
  const parsed = input.lines.map((l, position) => {
    const qtyMilli = toMilli(l.quantity);
    const unitCents = toCents(l.unitPrice);
    const discount = toCents(l.discount === "" ? 0 : l.discount);
    if (qtyMilli === null || qtyMilli <= 0) fail(`Line ${position + 1}: enter a quantity`);
    if (unitCents === null || unitCents < 0) fail(`Line ${position + 1}: enter a unit price`);
    if (discount === null || discount < 0 || discount > 10000)
      fail(`Line ${position + 1}: discount is between 0 and 100 %`);
    if (!(VAT_RATES as readonly number[]).includes(l.vatRate))
      fail(`Line ${position + 1}: pick a VAT rate`);
    return {
      id: crypto.randomUUID(),
      orgId: ctx.orgId,
      documentId: doc.id,
      position,
      itemId: l.itemId,
      description: l.description,
      qtyMilli,
      unitCents,
      discountBp: discount,
      vatRate: l.vatRate,
      netCents: 0,
    };
  });
  const totals = computeTotals(parsed);
  for (const l of parsed) l.netCents = computeTotals([l]).netCents;
  await db.batch([
    db.delete(lines).where(and(eq(lines.orgId, ctx.orgId), eq(lines.documentId, doc.id))),
    ...parsed.map((l) => db.insert(lines).values(l)),
    db
      .update(documents)
      .set({
        date: input.date,
        dueDate: input.dueDate,
        notes: input.notes,
        supplierRef: input.supplierRef,
        netCents: totals.netCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
      })
      .where(and(eq(documents.id, doc.id), eq(documents.status, "draft"))),
  ]);
  return { id: doc.id };
}

export async function deleteDraft(ctx: Ctx, id: string) {
  const doc = await loadDraft(ctx, id);
  await db.batch([
    db.delete(lines).where(and(eq(lines.orgId, ctx.orgId), eq(lines.documentId, doc.id))),
    db.delete(activity).where(and(eq(activity.orgId, ctx.orgId), eq(activity.documentId, doc.id))),
    db.delete(documents).where(and(eq(documents.id, doc.id), eq(documents.status, "draft"))),
  ]);
  return { id };
}

/** Numbers the draft with the next number of its type and year, gap-free, and locks it. */
export async function validate(ctx: Ctx, id: string) {
  const doc = await loadDraft(ctx, id);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(lines)
    .where(and(eq(lines.orgId, ctx.orgId), eq(lines.documentId, id)));
  if (Number(n) === 0) fail("Add at least one line first");
  if (doc.type === "credit") {
    const invoice = doc.sourceId
      ? await db.query.documents.findFirst({
          where: and(eq(documents.id, doc.sourceId), eq(documents.orgId, ctx.orgId)),
        })
      : undefined;
    if (!invoice) fail("A credit note needs its invoice");
    const { remaining } = await remainingOf(ctx, invoice);
    if (doc.totalCents > remaining) {
      fail(`A credit note can't exceed what remains on the invoice (${formatMoney(remaining)})`);
    }
  }
  const company = await getCompany(ctx.orgId);
  const year = Number(doc.date.slice(0, 4));
  const prefix = company.prefixes[doc.type];
  const status = VALIDATED_STATUS[doc.type];
  // One batch runs as one transaction: the counter only moves when the
  // draft is still a draft, and the draft takes exactly that number.
  await env.DB.batch([
    env.DB.prepare(
      `insert into counters (org_id, type, year, last)
       select ?1, ?2, ?3, 1
       where exists (select 1 from documents where id = ?4 and org_id = ?1 and status = 'draft')
       on conflict (org_id, type, year) do update set last = last + 1`,
    ).bind(ctx.orgId, doc.type, year, id),
    env.DB.prepare(
      `update documents set status = ?5,
         number = ?6 || '-' || cast(?3 as integer) || '-' || printf('%04d',
           (select last from counters where org_id = ?1 and type = ?2 and year = ?3))
       where id = ?4 and org_id = ?1 and status = 'draft'`,
    ).bind(ctx.orgId, doc.type, year, id, status, prefix),
  ]);
  const done = await loadDoc(ctx, id);
  await logEntry(ctx.orgId, ctx.email, `Validated as ${done.number}`, { documentId: id });
  if (doc.type === "credit" && doc.sourceId) await refreshPaidStatus(ctx, doc.sourceId);
  return { id, number: done.number };
}

const TRANSITIONS: Record<string, { types: DocType[]; from: string[]; to: string; log: string }> = {
  accept: { types: ["quote"], from: ["validated"], to: "accepted", log: "Marked accepted" },
  refuse: { types: ["quote"], from: ["validated"], to: "refused", log: "Marked refused" },
  cancel_quote: {
    types: ["quote"],
    from: ["validated", "accepted", "refused"],
    to: "cancelled",
    log: "Cancelled",
  },
  cancel_delivery: { types: ["delivery"], from: ["validated"], to: "cancelled", log: "Cancelled" },
  receive: { types: ["order"], from: ["sent"], to: "received", log: "Marked received" },
  cancel_order: { types: ["order"], from: ["sent"], to: "cancelled", log: "Cancelled" },
};
export const transitionInput = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["accept", "refuse", "cancel_quote", "cancel_delivery", "receive", "cancel_order"]),
  })
  .strict();

export async function transition(ctx: Ctx, input: z.infer<typeof transitionInput>) {
  const doc = await loadDoc(ctx, input.id);
  const t = TRANSITIONS[input.action]!;
  if (!t.types.includes(doc.type) || !t.from.includes(doc.status)) {
    fail("That change isn't possible in this state");
  }
  if ((input.action === "accept" || input.action === "refuse") && shownStatus(doc) === "expired") {
    fail("This quote has expired");
  }
  await db.batch([
    db
      .update(documents)
      .set({ status: t.to })
      .where(and(eq(documents.id, doc.id), eq(documents.status, doc.status))),
    logEntry(ctx.orgId, ctx.email, t.log, { documentId: doc.id }),
  ]);
  return { id: doc.id };
}

function docLines(ctx: Ctx, id: string) {
  return db
    .select()
    .from(lines)
    .where(and(eq(lines.orgId, ctx.orgId), eq(lines.documentId, id)))
    .orderBy(asc(lines.position));
}

/** An accepted quote becomes a draft invoice (and a delivery note) linked to it. */
export async function convertQuote(ctx: Ctx, id: string, withDelivery: boolean) {
  const quote = await loadDoc(ctx, id);
  if (quote.type !== "quote" || quote.status !== "accepted") fail("Only an accepted quote can be invoiced");
  const quoteLines = await docLines(ctx, id);
  const notes = quote.number ? `From quote ${quote.number}` : "";
  const invoice = await createDraft(ctx, { type: "invoice", accountId: quote.accountId }, { sourceId: id, lines: quoteLines, notes });
  if (withDelivery) {
    await createDraft(ctx, { type: "delivery", accountId: quote.accountId }, { sourceId: id, lines: quoteLines, notes });
  }
  await db.batch([
    db.update(documents).set({ status: "invoiced" }).where(and(eq(documents.id, id), eq(documents.status, "accepted"))),
    logEntry(ctx.orgId, ctx.email, "Converted to an invoice", { documentId: id }),
  ]);
  return invoice;
}

export async function createCreditNote(ctx: Ctx, invoiceId: string) {
  const invoice = await loadDoc(ctx, invoiceId);
  if (invoice.type !== "invoice" || !["issued", "partly_paid"].includes(invoice.status)) {
    fail("Only an issued invoice with something left to pay can be credited");
  }
  const notes = `Credit for invoice ${invoice.number}`;
  return createDraft(ctx, { type: "credit", accountId: invoice.accountId }, { sourceId: invoiceId, lines: await docLines(ctx, invoiceId), notes });
}

export async function billFromOrder(ctx: Ctx, orderId: string) {
  const order = await loadDoc(ctx, orderId);
  if (order.type !== "order" || order.status !== "received") fail("Only a received order can be billed");
  const draft = await createDraft(ctx, { type: "bill", accountId: order.accountId }, { sourceId: orderId, lines: await docLines(ctx, orderId), notes: `Order ${order.number}` });
  await logEntry(ctx.orgId, ctx.email, "Bill recorded from this order", { documentId: orderId });
  return draft;
}

/** Issued, partly paid, paid or cancelled, from what has been paid and credited. */
async function refreshPaidStatus(ctx: Ctx, id: string) {
  const doc = await loadDoc(ctx, id);
  if (doc.status === "draft" || doc.status === "cancelled") return;
  const { paid, credited, remaining } = await remainingOf(ctx, doc);
  const status =
    remaining <= 0 ? (paid > 0 ? "paid" : credited > 0 ? "cancelled" : "paid") : paid > 0 ? "partly_paid" : "issued";
  if (status !== doc.status) {
    await db.update(documents).set({ status }).where(eq(documents.id, id));
  }
}

export const paymentInput = z
  .object({
    documentId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    amount: amount,
    method: z.enum(["cash", "cheque", "transfer", "card"]),
    reference: z.string().trim().max(200),
  })
  .strict();

export async function recordPayment(ctx: Ctx, input: z.infer<typeof paymentInput>) {
  const doc = await loadDoc(ctx, input.documentId);
  if (!(doc.type === "invoice" || doc.type === "bill") || !["issued", "partly_paid"].includes(doc.status)) {
    fail("Payments go against an issued invoice or bill");
  }
  const cents = toCents(input.amount);
  if (cents === null || cents <= 0) fail("Enter an amount");
  const { remaining } = await remainingOf(ctx, doc);
  if (cents > remaining) fail(`The payment can't exceed what remains (${formatMoney(remaining)})`);
  await db.batch([
    db.insert(payments).values({
      id: crypto.randomUUID(),
      orgId: ctx.orgId,
      documentId: doc.id,
      date: input.date,
      amountCents: cents,
      method: input.method,
      reference: input.reference,
      createdBy: ctx.userId,
    }),
    logEntry(ctx.orgId, ctx.email, `Payment of ${formatMoney(cents)} recorded (${input.method})`, { documentId: doc.id }),
  ]);
  await refreshPaidStatus(ctx, doc.id);
  return { id: doc.id };
}

// Share links

export function canShare(doc: Pick<DocRow, "type" | "status">) {
  if (doc.type === "quote") return ["validated", "accepted", "refused", "invoiced"].includes(doc.status);
  if (doc.type === "invoice") return ["issued", "partly_paid", "paid"].includes(doc.status);
  return false;
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function ensureShareToken(ctx: Ctx, id: string) {
  const doc = await loadDoc(ctx, id);
  if (!canShare(doc)) fail("Only a validated quote or an issued invoice can be shared");
  if (doc.shareToken) return doc.shareToken;
  const token = newToken();
  await db.batch([
    db.update(documents).set({ shareToken: token }).where(eq(documents.id, id)),
    logEntry(ctx.orgId, ctx.email, "Share link created", { documentId: id }),
  ]);
  return token;
}

export async function revokeShare(ctx: Ctx, id: string) {
  const doc = await loadDoc(ctx, id);
  await db.batch([
    db.update(documents).set({ shareToken: null }).where(eq(documents.id, doc.id)),
    logEntry(ctx.orgId, ctx.email, "Share link revoked", { documentId: doc.id }),
  ]);
  return { id };
}

/** What anyone with the link sees, or null for an unknown or revoked token. */
export async function getShared(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const doc = await db.query.documents.findFirst({ where: eq(documents.shareToken, token) });
  if (!doc || !canShare(doc)) return null;
  const ctx: Ctx = { orgId: doc.orgId, userId: "", email: "", admin: false };
  const [account, docLines, company] = await Promise.all([
    db.query.accounts.findFirst({ where: and(eq(accounts.id, doc.accountId), eq(accounts.orgId, doc.orgId)) }),
    docLinesOf(doc.orgId, doc.id),
    getCompany(doc.orgId),
  ]);
  const { remaining } = await remainingOf(ctx, doc);
  const status = shownStatus(doc);
  return {
    type: doc.type,
    number: doc.number,
    date: doc.date,
    dueDate: doc.dueDate,
    notes: doc.notes,
    status,
    canRespond: doc.type === "quote" && status === "validated",
    remainingCents: doc.type === "invoice" ? remaining : null,
    customer: {
      name: account?.name ?? "",
      address: account?.address ?? "",
      taxId: account?.taxId ?? "",
    },
    company,
    lines: docLines.map((l) => ({
      description: l.description,
      qtyMilli: l.qtyMilli,
      unitCents: l.unitCents,
      discountBp: l.discountBp,
      vatRate: l.vatRate,
      netCents: l.netCents,
    })),
    totals: computeTotals(docLines),
  };
}

function docLinesOf(orgId: string, id: string) {
  return db
    .select()
    .from(lines)
    .where(and(eq(lines.orgId, orgId), eq(lines.documentId, id)))
    .orderBy(asc(lines.position));
}

export async function respondShared(token: string, answer: "accept" | "refuse") {
  const doc = await db.query.documents.findFirst({ where: eq(documents.shareToken, token) });
  if (!doc || doc.type !== "quote" || shownStatus(doc) !== "validated") return false;
  const to = answer === "accept" ? "accepted" : "refused";
  await db.batch([
    db
      .update(documents)
      .set({ status: to })
      .where(and(eq(documents.id, doc.id), eq(documents.status, "validated"), eq(documents.shareToken, token))),
    logEntry(doc.orgId, "Customer (share link)", answer === "accept" ? "Accepted through the share link" : "Refused through the share link", { documentId: doc.id }),
  ]);
  return true;
}
