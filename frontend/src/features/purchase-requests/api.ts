import { mockPurchaseRequests } from "@/lib/mock/purchase-requests";
import type { PurchaseRequest } from "@/types/purchase-request";

export async function getPurchaseRequests(): Promise<PurchaseRequest[]> {
  return mockPurchaseRequests.map((request) => ({
    ...request,
    specs: [...request.specs],
  }));
}

export async function getPurchaseRequest(
  id: string,
): Promise<PurchaseRequest | null> {
  const request = mockPurchaseRequests.find((item) => item.id === id);
  return request ? { ...request, specs: [...request.specs] } : null;
}
