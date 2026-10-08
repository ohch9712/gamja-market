export type PurchaseRequestStatus = "open" | "matched" | "closed";

export type Category =
  | "digital"
  | "appliance"
  | "furniture"
  | "fashion"
  | "hobby"
  | "etc";

export interface PurchaseRequest {
  id: string;
  title: string;
  category: Category;
  description: string;
  specs: string[];
  minPrice: number;
  maxPrice: number;
  location: string;
  status: PurchaseRequestStatus;
  buyerNickname: string;
  applicationCount: number;
  createdAt: string;
}
