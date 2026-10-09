# 2단계 인증 백엔드 구현·검증 결과

- 기준: `docs/specs/02-auth-signup-login.md` (2026-10-10 검증)
- 수정 범위: 신규 `backend/**`만 작성했으며 커밋하지 않았다.
- 구성: Python 3.12 + uv, FastAPI, 동기 SQLAlchemy 2.0/psycopg 3, Alembic, PostgreSQL 17.

## 구현

- `/api/health` 및 `/api/auth/signup`, `/login`, `/logout`, `/me`를 계약의 상태코드·camelCase JSON으로 제공한다.
- 이메일은 공백 제거 후 전체 소문자로 정규화하고, 비밀번호는 공백을 유지하며 8~128자만 허용한다.
- 필수 `passwordConfirm`을 `model_validator(mode="after")`로 검증한다. 불일치는 `passwordConfirm` 필드의 422이며, 잘못된 길이의 비밀번호와 불일치 에러를 중복하지 않는다. 확인 입력은 저장 계층에 전달하지 않는다.
- 비밀번호는 argon2id 기본 파라미터로 해시하고, 존재하지 않는 이메일도 더미 해시 검증을 수행한다.
- 세션 토큰은 `secrets.token_urlsafe(32)`로 발급하며 DB에는 SHA-256 해시만 저장한다. 7일 절대 만료이며 로그아웃·만료 조회 시 DB 세션을 삭제한다. 다른 기기의 세션은 유지한다.
- `gamja_session` HttpOnly/SameSite=Lax/Path=/ 쿠키와 환경변수에 따른 Secure 설정을 적용한다.
- `http://localhost:3000`의 credential CORS, 공통 JSON 에러 핸들러, JSON 가입·로그인 본문 제한을 적용한다. 거절된 CORS 프리플라이트도 JSON 에러를 반환하며 500에도 허용된 origin의 CORS 헤더를 보존한다.
- `users`, `sessions`, FK cascade 및 인덱스를 생성·삭제하는 초기 마이그레이션을 추가했다.
- 테스트는 `DATABASE_URL` DB(사전에 `alembic upgrade head` 적용)를 사용하고, 테스트마다 savepoint와 외부 트랜잭션을 롤백해 데이터를 남기지 않는다.

## 실행 결과

| 명령/검증 | 결과 |
| --- | --- |
| 루트에서 `docker compose up -d` | PostgreSQL 컨테이너 실행 확인 |
| `backend/`에서 `uv sync` | 성공, Python 3.12.13 가상환경 및 `uv.lock` 생성 |
| `uv run alembic upgrade head` | `0001_create_users_and_sessions` 적용 성공 |
| `uv run alembic check` | 모델·마이그레이션 차이 없음 |
| `uv run pytest -q` | **50 passed**, 문서 9.1 전체 항목 포함 |
| `uv run uvicorn app.main:app --port 8000` | 서버 기동 성공, 검증 후 SIGINT로 정상 종료 확인 |
| 실제 `curl` health | 200, `{"status":"ok"}` |
| 실제 `curl` signup | 201, 정규화 이메일 및 쿠키 속성 확인 |
| 실제 `curl` 정규화 이메일 중복 signup | 409 `EMAIL_ALREADY_EXISTS` |
| 실제 `curl` passwordConfirm 불일치 signup | 422, `passwordConfirm` 필드·한국어 메시지 확인 |
| 실제 `curl` login / me | 각각 200 |
| 실제 `curl` logout | 204, 빈 본문·쿠키 Max-Age=0 확인 |
| 실제 `curl` logout 후 기존 쿠키로 me | 401 `UNAUTHENTICATED` |
| 실제 `curl` 쿠키 없이 logout | 204 |
| 실제 `curl` localhost:3000 프리플라이트 | 200, 명시 origin 및 credentials 헤더 확인 |
| `git diff --check -- backend` | 오류 없음 |
| `.env`, `.venv/`, 로그 파일 gitignore | 무시 확인 |

최신 Starlette의 `httpx` TestClient 사용 중단 예정 경고가 1건 표시되지만 테스트는 모두 통과한다. 계약이 지정한 `httpx` 의존성을 유지했다.

스모크에는 충돌 방지를 위해 임의 접미사를 붙인 이메일을 사용했으며 생성한 사용자와 세션, 임시 쿠키 파일을 모두 정리했다. PostgreSQL 컨테이너는 통합 검증을 위해 실행 상태로 두었다. 프론트엔드와 함께 진행할 문서 9.3 브라우저 통합 검증은 코디네이터에게 남아 있다.

## 생성 파일 목록

```text
backend/.env.example
backend/.gitignore
backend/.python-version
backend/IMPLEMENTATION_REPORT.md
backend/pyproject.toml
backend/uv.lock
backend/alembic.ini
backend/alembic/env.py
backend/alembic/script.py.mako
backend/alembic/versions/0001_create_users_and_sessions.py
backend/app/__init__.py
backend/app/main.py
backend/app/api/__init__.py
backend/app/api/router.py
backend/app/api/deps.py
backend/app/api/health.py
backend/app/api/auth.py
backend/app/schemas/__init__.py
backend/app/schemas/common.py
backend/app/schemas/auth.py
backend/app/services/__init__.py
backend/app/services/auth_service.py
backend/app/repositories/__init__.py
backend/app/repositories/user_repository.py
backend/app/repositories/session_repository.py
backend/app/db/__init__.py
backend/app/db/base.py
backend/app/db/models.py
backend/app/db/session.py
backend/app/core/__init__.py
backend/app/core/config.py
backend/app/core/security.py
backend/app/core/errors.py
backend/app/core/cookies.py
backend/app/core/cors.py
backend/tests/conftest.py
backend/tests/test_health.py
backend/tests/test_auth.py
backend/logs/.gitkeep
```
