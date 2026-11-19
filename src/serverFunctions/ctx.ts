import { createMiddleware } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { ctxOf } from "@/server/context";

/** The signed-in member as a Ctx: organization, id, email and admin flag. */
export const memberMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) => next({ context: { ctx: await ctxOf(context.user) } }));
