import { GatewayRefusalError, sendEmail } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, documents, reminders } from "@/db/schema";
import { getCompany } from "./company";
import { fail, logEntry, type Ctx } from "./context";
import { ensureShareToken, remainingOf, shownStatus } from "./documents";
import { formatMoney } from "./money";

export type ReminderResult = { sent: true; to: string } | { sent: false; reason: string };

/** Emails the customer a reminder for an overdue invoice, with its share link. */
export async function sendReminder(ctx: Ctx, id: string, origin: string): Promise<ReminderResult> {
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.orgId, ctx.orgId)),
  });
  if (!doc || doc.type !== "invoice") fail("Invoice not found");
  if (shownStatus(doc) !== "overdue") fail("Only an overdue invoice gets a reminder");
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, doc.accountId), eq(accounts.orgId, ctx.orgId)),
  });
  if (!account?.email) fail("Add an email address to this customer first");
  const [token, company, { remaining }] = await Promise.all([
    ensureShareToken(ctx, id),
    getCompany(ctx.orgId),
    remainingOf(ctx, doc),
  ]);
  const from = company.name || "Our company";
  const link = `${origin}/s/${token}`;
  try {
    await sendEmail({
      env,
      message: {
        to: account.email,
        subject: `Reminder: invoice ${doc.number} is overdue`,
        text: [
          `Hello ${account.name},`,
          "",
          `Invoice ${doc.number}, due on ${doc.dueDate}, still has ${formatMoney(remaining, company.currency)} to pay.`,
          `You can view it here: ${link}`,
          "",
          from,
        ].join("\n"),
        ...(company.email ? { replyTo: company.email } : {}),
      },
    });
  } catch (error) {
    if (error instanceof GatewayRefusalError) {
      return {
        sent: false,
        reason:
          error.code === "integration_not_configured" || error.code === "capability_not_requested"
            ? "Email isn't set up for this app. An admin can turn it on in the Gateway."
            : error.message,
      };
    }
    throw error;
  }
  await db.batch([
    db.insert(reminders).values({
      id: crypto.randomUUID(),
      orgId: ctx.orgId,
      documentId: id,
      sentTo: account.email,
      sentBy: ctx.email,
    }),
    logEntry(ctx.orgId, ctx.email, `Reminder sent to ${account.email}`, { documentId: id }),
  ]);
  return { sent: true, to: account.email };
}
