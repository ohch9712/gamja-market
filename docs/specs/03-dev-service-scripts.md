# 03. 로컬 dev 서비스 기동·재기동·중지 스크립트

> 개발 환경 정비 단계. 같은 리포를 여러 git 워크트리(메인 체크아웃 + Orca 작업 워크트리)에서 번갈아 실행할 때 생기는 포트 3000/8000 충돌을 자동으로 정리하고, **현재 워크트리**의 frontend(Next.js)·backend(FastAPI)를 한 명령으로 기동·재기동·중지한다.
>
> 판단의 1차 근거는 항상 **포트를 LISTEN 중인 프로세스와 그 cwd 실측**이다. PID 파일은 보조 기록으로만 쓴다.

## 1. 목표

- `scripts/start.sh`, `scripts/restart.sh`, `scripts/stop.sh` 세 스크립트로 dev 서비스를 다룬다. 공통 로직은 `scripts/lib/common.sh`에 둔다.
- 다른 워크트리에서 띄운 감자마켓 서비스가 포트를 쓰고 있으면 **어느 워크트리인지 알려 주고 종료한 뒤** 현재 워크트리 서비스를 띄운다.
- 이 리포와 무관한 프로세스는 기본적으로 건드리지 않는다(`--force`일 때만 종료).
- 대화형 셸, 터미널, Orca 앱 프로세스는 어떤 경우에도 종료하지 않는다.
- 기동 후 헬스체크가 통과할 때까지 기다리고, 실패하면 로그 끝부분을 보여 주고 비정상 종료한다.

## 2. 범위

### 포함

- 대상 선택 `[all|frontend|backend]`, `--force`, `-h/--help`
- 포트 점유 프로세스의 소유 워크트리 판별, 프로세스 트리 정리(SIGTERM → SIGKILL)
- nohup + 자체 프로세스 그룹으로 백그라운드 분리 실행, 로그 파일 기록·회전
- PID/메타 파일(보조), 워크트리 간 동시 실행 잠금
- 사전 점검: 필수 명령, 의존성 설치(`uv sync`, `npm ci`), env 파일 복사, Postgres 기동 확인

### 제외

| 항목 | 처리 |
| --- | --- |
| DB(Postgres) 컨테이너 중지 | 하지 않는다. compose project `gamja-market`을 모든 워크트리가 공유한다 |
| DB 마이그레이션(`uv run alembic upgrade head`) | 실행하지 않는다. `MIGRATION_DATABASE_URL`이 운영 DB(Supabase)를 가리키므로 기동 스크립트에서 마이그레이션을 돌리면 운영 스키마가 바뀔 수 있다. 마이그레이션은 대상 DB를 확인한 뒤 직접 실행한다 |
| 여러 워크트리 서비스 동시 실행 | 기본 포트는 한 번에 한 워크트리만 쓴다. 동시에 띄우려면 포트를 override 한다(5.3) |
| 운영(Vercel) 배포, Supabase | 범위 밖. 로컬 개발 전용 |
| Linux·Windows 지원 | macOS 기준으로 작성·검증했다. Linux는 lsof·BSD 호환 옵션만 쓰므로 동작 가능성은 있으나 검증하지 않았다 |
| 다른 사용자 계정의 프로세스 | 다루지 않는다(lsof/kill 권한 밖) |

## 3. 기술 결정

| 항목 | 결정 | 근거·비고 |
| --- | --- | --- |
| 셸 | `#!/usr/bin/env bash`, `set -euo pipefail` | macOS 기본 `/bin/bash` 3.2 호환. 연관배열·`${var,,}`·`wait -n`·`mapfile`·`BASHPID` 금지, 배열 대신 공백 구분 문자열 사용(빈 배열 + `set -u` 문제 회피) |
| BSD 도구 | GNU `timeout`, `readlink -f`, `sed -i` 미사용 | 타임아웃은 `$SECONDS` 루프 + `curl --max-time`, 경로 정규화는 `cd … && pwd -P` |
| 리포 루트 | 스크립트 위치 기준(`scripts/..`) | 어느 디렉토리에서 호출해도 동작 |
| 포트 점유 조회 | `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` | |
| cwd 조회 | `lsof -a -p <PID> -d cwd -Fn` | |
| 워크트리 목록 | `git worktree list --porcelain` | git이 없으면 현재 워크트리만 인식 |
| 백그라운드 분리 | `set -m` + `( cd …; exec nohup … ) &` + `disown` | macOS에는 `setsid`가 없다. `set -m`으로 서비스가 **자체 프로세스 그룹의 리더**가 된다 |
| 헬스체크 | backend `GET http://127.0.0.1:<port>/api/health` 200, frontend `GET http://localhost:<port>/` 200 | |
| 동시 실행 방지 | `mkdir` 원자성을 이용한 잠금 디렉토리 | 워크트리 간 공유 |
| 정적 검사 | `bash -n`, shellcheck 경고 0 | |

## 4. 파일 구성

```
scripts/
  ├── start.sh          # 기동 (멱등)
  ├── stop.sh           # 중지
  ├── restart.sh        # stop → start
  └── lib/
       └── common.sh    # 공통 함수 (단독 실행하지 않고 source)
```

- 로그: `backend/logs/dev-server.log`, `frontend/logs/dev-server.log` (기존 `logs/*` gitignore에 포함)
- 런타임 파일: `${TMPDIR}/gamja-market/` (리포 밖이므로 `.gitignore` 변경 없음)

## 5. 사용법

### 5.1 명령

```sh
scripts/start.sh   [all|frontend|backend] [--force]
scripts/restart.sh [all|frontend|backend] [--force]
scripts/stop.sh    [all|frontend|backend] [--force]
scripts/<name>.sh -h   # 도움말
```

| 인자·옵션 | 설명 |
| --- | --- |
| `all` (기본) | start는 backend → frontend, stop은 frontend → backend 순서. 앞 서비스가 실패하면 즉시 중단한다 |
| `frontend` / `backend` | 해당 서비스만 |
| `--force` | 이 리포와 무관한 프로세스가 포트를 점유해도 종료한다(보호 대상은 `--force`여도 종료하지 않음, 7.4) |

- restart는 `stop.sh <대상> [--force]` 후 `start.sh <원래 인자 전체>`를 실행한다.
- 종료 코드: 성공 0(이미 실행 중, 종료할 서비스 없음 포함), 실패 1(잘못된 인자, 무관한 프로세스 점유 + `--force` 없음, 의존성 설치 실패, readiness 실패, 프로세스 종료 실패).

### 5.2 실행되는 명령

| 서비스 | 작업 디렉토리 | 명령 |
| --- | --- | --- |
| backend | `backend/` | `uv run uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT --reload` |
| frontend | `frontend/` | `npm run dev -- --port $FRONTEND_PORT` |

### 5.3 환경변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `FRONTEND_PORT` | `3000` | frontend 포트 |
| `BACKEND_PORT` | `8000` | backend 포트 |
| `GAMJA_BACKEND_READY_TIMEOUT` | `60` | backend readiness 대기(초) |
| `GAMJA_FRONTEND_READY_TIMEOUT` | `90` | frontend readiness 대기(초). next dev 첫 컴파일 고려 |
| `GAMJA_KILL_TIMEOUT` | `10` | SIGTERM 후 SIGKILL까지 대기(초) |
| `GAMJA_DB_READY_TIMEOUT` | `60` | `docker compose up` 후 Postgres healthy 대기(초) |
| `GAMJA_LOCK_TIMEOUT` | `300` | 다른 스크립트 실행이 끝나기를 기다리는 최대 시간(초) |
| `GAMJA_RUNTIME_DIR` | `${TMPDIR:-/tmp}/gamja-market` | PID/메타 파일·잠금 위치 |
| `POSTGRES_PORT` | `5432` | Postgres 응답 확인 포트(compose.yaml과 동일한 변수) |
| `NO_COLOR` | (없음) | 설정하면 색상 출력 끔 |

- **포트 override**: `FRONTEND_PORT` 또는 `BACKEND_PORT`가 기본값과 다르면 두 포트를 기준으로 계산한 값을 실행 프로세스 env로 넘긴다. 프로세스 env는 `backend/.env`, `frontend/.env.local` 값보다 우선한다.
  - backend: `FRONTEND_ORIGIN=http://localhost:$FRONTEND_PORT` (CORS 허용 origin)
  - frontend: `NEXT_PUBLIC_API_BASE_URL=http://localhost:$BACKEND_PORT`
- 기본 포트일 때는 env를 따로 넘기지 않고 `.env`/`.env.local` 값을 그대로 쓴다.

### 5.4 예시

```sh
scripts/start.sh                         # 전체 기동 (이미 떠 있으면 그대로 둠)
scripts/start.sh backend                 # backend만 기동
scripts/restart.sh frontend              # frontend만 재기동
scripts/stop.sh                          # 전체 중지 (DB는 유지)
FRONTEND_PORT=3100 BACKEND_PORT=8100 scripts/start.sh   # 다른 워크트리와 동시에 띄우기
```

## 6. 동작 흐름

### 6.1 start

1. 인자·포트 검증 → 실행 잠금 획득(6.5) → 워크트리 목록 로드
2. 사전 점검(9절): 필수 명령, env 파일, 의존성, Postgres
3. 서비스별(backend → frontend)로 6.2의 포트 충돌 처리
4. 기동: 로그 회전 → `set -m` + `nohup`으로 분리 실행 → PID 파일 기록
5. readiness 대기: 1초 간격으로 헬스 URL을 호출(요청 타임아웃 backend 3초, frontend 15초)해 200이면 성공
   - 기동한 래퍼 프로세스가 먼저 죽으면 즉시 실패
   - 실패 시 로그 마지막 40줄 출력 → 방금 띄운 프로세스 트리 정리 → PID 파일 삭제 → 종료 코드 1
6. 실측 재확인: 포트의 LISTEN 프로세스 cwd가 현재 워크트리 소속인지 확인하고 PID·cwd를 출력
7. 접속 URL, 로그 위치, 중지 명령 출력

### 6.2 워크트리 충돌 처리 흐름 (start)

```
포트 LISTEN PID 목록 조회 (lsof)
  └─ PID마다 cwd → 소유 워크트리 판별 (7.1)
        ├─ 무관(어느 워크트리에도 속하지 않음)
        │     ├─ --force 없음 → PID/명령/cwd 출력 후 실패(1)  ※ 아무것도 종료하지 않음
        │     └─ --force     → 종료 대상에 추가
        ├─ 다른 워크트리 → "포트 N: 다른 워크트리의 서비스가 사용 중 — <경로> (브랜치 X)" 출력, 종료 대상에 추가
        └─ 현재 워크트리
              ├─ (다른 점유자 없음) + 헬스체크 200 → "이미 실행 중" 출력, 성공(0)  ※ 멱등
              └─ 헬스체크 실패 → 경고 후 종료 대상에 추가(재기동)
PID 파일(보조): 같은 서비스·포트로 기록된 이 리포 프로세스가 살아 있으면(아직 LISTEN 전) 종료 대상에 추가
종료 대상마다 서비스 루트 찾기(7.2) → 프로세스 트리 수집(7.3) → SIGTERM → 최대 10초 → SIGKILL(7.5)
포트가 실제로 비었는지 확인(최대 10초) → 기동
```

### 6.3 stop

1. 포트 LISTEN 프로세스마다 소유 워크트리 판별
   - 이 리포의 워크트리(현재·다른 워크트리 모두): 소유 워크트리를 출력하고 종료 대상에 추가
   - 무관: `--force`면 종료, 아니면 경고만 출력하고 건드리지 않는다
2. PID 파일(보조): 같은 포트로 기록됐거나 **현재 워크트리가 다른 포트로 띄운** 같은 서비스가 살아 있으면 종료 대상에 추가. 그래서 포트 override로 띄운 서비스도 env 없이 `scripts/stop.sh`로 정리된다.
3. 프로세스 트리 종료 → 해당 포트들의 LISTEN이 사라졌는지 확인 → 프로세스가 없는 PID 파일 정리
4. 아무것도 떠 있지 않으면 "실행 중인 서비스가 없습니다"를 출력하고 성공(0). 무관한 프로세스만 남아 있어도 경고 후 0으로 끝난다(이 리포 서비스는 떠 있지 않으므로).
5. **DB 컨테이너는 중지하지 않는다.**

### 6.4 restart

- 잠금을 잡은 채로 `stop.sh` → `start.sh`를 실행한다. stop이 실패하면 start를 실행하지 않는다.
- 현재 워크트리 서비스가 떠 있으면 PID가 교체되고, 다른 워크트리 서비스가 떠 있으면 그 서비스를 종료한 뒤 현재 워크트리 서비스를 띄운다.

### 6.5 실행 잠금

- `${GAMJA_RUNTIME_DIR}/lock` 디렉토리를 `mkdir`로 만들 수 있을 때만 진행하고, 안에 소유 PID를 기록한다. 모든 워크트리가 같은 디렉토리를 쓰므로 워크트리 간에도 직렬화된다.
- 이미 잠겨 있으면 "다른 감자마켓 서비스 스크립트(PID N)가 실행 중"을 출력하고 최대 `GAMJA_LOCK_TIMEOUT`초 기다린다. 소유 PID가 죽어 있으면 잠금을 정리하고 진행한다.
- restart가 부르는 stop/start는 `GAMJA_SCRIPTS_LOCK_HELD=1`로 같은 잠금을 공유한다(기동되는 서비스 env에서는 이 변수를 지운다).
- 스크립트 종료(정상·오류·Ctrl-C) 시 EXIT trap으로 잠금을 해제한다.

## 7. 프로세스 판별 규칙

### 7.1 소유 워크트리 판별

- `git worktree list --porcelain`의 각 경로를 `pwd -P`로 정규화한다.
- LISTEN 프로세스의 cwd가 어떤 워크트리 경로와 같거나 그 하위이면 그 워크트리 소유다. 여러 개가 맞으면(워크트리 안에 워크트리가 중첩된 경우) **가장 긴 경로**를 택한다.
- 어느 워크트리에도 속하지 않으면 "무관한 프로세스"다.
- 출력 예: `/Users/…/projects/gamja-market (브랜치 develop)`, 현재 워크트리는 `(…, 현재 워크트리)`가 붙는다.

### 7.2 서비스 루트 찾기 (부모 방향)

LISTEN PID(예: `next-server`, uvicorn 워커)에서 부모로 올라가며 아래 조건을 **모두** 만족하는 동안 루트를 위로 옮긴다.

1. 부모 PID가 1보다 크다(launchd에서 멈춤).
2. 부모가 보호 대상(7.4)이 아니다.
3. 부모 명령줄이 서비스 또는 그 래퍼 형태다: `uvicorn`, `uv run`, `npm run`, `npm exec`, `npx`, `next dev`, `next start`, `next-server`.
   - 셸은 원칙적으로 통과시키지 않는다. 예외는 npm이 스크립트 실행용으로 띄운 `sh -c "next dev"`(부모가 npm/npx)뿐이다.
4. 부모의 cwd가 LISTEN 프로세스와 **같은 워크트리 소유**다(무관한 프로세스라면 둘 다 무관).

예) 메인 체크아웃에서 `zsh -c 'uv run uvicorn … | tee …'`로 띄운 backend
`uvicorn 워커(LISTEN) → uvicorn 리로더(LISTEN) → uv run → zsh -c(셸이라 멈춤)` → 루트는 `uv run`. `zsh`와 `tee`는 종료하지 않으며, 서비스가 끝나면 파이프가 닫혀 스스로 종료된다.

### 7.3 정리 대상 수집

- 루트와 **모든 자손**(`ps -axo pid,ppid` 스냅샷에서 너비 우선 탐색). 자손 중 보호 대상이 있으면 그 프로세스와 하위 트리는 건너뛰고 경고한다.
- **루트 자신이 프로세스 그룹 리더일 때만** 같은 그룹 구성원도 포함한다(부모가 이미 죽어 launchd로 재부모화된 워커까지 정리). 리더가 셸 등 서비스가 아닌 프로세스인 그룹은 통째로 건드리지 않는다. 그룹 구성원도 하나씩 보호 대상 여부를 확인한 뒤 PID 단위로 시그널을 보낸다(`kill -- -PGID`는 쓰지 않음).
- 스크립트가 직접 띄운 서비스는 `set -m` 덕분에 래퍼(`uv run`/`npm run dev`)가 그룹 리더이므로 그룹 단위 정리가 적용된다.

### 7.4 보호 대상 (어떤 경우에도 종료하지 않음, `--force` 포함)

| 대상 | 판별 |
| --- | --- |
| PID 1(launchd), PID 0 | PID ≤ 1 |
| 이 스크립트 자신과 모든 조상 | 시작 시 `$$`부터 부모 체인을 기록 (호출한 셸·터미널·Orca·에이전트 등) |
| 로그인 셸 | 실행 파일 이름이 `-`로 시작(`-zsh` 등) |
| 대화형 셸 | `sh/bash/zsh/fish/dash/ksh/mksh/tcsh/csh` 중 명령줄에 `-c`가 없는 것 |
| macOS 앱 번들 | 실행 파일 경로에 `.app/Contents/` 포함 (Terminal, iTerm2, Orca, VS Code, Cursor 등) |
| 터미널·멀티플렉서·에이전트 | `tmux`, `screen`, `sshd`, `login`, `Terminal`, `iTerm*`, `Orca*`, `Electron*`, `Code*`, `Cursor*`, `Warp*`, `wezterm*`, `kitty`, `alacritty`, `ghostty`, `Hyper`, `claude*` |

- `-c`로 실행된 비대화형 셸은 보호 대상은 아니지만 7.2 규칙상 루트로 올라가지 않으므로, 실제로 정리되는 셸은 서비스 루트의 자손인 경우(npm 스크립트의 `sh -c`)뿐이다.

### 7.5 종료 절차

1. 정리 대상 전체의 (PID, 시작 시각 `ps -o lstart`)를 기록한다.
2. 모든 대상에 SIGTERM을 보낸다.
3. 0.25초 간격으로 최대 `GAMJA_KILL_TIMEOUT`(10)초 동안 생존 여부를 확인한다. 생존 판정은 `kill -0` 성공 + 좀비 아님 + **시작 시각이 기록과 같음**(PID 재사용으로 다른 프로세스를 죽이지 않기 위함).
4. 남은 프로세스에 SIGKILL → 최대 5초 확인 → 그래도 남으면 실패(1).
5. 포트 LISTEN이 실제로 사라졌는지 확인한다(최대 10초).

- 참고: multiprocessing `resource_tracker`는 SIGTERM을 무시하지만 리로더가 종료되면 파이프가 닫혀 함께 종료된다.

## 8. 로그·PID·런타임 파일

### 8.1 로그

| 서비스 | 파일 | 회전 |
| --- | --- | --- |
| backend | `backend/logs/dev-server.log` | 기동할 때마다 기존 파일(비어 있지 않으면)을 `dev-server.log.1`로 옮기고 새로 쓴다(1세대 보관) |
| frontend | `frontend/logs/dev-server.log` | 동일 |

- 새 로그 첫 줄에 `=== <시각> <서비스> 기동 (worktree=…, port=…) ===` 헤더를 남긴다.
- stdout/stderr를 모두 기록한다. readiness 실패 시 마지막 40줄을 터미널에 출력한다.
- `--reload`는 `*.py` 변경만 재시작 대상으로 보므로 `backend/logs/`에 로그를 써도 재시작되지 않는다.

### 8.2 PID/메타 파일 (보조)

- 위치: `${GAMJA_RUNTIME_DIR}/<service>-<port>.pid` (기본 `${TMPDIR}/gamja-market/backend-8000.pid`)
- 기동 직후(readiness 대기 전) 기록하므로, readiness 대기 중 Ctrl-C로 스크립트를 끊어도 stop.sh가 서비스를 찾을 수 있다.
- 형식(`key=value`):

```
service=backend
port=8000
pid=70102                 # 래퍼(uv run / npm run dev) PID = 프로세스 그룹 ID
pgid=70102
lstart=Sat Oct 10 03:51:12 2026
worktree=/Users/…/festure-service-start-shell
started_at=2026-10-10T03:51:12+0900
log=/Users/…/backend/logs/dev-server.log
source=started            # started: 스크립트가 기동 / adopted: 이미 떠 있던 현재 워크트리 서비스를 기록
```

- **유효 판정**: PID 생존 + `lstart` 일치 + 서비스 명령줄 + cwd가 기록된 워크트리 소유. 하나라도 어긋나면 stale로 보고 삭제한다.
- 포트 점유 판단에는 쓰지 않는다. 쓰임새는 (1) 아직 LISTEN 전인 기동 중 프로세스 정리, (2) 포트 override로 띄운 현재 워크트리 서비스를 stop에서 찾기, 두 가지뿐이다.

### 8.3 잠금

- `${GAMJA_RUNTIME_DIR}/lock/pid` (6.5)

## 9. 사전 점검 (start / restart)

| 항목 | 동작 |
| --- | --- |
| 필수 명령 | `lsof`, `curl`, `ps` + backend면 `uv`, frontend면 `npm`. 없으면 실패. `git`이 없으면 경고(현재 워크트리만 인식) |
| `backend/.env` | 없으면 `backend/.env.example` 복사. **이미 있으면 절대 덮어쓰지 않는다**(심볼릭 링크 포함) |
| `frontend/.env.local` | 없으면 `frontend/.env.example` 복사. 이미 있으면 덮어쓰지 않는다 |
| `backend/.venv` | 없으면 `uv sync` |
| `frontend/node_modules` | 없으면 `npm ci` |
| Postgres | backend 대상일 때 `127.0.0.1:$POSTGRES_PORT`에 TCP 연결(bash `/dev/tcp`). 응답이 없으면 `docker compose -f compose.yaml up -d postgres` 후 컨테이너 health가 `healthy`가 될 때까지 대기. docker 명령이 없거나 데몬에 연결할 수 없으면 **경고만 하고 계속**(backend는 DB 없이도 기동되며 `/api/health`는 DB를 쓰지 않음) |

- stop은 `lsof`, `ps`만 확인한다.
- DB 마이그레이션은 사전 점검에 포함하지 않는다(2절 제외 항목 참고).
- 사전 점검(의존성 설치 포함)은 다른 워크트리 서비스를 종료하기 **전에** 끝내서 서비스 공백 시간을 줄인다.

## 10. 제약 사항

- **고정 포트**: 기본 포트(3000/8000)에서는 한 번에 한 워크트리의 서비스만 실행된다. start는 다른 워크트리 서비스를 종료하므로, 다른 사람·에이전트가 쓰고 있는 워크트리의 서버가 내려갈 수 있다. 동시에 띄워야 하면 포트를 override 한다.
- **공유 DB**: `compose.yaml`의 project name이 `gamja-market`으로 고정이라 모든 워크트리가 같은 Postgres 컨테이너와 데이터 볼륨을 쓴다. 스크립트는 DB를 중지하지 않고 마이그레이션도 실행하지 않는다. 한 워크트리에서 로컬 DB 스키마를 직접 올리면 다른 워크트리(다른 브랜치)에도 그대로 적용되므로 브랜치 간 마이그레이션 차이에 주의한다.
- **런타임 디렉토리 공유 전제**: PID 파일·잠금은 같은 사용자, 같은 `TMPDIR`일 때만 공유된다. 세션마다 `TMPDIR`이 다르면(일부 샌드박스 환경) 잠금이 공유되지 않으므로 `GAMJA_RUNTIME_DIR`을 같은 값으로 지정한다. 포트+cwd 실측 판단은 영향을 받지 않는다.
- **분리 수준**: `setsid`가 없어 세션은 분리하지 않는다. 대신 자체 프로세스 그룹 + `nohup`(SIGHUP 무시) + stdin `/dev/null`로 터미널의 Ctrl-C·종료와 분리한다.
- **macOS 전용 검증**: bash 3.2, BSD `ps`/`sed`/`sleep`(소수 초) 기준.

## 11. 트러블슈팅

| 증상 | 원인·대응 |
| --- | --- |
| `포트 N: 이 리포와 무관한 프로세스가 점유 중` 후 실패 | 출력된 PID/명령/cwd를 확인한다. 직접 종료하거나 `--force`로 다시 실행하거나 `FRONTEND_PORT`/`BACKEND_PORT`로 다른 포트를 쓴다 |
| `--force`인데도 종료되지 않음 | 점유 프로세스가 보호 대상(7.4, 예: 앱 번들)이다. 해당 앱에서 직접 종료한다 |
| `N초 안에 헬스체크(200)를 통과하지 못했습니다` | 출력된 로그 끝부분 확인. 첫 실행의 next dev 컴파일이 느리면 `GAMJA_FRONTEND_READY_TIMEOUT=180`처럼 늘린다. backend는 `.env` 설정 오류, import 에러가 흔하다 |
| `프로세스(PID N)가 기동 중 종료되었습니다` | 포트 경합(EADDRINUSE)이나 설정 오류. `*/logs/dev-server.log` 확인 |
| `SIGTERM 후 10초 안에 종료되지 않아 SIGKILL` 경고 | 서비스가 SIGTERM에 응답하지 않은 경우다. 검증 중 `uvicorn --reload` 리로더가 간헐적으로 SIGTERM 후 멈추는 현상이 한 번 관측됐고(재현 시도 8회에서는 재발 없음), SIGKILL로 정상 정리됐다. 반복되면 `GAMJA_KILL_TIMEOUT`을 줄이거나 로그를 확인한다 |
| `현재 워크트리 서비스가 … 헬스체크에 응답하지 않아 재기동합니다` | 프로세스가 멈췄거나(SIGSTOP, 디버거) 응답 불가 상태. 자동으로 재기동한다 |
| `Postgres(127.0.0.1:5432)가 응답하지 않습니다` 경고 | Docker Desktop을 켜고 다시 실행하거나 루트에서 `docker compose up -d postgres`. 그 사이 backend는 떠 있지만 DB를 쓰는 API(회원가입·로그인)는 실패한다 |
| `다른 감자마켓 서비스 스크립트(PID N)가 실행 중이라 … 기다립니다` | 다른 워크트리·터미널에서 스크립트가 실행 중이다. 소유 PID가 죽어 있으면 자동 정리된다. 강제로 풀려면 `rm -rf "${TMPDIR}/gamja-market/lock"` |
| 포트를 override 해서 띄운 서비스 중지 | 같은 env로 `stop.sh`를 실행하거나, env 없이 `scripts/stop.sh`만 실행해도 PID 파일 기준으로 현재 워크트리 서비스가 정리된다 |
| 스크립트 밖(터미널에서 `npm run dev`, `uv run … \| tee …`)에서 띄운 서비스 | 똑같이 cwd로 판별해 정리한다. 서비스를 감싼 셸·`tee`는 종료하지 않으며 서비스가 끝나면 스스로 종료된다 |
| readiness 대기 중 Ctrl-C | 서비스는 별도 프로세스 그룹이라 계속 기동된다. PID 파일이 이미 기록돼 있으므로 `scripts/stop.sh`로 정리하거나 `scripts/start.sh`로 상태를 다시 확인한다 |
| 첫 실행이 오래 걸림 | `backend/.venv`, `frontend/node_modules`가 없어 `uv sync`, `npm ci`를 실행하는 중이다 |

## 12. 완료 기준

확인 주체: **개발** = 개발 워커 자체 실측, **검증** = 독립 검증 워커 실측(13절), **코디네이터** = 코디네이터 재확인.

- [x] `bash -n scripts/*.sh scripts/lib/*.sh` 통과, shellcheck 경고 0 — 개발(shellcheck 0.11), 코디네이터(`--migrate` 제거 후 `bash -n`, `uvx --from shellcheck-py shellcheck -x` 0.11 재확인)
- [x] 다른 워크트리(메인 체크아웃) 서비스가 3000/8000에 떠 있을 때 `scripts/start.sh` → 기존 프로세스 트리 종료, 새 LISTEN 프로세스의 cwd가 현재 워크트리, 헬스 200. 메인 체크아웃의 셸·에이전트 프로세스는 살아 있다 — 개발, 검증(A)
- [x] `scripts/restart.sh` → LISTEN PID가 교체되고 헬스 200 — 개발, 검증(B)
- [x] `scripts/stop.sh` → 3000/8000 LISTEN 없음, 서비스 잔여 프로세스 없음, Postgres 컨테이너는 그대로 — 개발, 검증(C)
- [x] `scripts/start.sh` 2회 연속 실행 → 두 번 모두 "이미 실행 중", PID 불변, 종료 코드 0 — 개발, 검증(A')
- [x] 무관한 프로세스(`python3 -m http.server 8000`)가 포트를 점유하면 `--force` 없이 start/restart는 실패(1)하고 프로세스는 살아 있으며, stop은 건드리지 않는다. `--force`면 종료 후 기동한다 — 개발(전체), 검증(E: `start.sh backend` 거부만)
- [x] `FRONTEND_PORT=3100 BACKEND_PORT=8100`으로 기동하면 backend env에 `FRONTEND_ORIGIN=http://localhost:3100`, frontend env에 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8100`이 전달되고 CORS 프리플라이트가 `http://localhost:3100`을 허용한다 — 개발
- [x] readiness 실패 시 로그 끝부분 출력 + 기동한 프로세스 트리 정리 + 종료 코드 1 — 개발
- [x] 아무 디렉토리에서나 호출해도 동작하고, 아무것도 떠 있지 않을 때 stop은 안내 후 0으로 끝난다 — 검증(C: 빈 상태 stop), 코디네이터(`/`에서 `stop.sh` 호출 → 0)

## 13. 검증 결과

- 검증 일시: 2026-10-10 04:05–04:13 KST, 검증 워커(Codex `gpt-6.1-sol`, effort xhigh)
- 방식: 스크립트를 실제로 실행하고 `lsof`(포트·cwd), `ps`(프로세스 트리), `curl`(상태 코드)로 실측했다. 화면은 **Orca 내장 브라우저**(`orca tab create`/`goto`/`reload`/`snapshot`/`screenshot`)로 확인했다.
- 판정: **전 시나리오 PASS**, 결함 없음

### 13.1 시나리오별 결과

curl 열은 frontend `/` / backend `/api/health` / backend `/docs` 순서다. `000`은 연결 거부다.

| 시나리오 | 명령 → 종료 코드 | 관측 결과 | curl | 브라우저 확인 |
| --- | --- | --- | --- | --- |
| 준비 | 메인 체크아웃에서 `uvicorn --reload`, `npm run dev`를 직접 기동 | 3000·8000의 LISTEN cwd가 메인 체크아웃 | 200 / 200 / 200 | — |
| A. 다른 워크트리 교체 | `start.sh` → 0 | 메인 체크아웃 프로세스 7개 종료(backend: uvicorn 리로더·워커·resource_tracker, frontend: npm과 그 하위 프로세스 3개(next-server·빌드 워커 포함)). 새 LISTEN cwd가 현재 워크트리 | 200 / 200 / 200 | 감자마켓 헤더, 로그인·회원가입, 구매요청 9건 표시, Next.js 에러 오버레이 없음. 헬스 `{"status":"ok"}`, Swagger `감자마켓 API 0.1.0` |
| A'. 멱등성 | `start.sh` 재실행 → 0 | 두 서비스 모두 "이미 실행 중", LISTEN·래퍼 PID 불변 | 200 / 200 / 200 | — |
| B. 재기동 | `restart.sh` → 0 (2회) | 두 번 모두 LISTEN PID 교체, cwd는 현재 워크트리 | 200 / 200 / 200 | reload 후 홈·구매요청 카드(가격·지역·지원자 수) 정상 |
| C. 중지 | `stop.sh` → 0, 빈 상태에서 재실행 → 0 | 3000/8000 LISTEN 없음, 서비스 잔여 프로세스 없음 | 000 / 000 / 000 | reload 시 빈 오류 페이지, `goto`는 `ERR_CONNECTION_REFUSED` |
| D. 대상 인자 | `start.sh backend`, `start.sh frontend`, `restart.sh backend`, `stop.sh backend`, `stop.sh frontend` → 모두 0 | 지정한 서비스만 기동·교체·중지되고 다른 서비스 PID는 유지 | backend만 기동 시 000 / 200 / 200 | backend 중지 상태에서도 frontend 화면 정상(현재 홈 목록은 목업 데이터) |
| E. 무관 프로세스 보호 | 리포 밖에서 `python3 -m http.server 8000` 기동 후 `start.sh backend` → **1(기대값)** | 더미 PID·시작 시각·cwd 그대로, backend는 기동하지 않음. PID/명령/cwd와 `--force` 안내 출력 | 더미 `/` 200 | — |

- 공통: Postgres 컨테이너 `gamja-market-postgres-1`은 검증 내내 `healthy`였고 시작 시각도 그대로였다(DB 중지·재기동 없음).
- 무결성: 검증 전후 현재 워크트리 파일 111개, 메인 체크아웃 파일 106개의 SHA-256이 같았다(스크립트·문서·앱 코드 변경 없음).
- 종료 상태: 3000/8000 비어 있음, 검증용 브라우저 탭 모두 닫음. 메인 체크아웃 서비스는 다시 띄우지 않았다.

### 13.2 개발 워커 자체 실측 (검증 워커 범위 밖)

- 포트 override 시 env 전달과 CORS 허용 origin 반영
- readiness 실패 시 로그 tail 출력 + 프로세스 정리 + 종료 코드 1
- 워크트리 간 실행 잠금, stale PID 파일 정리
- SIGSTOP으로 멈춘 현재 워크트리 서비스 감지 후 재기동(SIGKILL 폴백)
- `restart.sh`의 무관 프로세스 거부, `stop.sh`의 무관 프로세스 보존, `--force` 종료 후 기동

### 13.3 미검증·관찰 사항

- **Postgres 자동 기동 분기**(`docker compose up -d postgres`)는 공유 DB를 내리지 않기 위해 가짜 `docker` 명령으로만 확인했다. DB가 실제로 꺼져 있을 때의 동작은 아직 실측하지 않았다.
- 개발 중 첫 `restart.sh`에서 `uvicorn --reload` 리로더가 SIGTERM 뒤 멈춰 10초 후 SIGKILL로 정리된 일이 한 번 있었다. 재현 시도 8회와 검증 워커의 재기동 3회에서는 다시 나타나지 않았다(11절 트러블슈팅 참고).
- macOS(bash 3.2)에서만 실행했다. Linux는 검증하지 않았다.

### 13.4 증거 위치 (로컬 전용, 커밋 대상 아님)

| 항목 | 경로 |
| --- | --- |
| 검증 보고서 | `backend/logs/service-scripts-verification.md` (`logs/*` gitignore) |
| 원본 증거(명령 출력 JSON, snapshot, 스크린샷) | `~/orca/verification/service-scripts-20261010-0404/` (리포 밖) |
| 서비스 실행 로그 | `backend/logs/dev-server.log`, `frontend/logs/dev-server.log` |

## 14. 작업 분담 및 경계

Orca orchestration으로 두 워커를 순서대로 실행했다(검증 태스크는 개발 태스크 완료에 의존).

| 워커 | 모델 | 수정 가능 범위 | 금지 |
| --- | --- | --- | --- |
| 개발 워커 | Claude Opus 5.5 (effort xhigh) | `scripts/**` 신규, 이 문서(`docs/specs/03-dev-service-scripts.md`), 필요 시 루트 `.gitignore` | `frontend/src`, `backend/app`, `compose.yaml`, 기존 스펙 문서, 다른 워크트리 파일 수정. commit/push |
| 검증 워커 | Codex `gpt-6.1-sol` (effort xhigh) | 없음(읽기 전용). 검증 보고서만 `backend/logs/`에 작성 | 리포·메인 체크아웃 파일 수정. 결함은 고치지 않고 재현 절차와 함께 보고 |

- 다른 워크트리 서비스 종료는 이 기능의 목적이므로 두 워커 모두 테스트 중 메인 체크아웃의 dev 서버를 종료할 수 있게 허용했다. 단, 메인 체크아웃 파일은 수정하지 않는다.
- 각 워커는 작업을 마칠 때 3000/8000을 비운 상태로 넘긴다.
- 루트 `.gitignore`는 바꿀 필요가 없었다(로그는 기존 `logs/*`, 런타임 파일은 리포 밖 `${TMPDIR}`).
- git commit 여부는 코디네이터 지시에 따른다.
