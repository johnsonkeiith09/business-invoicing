import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { formatDate, useMoney } from "@/client/lib/format";
import { getCollections } from "@/serverFunctions/app";

export const Route = createFileRoute("/collections")({
  loader: () => getCollections(),
  head: () => ({ meta: [{ title: "Collections" }] }),
  component: Collections,
});

const BUCKET_LABEL = {
  not_due: "Not due",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "Over 90 days",
} as const;

function Collections() {
  const data = Route.useLoaderData();
  const money = useMoney();
  return (
    <Page>
      <PageHeader title="Collections" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="aging-buckets">
        {(Object.keys(BUCKET_LABEL) as (keyof typeof BUCKET_LABEL)[]).map((b) => (
          <Card key={b} size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">{BUCKET_LABEL[b]}</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums" data-testid={`bucket-${b}`}>
              {money(data.buckets[b])}
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Unpaid invoices</h2>
        {data.invoices.length === 0 ? (
          <EmptyState title="Every invoice is paid" />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Days late</TableHead>
                  <TableHead className="text-right">Left to pay</TableHead>
                  <TableHead className="hidden md:table-cell">Last reminder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.invoices.map((r) => (
                  <TableRow key={r.id} data-testid="unpaid-row">
                    <TableCell>
                      <Link to="/documents/$id" params={{ id: r.id }} className="font-medium hover:underline">
                        {r.number}
                      </Link>
                    </TableCell>
                    <TableCell>{r.customer}</TableCell>
                    <TableCell>{formatDate(r.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.daysOverdue || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.remainingCents)}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.lastReminder ? formatDate(r.lastReminder) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      {data.byCustomer.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Receivable by customer</h2>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byCustomer.map((r) => (
                  <TableRow key={r.customer} data-testid="receivable-row">
                    <TableCell>{r.customer}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.totalCents - r.not_due)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(r.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Reminders sent</h2>
        {data.log.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Overdue invoices have a Send reminder button.</p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="reminder-log">
            {data.log.map((r) => (
              <li key={r.id}>
                <span className="text-muted-foreground">{formatDate(r.at)} · </span>
                {r.number} to {r.customer} ({r.sentTo}) by {r.sentBy}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
