import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { activity, members } from "@/db/schema";

/** Who is acting, and for which organization. Every query takes one. */
export interface Ctx {
  orgId: string;
  userId: string;
  email: string;
  admin: boolean;
}

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function fail(message: string): never {
  throw new AppError(message);
}

/** The caller as a Ctx; records the member the first time they are seen. */
export async function ctxOf(user: EveryAppUser): Promise<Ctx> {
  await db
    .insert(members)
    .values({ orgId: user.orgId, userId: user.id, email: user.email })
    .onConflictDoUpdate({
      target: [members.orgId, members.userId],
      set: { email: user.email },
    });
  return {
    orgId: user.orgId,
    userId: user.id,
    email: user.email,
    admin: isAdmin(user),
  };
}

export function logEntry(
  orgId: string,
  actor: string,
  message: string,
  target: { documentId?: string | null; accountId?: string | null },
) {
  return db.insert(activity).values({
    id: crypto.randomUUID(),
    orgId,
    actor,
    message,
    documentId: target.documentId ?? null,
    accountId: target.accountId ?? null,
  });
}
