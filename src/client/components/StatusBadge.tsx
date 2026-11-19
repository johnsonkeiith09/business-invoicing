import { Badge } from "@/client/components/ui/badge";
import { STATUS_LABEL } from "@/client/lib/format";

const VARIANT: Record<string, "outline" | "info" | "success" | "warning" | "destructive" | "secondary" | "soft"> = {
  draft: "outline",
  validated: "info",
  sent: "info",
  issued: "info",
  accepted: "success",
  paid: "success",
  received: "success",
  invoiced: "soft",
  partly_paid: "warning",
  expired: "secondary",
  refused: "destructive",
  overdue: "destructive",
  cancelled: "secondary",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANT[status] ?? "outline"} data-testid="status-badge">
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
