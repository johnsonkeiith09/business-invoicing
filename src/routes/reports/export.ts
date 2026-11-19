import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ctxOf } from "@/server/context";
import { REPORTS, rangeInput, reportCsv, type ReportId } from "@/server/reports";

// A report as CSV, for members only (the route is private).
export const Route = createFileRoute("/reports/export")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Not found", { status: 404 });
        const url = new URL(request.url);
        const report = url.searchParams.get("report") as ReportId;
        const range = rangeInput.safeParse({
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        });
        if (!REPORTS.includes(report) || !range.success) {
          return new Response("Unknown report or date range", { status: 400 });
        }
        const body = await reportCsv(await ctxOf(user), report, range.data);
        return new Response(body, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${report}-${range.data.from}-${range.data.to}.csv"`,
          },
        });
      },
    },
  },
});
