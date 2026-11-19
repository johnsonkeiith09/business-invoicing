import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Page } from "@/client/components/AppNav";
import { CopyButton } from "@/client/components/CopyButton";
import { DocumentSheet } from "@/client/components/DocumentSheet";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { StatusBadge } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorText, formatDate, METHOD_LABEL, TYPE_LABEL, useMoney } from "@/client/lib/format";
import { computeTotals, toCents, toMilli, today, VAT_RATES } from "@/server/money";
import {
  billFromOrder,
  convertQuote,
  createCreditNote,
  deleteDraft,
  getDocument,
  listItems,
  recordPayment,
  revokeShare,
  saveDraft,
  sendReminder,
  shareDocument,
  transitionDocument,
  validateDocument,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/documents/$id/")({
  loader: async ({ params }) => {
    const data = await getDocument({ data: { id: params.id } });
    const items = data.doc.status === "draft" ? await listItems({ data: { activeOnly: true } }) : [];
    return { ...data, items };
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `${TYPE_LABEL[loaderData.doc.type]} ${loaderData.doc.number ?? "draft"}` }] : [],
  }),
  component: DocumentPage,
  errorComponent: () => (
    <Page>
      <EmptyState kind="error" title="Document not found" />
    </Page>
  ),
});

type Data = Awaited<ReturnType<typeof getDocument>> & { items: Awaited<ReturnType<typeof listItems>> };

function DocumentPage() {
  const data = Route.useLoaderData();
  const { doc } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withDelivery, setWithDelivery] = useState(false);
  const editable = doc.status === "draft" && data.mine;
  const sales = ["quote", "delivery", "invoice", "credit"].includes(doc.type);
  const listTo = sales ? "/sales" : "/purchases";

  async function run(work: () => Promise<unknown>, done?: string) {
    setError(null);
    setBusy(true);
    try {
      await work();
      await router.invalidate();
      if (done) toast.success(done);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const go = (work: () => Promise<{ id: string }>) =>
    run(async () => {
      const { id } = await work();
      await navigate({ to: "/documents/$id", params: { id } });
    });
  const act = (action: "accept" | "refuse" | "cancel_quote" | "cancel_delivery" | "receive" | "cancel_order", done: string) =>
    run(() => transitionDocument({ data: { id: doc.id, action } }), done);

  const s = doc.shownStatus;
  const actions = (
    <>
      {doc.type === "quote" && s === "validated" && (
        <>
          <Button onClick={() => act("accept", "Quote accepted")} disabled={busy} data-testid="accept-quote">
            Mark accepted
          </Button>
          <Button variant="outline" onClick={() => act("refuse", "Quote refused")} disabled={busy}>
            Mark refused
          </Button>
        </>
      )}
      {doc.type === "quote" && ["validated", "expired", "accepted", "refused"].includes(s) && (
        <Button variant="outline" onClick={() => act("cancel_quote", "Quote cancelled")} disabled={busy}>
          Cancel quote
        </Button>
      )}
      {doc.type === "delivery" && s === "validated" && (
        <Button variant="outline" onClick={() => act("cancel_delivery", "Delivery note cancelled")} disabled={busy}>
          Cancel
        </Button>
      )}
      {doc.type === "invoice" && ["issued", "partly_paid", "overdue"].includes(s) && (
        <Button variant="outline" onClick={() => go(() => createCreditNote({ data: { id: doc.id } }))} disabled={busy} data-testid="credit-invoice">
          Credit note
        </Button>
      )}
      {doc.type === "order" && s === "sent" && (
        <>
          <Button onClick={() => act("receive", "Order received")} disabled={busy} data-testid="receive-order">
            Mark received
          </Button>
          <Button variant="outline" onClick={() => act("cancel_order", "Order cancelled")} disabled={busy}>
            Cancel order
          </Button>
        </>
      )}
      {doc.type === "order" && s === "received" && !data.related.some((r) => r.type === "bill") && (
        <Button onClick={() => go(() => billFromOrder({ data: { id: doc.id } }))} disabled={busy} data-testid="bill-from-order">
          Record bill
        </Button>
      )}
      {doc.status !== "draft" && (
        <Button variant="outline" render={<Link to="/documents/$id/print" params={{ id: doc.id }} />} nativeButton={false}>
          <Printer /> Print
        </Button>
      )}
    </>
  );

  return (
    <Page>
      <PageHeader
        backLink={<BackLink to={listTo}>{sales ? "Sales" : "Purchases"}</BackLink>}
        title={
          <span data-testid="document-title">
            {TYPE_LABEL[doc.type]} {doc.number ?? "draft"}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={s} />
            <Link to="/accounts/$id" params={{ id: data.account.id }} className="hover:underline">
              {data.account.name}
            </Link>
          </span>
        }
        actions={actions}
      />
      {error && (
        <Alert variant="destructive" data-testid="document-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {doc.type === "quote" && s === "accepted" && (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="with-delivery" checked={withDelivery} onCheckedChange={(v) => setWithDelivery(v === true)} />
              <Label htmlFor="with-delivery">Also create a delivery note</Label>
            </div>
            <Button onClick={() => go(() => convertQuote({ data: { id: doc.id, withDelivery } }))} disabled={busy} data-testid="convert-quote">
              Convert to invoice
            </Button>
          </CardContent>
        </Card>
      )}

      {editable ? (
        <DraftEditor data={data} busy={busy} run={run} />
      ) : (
        <>
          <DocumentSheet
            type={doc.type}
            number={doc.number}
            date={doc.date}
            dueDate={doc.dueDate}
            notes={doc.notes}
            supplierRef={doc.supplierRef}
            company={data.company}
            party={data.account}
            lines={data.lines}
            totals={data.totals}
            currency={data.company.currency}
          />
        </>
      )}

      {(doc.type === "invoice" || doc.type === "bill") && doc.status !== "draft" && (
        <Payments data={data} busy={busy} run={run} />
      )}
      {data.canShare && <Share data={data} busy={busy} run={run} />}
      {doc.type === "invoice" && s === "overdue" && <Reminder data={data} />}

      {data.related.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Linked documents</h2>
          <ul className="space-y-1 text-sm" data-testid="related-documents">
            {data.related.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <Link to="/documents/$id" params={{ id: r.id }} className="hover:underline">
                  {TYPE_LABEL[r.type]} {r.number ?? "draft"}
                </Link>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">History</h2>
        <ol className="space-y-1 text-sm" data-testid="document-activity">
          {data.activity.map((a) => (
            <li key={a.id}>
              <span className="text-muted-foreground">
                {new Date(a.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {a.actor} ·{" "}
              </span>
              {a.message}
            </li>
          ))}
        </ol>
      </section>
    </Page>
  );
}

interface LineRow {
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  vatRate: string;
}

type Run = (work: () => Promise<unknown>, done?: string) => Promise<void>;

function DraftEditor({ data, busy, run }: { data: Data; busy: boolean; run: Run }) {
  const { doc } = data;
  const navigate = useNavigate();
  const money = useMoney();
  const [date, setDate] = useState(doc.date);
  const [dueDate, setDueDate] = useState(doc.dueDate ?? "");
  const [notes, setNotes] = useState(doc.notes);
  const [supplierRef, setSupplierRef] = useState(doc.supplierRef);
  const [rows, setRows] = useState<LineRow[]>(() =>
    data.lines.map((l) => ({
      itemId: l.itemId,
      description: l.description,
      quantity: String(l.qtyMilli / 1000),
      unitPrice: (l.unitCents / 100).toFixed(2),
      discount: l.discountBp ? String(l.discountBp / 100) : "",
      vatRate: String(l.vatRate),
    })),
  );
  const update = (i: number, patch: Partial<LineRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const blank = (): LineRow => ({ itemId: null, description: "", quantity: "1", unitPrice: "", discount: "", vatRate: "20" });

  const preview = computeTotals(
    rows.map((r) => ({
      qtyMilli: toMilli(r.quantity) ?? 0,
      unitCents: toCents(r.unitPrice) ?? 0,
      discountBp: toCents(r.discount || "0") ?? 0,
      vatRate: Number(r.vatRate),
    })),
  );

  const payload = () => ({
    id: doc.id,
    date,
    dueDate: dueDate || null,
    notes,
    supplierRef,
    lines: rows.map((r) => ({ ...r, discount: r.discount || "0", vatRate: Number(r.vatRate) })),
  });

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" htmlFor="doc-date">
            <Input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {doc.type !== "delivery" && (
            <Field label={doc.type === "quote" ? "Valid until" : "Due date"} htmlFor="doc-due">
              <Input id="doc-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          )}
          {doc.type === "bill" && (
            <Field label="Supplier's reference" htmlFor="doc-supplier-ref">
              <Input id="doc-supplier-ref" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-12 md:items-end" data-testid="line-editor">
              <Field label="Item" htmlFor={`line-item-${i}`} className="space-y-1 md:col-span-3">
                <NativeSelect
                  id={`line-item-${i}`}
                  value={row.itemId ?? ""}
                  onChange={(e) => {
                    const item = data.items.find((it) => it.id === e.target.value);
                    update(
                      i,
                      item
                        ? { itemId: item.id, description: item.name, unitPrice: ((doc.type === "order" || doc.type === "bill" ? item.costCents : item.priceCents) / 100).toFixed(2), vatRate: String(item.vatRate) }
                        : { itemId: null },
                    );
                  }}
                >
                  <option value="">Free text</option>
                  {data.items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.code} · {it.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Description" htmlFor={`line-desc-${i}`} className="space-y-1 md:col-span-3">
                <Input id={`line-desc-${i}`} value={row.description} onChange={(e) => update(i, { description: e.target.value })} />
              </Field>
              <Field label="Qty" htmlFor={`line-qty-${i}`} className="space-y-1 md:col-span-1">
                <Input id={`line-qty-${i}`} inputMode="decimal" value={row.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
              </Field>
              <Field label="Unit price" htmlFor={`line-price-${i}`} className="space-y-1 md:col-span-2">
                <Input id={`line-price-${i}`} inputMode="decimal" value={row.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
              </Field>
              <Field label="Disc. %" htmlFor={`line-disc-${i}`} className="space-y-1 md:col-span-1">
                <Input id={`line-disc-${i}`} inputMode="decimal" value={row.discount} onChange={(e) => update(i, { discount: e.target.value })} />
              </Field>
              <Field label="VAT" htmlFor={`line-vat-${i}`} className="space-y-1 md:col-span-1">
                <NativeSelect id={`line-vat-${i}`} value={row.vatRate} onChange={(e) => update(i, { vatRate: e.target.value })}>
                  {VAT_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r} %
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setRows([...rows, blank()])} data-testid="add-line">
            <Plus /> Add line
          </Button>
        </div>

        <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Total excl. VAT</dt>
          <dd className="text-right tabular-nums">{money(preview.netCents)}</dd>
          <dt className="text-muted-foreground">VAT</dt>
          <dd className="text-right tabular-nums">{money(preview.vatCents)}</dd>
          <dt className="font-semibold">Total incl. VAT</dt>
          <dd className="text-right font-semibold tabular-nums" data-testid="draft-total">{money(preview.totalCents)}</dd>
        </dl>

        <Field label="Notes" htmlFor="doc-notes">
          <Textarea id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run(() => saveDraft({ data: payload() }), "Draft saved")} data-testid="save-draft">
            Save draft
          </Button>
          <Button
            disabled={busy}
            data-testid="validate-document"
            onClick={() =>
              run(async () => {
                await saveDraft({ data: payload() });
                await validateDocument({ data: { id: doc.id } });
              }, "Validated")
            }
          >
            {doc.type === "order" ? "Validate and mark sent" : "Validate"}
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await deleteDraft({ data: { id: doc.id } });
                await navigate({ to: doc.type === "order" || doc.type === "bill" ? "/purchases" : "/sales", search: { type: doc.type } as never });
              })
            }
          >
            Delete draft
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Validating gives the document its number and locks it.</p>
      </CardContent>
    </Card>
  );
}

function Payments({ data, busy, run }: { data: Data; busy: boolean; run: Run }) {
  const money = useMoney();
  const { doc, settled } = data;
  const open = ["issued", "partly_paid"].includes(doc.status) && settled.remaining > 0;
  const [form, setForm] = useState({
    date: today(),
    amount: (settled.remaining / 100).toFixed(2),
    method: "transfer" as keyof typeof METHOD_LABEL,
    reference: "",
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{doc.type === "invoice" ? "Payments received" : "Payments made"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="tabular-nums">{money(doc.totalCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="tabular-nums">{money(settled.paid)}</dd>
          </div>
          {settled.credited > 0 && (
            <div>
              <dt className="text-muted-foreground">Credited</dt>
              <dd className="tabular-nums">{money(settled.credited)}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Left to pay</dt>
            <dd className="font-semibold tabular-nums" data-testid="remaining">
              {money(settled.remaining)}
            </dd>
          </div>
        </dl>
        {data.payments.length > 0 && (
          <ul className="divide-y divide-border text-sm" data-testid="payment-list">
            {data.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-1.5">
                <span>
                  {formatDate(p.date)} · {METHOD_LABEL[p.method]}
                  {p.reference && ` · ${p.reference}`}
                </span>
                <span className="tabular-nums">{money(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
        {open && (
          <form
            className="grid gap-3 sm:grid-cols-5 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => recordPayment({ data: { documentId: doc.id, ...form } }), "Payment recorded");
            }}
          >
            <Field label="Date" htmlFor="pay-date">
              <Input id="pay-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Amount" htmlFor="pay-amount">
              <Input id="pay-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Method" htmlFor="pay-method">
              <NativeSelect id="pay-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as typeof form.method })}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reference" htmlFor="pay-ref">
              <Input id="pay-ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </Field>
            <Button type="submit" disabled={busy} data-testid="record-payment">
              Record payment
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Share({ data, busy, run }: { data: Data; busy: boolean; run: Run }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share link</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.shareUrl ? (
          <>
            <div className="flex items-center gap-2">
              <Input readOnly value={data.shareUrl} aria-label="Share link" data-testid="share-url" />
              <CopyButton value={data.shareUrl} successMessage="Link copied" />
            </div>
            <Button variant="outline" disabled={busy} onClick={() => run(() => revokeShare({ data: { id: data.doc.id } }), "Link revoked")} data-testid="revoke-share">
              Revoke link
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Anyone with the link can view this document{data.doc.type === "quote" ? " and accept or refuse it" : ""}.
            </p>
            <Button disabled={busy} onClick={() => run(() => shareDocument({ data: { id: data.doc.id } }), "Link created")} data-testid="create-share">
              Create link
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Reminder({ data }: { data: Data }) {
  const router = useRouter();
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment reminder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground" data-testid="last-reminder">
          {data.lastReminder ? `Last reminder ${formatDate(data.lastReminder)}` : "No reminder sent yet"}
          {data.account.email ? ` · ${data.account.email}` : ""}
        </p>
        {state && (
          <Alert variant={state.ok ? "default" : "destructive"} data-testid="reminder-result">
            <AlertDescription>{state.text}</AlertDescription>
          </Alert>
        )}
        <Button
          variant="outline"
          pending={busy}
          disabled={!data.account.email}
          data-testid="send-reminder"
          onClick={async () => {
            setBusy(true);
            try {
              const result = await sendReminder({ data: { id: data.doc.id } });
              setState(result.sent ? { ok: true, text: `Reminder sent to ${result.to}` } : { ok: false, text: result.reason });
              await router.invalidate();
            } catch (cause) {
              setState({ ok: false, text: errorText(cause) });
            } finally {
              setBusy(false);
            }
          }}
        >
          Send reminder
        </Button>
      </CardContent>
    </Card>
  );
}
