// The app's tools for AI clients, served by the Gateway at /mcp.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listAccounts } from "@/server/accounts";
import { ctxOf } from "@/server/context";
import { listDocuments } from "@/server/documents";
import { collections } from "@/server/reports";

export const tools = defineTools({
  list_accounts: {
    description: "List customers and suppliers with what each owes or is owed, in cents.",
    risk: "read",
    input: z.object({ q: z.string().max(200).optional() }).strict(),
    handler: async (input, { user }) => listAccounts(await ctxOf(user), { q: input.q }),
  },
  list_documents: {
    description:
      "List quotes, delivery notes, invoices, credit notes, purchase orders or bills, with status and amounts in cents.",
    risk: "read",
    input: z
      .object({
        type: z.enum(["quote", "delivery", "invoice", "credit", "order", "bill"]),
        status: z.string().max(30).optional(),
      })
      .strict(),
    handler: async (input, { user }) =>
      (await listDocuments(await ctxOf(user), { types: [input.type], status: input.status })).rows,
  },
  unpaid_invoices: {
    description: "Unpaid customer invoices with days overdue and the aging bucket of each.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) => (await collections(await ctxOf(user))).invoices,
  },
});
