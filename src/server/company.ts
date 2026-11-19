import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, type DocType } from "@/db/schema";
import { fail, type Ctx } from "./context";

export const DEFAULT_PREFIXES: Record<DocType, string> = {
  quote: "QU",
  delivery: "DN",
  invoice: "INV",
  credit: "CN",
  order: "PO",
  bill: "BILL",
};

const prefix = z
  .string()
  .trim()
  .min(1, "Every prefix needs a value")
  .max(10)
  .regex(/^[A-Za-z0-9]+$/, "Prefixes use letters and digits only");

export const companyInput = z
  .object({
    name: z.string().trim().max(200),
    address: z.string().trim().max(1000),
    taxId: z.string().trim().max(100),
    companyId: z.string().trim().max(100),
    email: z.string().trim().max(200),
    phone: z.string().trim().max(100),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Use a three-letter currency code"),
    bankDetails: z.string().trim().max(1000),
    footer: z.string().trim().max(1000),
    prefixes: z.object({
      quote: prefix,
      delivery: prefix,
      invoice: prefix,
      credit: prefix,
      order: prefix,
      bill: prefix,
    }),
  })
  .strict();
export type CompanyProfile = z.infer<typeof companyInput>;

export async function getCompany(orgId: string): Promise<CompanyProfile> {
  const row = await db.query.companies.findFirst({
    where: eq(companies.orgId, orgId),
  });
  const stored = row ? (JSON.parse(row.prefixes) as Partial<Record<DocType, string>>) : {};
  return {
    name: row?.name ?? "",
    address: row?.address ?? "",
    taxId: row?.taxId ?? "",
    companyId: row?.companyId ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    currency: row?.currency ?? "EUR",
    bankDetails: row?.bankDetails ?? "",
    footer: row?.footer ?? "",
    prefixes: { ...DEFAULT_PREFIXES, ...stored },
  };
}

export async function saveCompany(ctx: Ctx, input: CompanyProfile) {
  if (!ctx.admin) fail("Only an admin can change the company profile");
  const values = {
    ...input,
    prefixes: JSON.stringify(input.prefixes),
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(companies)
    .values({ orgId: ctx.orgId, ...values })
    .onConflictDoUpdate({ target: companies.orgId, set: values });
  return getCompany(ctx.orgId);
}
