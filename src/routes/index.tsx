import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Page } from "@/client/components/AppNav";
import { PageHeader } from "@/client/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { NativeSelect } from "@/client/components/ui/native-select";
import { useMoney } from "@/client/lib/format";
import { getDashboard } from "@/serverFunctions/app";

// Not at module scope: a Worker's clock reads 1970 outside a request.
const thisYear = () => new Date().getUTCFullYear();

export const Route = createFileRoute("/")({
  validateSearch: z.object({ year: z.number().int().min(2000).max(2100).optional() }),
  loaderDeps: ({ search }) => ({ year: search.year ?? thisYear() }),
  loader: ({ deps }) => getDashboard({ data: deps }),
  head: () => ({ meta: [{ title: "Dashboard" }] }),
  component: Dashboard,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Dashboard() {
  const d = Route.useLoaderData();
  const navigate = useNavigate({ from: "/" });
  const money = useMoney();
  const max = Math.max(1, ...d.months.map((m) => m.revenueCents));
  const kpi = (id: string, label: string, value: string, sub?: string) => (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums" data-testid={`kpi-${id}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description="Amounts excl. VAT, except what is owed."
        actions={
          <NativeSelect
            aria-label="Year"
            className="w-auto"
            value={d.year}
            onChange={(e) => void navigate({ search: { year: Number(e.target.value) } })}
          >
            {Array.from({ length: 6 }, (_, i) => thisYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </NativeSelect>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpi("revenue", "Revenue", money(d.revenueCents))}
        {kpi("purchases", "Purchases", money(d.purchasesCents))}
        {kpi("margin", "Gross margin", money(d.marginCents))}
        {kpi("receivable", "Customers owe", money(d.receivableCents), `${d.overdueShare} % overdue`)}
        {kpi("payable", "We owe suppliers", money(d.payableCents))}
        {kpi("quotes", "Quotes awaiting an answer", String(d.quotesWaiting), money(d.quotesWaitingCents))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-1.5" data-testid="revenue-chart">
            {d.months.map((m) => (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div
                  className="w-full rounded-t-sm bg-primary"
                  style={{ height: `${Math.max(0, (m.revenueCents / max) * 100)}%` }}
                  title={`${MONTHS[m.month - 1]}: ${money(m.revenueCents)}`}
                />
                <span className="text-xs text-muted-foreground">{MONTHS[m.month - 1]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices this year.</p>
            ) : (
              <ol className="space-y-2 text-sm" data-testid="top-customers">
                {d.topCustomers.map((c) => (
                  <li key={c.customer} className="flex justify-between gap-2">
                    <span>{c.customer}</span>
                    <span className="tabular-nums">{money(c.netCents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top items</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices this year.</p>
            ) : (
              <ol className="space-y-2 text-sm" data-testid="top-items">
                {d.topItems.map((c) => (
                  <li key={c.item} className="flex justify-between gap-2">
                    <span>{c.item}</span>
                    <span className="tabular-nums">{money(c.netCents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
