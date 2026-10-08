import type { Category, PurchaseRequest } from "@/types/purchase-request";

export const categoryLabels: Record<Category, string> = {
  digital: "디지털기기",
  appliance: "가전",
  furniture: "가구·인테리어",
  fashion: "의류·잡화",
  hobby: "취미·게임",
  etc: "기타",
};

export const categoryIcons: Record<Category, string> = {
  digital: "⌘",
  appliance: "◉",
  furniture: "▧",
  fashion: "✳",
  hobby: "✦",
  etc: "◈",
};

export const categoryColors: Record<Category, string> = {
  digital: "digital",
  appliance: "appliance",
  furniture: "furniture",
  fashion: "fashion",
  hobby: "hobby",
  etc: "etc",
};

export type RequestFilters = {
  query: string;
  category: Category | "all";
  status: "open" | "all";
};

export function filterPurchaseRequests(
  requests: PurchaseRequest[],
  filters: RequestFilters,
): PurchaseRequest[] {
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");

  return requests
    .filter((request) => {
      const matchesQuery =
        !query ||
        `${request.title} ${request.description}`
          .toLocaleLowerCase("ko-KR")
          .includes(query);
      return (
        matchesQuery &&
        (filters.category === "all" || request.category === filters.category) &&
        (filters.status === "all" || request.status === "open")
      );
    })
    .sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
}

export function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function formatPriceRange(minPrice: number, maxPrice: number): string {
  return minPrice === maxPrice
    ? formatPrice(minPrice)
    : `${formatPrice(minPrice)} ~ ${formatPrice(maxPrice)}`;
}

export function formatRelativeTime(
  createdAt: string,
  now: Date = new Date(),
): string {
  const date = new Date(createdAt);
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / 60000),
  );

  if (elapsedMinutes < 1) return "방금 전";
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  if (elapsedMinutes < 1440) return `${Math.floor(elapsedMinutes / 60)}시간 전`;
  if (elapsedMinutes < 10080) return `${Math.floor(elapsedMinutes / 1440)}일 전`;

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\s/g, "")
    .replace(/\.$/, "");
}
