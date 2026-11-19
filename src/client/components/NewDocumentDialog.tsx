import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Field } from "@/client/components/Field";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { NativeSelect } from "@/client/components/ui/native-select";
import { errorText, TYPE_LABEL, type DocTypeId } from "@/client/lib/format";
import { createDocument, pickableAccounts } from "@/serverFunctions/app";

/** Picks a type and an active account, creates the draft and opens it. */
export function NewDocumentDialog({
  types,
  side,
  defaultType,
  accountId,
  label = "New document",
}: {
  types: DocTypeId[];
  side: "customer" | "supplier";
  defaultType: DocTypeId;
  accountId?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DocTypeId>(defaultType);
  const [account, setAccount] = useState(accountId ?? "");
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setType(defaultType), [defaultType]);
  useEffect(() => {
    if (!open || accountId) return;
    setOptions(null);
    pickableAccounts({ data: { side } })
      .then((rows) => {
        setOptions(rows);
        setAccount((current) => current || rows[0]?.id || "");
      })
      .catch((cause) => setError(errorText(cause)));
  }, [open, side, accountId]);

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="new-document">
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <form
            id="new-document-form"
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setBusy(true);
              try {
                const { id } = await createDocument({ data: { type, accountId: account } });
                setOpen(false);
                await navigate({ to: "/documents/$id", params: { id } });
              } catch (cause) {
                setError(errorText(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Type" htmlFor="new-doc-type">
              <NativeSelect id="new-doc-type" value={type} onChange={(e) => setType(e.target.value as DocTypeId)}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {!accountId && (
              <Field label={side === "customer" ? "Customer" : "Supplier"} htmlFor="new-doc-account">
                {options && options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active {side === "customer" ? "customers" : "suppliers"} yet. Add one under Accounts.
                  </p>
                ) : (
                  <NativeSelect id="new-doc-account" value={account} onChange={(e) => setAccount(e.target.value)}>
                    {(options ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
          <DialogFooter>
            <Button type="submit" form="new-document-form" pending={busy} disabled={!account} data-testid="create-document">
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
