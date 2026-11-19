import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Page } from "@/client/components/AppNav";
import { DocumentSheet } from "@/client/components/DocumentSheet";
import { BackLink } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { TYPE_LABEL } from "@/client/lib/format";
import { getDocument } from "@/serverFunctions/app";

// The document alone; the bar and buttons stay off the printout.
export const Route = createFileRoute("/documents/$id/print")({
  loader: ({ params }) => getDocument({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `${TYPE_LABEL[loaderData.doc.type]} ${loaderData.doc.number ?? "draft"}` }] : [],
  }),
  component: Print,
});

function Print() {
  const data = Route.useLoaderData();
  return (
    <Page>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <BackLink to={`/documents/${data.doc.id}`}>Back to the document</BackLink>
        <Button onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
      <DocumentSheet
        type={data.doc.type}
        number={data.doc.number}
        date={data.doc.date}
        dueDate={data.doc.dueDate}
        notes={data.doc.notes}
        supplierRef={data.doc.supplierRef}
        company={data.company}
        party={data.account}
        lines={data.lines}
        totals={data.totals}
        currency={data.company.currency}
      />
    </Page>
  );
}
