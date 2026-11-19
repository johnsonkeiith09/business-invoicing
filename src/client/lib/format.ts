import { useRouterState } from "@tanstack/react-router";
import { formatMoney, formatQty } from "@/server/money";

export { formatMoney, formatQty };

export const TYPE_LABEL = {
  quote: "Quote",
  delivery: "Delivery note",
  invoice: "Invoice",
  credit: "Credit note",
  order: "Purchase order",
  bill: "Bill",
} as const;
export type DocTypeId = keyof typeof TYPE_LABEL;

export const TYPE_PLURAL: Record<DocTypeId, string> = {
  quote: "Quotes",
  delivery: "Delivery notes",
  invoice: "Invoices",
  credit: "Credit notes",
  order: "Purchase orders",
  bill: "Bills",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  validated: "Validated",
  accepted: "Accepted",
  refused: "Refused",
  expired: "Expired",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
  issued: "Issued",
  partly_paid: "Partly paid",
  paid: "Paid",
  overdue: "Overdue",
  sent: "Sent",
  received: "Received",
};

export const STATUSES_BY_TYPE: Record<DocTypeId, string[]> = {
  quote: ["draft", "validated", "accepted", "refused", "expired", "invoiced", "cancelled"],
  delivery: ["draft", "validated", "cancelled"],
  invoice: ["draft", "issued", "partly_paid", "paid", "overdue", "cancelled"],
  credit: ["draft", "issued"],
  order: ["draft", "sent", "received", "cancelled"],
  bill: ["draft", "issued", "partly_paid", "paid", "overdue"],
};

export const METHOD_LABEL = {
  transfer: "Transfer",
  card: "Card",
  cheque: "Cheque",
  cash: "Cash",
} as const;

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong.";
}

/** Formats cents in the organization's currency (from the root loader). */
export function useMoney(): (cents: number) => string {
  const currency = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData as { currency?: string } | undefined;
      return root?.currency ?? "EUR";
    },
  });
  return (cents) => formatMoney(cents, currency);
}
