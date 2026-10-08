import { categoryLabels } from "./utils";
import type { Category } from "@/types/purchase-request";

export type PurchaseRequestDraft = {
  title: string;
  category: Category | "";
  description: string;
  specs: string[];
  minPrice: string;
  maxPrice: string;
  location: string;
};

export type FormErrors = Partial<
  Record<keyof PurchaseRequestDraft, string>
>;

export function validatePurchaseRequest(
  draft: PurchaseRequestDraft,
): FormErrors {
  const errors: FormErrors = {};
  const titleLength = draft.title.trim().length;
  const descriptionLength = draft.description.trim().length;

  if (titleLength < 2 || titleLength > 50) {
    errors.title = "제목은 2~50자로 입력해 주세요.";
  }
  if (!Object.hasOwn(categoryLabels, draft.category)) {
    errors.category = "카테고리를 선택해 주세요.";
  }
  if (descriptionLength < 10 || descriptionLength > 1000) {
    errors.description = "설명은 10~1000자로 입력해 주세요.";
  }
  if (draft.specs.length > 10) {
    errors.specs = "원하는 스펙은 최대 10개까지 입력할 수 있어요.";
  } else if (
    draft.specs.some((spec) => spec.trim().length < 1 || spec.trim().length > 30)
  ) {
    errors.specs = "각 스펙은 1~30자로 입력해 주세요.";
  }

  const isValidPrice = (value: string) =>
    /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
  if (!isValidPrice(draft.minPrice)) {
    errors.minPrice = "0 이상의 정수로 입력해 주세요.";
  }
  if (!isValidPrice(draft.maxPrice)) {
    errors.maxPrice = "0 이상의 정수로 입력해 주세요.";
  }
  if (
    !errors.minPrice &&
    !errors.maxPrice &&
    Number(draft.minPrice) > Number(draft.maxPrice)
  ) {
    errors.maxPrice = "최대 가격은 최소 가격 이상이어야 해요.";
  }
  if (!draft.location.trim()) {
    errors.location = "거래 희망 지역을 입력해 주세요.";
  }

  return errors;
}
