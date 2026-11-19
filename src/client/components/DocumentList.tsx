import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { NewDocumentDialog } from "@/client/components/NewDocumentDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { StatusBadge } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { formatDate, STATUS_LABEL, STATUSES_BY_TYPE, TYPE_PLURAL, useMoney, type DocTypeId } from "@/client/lib/format";
import type { listDocuments } from "@/serverFunctions/app";

export interface ListSearch {
  type: DocTypeId;
  status?: string;
  q?: string;
  sort?: "date" | "number" | "account" | "total" | "due";
  dir?: "asc" | "desc";
}

type Data = Awaited<ReturnType<typeof listDocuments>>;

export function DocumentList({
  title,
  types,
  side,
  data,
  search,
  setSearch,
  children,
}: {
  title: string;
  types: DocTypeId[];
  side: "customer" | "supplier";
  data: Data;
  search: ListSearch;
  setSearch: (next: Partial<ListSearch>) => void;
  children?: ReactNode;
}) {
  const money = useMoney();
  const [q, setQ] = useState(search.q ?? "");
  const totalsBy = new Map(data.totals.map((t) => [t.status, t]));
  const filtered = !!(search.status || search.q);
  const isPayable = search.type === "invoice" || search.type === "bill";

  const header = (key: NonNullable<ListSearch["sort"]>, label: string, right?: boolean) => {
    const active = (search.sort ?? "date") === key;
    const dir = active ? (search.dir ?? "desc") : undefined;
    return (
      <TableHead className={right ? "text-right" : undefined}>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => setSearch({ sort: key, dir: active && dir === "desc" ? "asc" : "desc" })}
        >
          {label}
          {dir === "asc" && <ArrowUp className="size-3" />}
          {dir === "desc" && <ArrowDown className="size-3" />}
        </button>
      </TableHead>
    );
  };

  return (
    <>
      <PageHeader
        title={title}
        actions={<NewDocumentDialog types={types} side={side} defaultType={search.type} label="New document" />}
      />
      <Tabs value={search.type} onValueChange={(type) => setSearch({ type: type as DocTypeId, status: undefined })}>
        <TabsList>
          {types.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TYPE_PLURAL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap gap-2" data-testid="status-totals">
        <Button size="sm" variant={search.status ? "outline" : "secondary"} onClick={() => setSearch({ status: undefined })}>
          All
        </Button>
        {STATUSES_BY_TYPE[search.type].map((s) => {
          const t = totalsBy.get(s);
          return (
            <Button
              key={s}
              size="sm"
              variant={search.status === s ? "secondary" : "outline"}
              onClick={() => setSearch({ status: s })}
              data-testid={`status-filter-${s}`}
            >
              {STATUS_LABEL[s]} · {t?.count ?? 0}
              {t ? <span className="text-muted-foreground">{money(t.totalCents)}</span> : null}
            </Button>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch({ q: q || undefined });
        }}
      >
        <Input placeholder="Search by number or account" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      {children}
      {data.rows.length === 0 ? (
        <EmptyState
          kind={filtered ? "filtered" : "no-data"}
          title={filtered ? "Nothing matches" : `No ${TYPE_PLURAL[search.type].toLowerCase()} yet`}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {header("number", "Number")}
                {header("account", side === "customer" ? "Customer" : "Supplier")}
                {header("date", "Date")}
                {search.type !== "delivery" && header("due", search.type === "quote" ? "Valid until" : "Due")}
                <TableHead>Status</TableHead>
                {header("total", "Total", true)}
                {isPayable && <TableHead className="text-right">Left to pay</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id} data-testid="document-row">
                  <TableCell>
                    <Link to="/documents/$id" params={{ id: row.id }} className="font-medium hover:underline">
                      {row.number ?? "Draft"}
                    </Link>
                    {row.supplierRef && <span className="ml-2 text-muted-foreground">{row.supplierRef}</span>}
                  </TableCell>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  {search.type !== "delivery" && <TableCell>{formatDate(row.dueDate)}</TableCell>}
                  <TableCell>
                    <StatusBadge status={row.shownStatus} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.totalCents)}</TableCell>
                  {isPayable && <TableCell className="text-right tabular-nums">{money(row.remainingCents)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}
