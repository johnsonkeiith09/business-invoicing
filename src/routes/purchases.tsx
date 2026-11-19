import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Page } from "@/client/components/AppNav";
import { DocumentList, type ListSearch } from "@/client/components/DocumentList";
import { listDocuments } from "@/serverFunctions/app";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { formatDate, useMoney } from "@/client/lib/format";
import { getBillsToPay } from "@/serverFunctions/app";
const TYPES = ["order", "bill"] as const;

export const Route = createFileRoute("/purchases")({
  validateSearch: z.object({
    type: z.enum(TYPES).catch("order"),
    status: z.string().optional(),
    q: z.string().optional(),
    sort: z.enum(["date", "number", "account", "total", "due"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const { type, ...rest } = deps;
    return { list: await listDocuments({ data: { types: [type], ...rest } }), toPay: type === "bill" ? await getBillsToPay() : [] };
  },
  head: () => ({ meta: [{ title: "Purchases" }] }),
  component: List,
});

function List() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/purchases" });
  return (
    <Page>
      <DocumentList
        title="Purchases"
        types={[...TYPES]}
        side="supplier"
        data={data.list}
        search={search}
        setSearch={(next: Partial<ListSearch>) => void navigate({ search: { ...search, ...next } as never })}
      >
        {search.type === "bill" && !search.status && <ToPay rows={data.toPay} />}
      </DocumentList>
    </Page>
  );
}

function ToPay({ rows }: { rows: Awaited<ReturnType<typeof getBillsToPay>> }) {
  const money = useMoney();
  if (rows.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>To pay, soonest due first</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm" data-testid="bills-to-pay">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link to="/documents/$id" params={{ id: r.id }} className="font-medium hover:underline">
                {r.number} · {r.accountName}
              </Link>
              <span className="tabular-nums">
                due {formatDate(r.dueDate)} · <span className="font-medium">{money(r.remainingCents)}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
