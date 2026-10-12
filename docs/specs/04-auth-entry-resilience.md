# 04. 로그인·회원가입 진입점 안정화 (배포 환경 장애 대응)

> 운영 보고: "Vercel에 배포된 감자마켓에 로그인/회원가입 기능이 없다(보이지 않거나 동작하지 않는다)."
> 이 문서는 배포 사이트에서 증상을 확인한 결과, 원인 분석, 수정 내용, 배포·검증 절차를 기록한다. 02(회원가입·로그인) 설계의 헤더 `loading` 표시 규칙을 이 문서가 대체한다.

## 1. 확인 결과 (2026-10-12)

대상: Vercel 팀 `icleansun`, 프로젝트 `gamja-market`. production 도메인은 `gamja-market-virid.vercel.app`이고, 당시 production 배포는 `main@e65bd46`(`dpl_8zj7tPfMMbZ1B7vKVBF6f81eBTFN`)였다.

| 확인 항목 | 결과 |
| --- | --- |
| 헤더 진입점 | 로그인 상태 확인이 끝난 뒤에는 "로그인"/"회원가입" 링크가 보인다 (Orca 브라우저 snapshot). 하지만 서버 렌더 HTML(확인 전 상태)에는 링크가 없고 빈 placeholder만 있다 |
| `/login`, `/signup` | 200 |
| `/api/health` | 200 `{"status":"ok"}` |
| `/api/auth/me` (쿠키 없음) | 401 `UNAUTHENTICATED` (공통 JSON 에러 포맷) |
| 실제 흐름 | 요청 로그에 `POST /api/auth/signup 201` → `GET /api/auth/me 200` → `POST /api/auth/logout 204` → `POST /api/auth/login 200` 기록 |
| 프런트 API 주소 | 번들에 `NEXT_PUBLIC_API_BASE_URL="/"`가 들어가 있어 same-origin `/api/*`로 호출한다 (`vercel.json` rewrite → backend 서비스) |
| 세션 쿠키 | `gamja_session` HttpOnly, Secure, SameSite=Lax, Path=/ |
| production 외 URL | 팀 도메인(`gamja-market-icleansun.vercel.app`), 브랜치 도메인(`gamja-market-git-*-icleansun.vercel.app`), 개별 배포 URL은 `ssoProtection=all_except_custom_domains` 때문에 Vercel 로그인 화면(`vercel.com/sso-api`)으로 302된다 |
| 첫 production 배포 | `0c553b6`(`gamja-market-bsqjoia6i-…`)는 인증 기능이 생기기 전 목업이다 |

즉 확인 시점의 production 도메인에서는 기능이 동작했다. 사용자가 "기능이 없다"고 볼 수 있는 경로는 아래 2절과 같다.

### 1.1 "첫 요청 40초 지연" 관찰에 대한 정정

처음에는 응답 `Date` 헤더 값을 보고 첫 API 요청이 약 40초 걸렸다고 판단했다. 다시 측정해 보니 실제 지연이 아니었다. 쉬고 있던(Fluid Compute에서 일시 정지된) 인스턴스의 uvicorn이 캐시해 둔 `Date` 헤더가 그대로 나온 것이다.

- 로컬 시각 14:18:48에 보낸 요청이 `Date: 14:14:42`를 받았고, `time_total`은 0.08초였다.
- Vercel 요청 로그의 타임스탬프와 `x-vercel-id`의 시각도 해당 요청들이 연달아 바로 처리됐음을 보여 준다.

따라서 응답 지연을 잴 때는 `Date` 헤더가 아니라 클라이언트 측 `time_total`과 요청 로그를 기준으로 삼는다.

## 2. 원인 분석

| # | 원인 | 근거 | 영향 |
| --- | --- | --- | --- |
| 1 | 헤더 진입점이 `/api/auth/me` 응답을 기다린다 | `AuthMenu`가 `status === "loading"`이면 고정 폭 빈 placeholder만 그렸다 (02 §7.6 설계) | 응답이 오기 전까지 로그인·회원가입 링크가 아예 없다 |
| 2 | 프런트 요청에 타임아웃이 없다 | `apiFetch`가 `fetch`를 그대로 호출했다 | 백엔드가 응답하지 않으면(cold start, DB 대기, 함수 hang) `loading`이 끝나지 않는다. Vercel 함수 최대 실행 시간은 300초다 |
| 3 | DB 접속 타임아웃이 없다 | `create_engine(database_url, pool_pre_ping=True)`에 `connect_timeout`이 없었다. psycopg 기본값은 무제한이다 | Supabase 일시 정지나 네트워크 장애가 나면 로그인·회원가입·쿠키가 있는 `/me` 요청이 TCP 타임아웃(수십 초~수 분)까지 매달린다 → 2와 겹쳐 진입점이 사라진다 |
| 4 | production 외 URL은 SSO로 보호된다 | 1절 표 | 팀/브랜치/배포 URL을 열면 감자마켓 대신 Vercel 로그인 화면이 나온다. 설정으로 의도된 동작이며 코드 수정 대상이 아니다 |
| 5 | 드라이버 없는 DB URL을 그대로 쓴다 | 2026-10-12 23:32 KST에 `DATABASE_URL`이 Supabase Session pooler 문자열(`postgresql://…pooler.supabase.com:5432/…`)로 바뀌었다. 이 값으로 빌드한 배포는 SQLAlchemy가 psycopg2 dialect를 골라 `ModuleNotFoundError: No module named 'psycopg2'`를 내고 `app/main.py` import부터 실패한다 → `/api/*` 전체가 500(`FUNCTION_INVOCATION_FAILED`). 6절의 실제 장애로 확인했다 | 이 값으로 다시 배포하면(main push 포함) 회원가입·로그인이 전부 실패한다 |

### 2.1 production 배포 이력 (KST)

| 시각 | 배포 | 커밋 | 내용 |
| --- | --- | --- | --- |
| 2026-10-09 23:53 | `dpl_BdU7sTbmYPC2mUUtAqnijvp1MBVd` (production) | `main@0c553b6` | 프런트 목업만 있다. `backend/`와 `vercel.json`이 없고 헤더에 `AuthMenu`도 없다 → 인증 UI·API가 아예 없다 |
| 2026-10-10 02:51 / 03:08 | 환경변수 | — | `DATABASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `COOKIE_SECURE`, `FRONTEND_ORIGIN`(production 전용) 추가 |
| 2026-10-10 03:21 | `dpl_8zj7tPfMMbZ1B7vKVBF6f81eBTFN` (production) | `main@e65bd46` | 회원가입 기능(`1e2ac9a`)과 `vercel.json`(frontend + backend 서비스)이 처음 함께 배포됐다. 수정 전 마지막 production 배포다 |
| 2026-10-12 22:53 / 23:03 | preview | `fdb15c6`, `develop@4f60bb2` | 스크립트 추가. 인증 코드는 바뀌지 않았다 |

`1e2ac9a`만 따로 배포된 적은 없다. 따라서 "frontend만 배포돼 `/api/auth/*`가 404였던 상태"는 production에 없었다.

### 2.2 확정 원인과 추정 원인

| 구분 | 내용 | 근거 |
| --- | --- | --- |
| **확정(코드 결함)** | 헤더의 로그인·회원가입 진입점이 `/api/auth/me` 응답 전에는 없고, 요청·DB 접속에 타임아웃이 없어 응답이 늦거나 매달리면 계속 없다 | production SSR HTML의 `<nav>`에 `auth-menu-placeholder`와 "구매요청 올리기"만 있고 `/login`·`/signup` 링크가 없다(검증 워커 기준선 증거 `08-baseline-ssr-home.html`). 원인 표 #1~#3 |
| **확정(배포 이력)** | 2026-10-09 23:53 ~ 10-10 03:21 KST에는 production이 인증 기능이 없는 목업(`0c553b6`)이었다 | 2.1 표 |
| **추정** | 사용자가 그 시간대에 production을 봤거나, 백엔드 cold start나 DB 지연 때문에 헤더 진입점이 비어 있는 순간을 봤다 | 사용자가 접속한 정확한 URL과 시각은 확인하지 못했다. 런타임 로그는 Hobby 플랜에서 1시간만 보관된다 |
| **추정** | 팀/브랜치/배포 URL로 접속해 Vercel 로그인 화면만 봤다 | 해당 URL은 SSO 302로 확인했다(원인 #4). 실제로 그 URL로 접속했는지는 확인하지 못했다 |
| **배제** | frontend만 배포돼 인증 API가 404였다 | 2.1 표 |

참고: 쿠키가 없는 `/api/auth/me`는 이미 DB 없이 바로 401을 반환한다. SQLAlchemy `Session`은 실제 쿼리가 실행될 때 연결을 얻는데, `get_current_user`가 토큰이 없으면 쿼리 전에 예외를 던지기 때문이다. 이번에 이 동작이 유지되는지 확인하는 회귀 테스트를 추가했다.

## 3. 변경 내용

### 3.1 프런트엔드

| 파일 | 변경 |
| --- | --- |
| `src/features/auth/components/AuthMenu.tsx` | `loading` 상태에서도 `unauthenticated`와 같은 "로그인"/"회원가입" 링크를 그린다. 인증이 확인되면 이메일 + "로그아웃"으로 바꾼다. 컨테이너에 `aria-busy`(loading 중 true)와 `data-auth-status`를 붙인다 |
| `src/app/globals.css` | 쓰지 않게 된 `.auth-menu-placeholder` 규칙(기본·520px 미디어쿼리)을 삭제한다 |
| `src/lib/api-client.ts` | `REQUEST_TIMEOUT_MS = 10_000`. 응답 헤더가 이 시간 안에 오지 않으면 `AbortController`로 요청을 끊고 `ApiError(0, "TIMEOUT", "서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.")`를 던진다. 요청마다 `timeoutMs`로 바꿀 수 있다. 호출자가 넘긴 `signal`로 취소하면 지금처럼 `AbortError`를 그대로 던진다 |
| `src/features/auth/AuthProvider.tsx` | 최초 `getMe`가 `NETWORK_ERROR` 또는 `TIMEOUT`이면 `unauthenticated` + `backendAvailable=false`로 둔다 |
| `src/features/auth/errors.ts` | 폼 제출이 `TIMEOUT`이면 폼 위에 지연 안내를 띄운다 |

헤더 상태별 표시(02 §7.6을 대체):

| 상태 | 표시 |
| --- | --- |
| `loading` | "로그인"(`/login`), "회원가입"(`/signup`) 링크 (`aria-busy="true"`) |
| `unauthenticated` | "로그인", "회원가입" 링크 |
| `authenticated` | 사용자 이메일 + "로그아웃" 버튼 |

- 트레이드오프: 이미 로그인한 사용자는 페이지를 처음 열 때 `/me` 응답 전까지 잠깐 링크를 본다. 이때 `/login`·`/signup`으로 들어가도 인증이 확인되면 기존 로직이 `/`로 보낸다. 진입점이 사라지는 쪽이 더 큰 문제라고 보고 이 깜빡임은 받아들인다.
- `/requests/new` 게이트(`RequireAuth`)는 그대로 둔다. 타임아웃이 나면 `unauthenticated`로 바뀌어 로그인 화면으로 보낸다.

### 3.2 백엔드

| 파일 | 변경 |
| --- | --- |
| `app/core/config.py` | `db_connect_timeout_seconds: int = 5` (환경변수 `DB_CONNECT_TIMEOUT_SECONDS`, 값은 0보다 커야 한다). 기본값이 있으므로 Vercel 환경변수를 바꿀 필요는 없다 |
| `app/core/config.py` | `database_url`·`migration_database_url`의 앞뒤 공백을 제거하고, `postgresql://`·`postgres://`로 시작하면 `postgresql+psycopg://`로 바꾼다(드라이버를 명시한 URL은 그대로 둔다). Supabase 대시보드 문자열을 그대로 붙여 넣어도 동작하므로 환경변수를 고칠 필요가 없다 |
| `app/db/session.py` | 엔진 생성을 `create_db_engine(settings)`로 분리하고 `connect_args={"connect_timeout": …}`를 넘긴다 |
| `.env.example` | `DB_CONNECT_TIMEOUT_SECONDS=5` 예시 추가 |

DB 스키마와 마이그레이션은 바꾸지 않는다.

## 4. 테스트

- 프런트(Vitest, 7개 파일·75개 테스트 통과)
  - `apiFetch`: 10초가 지나면 `TIMEOUT`이 나고 signal이 abort된다 / `timeoutMs`로 바꿀 수 있다 / 호출자가 취소하면 `AbortError` / 응답이 오면 타이머가 정리된다
  - 헤더: loading 중에도 링크가 보인다 / loading → authenticated로 바뀐다 / `getMe` 타임아웃 뒤에도 링크가 남아 있다
  - `AuthProvider`: 타임아웃이 나면 `unauthenticated` + `backendAvailable=false`
  - `LoginForm`: 타임아웃이 나면 지연 안내를 띄우고 다시 제출할 수 있다
  - `eslint`, `tsc --noEmit`, `next build` 통과
- 백엔드(pytest, 로컬 Docker Postgres, 58개 통과): `tests/test_resilience.py`
  - 쿠키 없는 `/api/auth/me`와 `/api/health`가 DB 세션에 손대지 않는다(속성에 접근하면 실패하는 가짜 세션 사용)
  - 엔진이 드라이버에 `connect_timeout`을 넘기고, 기본값은 5초다
  - `postgresql://`, `postgres://`, 앞뒤 공백이 있는 URL을 `postgresql+psycopg://`로 바꾸고 엔진 드라이버가 `psycopg`다. 드라이버를 명시한 URL은 그대로 둔다
- 수동 확인: `DATABASE_URL=postgresql://…localhost…`로 앱을 import하면 driver=psycopg, `/api/health` 200, `/api/auth/me` 401, 로그인 시도 401(DB 조회 정상)
- 수동 확인: 응답하지 않는 주소(`10.255.255.1`)에 `connect_timeout=3`으로 접속하면 3.0초 뒤 `OperationalError`가 난다
- 마이그레이션(`alembic upgrade`)은 실행하지 않았다(`MIGRATION_DATABASE_URL`이 운영 Supabase를 가리킨다).

## 5. 배포·검증 절차

1. `feature/login-register-fix` 브랜치를 push하면 Git 연동으로 preview 배포가 만들어진다. preview는 SSO로 보호되므로 Vercel 공유 링크로 검증한다.
2. preview에서 확인할 것: 헤더 링크가 보이는지(느린 응답 중 포함), 회원가입 → 로그아웃 → 로그인, `/api/health`, `/api/auth/me`.
3. preview 검증이 끝나면 롤백에 쓸 직전 production 배포 ID를 기록하고, Vercel CLI로 production에 반영한다. main 머지는 하지 않는다.
4. production 도메인에서 새 테스트 계정으로 회원가입 → 로그인을 최종 검증한다.

배포 결과는 6절에 적는다.

## 6. 배포 결과

| 시각(KST) | 단계 | 결과 |
| --- | --- | --- |
| 10-12 23:27 | `9f2b322` push → preview `dpl_HbePP4ZM4qVePTxh1NBBPJrN42vL` READY | 검증 워커 PASS: SSR HTML에 `data-auth-status="loading"`과 링크가 있다. 회원가입 201 → 로그아웃 204 → 로그인 200 → 새로고침 후 `/me` 200. 콘솔 에러 0건 |
| 10-12 23:31 | `vercel promote` → production 재빌드 `dpl_CxrtU1www7KJwBYiXdESWeuRYJdT` | **장애**: 빌드 직전(23:32:06)에 바뀐 `DATABASE_URL`(`postgresql://`)을 가져가 `/api/*` 전체가 500(원인 #5). 헤더 SSR 링크는 정상이었다 |
| 10-12 23:36 | `vercel rollback dpl_8zj7tPfMMbZ1B7vKVBF6f81eBTFN` | `/api/health` 200, `/api/auth/me` 401로 복구. 장애는 약 3분간 이어졌다 |
| (이후) | DB URL 정규화 커밋 → 새 preview 검증 → production 반영 | 아래에 덧붙인다 |

교훈: promote는 production 환경변수로 **다시 빌드**하므로, preview 검증 뒤에 환경변수가 바뀌면 검증하지 않은 값으로 배포된다. promote 직후에는 반드시 `/api/health`를 확인하고, 롤백할 배포 ID를 미리 적어 둔다.

## 7. 남은 일

- 이 수정은 `main`에 아직 머지되지 않았다. 다음에 `main`에 push하면 Git 연동이 수정 전 코드로 production을 다시 배포해 이 변경을 덮어쓴다. `feature/login-register-fix`를 `main`(및 `develop`)에 머지해야 한다.
- Vercel 런타임 로그는 Hobby 플랜에서 1시간만 보관된다. 장애가 난 시점의 로그를 남기려면 Log Drain이나 플랜 변경을 검토한다.
