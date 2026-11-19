import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { DocumentSheet } from "@/client/components/DocumentSheet";
import { StatusBadge } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import { formatMoney } from "@/client/lib/format";
import { getShared, respondShared } from "@/server/documents";

// Public (everyapp.config.ts): anyone with the link sees this one document.
// The page renders on the server; accepting or refusing is a plain form
// POST to the same path, so nothing else needs to be public.
const loadShared = createServerFn()
  .validator((token: unknown) => String(token))
  .handler(async ({ data }) => {
    const shared = await getShared(data);
    if (!shared) throw notFound();
    return shared;
  });

export const Route = createFileRoute("/s/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { token: string } }) => {
        const form = await request.formData();
        const answer = form.get("answer");
        if (answer !== "accept" && answer !== "refuse") return new Response("Bad request", { status: 400 });
        const ok = await respondShared(params.token, answer);
        if (!ok) return new Response("Not found", { status: 404 });
        return new Response(null, { status: 303, headers: { location: `/s/${params.token}` } });
      },
    },
  },
  loader: ({ params }) => loadShared({ data: params.token }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.company.name || "Document"} · ${loaderData.number}` : "Not found" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Shared,
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-semibold" data-testid="share-not-found">
        This link doesn't lead anywhere
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been revoked. Ask the sender for a new one.</p>
    </main>
  ),
});

function Shared() {
  const doc = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge status={doc.status} />
        {doc.remainingCents !== null && doc.remainingCents > 0 && (
          <p className="text-sm">
            Left to pay: <span className="font-semibold">{formatMoney(doc.remainingCents, doc.company.currency)}</span>
          </p>
        )}
      </div>
      {doc.canRespond && (
        <form method="post" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
          <p className="mr-auto text-sm">Do you accept this quote?</p>
          <Button type="submit" name="answer" value="accept" data-testid="share-accept">
            Accept
          </Button>
          <Button type="submit" name="answer" value="refuse" variant="outline" data-testid="share-refuse">
            Refuse
          </Button>
        </form>
      )}
      <DocumentSheet
        type={doc.type}
        number={doc.number}
        date={doc.date}
        dueDate={doc.dueDate}
        notes={doc.notes}
        company={doc.company}
        party={doc.customer}
        lines={doc.lines}
        totals={doc.totals}
        currency={doc.company.currency}
      />
    </main>
  );
}
