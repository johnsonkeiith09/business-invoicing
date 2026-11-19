import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ConfigurationError, getEveryAppUser, gatewayUrl } from "@every-app/sdk/server";
import { getCompany } from "@/server/company";

/**
 * The Gateway's origin for members: the way back to the other apps, and the
 * host the light/dark cookie is set on. Null for an anonymous visitor of a
 * share link, and when the Worker has no GATEWAY_URL. With it, the
 * organization's currency, which every amount is shown in.
 */
export const getGatewayUrl = createServerFn().handler(async () => {
  const user = await getEveryAppUser(getRequest(), env);
  if (!user) return { gatewayUrl: null, currency: "EUR" };
  const { currency } = await getCompany(user.orgId);
  try {
    return { gatewayUrl: new URL(gatewayUrl(env)).origin, currency };
  } catch (error) {
    if (!(error instanceof ConfigurationError)) throw error;
    return { gatewayUrl: null, currency };
  }
});
