import { describe, expect, it } from "vitest";
import type { PurchaseRequest } from "@/types/purchase-request";
import {
  filterPurchaseRequests,
  formatPriceRange,
  formatRelativeTime,
} from "@/features/purchase-requests/utils";
import {
  validatePurchaseRequest,
  type PurchaseRequestDraft,
} from "@/features/purchase-requests/validation";

const baseRequest: PurchaseRequest = {
  id: "1",
  title: "아이폰 15 구해요",
  category: "digital",
  description: "깨끗한 스마트폰을 찾습니다",
  specs: ["256GB"],
  minPrice: 300000,
  maxPrice: 450000,
  location: "서울 마포구",
  status: "open",
  buyerNickname: "감자",
  applicationCount: 2,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const requests: PurchaseRequest[] = [
  baseRequest,
  { ...baseRequest, id: "2", title: "책상 찾아요", category: "furniture", status: "matched", createdAt: "2026-10-03T00:00:00.000Z" },
  { ...baseRequest, id: "3", title: "카메라", category: "hobby", description: "필름 카메라를 구해요", createdAt: "2026-10-02T00:00:00.000Z" },
];

describe("구매요청 필터", () => {
  it("기본 상태에서 모집 중인 요청을 최신순으로 보여준다", () => {
    expect(filterPurchaseRequests(requests, { query: "", category: "all", status: "open" }).map((item) => item.id)).toEqual(["3", "1"]);
    expect(requests.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("제목·설명 검색, 카테고리, 전체 상태를 함께 적용한다", () => {
    expect(filterPurchaseRequests(requests, { query: "  필름  ", category: "hobby", status: "all" }).map((item) => item.id)).toEqual(["3"]);
    expect(filterPurchaseRequests(requests, { query: "아이폰", category: "furniture", status: "all" })).toEqual([]);
    expect(filterPurchaseRequests(requests, { query: "", category: "all", status: "all" }).map((item) => item.id)).toEqual(["2", "3", "1"]);
  });
});

describe("표시 형식", () => {
  it("가격대와 같은 가격을 형식화한다", () => {
    expect(formatPriceRange(300000, 450000)).toBe("300,000원 ~ 450,000원");
    expect(formatPriceRange(50000, 50000)).toBe("50,000원");
  });

  it("상대 시간 경계와 7일 이후 날짜를 형식화한다", () => {
    const now = new Date("2026-10-03T00:00:00.000Z");
    expect(formatRelativeTime("2026-10-02T23:59:40.000Z", now)).toBe("방금 전");
    expect(formatRelativeTime("2026-10-02T23:40:00.000Z", now)).toBe("20분 전");
    expect(formatRelativeTime("2026-10-02T21:00:00.000Z", now)).toBe("3시간 전");
    expect(formatRelativeTime("2026-10-01T00:00:00.000Z", now)).toBe("2일 전");
    expect(formatRelativeTime("2026-09-26T00:00:00.000Z", now)).toBe("2026.09.26");
  });
});

const validDraft: PurchaseRequestDraft = {
  title: "아이폰 15 프로 구해요",
  category: "digital",
  description: "상태 좋은 아이폰을 찾고 있어요.",
  specs: ["256GB", "배터리 효율 85% 이상"],
  minPrice: "300000",
  maxPrice: "450000",
  location: "서울 마포구",
};

describe("등록 폼 검사", () => {
  it("유효한 값과 선택 스펙 0개를 허용한다", () => {
    expect(validatePurchaseRequest(validDraft)).toEqual({});
    expect(validatePurchaseRequest({ ...validDraft, specs: [], minPrice: "0", maxPrice: "0" })).toEqual({});
  });

  it("필수 입력, 글자 수, 스펙 개수와 길이를 검사한다", () => {
    const errors = validatePurchaseRequest({ ...validDraft, title: "가", category: "", description: "짧음", specs: [""], location: "   " });
    expect(errors).toMatchObject({ title: expect.any(String), category: expect.any(String), description: expect.any(String), specs: expect.any(String), location: expect.any(String) });
    expect(validatePurchaseRequest({ ...validDraft, title: "가".repeat(51) }).title).toBeDefined();
    expect(validatePurchaseRequest({ ...validDraft, description: "가".repeat(1001) }).description).toBeDefined();
    expect(validatePurchaseRequest({ ...validDraft, specs: Array(11).fill("조건") }).specs).toBeDefined();
    expect(validatePurchaseRequest({ ...validDraft, specs: ["가".repeat(31)] }).specs).toBeDefined();
  });

  it("가격을 0 이상의 안전한 정수로 검사하고 하한이 상한을 넘지 않게 한다", () => {
    expect(validatePurchaseRequest({ ...validDraft, minPrice: "-1" }).minPrice).toBeDefined();
    expect(validatePurchaseRequest({ ...validDraft, minPrice: "1.5" }).minPrice).toBeDefined();
    expect(validatePurchaseRequest({ ...validDraft, maxPrice: "" }).maxPrice).toBeDefined();
    expect(validatePurchaseRequest({ ...validDraft, maxPrice: "99999999999999999999" }).maxPrice).toBeDefined();
    expect(validatePurchaseRequest({ ...validDraft, minPrice: "500000", maxPrice: "400000" }).maxPrice).toBeDefined();
  });
});
