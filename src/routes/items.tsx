import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { errorText, useMoney } from "@/client/lib/format";
import { VAT_RATES } from "@/server/money";
import { listItems, saveItem } from "@/serverFunctions/app";

export const Route = createFileRoute("/items")({
  validateSearch: z.object({ q: z.string().optional() }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listItems({ data: { q: deps.q } }),
  head: () => ({ meta: [{ title: "Catalogue" }] }),
  component: Items,
});

type Row = Awaited<ReturnType<typeof listItems>>[number];
interface ItemForm {
  code: string;
  name: string;
  kind: "product" | "service";
  unit: string;
  price: string;
  cost: string;
  vatRate: string;
  active: boolean;
}
const BLANK: ItemForm = { code: "", name: "", kind: "product", unit: "unit", price: "", cost: "0", vatRate: "20", active: true };

function Items() {
  const rows = Route.useLoaderData();
  const { q: query } = Route.useSearch();
  const navigate = useNavigate({ from: "/items" });
  const router = useRouter();
  const money = useMoney();
  const [q, setQ] = useState(query ?? "");
  const [editing, setEditing] = useState<{ id: string | null; form: ItemForm } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (row?: Row) => {
    setError(null);
    setEditing(
      row
        ? {
            id: row.id,
            form: {
              code: row.code,
              name: row.name,
              kind: row.kind,
              unit: row.unit,
              price: (row.priceCents / 100).toFixed(2),
              cost: (row.costCents / 100).toFixed(2),
              vatRate: String(row.vatRate),
              active: row.active,
            },
          }
        : { id: null, form: BLANK },
    );
  };
  const form = editing?.form;
  const set = (patch: Partial<ItemForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  return (
    <Page>
      <PageHeader
        title="Catalogue"
        actions={
          <Button onClick={() => open()} data-testid="new-item">
            <Plus /> New item
          </Button>
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void navigate({ search: { q: q || undefined } });
        }}
      >
        <Input placeholder="Search by reference or name" aria-label="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      {rows.length === 0 ? (
        <EmptyState
          kind={query ? "filtered" : "no-data"}
          title={query ? "No matching items" : "No items yet"}
          description={query ? undefined : "Add the products and services you sell or buy."}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Kind</TableHead>
                <TableHead className="text-right">Price excl. VAT</TableHead>
                <TableHead className="hidden md:table-cell text-right">Cost</TableHead>
                <TableHead className="text-right">VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid="item-row" className="cursor-pointer" onClick={() => open(row)}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>
                    <span className="font-medium">{row.name}</span>
                    {!row.active && (
                      <Badge variant="secondary" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell capitalize">{row.kind}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.priceCents)} / {row.unit}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right tabular-nums">{money(row.costCents)}</TableCell>
                  <TableCell className="text-right">{row.vatRate} %</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          {form && (
            <form
              id="item-form"
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setBusy(true);
                try {
                  await saveItem({ data: { id: editing!.id, item: { ...form, vatRate: Number(form.vatRate) } } });
                  setEditing(null);
                  await router.invalidate();
                } catch (cause) {
                  setError(errorText(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Reference" htmlFor="item-code">
                <Input id="item-code" value={form.code} onChange={(e) => set({ code: e.target.value })} required />
              </Field>
              <Field label="Name" htmlFor="item-name">
                <Input id="item-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
              </Field>
              <Field label="Kind" htmlFor="item-kind">
                <NativeSelect id="item-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value as ItemForm["kind"] })}>
                  <option value="product">Product</option>
                  <option value="service">Service</option>
                </NativeSelect>
              </Field>
              <Field label="Unit" htmlFor="item-unit">
                <Input id="item-unit" value={form.unit} onChange={(e) => set({ unit: e.target.value })} required />
              </Field>
              <Field label="Sale price excl. VAT" htmlFor="item-price">
                <Input id="item-price" inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} required />
              </Field>
              <Field label="Purchase cost" htmlFor="item-cost">
                <Input id="item-cost" inputMode="decimal" value={form.cost} onChange={(e) => set({ cost: e.target.value })} />
              </Field>
              <Field label="VAT rate" htmlFor="item-vat">
                <NativeSelect id="item-vat" value={form.vatRate} onChange={(e) => set({ vatRate: e.target.value })}>
                  {VAT_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r} %
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="flex items-center gap-2 self-end pb-2">
                <Checkbox id="item-active" checked={form.active} onCheckedChange={(v) => set({ active: v === true })} />
                <Label htmlFor="item-active">Active</Label>
              </div>
              {error && (
                <Alert variant="destructive" className="sm:col-span-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
          )}
          <DialogFooter>
            <Button type="submit" form="item-form" pending={busy} data-testid="save-item">
              Save item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
