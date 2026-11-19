import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import * as accounts from "@/server/accounts";
import * as company from "@/server/company";
import * as documents from "@/server/documents";
import * as items from "@/server/items";
import * as reminders from "@/server/reminders";
import * as reports from "@/server/reports";
import { memberMiddleware } from "./ctx";

const id = z.object({ id: z.string().uuid() }).strict();
const parse =
  <T extends z.ZodType>(schema: T) =>
  (data: unknown) =>
    schema.parse(data) as z.output<T>;

// Company

export const getCompany = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context: { ctx } }) => ({
    profile: await company.getCompany(ctx.orgId),
    canEdit: ctx.admin,
  }));

export const saveCompany = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(company.companyInput))
  .handler(({ data, context: { ctx } }) => company.saveCompany(ctx, data));

// Accounts

export const listAccounts = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(accounts.listAccountsInput))
  .handler(({ data, context: { ctx } }) => accounts.listAccounts(ctx, data));

export const pickableAccounts = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(z.object({ side: z.enum(["customer", "supplier"]) }).strict()))
  .handler(({ data, context: { ctx } }) => accounts.pickableAccounts(ctx, data.side));

export const getAccount = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => accounts.getAccount(ctx, data.id));

export const createAccount = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(accounts.accountInput))
  .handler(({ data, context: { ctx } }) => accounts.createAccount(ctx, data));

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(z.object({ id: z.string().uuid(), account: accounts.accountInput }).strict()))
  .handler(({ data, context: { ctx } }) => accounts.updateAccount(ctx, data.id, data.account));

export const archiveAccount = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(z.object({ id: z.string().uuid(), archived: z.boolean() }).strict()))
  .handler(({ data, context: { ctx } }) => accounts.setArchived(ctx, data.id, data.archived));

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => accounts.deleteAccount(ctx, data.id));

export const addContact = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(z.object({ accountId: z.string().uuid(), contact: accounts.contactInput }).strict()))
  .handler(({ data, context: { ctx } }) => accounts.addContact(ctx, data.accountId, data.contact));

export const removeContact = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => accounts.removeContact(ctx, data.id));

// Catalogue

export const listItems = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(z.object({ q: z.string().max(200).optional(), activeOnly: z.boolean().optional() }).strict()))
  .handler(({ data, context: { ctx } }) => items.listItems(ctx, data));

export const saveItem = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(z.object({ id: z.string().uuid().nullable(), item: items.itemInput }).strict()))
  .handler(({ data, context: { ctx } }) => items.saveItem(ctx, data.id, data.item));

// Documents

export const listDocuments = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(documents.listInput))
  .handler(({ data, context: { ctx } }) => documents.listDocuments(ctx, data));

export const getDocument = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(async ({ data, context: { ctx } }) => {
    const result = await documents.getDocument(ctx, data.id);
    const { shareToken, ...doc } = result.doc;
    return {
      ...result,
      doc,
      shareUrl: shareToken ? `${new URL(getRequest().url).origin}/s/${shareToken}` : null,
      canShare: documents.canShare(doc),
    };
  });

export const createDocument = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(
    parse(
      z
        .object({
          type: z.enum(["quote", "delivery", "invoice", "credit", "order", "bill"]),
          accountId: z.string().uuid(),
        })
        .strict(),
    ),
  )
  .handler(({ data, context: { ctx } }) => documents.createDraft(ctx, data));

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(documents.draftInput))
  .handler(({ data, context: { ctx } }) => documents.saveDraft(ctx, data));

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => documents.deleteDraft(ctx, data.id));

export const validateDocument = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => documents.validate(ctx, data.id));

export const transitionDocument = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(documents.transitionInput))
  .handler(({ data, context: { ctx } }) => documents.transition(ctx, data));

export const convertQuote = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(z.object({ id: z.string().uuid(), withDelivery: z.boolean() }).strict()))
  .handler(({ data, context: { ctx } }) => documents.convertQuote(ctx, data.id, data.withDelivery));

export const createCreditNote = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => documents.createCreditNote(ctx, data.id));

export const billFromOrder = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => documents.billFromOrder(ctx, data.id));

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(documents.paymentInput))
  .handler(({ data, context: { ctx } }) => documents.recordPayment(ctx, data));

export const shareDocument = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(async ({ data, context: { ctx } }) => {
    const token = await documents.ensureShareToken(ctx, data.id);
    return { url: `${new URL(getRequest().url).origin}/s/${token}` };
  });

export const revokeShare = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) => documents.revokeShare(ctx, data.id));

export const sendReminder = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator(parse(id))
  .handler(({ data, context: { ctx } }) =>
    reminders.sendReminder(ctx, data.id, new URL(getRequest().url).origin),
  );

// Collections, dashboard, reports

export const getCollections = createServerFn()
  .middleware([memberMiddleware])
  .handler(({ context: { ctx } }) => reports.collections(ctx));

export const getBillsToPay = createServerFn()
  .middleware([memberMiddleware])
  .handler(({ context: { ctx } }) => reports.billsToPay(ctx));

export const getDashboard = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(z.object({ year: z.number().int().min(2000).max(2100) }).strict()))
  .handler(async ({ data, context: { ctx } }) => ({
    ...(await reports.dashboard(ctx, data.year)),
    currency: (await company.getCompany(ctx.orgId)).currency,
  }));

export const getReports = createServerFn()
  .middleware([memberMiddleware])
  .validator(parse(reports.rangeInput))
  .handler(async ({ data, context: { ctx } }) => {
    const [byCustomer, byItem, vat, aging, profile] = await Promise.all([
      reports.salesByCustomer(ctx, data),
      reports.salesByItem(ctx, data),
      reports.vatByMonth(ctx, data),
      reports.aging(ctx, data),
      company.getCompany(ctx.orgId),
    ]);
    return { byCustomer, byItem, vat, aging, currency: profile.currency };
  });
