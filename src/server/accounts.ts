import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, activity, contacts, documents, payments } from "@/db/schema";
import { fail, logEntry, type Ctx } from "./context";

const text = (max: number) => z.string().trim().max(max);

export const accountInput = z
  .object({
    kind: z.enum(["customer", "supplier", "both"]),
    name: z.string().trim().min(1, "Name is required").max(200),
    taxId: text(100),
    address: text(1000),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    phone: text(100),
    paymentTerms: z.coerce.number().int().min(0).max(365),
    notes: text(4000),
  })
  .strict();

export const contactInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    role: text(200),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    phone: text(100),
  })
  .strict();

export const listAccountsInput = z
  .object({
    q: z.string().trim().max(200).optional(),
    kind: z.enum(["customer", "supplier"]).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export async function listAccounts(
  ctx: Ctx,
  input: z.infer<typeof listAccountsInput>,
) {
  const where = [
    eq(accounts.orgId, ctx.orgId),
    eq(accounts.archived, input.archived ?? false),
  ];
  if (input.q) {
    const q = `%${input.q}%`;
    where.push(
      or(like(accounts.name, q), like(accounts.email, q), like(accounts.taxId, q))!,
    );
  }
  if (input.kind) where.push(inArray(accounts.kind, [input.kind, "both"]));
  const rows = await db
    .select({
      id: accounts.id,
      kind: accounts.kind,
      name: accounts.name,
      email: accounts.email,
      phone: accounts.phone,
      archived: accounts.archived,
    })
    .from(accounts)
    .where(and(...where))
    .orderBy(asc(accounts.name));
  const balances = await balancesFor(ctx.orgId, rows.map((r) => r.id));
  return rows.map((row) => ({ ...row, ...(balances.get(row.id) ?? { receivable: 0, payable: 0 }) }));
}

/** Accounts a new document may use: not archived, of the right side. */
export function pickableAccounts(ctx: Ctx, side: "customer" | "supplier") {
  return db
    .select({ id: accounts.id, name: accounts.name, paymentTerms: accounts.paymentTerms })
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, ctx.orgId),
        eq(accounts.archived, false),
        inArray(accounts.kind, [side, "both"]),
      ),
    )
    .orderBy(asc(accounts.name));
}

/**
 * Outstanding per account: issued invoices minus credit notes minus payments
 * received (what they owe), and recorded bills minus payments made (what is
 * owed to them).
 */
export async function balancesFor(orgId: string, ids: string[]) {
  const result = new Map<string, { receivable: number; payable: number }>();
  if (ids.length === 0) return result;
  const docs = await db
    .select({
      accountId: documents.accountId,
      type: documents.type,
      total: sql<number>`sum(${documents.totalCents})`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        inArray(documents.accountId, ids),
        inArray(documents.type, ["invoice", "credit", "bill"]),
        sql`${documents.status} not in ('draft')`,
      ),
    )
    .groupBy(documents.accountId, documents.type);
  const paid = await db
    .select({
      accountId: documents.accountId,
      type: documents.type,
      total: sql<number>`sum(${payments.amountCents})`,
    })
    .from(payments)
    .innerJoin(documents, eq(documents.id, payments.documentId))
    .where(and(eq(payments.orgId, orgId), inArray(documents.accountId, ids)))
    .groupBy(documents.accountId, documents.type);
  const entry = (id: string) => {
    let e = result.get(id);
    if (!e) result.set(id, (e = { receivable: 0, payable: 0 }));
    return e;
  };
  for (const d of docs) {
    const total = Number(d.total);
    if (d.type === "invoice") entry(d.accountId).receivable += total;
    if (d.type === "credit") entry(d.accountId).receivable -= total;
    if (d.type === "bill") entry(d.accountId).payable += total;
  }
  for (const p of paid) {
    const total = Number(p.total);
    if (p.type === "invoice") entry(p.accountId).receivable -= total;
    if (p.type === "bill") entry(p.accountId).payable -= total;
  }
  return result;
}

async function ownAccount(ctx: Ctx, id: string) {
  const row = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.orgId, ctx.orgId)),
  });
  return row ?? fail("Account not found");
}

export async function getAccount(ctx: Ctx, id: string) {
  const account = await ownAccount(ctx, id);
  const [people, docs, log, balances] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.accountId, id)))
      .orderBy(asc(contacts.name)),
    db
      .select({
        id: documents.id,
        type: documents.type,
        number: documents.number,
        status: documents.status,
        date: documents.date,
        dueDate: documents.dueDate,
        totalCents: documents.totalCents,
        createdBy: documents.createdBy,
      })
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.accountId, id)))
      .orderBy(desc(documents.date), desc(documents.createdAt)),
    db
      .select({ id: activity.id, at: activity.at, actor: activity.actor, message: activity.message })
      .from(activity)
      .where(and(eq(activity.orgId, ctx.orgId), eq(activity.accountId, id)))
      .orderBy(desc(activity.at))
      .limit(50),
    balancesFor(ctx.orgId, [id]),
  ]);
  return {
    account,
    contacts: people,
    // Drafts stay with their author until validated.
    documents: docs
      .filter((d) => d.status !== "draft" || d.createdBy === ctx.userId)
      .map(({ createdBy: _, ...d }) => d),
    activity: log,
    balance: balances.get(id) ?? { receivable: 0, payable: 0 },
  };
}

export async function createAccount(ctx: Ctx, input: z.infer<typeof accountInput>) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(accounts).values({ id, orgId: ctx.orgId, createdBy: ctx.userId, ...input }),
    logEntry(ctx.orgId, ctx.email, "Account created", { accountId: id }),
  ]);
  return { id };
}

export async function updateAccount(
  ctx: Ctx,
  id: string,
  input: z.infer<typeof accountInput>,
) {
  await ownAccount(ctx, id);
  await db.batch([
    db.update(accounts).set(input).where(and(eq(accounts.id, id), eq(accounts.orgId, ctx.orgId))),
    logEntry(ctx.orgId, ctx.email, "Details updated", { accountId: id }),
  ]);
  return { id };
}

export async function setArchived(ctx: Ctx, id: string, archived: boolean) {
  await ownAccount(ctx, id);
  await db.batch([
    db.update(accounts).set({ archived }).where(and(eq(accounts.id, id), eq(accounts.orgId, ctx.orgId))),
    logEntry(ctx.orgId, ctx.email, archived ? "Archived" : "Restored", { accountId: id }),
  ]);
  return { id };
}

/** Deletes an account with no documents; one with documents can only be archived. */
export async function deleteAccount(ctx: Ctx, id: string) {
  await ownAccount(ctx, id);
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(documents)
    .where(and(eq(documents.orgId, ctx.orgId), eq(documents.accountId, id)));
  if (Number(used?.n) > 0) fail("This account has documents. Archive it instead.");
  await db.batch([
    db.delete(contacts).where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.accountId, id))),
    db.delete(activity).where(and(eq(activity.orgId, ctx.orgId), eq(activity.accountId, id))),
    db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, ctx.orgId))),
  ]);
  return { id };
}

export async function addContact(ctx: Ctx, accountId: string, input: z.infer<typeof contactInput>) {
  await ownAccount(ctx, accountId);
  const id = crypto.randomUUID();
  await db.insert(contacts).values({ id, orgId: ctx.orgId, accountId, ...input });
  return { id };
}

export async function removeContact(ctx: Ctx, id: string) {
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.orgId)));
  return { id };
}
