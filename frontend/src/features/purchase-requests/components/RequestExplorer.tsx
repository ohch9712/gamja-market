"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Category, PurchaseRequest } from "@/types/purchase-request";
import { categoryLabels, filterPurchaseRequests, type RequestFilters } from "../utils";
import { RequestCard } from "./RequestCard";

const categories: (Category | "all")[] = [
  "all",
  "digital",
  "appliance",
  "furniture",
  "fashion",
  "hobby",
  "etc",
];

function filtersFromUrl(): RequestFilters {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  return {
    query: params.get("q") ?? "",
    category: categories.includes(category as Category | "all")
      ? (category as Category | "all")
      : "all",
    status: params.get("status") === "all" ? "all" : "open",
  };
}

export function RequestExplorer({
  requests,
  initialFilters,
  now,
}: {
  requests: PurchaseRequest[];
  initialFilters: RequestFilters;
  now: string;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const results = useMemo(
    () => filterPurchaseRequests(requests, filters),
    [requests, filters],
  );

  useEffect(() => {
    const onPopState = () => setFilters(filtersFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function updateFilters(next: RequestFilters) {
    setFilters(next);
    const url = new URL(window.location.href);
    url.searchParams.set("q", next.query);
    url.searchParams.set("category", next.category);
    url.searchParams.set("status", next.status);
    window.history.replaceState(null, "", url);
  }

  return (
    <section className="listing-section container" aria-labelledby="listing-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">NEIGHBORHOOD REQUESTS</span>
          <h2 id="listing-title">지금 찾고 있는 물건</h2>
          <p>이웃의 구매요청을 둘러보고, 내가 가진 물건을 떠올려 보세요.</p>
        </div>
        <span className="result-count" aria-live="polite">{results.length}개의 요청</span>
      </div>

      <div className="filter-panel">
        <label className="search-field">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <span className="sr-only">구매요청 검색</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
            placeholder="어떤 물건을 찾고 계세요?"
          />
        </label>
        <div className="filter-row">
          <div className="category-filters" role="group" aria-label="카테고리 필터">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`filter-chip${filters.category === category ? " active" : ""}`}
                aria-pressed={filters.category === category}
                onClick={() => updateFilters({ ...filters, category })}
              >
                {category === "all" ? "전체" : categoryLabels[category]}
              </button>
            ))}
          </div>
          <label className="status-toggle">
            <input
              type="checkbox"
              checked={filters.status === "all"}
              onChange={(event) =>
                updateFilters({ ...filters, status: event.target.checked ? "all" : "open" })
              }
            />
            <span className="toggle-track" aria-hidden="true" />
            전체 상태 보기
          </label>
        </div>
      </div>

      {results.length > 0 ? (
        <div className="request-grid">
          {results.map((request) => (
            <RequestCard key={request.id} request={request} now={now} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">🥔</span>
          <h3>아직 일치하는 요청이 없어요</h3>
          <p>다른 검색어나 카테고리를 선택해 보세요. 직접 원하는 물건을 알려도 좋아요.</p>
          <Link href="/requests/new" className="button button-primary">구매요청 올리기 <span aria-hidden="true">↗</span></Link>
        </div>
      )}
    </section>
  );
}
