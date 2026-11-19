import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Page } from "@/client/components/AppNav";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { errorText, TYPE_LABEL, type DocTypeId } from "@/client/lib/format";
import { getCompany, saveCompany } from "@/serverFunctions/app";

export const Route = createFileRoute("/settings")({
  loader: () => getCompany(),
  head: () => ({ meta: [{ title: "Company" }] }),
  component: Settings,
});

function Settings() {
  const { profile, canEdit } = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState(profile);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await saveCompany({ data: form });
      await router.invalidate();
      toast.success("Company profile saved");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  const text = (key: "name" | "taxId" | "companyId" | "email" | "phone" | "currency", label: string) => (
    <Field label={label} htmlFor={`company-${key}`}>
      <Input id={`company-${key}`} value={form[key]} onChange={set(key)} disabled={!canEdit} />
    </Field>
  );
  const area = (key: "address" | "bankDetails" | "footer", label: string) => (
    <Field label={label} htmlFor={`company-${key}`}>
      <Textarea id={`company-${key}`} value={form[key]} onChange={set(key)} disabled={!canEdit} rows={3} />
    </Field>
  );

  return (
    <Page>
      <PageHeader title="Company" description="Printed on every document you send." />
      {!canEdit && (
        <Alert data-testid="read-only-note">
          <AlertDescription>Only admins can change these details.</AlertDescription>
        </Alert>
      )}
      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {text("name", "Company name")}
            {text("email", "Email")}
            {text("phone", "Phone")}
            {text("currency", "Currency")}
            {text("taxId", "Tax ID")}
            {text("companyId", "Company registration")}
            {area("address", "Address")}
            {area("bankDetails", "Bank details")}
            <div className="md:col-span-2">{area("footer", "Document footer")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Numbering</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(TYPE_LABEL) as DocTypeId[]).map((type) => (
              <Field key={type} label={`${TYPE_LABEL[type]} prefix`} htmlFor={`prefix-${type}`}>
                <Input
                  id={`prefix-${type}`}
                  value={form.prefixes[type]}
                  disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, prefixes: { ...form.prefixes, [type]: e.target.value } })}
                />
              </Field>
            ))}
          </CardContent>
        </Card>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {canEdit && (
          <Button type="submit" pending={saving} data-testid="save-company">
            Save
          </Button>
        )}
      </form>
    </Page>
  );
}
