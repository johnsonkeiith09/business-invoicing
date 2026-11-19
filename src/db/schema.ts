import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Every row belongs to an organization (the Gateway's `user.orgId`); every
// query filters by it. Amounts are integer cents, quantities thousandths.

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** The app's own record of each member, keyed by the Gateway's user id. */
export const members = sqliteTable(
  "members",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const companies = sqliteTable("companies", {
  orgId: text("org_id").primaryKey(),
  name: text("name").notNull().default(""),
  address: text("address").notNull().default(""),
  taxId: text("tax_id").notNull().default(""),
  companyId: text("company_id").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  currency: text("currency").notNull().default("EUR"),
  bankDetails: text("bank_details").notNull().default(""),
  footer: text("footer").notNull().default(""),
  prefixes: text("prefixes").notNull().default("{}"),
  updatedAt: text("updated_at"),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    kind: text("kind", { enum: ["customer", "supplier", "both"] }).notNull(),
    name: text("name").notNull(),
    taxId: text("tax_id").notNull().default(""),
    address: text("address").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    paymentTerms: integer("payment_terms").notNull().default(30),
    notes: text("notes").notNull().default(""),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("accounts_org").on(t.orgId, t.name)],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
  },
  (t) => [index("contacts_account").on(t.orgId, t.accountId)],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["product", "service"] }).notNull(),
    unit: text("unit").notNull().default("unit"),
    priceCents: integer("price_cents").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    vatRate: integer("vat_rate").notNull().default(20),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("items_org_code").on(t.orgId, t.code)],
);

export const DOC_TYPES = [
  "quote",
  "delivery",
  "invoice",
  "credit",
  "order",
  "bill",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    type: text("type", { enum: DOC_TYPES }).notNull(),
    accountId: text("account_id").notNull(),
    number: text("number"),
    status: text("status").notNull().default("draft"),
    date: text("date").notNull(),
    dueDate: text("due_date"),
    notes: text("notes").notNull().default(""),
    supplierRef: text("supplier_ref").notNull().default(""),
    sourceId: text("source_id"),
    netCents: integer("net_cents").notNull().default(0),
    vatCents: integer("vat_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    shareToken: text("share_token"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("documents_org_type").on(t.orgId, t.type, t.date),
    index("documents_account").on(t.orgId, t.accountId),
    uniqueIndex("documents_share").on(t.shareToken),
  ],
);

export const lines = sqliteTable(
  "lines",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    documentId: text("document_id").notNull(),
    position: integer("position").notNull(),
    itemId: text("item_id"),
    description: text("description").notNull(),
    qtyMilli: integer("qty_milli").notNull(),
    unitCents: integer("unit_cents").notNull(),
    discountBp: integer("discount_bp").notNull().default(0),
    vatRate: integer("vat_rate").notNull(),
    netCents: integer("net_cents").notNull(),
  },
  (t) => [index("lines_document").on(t.documentId, t.position)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    documentId: text("document_id").notNull(),
    date: text("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    method: text("method", {
      enum: ["cash", "cheque", "transfer", "card"],
    }).notNull(),
    reference: text("reference").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payments_document").on(t.orgId, t.documentId)],
);

/** What happened to a document or account, newest last. */
export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    documentId: text("document_id"),
    accountId: text("account_id"),
    actor: text("actor").notNull(),
    message: text("message").notNull(),
    at: text("at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    index("activity_document").on(t.orgId, t.documentId),
    index("activity_account").on(t.orgId, t.accountId),
  ],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    documentId: text("document_id").notNull(),
    sentTo: text("sent_to").notNull(),
    sentBy: text("sent_by").notNull(),
    at: text("at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("reminders_org").on(t.orgId, t.at)],
);

/** The last number used per organization, document type and year. */
export const counters = sqliteTable(
  "counters",
  {
    orgId: text("org_id").notNull(),
    type: text("type").notNull(),
    year: integer("year").notNull(),
    last: integer("last").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.type, t.year] })],
);
