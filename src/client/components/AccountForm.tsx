import { useState } from "react";
import { Field } from "@/client/components/Field";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorText } from "@/client/lib/format";

export interface AccountValues {
  kind: "customer" | "supplier" | "both";
  name: string;
  taxId: string;
  address: string;
  email: string;
  phone: string;
  paymentTerms: number;
  notes: string;
}

export const EMPTY_ACCOUNT: AccountValues = {
  kind: "customer",
  name: "",
  taxId: "",
  address: "",
  email: "",
  phone: "",
  paymentTerms: 30,
  notes: "",
};

export function AccountForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: AccountValues;
  submitLabel: string;
  onSubmit: (values: AccountValues) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof AccountValues) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setSaving(true);
        try {
          await onSubmit({ ...form, paymentTerms: Number(form.paymentTerms) });
        } catch (cause) {
          setError(errorText(cause));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Name" htmlFor="account-name">
        <Input id="account-name" value={form.name} onChange={set("name")} required />
      </Field>
      <Field label="Type" htmlFor="account-kind">
        <NativeSelect id="account-kind" value={form.kind} onChange={set("kind")}>
          <option value="customer">Customer</option>
          <option value="supplier">Supplier</option>
          <option value="both">Customer and supplier</option>
        </NativeSelect>
      </Field>
      <Field label="Email" htmlFor="account-email">
        <Input id="account-email" type="email" value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Phone" htmlFor="account-phone">
        <Input id="account-phone" value={form.phone} onChange={set("phone")} />
      </Field>
      <Field label="Tax or company ID" htmlFor="account-tax">
        <Input id="account-tax" value={form.taxId} onChange={set("taxId")} />
      </Field>
      <Field label="Payment terms (days)" htmlFor="account-terms">
        <Input id="account-terms" type="number" min={0} max={365} value={form.paymentTerms} onChange={set("paymentTerms")} />
      </Field>
      <Field label="Address" htmlFor="account-address">
        <Textarea id="account-address" value={form.address} onChange={set("address")} rows={3} />
      </Field>
      <Field label="Notes" htmlFor="account-notes">
        <Textarea id="account-notes" value={form.notes} onChange={set("notes")} rows={3} />
      </Field>
      {error && (
        <Alert variant="destructive" className="md:col-span-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="md:col-span-2">
        <Button type="submit" pending={saving} data-testid="save-account">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
