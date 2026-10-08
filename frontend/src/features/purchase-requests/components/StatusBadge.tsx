import type { PurchaseRequestStatus } from "@/types/purchase-request";

const statusLabels: Record<PurchaseRequestStatus, string> = {
  open: "모집 중",
  matched: "매칭 완료",
  closed: "마감",
};

export function StatusBadge({ status }: { status: PurchaseRequestStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
