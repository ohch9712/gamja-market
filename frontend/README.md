# 감자마켓 프런트엔드

구매자가 원하는 물건을 먼저 요청하는 감자마켓의 1단계 목업 화면입니다. 현재 데이터는 `src/lib/mock/purchase-requests.ts`에 있으며, 화면은 `src/features/purchase-requests/api.ts`를 통해서만 데이터를 읽습니다. 등록 폼은 입력 검증과 안내만 제공하고 실제로 저장하지 않습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 검증

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

주요 경로는 `/`(목록), `/requests/iphone-15-pro`(상세), `/requests/new`(등록)입니다.
