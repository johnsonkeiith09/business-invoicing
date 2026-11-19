import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AccountForm } from "@/client/components/AccountForm";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { NewDocumentDialog } from "@/client/components/NewDocumentDialog";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { StatusBadge } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { errorText, formatDate, TYPE_LABEL, useMoney } from "@/client/lib/format";
import {
  addContact,
  archiveAccount,
  deleteAccount,
  getAccount,
  removeContact,
  updateAccount,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/accounts/$id")({
  loader: ({ params }) => getAccount({ data: { id: params.id } }),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.account.name }] : [] }),
  component: AccountPage,
  errorComponent: () => (
    <Page>
      <EmptyState kind="error" title="Account not found" />
    </Page>
  ),
});

const EMPTY_CONTACT = { name: "", role: "", email: "", phone: "" };

function AccountPage() {
  const data = Route.useLoaderData();
  const { account } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const money = useMoney();
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [error, setError] = useState<string | null>(null);
  const isCustomer = account.kind !== "supplier";
  const isSupplier = account.kind !== "customer";

  async function run(work: () => Promise<unknown>, done?: string) {
    setError(null);
    try {
      await work();
      await router.invalidate();
      if (done) toast.success(done);
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return (
    <Page>
      <PageHeader
        backLink={<BackLink to="/accounts">Accounts</BackLink>}
        title={account.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {account.kind === "both" ? "Customer and supplier" : account.kind === "customer" ? "Customer" : "Supplier"}
            </Badge>
            {account.archived && <Badge variant="secondary">Archived</Badge>}
          </span>
        }
        actions={
          <>
            {!account.archived && isCustomer && (
              <NewDocumentDialog types={["quote", "invoice", "delivery"]} side="customer" defaultType="quote" accountId={account.id} label="New sales document" />
            )}
            {!account.archived && isSupplier && (
              <NewDocumentDialog types={["order", "bill"]} side="supplier" defaultType="order" accountId={account.id} label="New purchase" />
            )}
            <Button
              variant="outline"
              data-testid="archive-account"
              onClick={() => run(() => archiveAccount({ data: { id: account.id, archived: !account.archived } }), account.archived ? "Account restored" : "Account archived")}
            >
              {account.archived ? <ArchiveRestore /> : <Archive />}
              {account.archived ? "Restore" : "Archive"}
            </Button>
            {data.documents.length === 0 && (
              <Button
                variant="destructive"
                data-testid="delete-account"
                onClick={() =>
                  run(async () => {
                    await deleteAccount({ data: { id: account.id } });
                    await navigate({ to: "/accounts" });
                  }, "Account deleted")
                }
              >
                <Trash2 /> Delete
              </Button>
            )}
          </>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {isCustomer && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">Owes us</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums" data-testid="account-receivable">
              {money(data.balance.receivable)}
            </CardContent>
          </Card>
        )}
        {isSupplier && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">We owe</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums" data-testid="account-payable">
              {money(data.balance.payable)}
            </CardContent>
          </Card>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Documents</h2>
        {data.documents.length === 0 ? (
          <EmptyState title="No documents yet" variant="dashed" size="sm" />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link to="/documents/$id" params={{ id: d.id }} className="font-medium hover:underline">
                        {TYPE_LABEL[d.type]} {d.number ?? "(draft)"}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(d.date)}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(d.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm
            key={JSON.stringify(account)}
            initial={account}
            submitLabel="Save details"
            onSubmit={async (values) => {
              await updateAccount({ data: { id: account.id, account: values } });
              await router.invalidate();
              toast.success("Details saved");
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.contacts.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm" data-testid="contact-row">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.name}
                      {c.role && <span className="font-normal text-muted-foreground"> · {c.role}</span>}
                    </p>
                    <p className="text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => run(() => removeContact({ data: { id: c.id } }))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="grid gap-3 sm:grid-cols-5 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await addContact({ data: { accountId: account.id, contact } });
                setContact(EMPTY_CONTACT);
              });
            }}
          >
            {(["name", "role", "email", "phone"] as const).map((key) => (
              <Field key={key} label={key[0]!.toUpperCase() + key.slice(1)} htmlFor={`contact-${key}`}>
                <Input
                  id={`contact-${key}`}
                  value={contact[key]}
                  type={key === "email" ? "email" : "text"}
                  required={key === "name"}
                  onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
                />
              </Field>
            ))}
            <Button type="submit" variant="outline" data-testid="add-contact">
              Add contact
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Activity</h2>
        <ul className="space-y-1 text-sm" data-testid="account-activity">
          {data.activity.map((a) => (
            <li key={a.id}>
              <span className="text-muted-foreground">{formatDate(a.at)} · {a.actor} · </span>
              {a.message}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
