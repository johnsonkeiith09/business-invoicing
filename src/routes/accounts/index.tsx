import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AccountForm, EMPTY_ACCOUNT } from "@/client/components/AccountForm";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { useMoney } from "@/client/lib/format";
import { createAccount, listAccounts } from "@/serverFunctions/app";

const search = z.object({
  q: z.string().optional(),
  kind: z.enum(["customer", "supplier"]).optional(),
  archived: z.boolean().optional(),
});

export const Route = createFileRoute("/accounts/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listAccounts({ data: deps }),
  head: () => ({ meta: [{ title: "Accounts" }] }),
  component: Accounts,
});

const KIND = { customer: "Customer", supplier: "Supplier", both: "Customer and supplier" };

function Accounts() {
  const rows = Route.useLoaderData();
  const money = useMoney();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: "/accounts/" });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(filters.q ?? "");
  const filtered = !!(filters.q || filters.kind || filters.archived);

  return (
    <Page>
      <PageHeader
        title="Accounts"
        actions={
          <Button onClick={() => setOpen(true)} data-testid="new-account">
            <Plus /> New account
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <form
          className="min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ search: { ...filters, q: q || undefined } });
          }}
        >
          <Input
            placeholder="Search by name, email or tax ID"
            aria-label="Search accounts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <NativeSelect
          aria-label="Type"
          className="w-auto"
          value={filters.kind ?? ""}
          onChange={(e) =>
            void navigate({ search: { ...filters, kind: (e.target.value || undefined) as "customer" | undefined } })
          }
        >
          <option value="">Customers and suppliers</option>
          <option value="customer">Customers</option>
          <option value="supplier">Suppliers</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Archived"
          className="w-auto"
          value={filters.archived ? "archived" : "active"}
          onChange={(e) =>
            void navigate({ search: { ...filters, archived: e.target.value === "archived" || undefined } })
          }
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </NativeSelect>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          kind={filtered ? "filtered" : "no-data"}
          title={filtered ? "No matching accounts" : "No accounts yet"}
          description={filtered ? undefined : "Add a customer or supplier to start quoting and invoicing."}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="text-right">They owe</TableHead>
                <TableHead className="text-right">We owe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid="account-row">
                  <TableCell>
                    <Link to="/accounts/$id" params={{ id: row.id }} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{KIND[row.kind]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{row.email}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.receivable)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.payable)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
          </DialogHeader>
          <AccountForm
            initial={EMPTY_ACCOUNT}
            submitLabel="Create account"
            onSubmit={async (values) => {
              const { id } = await createAccount({ data: values });
              setOpen(false);
              await navigate({ to: "/accounts/$id", params: { id } });
            }}
          />
        </DialogContent>
      </Dialog>
    </Page>
  );
}
