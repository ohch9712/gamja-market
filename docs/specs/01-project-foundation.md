# 01. 프로젝트 기반 (목업 화면 구성)

> 커리큘럼 1단계. 로그인 없이 볼 수 있는 간단한 웹을 Next.js로 스캐폴딩하고, 목업 데이터로 화면만 구성한다.

## 1. 목표

- `frontend/`에 Next.js + TypeScript 프로젝트를 만들고 기본 디렉토리 구조를 잡는다.
- 목업 데이터로 감자마켓의 핵심 화면(구매요청 목록·상세·등록)의 레이아웃과 페이지 구조를 완성한다.
- 이후 단계에서 실제 API로 바꿔 끼우기 쉽도록 **데이터 접근 계층을 한 곳에 모은다**.

## 2. 범위

### 포함

- Next.js(App Router) + TypeScript 스캐폴딩
- 공통 레이아웃(헤더, 본문 컨테이너, 푸터)
- 구매요청 목록 / 상세 / 등록 폼 화면
- 목업 데이터와 도메인 타입 정의
- 클라이언트 측 검색·필터
- 404 페이지
- 린트·타입 체크·빌드가 통과하는 상태

### 제외 (이후 단계)

| 항목 | 도입 단계 |
| --- | --- |
| FastAPI 백엔드, DB(Postgres/Supabase) 연동 | 2단계 이후 |
| 회원가입·로그인·로그아웃 | 2단계 |
| 구매요청 실제 저장·조회 API | 3단계 |
| 판매자 지원, 채팅방 생성 | 4단계 |
| 사진 업로드(Supabase Storage) | 5단계 |
| 채팅 | 6단계 |
| 매칭 확정·상태 관리 | 7단계 |
| 거래 완료·후기 | 8단계 |

> `backend/` 디렉토리는 이번 단계에서 만들지 않는다.

## 3. 기술 결정

| 항목 | 결정 | 비고 |
| --- | --- | --- |
| 프레임워크 | Next.js (App Router) | `create-next-app` 최신 안정 버전 |
| 언어 | TypeScript (strict) | |
| 스타일 | Tailwind CSS | `create-next-app` 기본 옵션 |
| 패키지 매니저 | npm | |
| 린트 | ESLint (Next.js 기본 설정) | |
| 테스트 | Vitest + Testing Library | 필터·포맷 함수 단위 테스트 위주 |
| 렌더링 | 목록·상세는 Server Component, 검색·필터·폼은 Client Component | |

## 4. 디렉토리 구조

```
frontend/
  ├── public/
  ├── src/
  │    ├── app/
  │    │    ├── layout.tsx              # 공통 레이아웃
  │    │    ├── page.tsx                # 구매요청 목록 (/)
  │    │    ├── not-found.tsx           # 404
  │    │    └── requests/
  │    │         ├── new/page.tsx       # 구매요청 등록 폼 (/requests/new)
  │    │         └── [id]/page.tsx      # 구매요청 상세 (/requests/[id])
  │    ├── components/                  # 범용 UI (Header, Footer, Button, Badge 등)
  │    ├── features/
  │    │    └── purchase-requests/
  │    │         ├── api.ts             # 데이터 접근 함수 (현재는 목업 반환)
  │    │         ├── components/        # RequestCard, RequestList, RequestFilter, RequestForm 등
  │    │         └── utils.ts           # 필터링, 가격 포맷 등
  │    ├── lib/
  │    │    └── mock/
  │    │         └── purchase-requests.ts  # 목업 데이터
  │    └── types/
  │         └── purchase-request.ts     # 도메인 타입
  ├── tests/
  └── logs/
```

## 5. 도메인 타입 (목업 기준)

```ts
// src/types/purchase-request.ts
export type PurchaseRequestStatus = "open" | "matched" | "closed";

export type Category =
  | "digital"     // 디지털기기
  | "appliance"   // 가전
  | "furniture"   // 가구·인테리어
  | "fashion"     // 의류·잡화
  | "hobby"       // 취미·게임
  | "etc";        // 기타

export interface PurchaseRequest {
  id: string;
  title: string;            // 예: "아이폰 15 프로 256GB 구해요"
  category: Category;
  description: string;      // 원하는 물건에 대한 자유 설명
  specs: string[];          // 원하는 스펙 목록 예: ["256GB", "배터리 효율 85% 이상"]
  minPrice: number;         // 희망 가격 하한 (원)
  maxPrice: number;         // 희망 가격 상한 (원)
  location: string;         // 거래 희망 지역 예: "서울 마포구"
  status: PurchaseRequestStatus;
  buyerNickname: string;    // 로그인 도입 전이므로 목업 문자열
  applicationCount: number; // 판매자 지원 수 (4단계 전까지 목업 값)
  createdAt: string;        // ISO 8601
}
```

- 목업 데이터는 10~15건으로 구성하고, 모든 카테고리와 상태가 최소 1건씩 들어가게 한다.
- 이미지 필드는 5단계에서 추가한다. 이번 단계의 카드·상세는 카테고리별 플레이스홀더를 쓴다.

## 6. 데이터 접근 계층

화면 컴포넌트는 목업 파일을 직접 import하지 않고, 반드시 `features/purchase-requests/api.ts`를 거친다.

```ts
// src/features/purchase-requests/api.ts
export async function getPurchaseRequests(): Promise<PurchaseRequest[]>;
export async function getPurchaseRequest(id: string): Promise<PurchaseRequest | null>;
```

- 지금은 목업 데이터를 반환하고, 3단계에서 FastAPI 호출로 바꾼다.
- 나중에 비동기 API로 바꿀 때 호출부를 고치지 않도록 처음부터 `async`로 정의한다.

## 7. 화면 명세

### 7.1 공통 레이아웃

- 헤더: 로고 "감자마켓"(클릭 시 `/`)과 "구매요청 올리기" 버튼(`/requests/new`)
- 로그인 버튼은 두지 않는다(2단계에서 추가).
- 반응형 레이아웃: 모바일(360px)부터 데스크톱(1280px)까지 가로 스크롤 없이 표시

### 7.2 구매요청 목록 — `/`

- 구매요청 카드 목록. 카드 내용: 플레이스홀더 이미지, 제목, 카테고리, 희망 가격대, 지역, 상태 배지, 지원 수, 작성 시각
- 정렬: 최신순(`createdAt` 내림차순)
- 검색: 제목·설명의 키워드 부분 일치(대소문자 무시)
- 필터: 카테고리(단일 선택, "전체" 포함), 상태(기본값 "모집 중"만 보기, 토글로 전체 보기)
- 결과가 없으면 빈 상태 메시지와 "구매요청 올리기" 링크를 보여 준다.
- 검색·필터 상태는 URL 쿼리(`?q=&category=&status=`)에 반영해 새로고침해도 유지한다.

### 7.3 구매요청 상세 — `/requests/[id]`

- 표시 항목: 제목, 카테고리, 상태 배지, 희망 가격대, 지역, 작성자 닉네임, 작성 시각, 설명, 원하는 스펙 목록, 지원 수
- "판매 지원하기" 버튼: 비활성 상태로 두고 "준비 중" 안내를 붙인다(4단계에서 구현).
- 존재하지 않는 id면 `notFound()`로 404 페이지를 보여 준다.

### 7.4 구매요청 등록 — `/requests/new`

- 입력 필드: 제목, 카테고리, 설명, 원하는 스펙(추가·삭제 가능한 목록), 최소·최대 희망 가격, 지역
- 클라이언트 유효성 검사:
  - 제목 2~50자, 설명 10~1000자
  - 가격은 0 이상 정수이고 `minPrice ≤ maxPrice`
  - 카테고리·지역 필수
  - 스펙은 0~10개, 각 1~30자
- 제출하면 저장하지 않고 "3단계에서 실제 등록이 연결됩니다"라는 안내만 보여 준다. 목업 데이터는 바뀌지 않는다.

### 7.5 404

- 안내 문구와 목록으로 돌아가는 링크

## 8. 표시 규칙

- 가격: `toLocaleString("ko-KR")` + "원". 가격대는 `300,000원 ~ 450,000원`, 최소·최대가 같으면 단일 값으로 표시
- 시각: 상대 시간(방금 전 / N분 전 / N시간 전 / N일 전). 7일이 지나면 `YYYY.MM.DD`
- 상태 배지: `open` → "모집 중", `matched` → "매칭 완료", `closed` → "마감"

## 9. 완료 기준

- [ ] `frontend/`에서 `npm run dev`로 실행하면 `/`, `/requests/[id]`, `/requests/new`, 404 페이지가 모두 정상 렌더링된다.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build`가 에러 없이 통과한다.
- [ ] `npm run test`가 통과한다. 최소 범위:
  - 검색·카테고리·상태 필터 함수
  - 가격대·상대 시간 포맷 함수
  - 등록 폼 유효성 검사 함수
- [ ] 화면 컴포넌트가 `lib/mock`을 직접 import하지 않는다(`api.ts`만 사용).
- [ ] 외부 네트워크(DB, Supabase, 백엔드) 호출이 없다.
- [ ] 360px 모바일 폭에서 가로 스크롤이 생기지 않는다.

## 10. 다음 단계 연결 포인트

- **2단계(회원)**: 헤더에 로그인·로그아웃 영역을 추가하고, `buyerNickname`을 실제 사용자 정보로 바꾼다.
- **3단계(구매요청 API)**: `api.ts` 내부 구현을 FastAPI 호출로 바꾸고, 등록 폼을 실제 POST로 연결한다. 타입은 백엔드 스키마에 맞춰 조정한다.
- **4단계(지원)**: 상세 화면의 "판매 지원하기" 버튼을 활성화하고, `applicationCount`를 실제 값으로 바꾼다.
- **5단계(사진)**: 플레이스홀더를 실제 이미지로 바꾼다.
