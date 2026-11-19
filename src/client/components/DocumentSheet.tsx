import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { formatDate, formatMoney, formatQty, TYPE_LABEL, type DocTypeId } from "@/client/lib/format";

interface SheetLine {
  description: string;
  qtyMilli: number;
  unitCents: number;
  discountBp: number;
  vatRate: number;
  netCents: number;
}

/** A document as it is printed and shared: who, what, how much. */
export function DocumentSheet({
  type,
  number,
  date,
  dueDate,
  notes,
  supplierRef,
  company,
  party,
  lines,
  totals,
  currency,
}: {
  type: DocTypeId;
  number: string | null;
  date: string;
  dueDate: string | null;
  notes: string;
  supplierRef?: string;
  company: { name: string; address: string; taxId: string; companyId: string; email: string; phone: string; bankDetails: string; footer: string };
  party: { name: string; address: string; taxId: string };
  lines: SheetLine[];
  totals: { netCents: number; vatCents: number; totalCents: number; byRate: { rate: number; baseCents: number; vatCents: number }[] };
  currency: string;
}) {
  const money = (c: number) => formatMoney(c, currency);
  const purchase = type === "order" || type === "bill";
  return (
    <article className="space-y-6 rounded-xl border border-border bg-card p-6 text-card-foreground" data-testid="document-sheet">
      <div className="flex flex-wrap justify-between gap-6">
        <div className="space-y-1 text-sm">
          <p className="text-base font-semibold">{company.name || "Your company"}</p>
          <p className="whitespace-pre-line text-muted-foreground">{company.address}</p>
          <p className="text-muted-foreground">{[company.email, company.phone].filter(Boolean).join(" · ")}</p>
          <p className="text-muted-foreground">{[company.taxId && `Tax ID ${company.taxId}`, company.companyId && `Reg. ${company.companyId}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="space-y-1 text-right text-sm">
          <p className="text-xl font-semibold">
            {TYPE_LABEL[type]} {number ?? "(draft)"}
          </p>
          <p>Date: {formatDate(date)}</p>
          {dueDate && (
            <p>
              {type === "quote" ? "Valid until" : "Due"}: {formatDate(dueDate)}
            </p>
          )}
          {supplierRef && <p>Supplier reference: {supplierRef}</p>}
        </div>
      </div>
      <div className="text-sm">
        <p className="text-muted-foreground">{purchase ? "Supplier" : "Bill to"}</p>
        <p className="font-medium">{party.name}</p>
        <p className="whitespace-pre-line">{party.address}</p>
        {party.taxId && <p>Tax ID {party.taxId}</p>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">Disc.</TableHead>
            <TableHead className="text-right">VAT</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow key={i} data-testid="sheet-line">
              <TableCell>{l.description}</TableCell>
              <TableCell className="text-right tabular-nums">{formatQty(l.qtyMilli)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(l.unitCents)}</TableCell>
              <TableCell className="text-right tabular-nums">{l.discountBp ? `${l.discountBp / 100} %` : ""}</TableCell>
              <TableCell className="text-right">{l.vatRate} %</TableCell>
              <TableCell className="text-right tabular-nums">{money(l.netCents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Total excl. VAT</dt>
        <dd className="text-right tabular-nums" data-testid="total-net">{money(totals.netCents)}</dd>
        {totals.byRate.map((r) => (
          <div key={r.rate} className="contents">
            <dt className="text-muted-foreground">VAT {r.rate} % on {money(r.baseCents)}</dt>
            <dd className="text-right tabular-nums">{money(r.vatCents)}</dd>
          </div>
        ))}
        <dt className="font-semibold">Total incl. VAT</dt>
        <dd className="text-right font-semibold tabular-nums" data-testid="total-gross">{money(totals.totalCents)}</dd>
      </dl>
      {notes && <p className="whitespace-pre-line text-sm">{notes}</p>}
      {(company.bankDetails || company.footer) && (
        <footer className="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          {company.bankDetails && <p className="whitespace-pre-line">{company.bankDetails}</p>}
          {company.footer && <p className="whitespace-pre-line">{company.footer}</p>}
        </footer>
      )}
    </article>
  );
}
