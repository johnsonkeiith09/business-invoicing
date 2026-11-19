import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";
import { Page } from "@/client/components/AppNav";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { formatMoney, formatQty } from "@/client/lib/format";
import { getReports } from "@/serverFunctions/app";

// Not at module scope: a Worker's clock reads 1970 outside a request.
const thisYear = () => new Date().getUTCFullYear();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Route = createFileRoute("/reports")({
  validateSearch: z.object({ from: date.optional(), to: date.optional() }),
  loaderDeps: ({ search }) => ({ from: search.from ?? `${thisYear()}-01-01`, to: search.to ?? `${thisYear()}-12-31` }),
  loader: async ({ deps }) => ({ range: deps, ...(await getReports({ data: deps })) }),
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: Reports,
});

function Reports() {
  const d = Route.useLoaderData();
  const navigate = useNavigate({ from: "/reports" });
  const money = (c: number) => formatMoney(c, d.currency);
  const csv = (report: string) => `/reports/export?report=${report}&from=${d.range.from}&to=${d.range.to}`;

  return (
    <Page>
      <PageHeader title="Reports" description="Amounts excl. VAT." />
      <div className="flex flex-wrap gap-3">
        <Field label="From" htmlFor="range-from">
          <Input id="range-from" type="date" value={d.range.from} onChange={(e) => e.target.value && void navigate({ search: (s) => ({ ...s, from: e.target.value }) })} />
        </Field>
        <Field label="To" htmlFor="range-to">
          <Input id="range-to" type="date" value={d.range.to} onChange={(e) => e.target.value && void navigate({ search: (s) => ({ ...s, to: e.target.value }) })} />
        </Field>
      </div>

      <Report title="Sales by customer" href={csv("sales-by-customer")} id="sales-by-customer" empty={d.byCustomer.length === 0}
        head={["Customer", "Invoiced", "Credited", "Net sales"]}
        rows={d.byCustomer.map((r) => [r.customer, money(r.invoicedCents), money(r.creditedCents), money(r.netCents)])} />
      <Report title="Sales by item" href={csv("sales-by-item")} id="sales-by-item" empty={d.byItem.length === 0}
        head={["Item", "Quantity", "Net sales"]}
        rows={d.byItem.map((r) => [r.item, formatQty(r.qtyMilli), money(r.netCents)])} />
      <Report title="VAT by month" href={csv("vat")} id="vat" empty={d.vat.length === 0}
        head={["Month", "Collected", "Deductible", "Balance"]}
        rows={d.vat.map((r) => [r.month, money(r.collectedCents), money(r.deductibleCents), money(r.balanceCents)])} />
      <Report title="Receivables aging" href={csv("aging")} id="aging" empty={d.aging.length === 0}
        head={["Customer", "Not due", "1–30", "31–60", "61–90", "90+", "Total"]}
        rows={d.aging.map((r) => [r.customer, money(r.not_due), money(r["1_30"]), money(r["31_60"]), money(r["61_90"]), money(r["90_plus"]), money(r.totalCents)])} />
    </Page>
  );
}

function Report({ title, href, id, head, rows, empty }: { title: string; href: string; id: string; head: string[]; rows: ReactNode[][]; empty: boolean }) {
  return (
    <Card data-testid={`report-${id}`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={href} download />} data-testid={`csv-${id}`}>
            <Download /> CSV
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">Nothing in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {head.map((h, i) => (
                  <TableHead key={h} className={i > 0 ? "text-right" : undefined}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    <TableCell key={j} className={j > 0 ? "text-right tabular-nums" : undefined}>
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
