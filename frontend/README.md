# 감자마켓 프런트엔드

구매자가 원하는 물건을 먼저 요청하는 감자마켓의 프런트엔드입니다.

- 구매요청 목록·상세·등록 화면은 아직 목업 데이터(`src/lib/mock/purchase-requests.ts`)를 쓰며, 화면은 `src/features/purchase-requests/api.ts`를 통해서만 데이터를 읽습니다. 등록 폼은 입력 검증과 안내만 제공하고 실제로 저장하지 않습니다.
- 회원가입(`/signup`)·로그인(`/login`)·로그아웃·현재 사용자 조회는 FastAPI 백엔드(`backend/`)의 `/api/auth/*`를 실제로 호출합니다(인증 목업 없음). 세션은 HttpOnly 쿠키(`gamja_session`)로 유지됩니다.
- 구매요청 등록(`/requests/new`)은 로그인한 사용자만 볼 수 있고, 미로그인 시 `/login?next=/requests/new`로 이동합니다.

## 실행

```bash
npm install
cp .env.example .env.local   # 최초 1회. NEXT_PUBLIC_API_BASE_URL=백엔드 origin
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다. 로그인·회원가입을 쓰려면 백엔드(`http://localhost:8000`)를 함께 띄웁니다(`docs/specs/02-auth-signup-login.md` 6.3절). 백엔드가 꺼져 있어도 목록·상세는 동작하며, 헤더는 미로그인 상태로 보입니다.

## 검증

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

주요 경로는 `/`(목록), `/requests/iphone-15-pro`(상세), `/requests/new`(등록, 로그인 필요), `/signup`, `/login`입니다.
