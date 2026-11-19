import { and, asc, eq, like, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { items } from "@/db/schema";
import { fail, type Ctx } from "./context";
import { toCents, VAT_RATES } from "./money";

const money = z
  .union([z.string(), z.number()])
  .transform((v, c) => {
    const cents = toCents(v);
    if (cents === null || cents < 0) {
      c.addIssue({ code: "custom", message: "Enter an amount" });
      return z.NEVER;
    }
    return cents;
  });

export const itemInput = z
  .object({
    code: z.string().trim().min(1, "Reference is required").max(50),
    name: z.string().trim().min(1, "Name is required").max(200),
    kind: z.enum(["product", "service"]),
    unit: z.string().trim().min(1).max(30),
    price: money,
    cost: money,
    vatRate: z.coerce
      .number()
      .refine((r) => (VAT_RATES as readonly number[]).includes(r), "Pick a VAT rate"),
    active: z.boolean(),
  })
  .strict();

export function listItems(ctx: Ctx, input: { q?: string; activeOnly?: boolean }) {
  const where = [eq(items.orgId, ctx.orgId)];
  if (input.activeOnly) where.push(eq(items.active, true));
  if (input.q) {
    const q = `%${input.q}%`;
    where.push(or(like(items.code, q), like(items.name, q))!);
  }
  return db.select().from(items).where(and(...where)).orderBy(asc(items.code));
}

async function codeTaken(ctx: Ctx, code: string, except?: string) {
  const where = [eq(items.orgId, ctx.orgId), eq(items.code, code)];
  if (except) where.push(ne(items.id, except));
  return !!(await db.query.items.findFirst({ where: and(...where) }));
}

export async function saveItem(ctx: Ctx, id: string | null, input: z.output<typeof itemInput>) {
  if (await codeTaken(ctx, input.code, id ?? undefined)) {
    fail(`Reference ${input.code} is already used`);
  }
  const { price, cost, ...rest } = input;
  const values = { ...rest, priceCents: price, costCents: cost };
  if (id) {
    const [row] = await db
      .update(items)
      .set(values)
      .where(and(eq(items.id, id), eq(items.orgId, ctx.orgId)))
      .returning({ id: items.id });
    return row ?? fail("Item not found");
  }
  const newId = crypto.randomUUID();
  await db.insert(items).values({ id: newId, orgId: ctx.orgId, ...values });
  return { id: newId };
}
