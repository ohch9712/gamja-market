import Link from "next/link";
import type { PurchaseRequest } from "@/types/purchase-request";
import { categoryLabels, formatPriceRange, formatRelativeTime } from "../utils";
import { CategoryVisual } from "./CategoryVisual";
import { StatusBadge } from "./StatusBadge";

export function RequestCard({
  request,
  now,
}: {
  request: PurchaseRequest;
  now: string;
}) {
  return (
    <article className="request-card">
      <Link href={`/requests/${request.id}`} className="request-card-link">
        <div className="request-card-image">
          <CategoryVisual category={request.category} />
          <div className="card-status"><StatusBadge status={request.status} /></div>
        </div>
        <div className="request-card-body">
          <div className="card-eyebrow">
            <span>{categoryLabels[request.category]}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={request.createdAt}>{formatRelativeTime(request.createdAt, new Date(now))}</time>
          </div>
          <h3>{request.title}</h3>
          <p className="card-price">{formatPriceRange(request.minPrice, request.maxPrice)}</p>
          <div className="card-meta">
            <span className="card-location">⌖ <span>{request.location}</span></span>
            <span>지원 {request.applicationCount}명</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
