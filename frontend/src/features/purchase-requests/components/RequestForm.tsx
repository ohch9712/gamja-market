"use client";

import { useState, type FormEvent } from "react";
import type { Category } from "@/types/purchase-request";
import { categoryLabels } from "../utils";
import {
  validatePurchaseRequest,
  type FormErrors,
  type PurchaseRequestDraft,
} from "../validation";

const initialDraft: PurchaseRequestDraft = {
  title: "",
  category: "",
  description: "",
  specs: [],
  minPrice: "",
  maxPrice: "",
  location: "",
};

const fieldOrder: (keyof PurchaseRequestDraft)[] = [
  "title", "category", "description", "specs", "minPrice", "maxPrice", "location",
];

export function RequestForm() {
  const [draft, setDraft] = useState<PurchaseRequestDraft>(initialDraft);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function updateField<K extends keyof PurchaseRequestDraft>(key: K, value: PurchaseRequestDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitted(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validatePurchaseRequest(draft);
    setErrors(nextErrors);
    setSubmitted(false);
    if (Object.keys(nextErrors).length > 0) {
      const firstField = fieldOrder.find((field) => nextErrors[field]);
      if (firstField) {
        const target = firstField === "specs"
          ? document.querySelector<HTMLInputElement>(".spec-row input")
          : document.getElementById(firstField);
        target?.focus();
      }
      return;
    }
    setSubmitted(true);
  }

  return (
    <form className="request-form" onSubmit={handleSubmit} noValidate>
      <div className="form-section-heading"><span>01</span><div><h2>어떤 물건을 찾으세요?</h2><p>이웃이 알아보기 쉽게 자세히 적어주세요.</p></div></div>
      <div className="form-fields">
        <div className="form-field">
          <label htmlFor="title">제목 <span className="required">*</span></label>
          <input id="title" type="text" maxLength={50} value={draft.title} onChange={(event) => updateField("title", event.target.value)} placeholder="예: 아이폰 15 프로 256GB 구해요" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : "title-hint"} />
          {errors.title ? <p className="field-error" id="title-error">{errors.title}</p> : <p className="field-hint" id="title-hint">2~50자로 입력해 주세요.</p>}
        </div>
        <div className="form-field">
          <label htmlFor="category">카테고리 <span className="required">*</span></label>
          <select id="category" value={draft.category} onChange={(event) => updateField("category", event.target.value as Category | "")} aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? "category-error" : undefined}>
            <option value="">카테고리를 선택해 주세요</option>
            {(Object.keys(categoryLabels) as Category[]).map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
          </select>
          {errors.category && <p className="field-error" id="category-error">{errors.category}</p>}
        </div>
        <div className="form-field">
          <label htmlFor="description">설명 <span className="required">*</span></label>
          <textarea id="description" rows={6} maxLength={1000} value={draft.description} onChange={(event) => updateField("description", event.target.value)} placeholder="원하는 상태, 사용 목적, 거래 방식 등 자유롭게 적어주세요." aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : "description-hint"} />
          {errors.description ? <p className="field-error" id="description-error">{errors.description}</p> : <p className="field-hint" id="description-hint">10~1000자 · {draft.description.length}/1000</p>}
        </div>
        <div className="form-field">
          <div className="label-row"><span id="specs-label" className="group-label">원하는 스펙 <span className="optional">선택</span></span><span className="field-counter">{draft.specs.length}/10</span></div>
          <p className="field-hint specs-hint">용량, 크기, 색상처럼 꼭 필요한 조건을 하나씩 적어주세요.</p>
          <div className="spec-list" role="group" aria-labelledby="specs-label">
            {draft.specs.map((spec, index) => (
              <div className="spec-row" key={index}>
                <input aria-label={`스펙 ${index + 1}`} type="text" maxLength={30} value={spec} onChange={(event) => {
                  const specs = [...draft.specs];
                  specs[index] = event.target.value;
                  updateField("specs", specs);
                }} placeholder={`스펙 ${index + 1} (예: 256GB)`} aria-invalid={Boolean(errors.specs)} aria-describedby={errors.specs ? "specs-error" : undefined} />
                <button type="button" className="remove-spec" aria-label={`스펙 ${index + 1} 삭제`} onClick={() => updateField("specs", draft.specs.filter((_, itemIndex) => itemIndex !== index))}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="add-spec" disabled={draft.specs.length >= 10} onClick={() => updateField("specs", [...draft.specs, ""])}>＋ 스펙 추가하기</button>
          {errors.specs && <p className="field-error" id="specs-error">{errors.specs}</p>}
        </div>
      </div>

      <div className="form-divider" />
      <div className="form-section-heading"><span>02</span><div><h2>희망 가격과 지역을 알려주세요</h2><p>거래를 원하는 범위를 입력해 주세요.</p></div></div>
      <div className="form-fields">
        <div className="price-fields">
          <div className="form-field">
            <label htmlFor="minPrice">최소 희망 가격 <span className="required">*</span></label>
            <div className="input-unit"><input id="minPrice" type="number" inputMode="numeric" min="0" step="1" value={draft.minPrice} onChange={(event) => updateField("minPrice", event.target.value)} placeholder="0" aria-invalid={Boolean(errors.minPrice)} aria-describedby={errors.minPrice ? "minPrice-error" : undefined} /><span>원</span></div>
            {errors.minPrice && <p className="field-error" id="minPrice-error">{errors.minPrice}</p>}
          </div>
          <div className="form-field">
            <label htmlFor="maxPrice">최대 희망 가격 <span className="required">*</span></label>
            <div className="input-unit"><input id="maxPrice" type="number" inputMode="numeric" min="0" step="1" value={draft.maxPrice} onChange={(event) => updateField("maxPrice", event.target.value)} placeholder="0" aria-invalid={Boolean(errors.maxPrice)} aria-describedby={errors.maxPrice ? "maxPrice-error" : undefined} /><span>원</span></div>
            {errors.maxPrice && <p className="field-error" id="maxPrice-error">{errors.maxPrice}</p>}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="location">거래 희망 지역 <span className="required">*</span></label>
          <input id="location" type="text" value={draft.location} onChange={(event) => updateField("location", event.target.value)} placeholder="예: 서울 마포구" aria-invalid={Boolean(errors.location)} aria-describedby={errors.location ? "location-error" : undefined} />
          {errors.location && <p className="field-error" id="location-error">{errors.location}</p>}
        </div>
      </div>
      <div className="form-submit">
        <p>입력한 내용은 아직 저장되지 않아요.</p>
        <button type="submit" className="button button-primary button-large">구매요청 미리 등록하기 <span aria-hidden="true">↗</span></button>
      </div>
      {submitted && <div className="form-success" role="status"><span aria-hidden="true">✓</span><div><strong>내용을 확인했어요!</strong><p>3단계에서 실제 등록이 연결됩니다. 지금은 목업 데이터가 바뀌지 않아요.</p></div></div>}
    </form>
  );
}
