import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Page } from "@/client/components/AppNav";
import { DocumentList, type ListSearch } from "@/client/components/DocumentList";
import { listDocuments } from "@/serverFunctions/app";
const TYPES = ["quote", "delivery", "invoice", "credit"] as const;

export const Route = createFileRoute("/sales")({
  validateSearch: z.object({
    type: z.enum(TYPES).catch("quote"),
    status: z.string().optional(),
    q: z.string().optional(),
    sort: z.enum(["date", "number", "account", "total", "due"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const { type, ...rest } = deps;
    return { list: await listDocuments({ data: { types: [type], ...rest } }) };
  },
  head: () => ({ meta: [{ title: "Sales" }] }),
  component: List,
});

function List() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/sales" });
  return (
    <Page>
      <DocumentList
        title="Sales"
        types={[...TYPES]}
        side="customer"
        data={data.list}
        search={search}
        setSearch={(next: Partial<ListSearch>) => void navigate({ search: { ...search, ...next } as never })}
      >
      </DocumentList>
    </Page>
  );
}
