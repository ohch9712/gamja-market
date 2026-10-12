# 02. 회원가입·로그인 (FastAPI 회원 API + Next.js 인증 화면)

> 커리큘럼 2단계. 이메일·비밀번호(확인 입력 포함)만 입력하면 정규화 이메일 중복이 없을 때 즉시 가입되고, FastAPI가 로그인·로그아웃·현재 사용자 조회를 제공한다. Supabase Auth, 이메일 인증, OAuth는 사용하지 않는다.
>
> 이 문서는 **프론트엔드 워커(Next.js)와 백엔드 워커(FastAPI)가 서로 대화 없이 병렬로 구현하는 유일한 계약**이다. 두 워커는 이 문서에 적힌 경로·JSON 필드·상태코드·쿠키 이름을 그대로 따르고, 문서에 없는 사항은 각자 범위 안에서 가장 단순한 방식으로 결정한다.

## 1. 목표

- `backend/`에 FastAPI + uv 프로젝트를 처음 만들고, AGENTS.md의 레이어 구조(`api / schemas / services / repositories / db / core`)를 잡는다.
- 애플리케이션 `users` 테이블과 `sessions` 테이블을 Postgres(compose.yaml)에 만들고 Alembic으로 관리한다.
- 회원가입 / 로그인 / 로그아웃 / 현재 사용자 조회 4개 API를 제공한다. **로그아웃은 서버에서 세션을 실제로 무효화**한다.
- 프론트엔드에 `/signup`, `/login` 페이지를 추가하고, 헤더에 로그인 상태와 로그아웃 버튼을 표시한다.
- 구매요청 등록 화면(`/requests/new`)은 로그인한 사용자만 들어갈 수 있게 한다.

## 2. 범위

### 포함

- 백엔드 프로젝트 스캐폴딩(uv, FastAPI, SQLAlchemy 2.0, Alembic, pytest)
- `users`, `sessions` 테이블 + 초기 마이그레이션
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/health`
- HttpOnly 쿠키 기반 서버 세션, CORS 설정(localhost:3000 ↔ localhost:8000)
- 통일된 에러 응답 포맷
- 프론트엔드 `/signup`, `/login` 페이지, 헤더 로그인 상태 영역, `features/auth` 모듈, 공통 API 클라이언트
- `/requests/new` 로그인 게이트(클라이언트 측)
- 백엔드/프론트엔드 각각의 자동 테스트

### 제외 (이후 단계 또는 범위 밖)

| 항목 | 처리 |
| --- | --- |
| 구매요청 실제 저장·조회 API, `buyerNickname`을 실제 사용자로 교체 | 3단계 (구매요청 목록·상세·등록 폼은 1단계 목업 그대로 둔다) |
| 판매자 지원, 채팅, 매칭, 후기 | 4~8단계 |
| Supabase Auth, 이메일 인증 메일, OAuth 소셜 로그인 | 사용 금지 (커리큘럼 원칙) |
| 닉네임·역할(구매자/판매자)·프로필 입력 | 받지 않음 (커리큘럼 원칙). 화면에는 이메일을 그대로 표시한다. 회원가입의 "비밀번호 확인"은 오타 방지용 재입력이며 별도 정보가 아니므로 허용한다 |
| 비밀번호 재설정, 비밀번호 변경, 회원 탈퇴 | 범위 밖 |
| 로그인 시도 제한(rate limit), 계정 잠금 | 범위 밖 |
| 운영 배포(Supabase Postgres, Vercel) 설정 | 범위 밖. 단, 운영 전환 시 바꿀 값은 환경변수로 분리해 둔다 |
| Next.js 서버 측 인증(미들웨어/proxy에서 쿠키 검사) | 범위 밖. 이번 단계는 클라이언트 측 게이트만 구현한다 |

## 3. 기술 결정

| 항목 | 결정 | 근거·비고 |
| --- | --- | --- |
| 백엔드 프레임워크 | FastAPI + uvicorn, 패키지 관리 uv | AGENTS.md. `requires-python = ">=3.12"` |
| ORM | SQLAlchemy 2.0 (동기 엔진, `psycopg[binary]` 3 드라이버) | 비동기 ORM은 학습 난이도를 올리므로 동기로 간다. FastAPI는 동기 엔드포인트를 스레드풀에서 실행하므로 충분하다 |
| 마이그레이션 | Alembic | `uv run alembic upgrade head`로 스키마 적용. 접속 URL은 `MIGRATION_DATABASE_URL`(비어 있으면 `DATABASE_URL`). 테스트도 같은 스키마 사용 |
| 설정 로딩 | pydantic-settings (`.env` 읽기) | |
| 비밀번호 해시 | **argon2id** (`argon2-cffi`, 라이브러리 기본 파라미터) | bcrypt의 72바이트 제한과 passlib 유지보수 중단을 피한다. 해시 문자열에 파라미터가 포함돼 추후 파라미터 변경 시 재해시가 쉽다 |
| 인증 방식 | **서버 세션 + HttpOnly 쿠키** (세션 테이블 `sessions`) | 요구사항 "로그아웃이 실제로 무효화되어야 함"을 충족하려면 서버 상태가 필요하다. JWT는 만료 전 무효화를 위해 블랙리스트를 따로 둬야 하므로 세션 테이블보다 복잡하다. 쿠키는 HttpOnly라 JS에서 토큰을 만질 일이 없다 |
| 세션 토큰 | `secrets.token_urlsafe(32)`를 쿠키에 담고, DB에는 SHA-256 해시만 저장 | DB가 유출돼도 세션 탈취가 불가능 |
| 세션 수명 | 발급 후 7일 고정(절대 만료). 연장 없음 | 단순화. 만료된 세션은 조회 시 삭제 |
| 쿠키 | 이름 `gamja_session`, `HttpOnly; SameSite=Lax; Path=/`, `Max-Age=604800`, `Secure`는 `COOKIE_SECURE` 환경변수로 제어(dev: false). `Domain` 속성 없음 | 브라우저의 same-site 판정은 포트를 보지 않으므로 localhost:3000 → localhost:8000 요청에 `SameSite=Lax` 쿠키가 실린다 |
| CORS | `allow_origins=[FRONTEND_ORIGIN]`(정확히 `http://localhost:3000`), `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]` | credentials 모드에서는 `*` origin을 쓸 수 없으므로 반드시 명시 origin |
| CSRF 대응 | 상태 변경 엔드포인트는 JSON 본문만 받고(`Content-Type: application/json`), `SameSite=Lax` 쿠키 + 명시 origin CORS로 충분하다고 본다 | 별도 CSRF 토큰은 범위 밖 |
| JSON 필드 표기 | **camelCase** (`createdAt`, `expiresAt`) | 프론트엔드 타입 규칙(1단계)과 맞춘다. 백엔드는 pydantic `alias_generator=to_camel` + `populate_by_name=True`로 처리하고 FastAPI 기본값 `response_model_by_alias=True`를 사용 |
| 경로 접두어 | `/api` (인증은 `/api/auth/...`) | 3단계 이후 `/api/purchase-requests` 등으로 확장 |
| 백엔드 테스트 | pytest + FastAPI `TestClient`(httpx), `DATABASE_URL` DB + 테스트별 트랜잭션 롤백 | 7절 참고 |
| 프론트엔드 테스트 | Vitest + Testing Library (1단계 설정 유지), `fetch`는 `vi.stubGlobal`로 모킹 | |
| 프론트엔드 상태 관리 | React Context(`AuthProvider`) + `useAuth()` 훅, 외부 상태 라이브러리 없음 | 로그인 사용자 1개 값만 다루므로 Context로 충분 |

## 4. DB 스키마

Dev DB는 `compose.yaml`의 Postgres 17이다. 접속 URL: `postgresql+psycopg://gamja:gamja_local_password@localhost:5432/gamja_market`

### 4.1 `users`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `email` | `varchar(254)` | NOT NULL, UNIQUE | **정규화된 이메일만 저장**(원본 보관 안 함). 정규화 규칙은 5.4 |
| `password_hash` | `text` | NOT NULL | argon2id 해시 문자열 |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | 이번 단계에서는 갱신 로직 없음 |

### 4.2 `sessions`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` ON DELETE CASCADE, 인덱스 `ix_sessions_user_id` | |
| `token_hash` | `varchar(64)` | NOT NULL, UNIQUE | 쿠키 토큰의 SHA-256 hex |
| `expires_at` | `timestamptz` | NOT NULL | 발급 시각 + 7일 |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### 4.3 마이그레이션

- `0001_create_users_and_sessions`: `upgrade`는 두 테이블·인덱스 생성, `downgrade`는 역순 삭제.
- `0002_enable_row_level_security`: `alembic_version`, `users`, `sessions`에 RLS를 켜고 정책은 만들지 않는다. Supabase는 `public` 스키마를 Data API(anon/authenticated 역할)로 노출하므로 이를 막는다. 테이블 소유자인 백엔드 접속 계정은 RLS를 우회하므로 앱 동작은 그대로다.
- `gen_random_uuid()`는 Postgres 13+ 내장이므로 확장 설치가 필요 없다.

## 5. API 계약

### 5.1 공통 규칙

- Base URL(dev): `http://localhost:8000`. 모든 경로는 `/api`로 시작한다.
- 요청·응답 본문은 JSON, 필드는 camelCase. 시각은 ISO 8601(UTC, 예: `2026-10-10T03:21:45.123456Z`).
- 인증은 `gamja_session` 쿠키로만 한다. `Authorization` 헤더는 받지 않는다.
- 세션이 있는 요청: 쿠키 토큰 → SHA-256 → `sessions.token_hash` 조회 → `expires_at > now()`이면 유효. 만료 행은 발견 즉시 삭제하고 미인증으로 처리.

**에러 응답 포맷(모든 4xx/5xx 공통)**

```json
{
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "이미 가입된 이메일입니다.",
    "details": []
  }
}
```

| HTTP | `code` | 상황 |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | 쿠키 없음, 세션 없음, 세션 만료 |
| 401 | `INVALID_CREDENTIALS` | 로그인 실패(이메일 없음·비밀번호 불일치 모두 동일 응답) |
| 409 | `EMAIL_ALREADY_EXISTS` | 정규화 이메일 중복 |
| 422 | `VALIDATION_ERROR` | 본문 검증 실패. `details`에 `[{"field": "email", "message": "..."}]` 배열 |
| 404 | `NOT_FOUND` | 없는 경로 |
| 500 | `INTERNAL_ERROR` | 처리되지 않은 예외 |

- FastAPI 기본 `RequestValidationError` 핸들러와 `HTTPException` 핸들러를 **모두 교체**해 위 포맷으로 통일한다. `details`는 검증 에러가 아닐 때 빈 배열.
- `details[].field`는 pydantic 에러 `loc`의 마지막 요소(`email`, `password`, `passwordConfirm`). 모델 수준 검증(비밀번호 확인 불일치)은 `passwordConfirm`으로 고정한다. 본문 전체가 JSON이 아닐 때는 `field: "body"`.

### 5.2 `GET /api/health`

- 인증 불필요. 프론트엔드가 백엔드 기동 여부를 확인할 때 쓴다.
- 응답 `200`: `{"status": "ok"}`

### 5.3 `POST /api/auth/signup` — 회원가입

- 요청 본문

```json
{ "email": "Potato@Example.com", "password": "gamja1234", "passwordConfirm": "gamja1234" }
```

- `passwordConfirm`은 필수이며 `password`와 **완전히 같은 문자열**이어야 한다(대소문자·공백 구분). 프론트가 먼저 거르지만 백엔드도 반드시 다시 검사한다(이중 검증). 불일치 시 `422 VALIDATION_ERROR`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "details": [{ "field": "passwordConfirm", "message": "비밀번호가 일치하지 않습니다." }]
  }
}
```

- `passwordConfirm`은 비교에만 쓰고 **DB에 저장하지 않는다**. `password`가 8~128자 규칙을 어기면 `password` 에러만 내고, 불일치 검사는 `password`가 유효할 때만 수행한다(에러 중복 방지). pydantic `model_validator(mode="after")`로 구현한다.
- 처리: 이메일 정규화(5.4) → `users.email` 중복 조회 → 없으면 argon2id 해시로 사용자 생성 → **세션 발급 + 쿠키 설정**(가입 즉시 로그인 상태).
- 응답 `201 Created` + `Set-Cookie: gamja_session=...`

```json
{
  "user": {
    "id": "6d2c1b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    "email": "potato@example.com",
    "createdAt": "2026-10-10T03:21:45.123456Z"
  }
}
```

- 에러: `409 EMAIL_ALREADY_EXISTS`, `422 VALIDATION_ERROR`
- 동시 가입으로 UNIQUE 제약이 터지면(`IntegrityError`) 역시 `409`로 변환한다.

### 5.4 검증·정규화 규칙 (프론트·백엔드 공통)

| 필드 | 규칙 |
| --- | --- |
| `email` | 문자열, 앞뒤 공백 제거 후 1~254자, 이메일 형식(백엔드: pydantic `EmailStr` = email-validator, 배달 가능성 검사 없음 / 프론트: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) |
| 이메일 정규화 | `strip()` → 전체 **소문자화**. 로컬 파트까지 소문자로 바꾼다(실제 메일 서비스 대부분이 대소문자를 구분하지 않으므로 중복 가입 방지를 우선). 응답·저장·비교 모두 정규화된 값만 사용 |
| `password` | 문자열, 8~128자(문자 수 기준, 공백 포함 허용, 구성 규칙 없음). 앞뒤 공백을 제거하지 않는다 |
| `passwordConfirm` | **회원가입에만** 존재. 필수 문자열, `password`와 완전 일치(`===`). 길이 규칙은 따로 두지 않는다(일치하면 자동 충족). 로그인 요청에는 없다 |

- 백엔드가 최종 권위다. 프론트 검증은 UX용이며 같은 규칙을 미러링한다.
- 검증 메시지(프론트·백엔드 동일 문구): 이메일 → `"올바른 이메일 형식이 아닙니다."`, 비밀번호 → `"비밀번호는 8~128자로 입력해 주세요."`, 비밀번호 확인 → `"비밀번호가 일치하지 않습니다."` (비어 있을 때는 `"비밀번호를 한 번 더 입력해 주세요."`)

### 5.5 `POST /api/auth/login` — 로그인

- 요청 본문(`passwordConfirm` 없음. 보내더라도 무시한다)

```json
{ "email": "potato@example.com", "password": "gamja1234" }
```

- 처리: 이메일 정규화 → 사용자 조회 → argon2 검증 → 새 세션 발급(기존 세션은 유지, 기기별 다중 로그인 허용) + 쿠키 설정.
- 응답 `200 OK` + `Set-Cookie` (본문은 signup과 같은 `{"user": {...}}`)
- 에러: `401 INVALID_CREDENTIALS`(메시지 `"이메일 또는 비밀번호가 올바르지 않습니다."`), `422 VALIDATION_ERROR`
- 사용자가 없을 때도 더미 해시를 검증해 응답 시간 차이를 줄인다(선택, 구현 간단하면 적용).

### 5.6 `POST /api/auth/logout` — 로그아웃

- 요청 본문 없음. 쿠키만 사용.
- 처리: 쿠키 토큰의 세션 행을 **삭제**하고, 쿠키를 만료시킨다(`Set-Cookie: gamja_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`).
- 응답 `204 No Content`. 쿠키가 없거나 세션이 이미 없어도 **항상 204**(멱등).

### 5.7 `GET /api/auth/me` — 현재 사용자 조회

- 응답 `200 OK`

```json
{
  "user": {
    "id": "6d2c1b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    "email": "potato@example.com",
    "createdAt": "2026-10-10T03:21:45.123456Z"
  }
}
```

- 에러: `401 UNAUTHENTICATED`(메시지 `"로그인이 필요합니다."`)

### 5.8 Set-Cookie 예시 (dev)

```
Set-Cookie: gamja_session=K3m9...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
```

운영(`COOKIE_SECURE=true`)에서는 `; Secure`가 붙는다.

### 5.9 curl 스모크 테스트

```sh
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"Potato@Example.com","password":"gamja1234","passwordConfirm":"gamja1234"}' \
  http://localhost:8000/api/auth/signup            # 201 + Set-Cookie
curl -i -H 'Content-Type: application/json' \
  -d '{"email":"other@example.com","password":"gamja1234","passwordConfirm":"gamja1235"}' \
  http://localhost:8000/api/auth/signup            # 422 VALIDATION_ERROR (field: passwordConfirm)
curl -i -b cookies.txt http://localhost:8000/api/auth/me   # 200
curl -i -b cookies.txt -X POST http://localhost:8000/api/auth/logout  # 204
curl -i -b cookies.txt http://localhost:8000/api/auth/me   # 401 UNAUTHENTICATED
```

## 6. 백엔드 구조·환경변수·실행

### 6.1 디렉토리 구조

```
backend/
  ├── pyproject.toml            # fastapi, uvicorn[standard], sqlalchemy, psycopg[binary], alembic,
  │                             # pydantic-settings, pydantic[email], argon2-cffi / dev: pytest, httpx
  ├── .python-version           # 3.12
  ├── .env.example
  ├── .gitignore                # .env, .venv/, __pycache__/, logs/*, !logs/.gitkeep
  ├── alembic.ini
  ├── alembic/
  │    ├── env.py               # app.core.config의 MIGRATION_DATABASE_URL(없으면 DATABASE_URL) 사용, target_metadata = Base.metadata
  │    └── versions/
  │         ├── 0001_create_users_and_sessions.py
  │         └── 0002_enable_row_level_security.py
  ├── app/
  │    ├── main.py              # create_app(): CORS, 예외 핸들러, 라우터 등록
  │    ├── api/
  │    │    ├── router.py       # APIRouter(prefix="/api") 에 health, auth 포함
  │    │    ├── deps.py         # get_db, get_current_user(쿠키 → 세션 → User, 없으면 401)
  │    │    ├── health.py
  │    │    └── auth.py         # signup / login / logout / me
  │    ├── schemas/
  │    │    ├── common.py       # CamelModel(alias_generator=to_camel), ErrorResponse
  │    │    └── auth.py         # SignupRequest(passwordConfirm 일치 model_validator), LoginRequest, UserOut, AuthResponse
  │    ├── services/
  │    │    └── auth_service.py # signup, login, logout, 세션 검증 (비즈니스 규칙·에러 코드 결정)
  │    ├── repositories/
  │    │    ├── user_repository.py
  │    │    └── session_repository.py
  │    ├── db/
  │    │    ├── base.py         # DeclarativeBase
  │    │    ├── models.py       # User, Session
  │    │    └── session.py      # engine, SessionLocal
  │    └── core/
  │         ├── config.py       # Settings(pydantic-settings)
  │         ├── security.py     # hash_password, verify_password, new_session_token, hash_token
  │         ├── errors.py       # AppError(code, status, message) + 핸들러 등록 함수
  │         └── cookies.py      # set_session_cookie, clear_session_cookie
  ├── tests/
  │    ├── conftest.py
  │    ├── test_health.py
  │    └── test_auth.py
  └── logs/.gitkeep
```

- 레이어 규칙: `api`는 HTTP(쿠키·상태코드)만 다루고, `services`가 규칙과 에러 코드를 결정하며, `repositories`만 SQLAlchemy 쿼리를 작성한다. `api`에서 직접 쿼리하지 않는다.
- `AppError`는 `(status_code, code, message)`를 담는 예외이며 `main.py`에 등록된 핸들러가 5.1 포맷으로 변환한다.

### 6.2 환경변수 — `backend/.env.example`

```dotenv
# 로컬 개발 기본값. 비밀값 아님. 실제 값은 .env(gitignore)에 둔다.
APP_ENV=development
DATABASE_URL=postgresql+psycopg://gamja:gamja_local_password@localhost:5432/gamja_market
# 마이그레이션(Alembic) 전용. 비우면 DATABASE_URL을 사용한다.
MIGRATION_DATABASE_URL=postgresql+psycopg://gamja:gamja_local_password@localhost:5432/gamja_market
FRONTEND_ORIGIN=http://localhost:3000
SESSION_COOKIE_NAME=gamja_session
SESSION_TTL_SECONDS=604800
COOKIE_SECURE=false
```

- `Settings`는 위 키를 같은 이름으로 읽고 모두 기본값을 가진다(`.env`가 없어도 dev에서 뜬다).

### 6.3 실행 명령

```sh
docker compose up -d                       # 리포지토리 루트, Postgres 기동
cd backend
cp .env.example .env                       # 최초 1회
uv sync                                    # 의존성 설치(.venv 생성)
uv run alembic upgrade head                # 스키마 적용
uv run uvicorn app.main:app --reload --port 8000
# 확인: http://localhost:8000/api/health → {"status":"ok"}, http://localhost:8000/docs
```

## 7. 프론트엔드 설계

### 7.1 추가·변경 파일

```
frontend/
  ├── .env.example                        # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
  ├── .gitignore                          # `!.env.example` 한 줄 추가(.env* 가 전부 무시되고 있음)
  └── src/
       ├── app/
       │    ├── layout.tsx                # <AuthProvider>로 Header·children 감싸기
       │    ├── login/page.tsx            # /login
       │    ├── signup/page.tsx           # /signup
       │    └── requests/new/page.tsx     # <RequireAuth>로 RequestForm 감싸기
       ├── components/
       │    └── Header.tsx                # nav 안에 <AuthMenu /> 추가
       ├── features/auth/
       │    ├── api.ts                    # signup, login, logout, getMe (api-client 사용)
       │    ├── validation.ts             # validateLogin(Credentials), validateSignup(SignupInput) → errors
       │    ├── AuthProvider.tsx          # "use client" Context + useAuth()
       │    └── components/
       │         ├── AuthMenu.tsx         # 헤더 로그인 상태 영역
       │         ├── LoginForm.tsx
       │         ├── SignupForm.tsx
       │         └── RequireAuth.tsx      # 보호 화면 게이트
       ├── lib/
       │    └── api-client.ts             # fetch 래퍼, ApiError
       └── types/
            └── auth.ts                   # AuthUser, Credentials, SignupInput
```

### 7.2 타입

```ts
// src/types/auth.ts
export interface AuthUser {
  id: string;
  email: string;
  createdAt: string; // ISO 8601
}

export interface Credentials {
  email: string;
  password: string;
}

export interface SignupInput extends Credentials {
  passwordConfirm: string; // 회원가입 전용. 서버로 그대로 전송하되 DB에는 저장되지 않는다
}
```

### 7.3 API 클라이언트 — `src/lib/api-client.ts`

```ts
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,          // 네트워크 실패는 0
    public code: string,            // 서버 error.code 또는 "NETWORK_ERROR"
    message: string,
    public details: { field: string; message: string }[] = [],
  ) { super(message); }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>;
```

- 항상 `credentials: "include"`, JSON 본문이면 `Content-Type: application/json`.
- `fetch` 자체가 실패(TypeError)하면 `ApiError(0, "NETWORK_ERROR", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.")`.
- `res.ok`가 아니면 본문을 5.1 포맷으로 파싱해 `ApiError(status, code, message, details)`. 파싱 실패 시 `code: "UNKNOWN_ERROR"`.
- `204`는 `undefined`를 반환.

### 7.4 `features/auth/api.ts`

```ts
export async function signup(input: SignupInput): Promise<AuthUser>;       // POST /api/auth/signup (passwordConfirm 포함 전송)
export async function login(credentials: Credentials): Promise<AuthUser>;  // POST /api/auth/login
export async function logout(): Promise<void>;                             // POST /api/auth/logout
export async function getMe(): Promise<AuthUser | null>;                   // GET /api/auth/me, 401이면 null
```

- `getMe`는 `401 UNAUTHENTICATED`만 `null`로 바꾸고, 그 외 에러(`NETWORK_ERROR` 포함)는 던진다.

### 7.5 인증 상태 관리 — `AuthProvider`

```ts
type AuthStatus = "loading" | "authenticated" | "unauthenticated";
interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  backendAvailable: boolean;   // getMe가 NETWORK_ERROR면 false
  signup(input: SignupInput): Promise<void>;
  login(c: Credentials): Promise<void>;
  logout(): Promise<void>;
}
export function useAuth(): AuthContextValue;
```

- 마운트 시 `getMe()` 1회 호출. 성공 → `authenticated`, `null` → `unauthenticated`, `NETWORK_ERROR` → `unauthenticated` + `backendAvailable=false`.
- `signup/login` 성공 시 `user`를 응답으로 교체하고 `authenticated`. 실패 시 `ApiError`를 그대로 던져 폼이 메시지를 표시한다.
- `logout`은 API 호출 결과와 무관하게 `user=null`, `unauthenticated`로 바꾼 뒤 `router.push("/")`.
- `layout.tsx`는 Server Component를 유지하고 `<AuthProvider>`(Client)로 `<Header />`와 `<main>`을 감싼다.

### 7.6 헤더 — `AuthMenu`

| 상태 | 표시 |
| --- | --- |
| `loading` | ~~아무것도 표시하지 않음(고정 폭 빈 영역)~~ → **04에서 변경**: `unauthenticated`와 같은 "로그인"/"회원가입" 링크를 표시한다([04-auth-entry-resilience.md](04-auth-entry-resilience.md)) |
| `unauthenticated` | "로그인" 링크(`/login`), "회원가입" 링크(`/signup`) |
| `authenticated` | 사용자 이메일 텍스트 + "로그아웃" 버튼 |

- 기존 "구매요청 올리기" CTA는 상태와 무관하게 항상 보인다(클릭 시 `/requests/new`의 게이트가 처리).
- 기존 CSS 클래스(`button`, `button-primary`, `button-text`)를 재사용하고, 새 클래스는 `globals.css`에 추가한다.

### 7.7 페이지

**`/signup`** — 제목 "회원가입", `SignupForm`

- 입력: 이메일, 비밀번호, **비밀번호 확인** 3개 필드(닉네임·역할 없음). 비밀번호 확인은 `type="password"`, `id="passwordConfirm"`, `autoComplete="new-password"`.
- 검증 시점:
  - **입력 시점**: 필드 값이 바뀌면 그 필드의 에러만 지운다(기존 `RequestForm` 패턴). 추가로 비밀번호 확인 필드는 `blur` 시점, 그리고 두 필드 모두 비어 있지 않을 때 값이 바뀌는 즉시 일치 여부를 검사해 "비밀번호가 일치하지 않습니다."를 필드 아래에 표시한다. 비밀번호 필드를 고쳐서 다시 일치하게 되면 에러를 즉시 지운다.
  - **제출 시점**: `validateSignup`으로 5.4 규칙 전체(이메일 형식, 비밀번호 8~128자, 비밀번호 확인 비어 있지 않음·일치)를 검사한다. 에러가 하나라도 있으면 **API를 호출하지 않고** 필드 아래 메시지를 보여 주고 첫 에러 필드(순서: email → password → passwordConfirm)에 포커스한다.
  - 비밀번호가 8~128자 규칙을 어기면 `password` 에러만 보여 주고 `passwordConfirm` 불일치 에러는 함께 띄우지 않는다(백엔드 5.3과 동일).
- 제출 중 버튼 비활성 + "가입 중…".
- 성공 → `/`로 이동(가입 즉시 로그인 상태이므로 헤더에 이메일이 보인다).
- 에러 메시지 매핑: `EMAIL_ALREADY_EXISTS` → "이미 가입된 이메일입니다." (이메일 필드 아래) / `VALIDATION_ERROR` → `details`를 필드별 메시지로(`passwordConfirm` 포함) / `NETWORK_ERROR` → 폼 상단 안내 / 그 외 → "잠시 후 다시 시도해 주세요."
- 하단에 "이미 계정이 있나요? 로그인" 링크.
- 이미 `authenticated`면 `/`로 리다이렉트.

**`/login`** — 제목 "로그인", `LoginForm`

- 입력: 이메일, 비밀번호 **2개**(비밀번호 확인 없음). 검증은 `validateLogin`으로 "비어 있지 않음"만(형식 검사는 서버 응답에 맡겨도 되지만 5.4 미러링을 권장).
- 성공 → `next` 쿼리가 있고 `/`로 시작하는 상대 경로이면 그곳으로, 아니면 `/`.
- `INVALID_CREDENTIALS` → 폼 상단 "이메일 또는 비밀번호가 올바르지 않습니다."
- 하단에 "아직 계정이 없나요? 회원가입" 링크. 이미 로그인 상태면 `/`로 리다이렉트.

**`/requests/new`** — `RequireAuth` 게이트

- `status === "loading"`: 폼 대신 로딩 플레이스홀더.
- `unauthenticated`: `router.replace("/login?next=/requests/new")`.
- `authenticated`: 기존 `RequestForm`을 그대로 렌더(폼 내용·"3단계에서 연결" 안내는 변경 없음).
- 목록(`/`)과 상세(`/requests/[id]`)는 로그인 없이 그대로 볼 수 있다.

### 7.8 환경변수

- `NEXT_PUBLIC_API_BASE_URL` — 백엔드 origin. 미설정 시 코드 기본값 `http://localhost:8000`.
- `.env.example`만 커밋하고 `.env.local`은 개발자가 복사한다. 1단계 `.gitignore`가 `.env*`를 전부 무시하므로 `!.env.example` 예외를 추가한다.

## 8. 백엔드 미기동 시 프론트 동작 방침

- **인증 기능은 목업을 두지 않는다.** 계약이 작고 에러 경로가 중요하므로 실제 API로만 동작시킨다.
- 백엔드가 꺼져 있으면: `getMe`가 `NETWORK_ERROR` → 헤더는 미로그인 상태(로그인/회원가입 링크)로 보이고, 목록·상세는 1단계 목업 그대로 정상 동작한다. 로그인·회원가입 폼 제출 시 상단에 "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."를 보여 준다.
- `/requests/new`는 백엔드가 꺼져 있으면 미로그인으로 판정되어 `/login`으로 보낸다. 화면만 확인하고 싶을 때는 백엔드를 띄운다(6.3).
- 프론트 워커는 백엔드 없이 개발·테스트한다. 단위 테스트는 `fetch`를 모킹하고, 수동 확인은 통합 시점(두 워커 완료 후)에 코디네이터가 진행한다. 프론트 워커가 로컬에서 임시 스텁 서버를 띄워 확인하는 것은 자유지만 리포지토리에 포함하지 않는다.

## 9. 테스트·수락 기준

### 9.1 백엔드

실행:

```sh
docker compose up -d          # 루트
cd backend && uv run alembic upgrade head && uv run pytest -q
```

- 테스트 DB: 별도 테스트 DB를 두지 않고 `DATABASE_URL`(로컬 compose Postgres)을 그대로 사용한다. 스키마는 `uv run alembic upgrade head`로 미리 적용되어 있어야 하며, 각 테스트는 외부 트랜잭션 안에서 `sessions`·`users` 행을 비운 뒤(savepoint로 서비스 커밋 흡수) 실행하고, 종료 시 롤백해 기존 개발 데이터를 복원하며 테스트 데이터를 남기지 않는다. `get_db` 의존성을 테스트 세션으로 오버라이드한다.
- 체크리스트:
  - [ ] `uv sync`, `uv run alembic upgrade head`, `uv run uvicorn app.main:app --port 8000`가 에러 없이 동작한다.
  - [ ] `GET /api/health` → 200 `{"status":"ok"}`
  - [ ] signup 성공: 201, 응답 이메일이 소문자 정규화됨, `Set-Cookie: gamja_session` + `HttpOnly` + `SameSite=Lax` + `Path=/`
  - [ ] signup 중복: `Potato@Example.com` 가입 후 ` potato@example.com ` 가입 → 409 `EMAIL_ALREADY_EXISTS`
  - [ ] signup 검증: 잘못된 이메일 / 7자 비밀번호 / 129자 비밀번호 → 422 `VALIDATION_ERROR` + `details[].field`
  - [ ] signup 비밀번호 확인: `password`와 불일치 → 422, `details`에 `{"field":"passwordConfirm","message":"비밀번호가 일치하지 않습니다."}`; `passwordConfirm` 누락 → 422, `details[].field`가 `passwordConfirm`(메시지는 pydantic 기본 문구 허용). 두 경우 모두 사용자 행이 생성되지 않음. `password`가 7자이고 불일치이면 `details`에 `password` 에러만 있다
  - [ ] login 성공: 200 + 새 세션 쿠키 / 비밀번호 불일치·없는 이메일 → 401 `INVALID_CREDENTIALS`(두 경우 응답 본문 동일)
  - [ ] me: 쿠키 있으면 200, 없으면 401 `UNAUTHENTICATED`
  - [ ] logout: 204, 이후 같은 쿠키로 me → 401 (세션 행이 삭제됨), 쿠키 없이 logout → 204
  - [ ] 만료 세션(`expires_at`을 과거로 수정)으로 me → 401, 행이 삭제됨
  - [ ] `password_hash`가 `$argon2id$`로 시작하고 평문이 저장되지 않는다. `passwordConfirm` 값은 어떤 컬럼에도 저장되지 않는다
  - [ ] login 요청에 `passwordConfirm`을 넣어도 무시되고 정상 처리된다
  - [ ] 404·500 응답도 5.1 포맷을 따른다
  - [ ] `Origin: http://localhost:3000` 프리플라이트(OPTIONS)에 `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Credentials: true`가 포함된다

### 9.2 프론트엔드

실행:

```sh
cd frontend && npm run lint && npx tsc --noEmit && npm run test && npm run build
```

- 체크리스트:
  - [ ] 위 4개 명령이 모두 통과한다.
  - [ ] Vitest: `validateSignup`(이메일 형식, 비밀번호 8~128자, 비밀번호 확인 비어 있음·불일치)·`validateLogin`, `apiFetch`(에러 포맷 파싱 → `ApiError`, 네트워크 실패 → `NETWORK_ERROR`, `credentials: "include"` 전달), `SignupForm`/`LoginForm`(검증 메시지 표시, 409/401 메시지 매핑) 테스트가 있다.
  - [ ] `SignupForm` 불일치 테스트: 비밀번호와 비밀번호 확인이 다르면 제출 시 "비밀번호가 일치하지 않습니다."가 표시되고 모킹된 `fetch`(또는 `signup`)가 **호출되지 않는다**. 일치하면 `passwordConfirm`을 포함한 본문으로 1회 호출된다.
  - [ ] `/signup` 페이지는 이메일·비밀번호·비밀번호 확인 3개 필드, `/login` 페이지는 이메일·비밀번호 2개 필드만 렌더링한다.
  - [ ] 헤더가 `loading / unauthenticated / authenticated` 3상태를 7.6대로 표시한다.
  - [ ] `/requests/new`는 미로그인 시 `/login?next=/requests/new`로 이동하고, 로그인 후 원래 폼이 보인다.
  - [ ] 백엔드가 꺼져 있어도 `/`, `/requests/[id]`가 1단계와 동일하게 동작하고 콘솔에 처리되지 않은 예외가 없다.
  - [ ] 화면 컴포넌트가 `fetch`를 직접 호출하지 않는다(`lib/api-client.ts`만 사용).
  - [ ] 360px 폭에서 가로 스크롤이 생기지 않는다(새 페이지 포함).

### 9.3 통합(코디네이터 확인)

- [ ] 백엔드(8000)·프론트(3000)를 함께 띄우고 브라우저에서 비밀번호 확인을 다르게 입력하면 가입이 막히고, 같게 입력하면 가입 → 헤더에 이메일 표시 → 새로고침 후 유지 → 로그아웃 → 헤더가 로그인 링크로 바뀜 → `/requests/new` 접근 시 `/login`으로 이동 → 로그인 후 `/requests/new`로 복귀.

## 10. 작업 분담 및 경계

| 워커 | 수정 가능 범위 | 금지 |
| --- | --- | --- |
| 백엔드 워커 | `backend/**` (신규 생성 포함) | `frontend/`, `docs/`, `compose.yaml`, 루트 파일 수정 금지 |
| 프론트엔드 워커 | `frontend/**` | `backend/`, `docs/`, `compose.yaml`, 루트 파일 수정 금지. `src/features/purchase-requests/`와 `src/lib/mock/`은 수정하지 않는다(`requests/new/page.tsx`에 게이트를 감싸는 것만 허용) |

- 두 워커 사이의 유일한 인터페이스는 **5절 API 계약과 3절 쿠키·CORS 설정**이다. 계약을 바꿔야 한다면 구현을 멈추고 코디네이터에게 묻는다(상대 워커와 직접 조율하지 않는다).
- `compose.yaml`은 이미 존재하며 두 워커 모두 수정하지 않는다.
- git commit 여부는 코디네이터 지시에 따른다.

## 11. 다음 단계 연결 포인트

- **3단계(구매요청 API)**: `get_current_user` 의존성을 그대로 써서 `POST /api/purchase-requests`를 보호하고, `buyer_id`를 `users.id`로 저장한다. 프론트는 `apiFetch`로 `features/purchase-requests/api.ts`를 교체하고, `buyerNickname` 표시를 사용자 이메일(또는 3단계에서 정하는 표시 규칙)로 바꾼다.
- **운영 전환 시**: `DATABASE_URL`을 Supabase Postgres(앱용 접속)로, `MIGRATION_DATABASE_URL`을 DDL 권한이 있는 Supabase 직접 접속(direct connection)으로, `FRONTEND_ORIGIN`을 Vercel 도메인으로, `COOKIE_SECURE=true`로 바꾼다. 프론트와 백엔드 도메인이 달라 cross-site가 되면 `SameSite=None; Secure` 또는 Next.js rewrites 프록시가 필요하다. 이 결정은 배포 단계에서 한다.
  - 적용 결과: 루트 `vercel.json`의 Vercel Services로 프론트와 백엔드를 한 도메인에 배포하고 `/api/*`를 백엔드로 보낸다(same-origin이라 `SameSite=Lax` 유지). 함수 리전은 Supabase(ap-northeast-2)와 같은 서울 `icn1`로 고정한다(`"regions": ["icn1"]`). 프론트는 `NEXT_PUBLIC_API_BASE_URL=/`로 상대 경로를 호출한다. Supabase 직접 접속 호스트는 IPv6 전용이라 Vercel에서 접속할 수 없으므로 `DATABASE_URL`은 Supavisor 세션 pooler(IPv4, 5432)를 쓴다. 로컬에서 운영 DB에 마이그레이션할 때도 같은 pooler 주소를 `.env`를 고치지 않고 `MIGRATION_DATABASE_URL=... uv run alembic upgrade head`로 넘긴다.
