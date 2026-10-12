#!/usr/bin/env bash
# 감자마켓 로컬 dev 서비스 기동. 설계: docs/specs/03-dev-service-scripts.md
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
사용법: scripts/start.sh [all|frontend|backend] [--force] [-h|--help]

현재 워크트리의 감자마켓 dev 서비스를 백그라운드로 기동하고 헬스체크가 통과할 때까지 기다린다.
  backend : uv run uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT --reload
  frontend: npm run dev -- --port $FRONTEND_PORT

대상 (기본 all)
  all        backend → frontend 순서로 기동
  frontend   Next.js dev 서버만
  backend    FastAPI dev 서버만

옵션
  --force    이 리포와 무관한 프로세스가 포트를 점유하고 있어도 종료하고 기동
  -h, --help 도움말

동작
  - 같은 리포의 다른 워크트리 서비스가 포트를 쓰고 있으면 그 워크트리를 출력하고 종료한 뒤 기동한다.
  - 현재 워크트리 서비스가 이미 떠 있고 헬스체크가 정상이면 다시 띄우지 않는다(멱등).
  - 무관한 프로세스가 포트를 점유하면 --force 없이는 종료하지 않고 실패한다.

환경변수
  FRONTEND_PORT (기본 3000), BACKEND_PORT (기본 8000)
    override 시 backend에 FRONTEND_ORIGIN, frontend에 NEXT_PUBLIC_API_BASE_URL을 맞춰 넘긴다.
  GAMJA_BACKEND_READY_TIMEOUT (기본 60), GAMJA_FRONTEND_READY_TIMEOUT (기본 90),
  GAMJA_KILL_TIMEOUT (기본 10), GAMJA_RUNTIME_DIR (기본 ${TMPDIR}/gamja-market)

로그: backend/logs/dev-server.log, frontend/logs/dev-server.log (직전 로그는 *.log.1)
EOF
}

gm_parse_args "$@"
gm_acquire_lock
gm_print_header start

gm_step "사전 점검"
gm_preflight_start

for svc in $(gm_services start); do
  if ! gm_start_service "$svc"; then
    gm_error "[$svc] 기동에 실패했습니다."
    exit 1
  fi
done

gm_step "실행 중"
for svc in $(gm_services start); do
  port=$(gm_service_port "$svc")
  if [ "$svc" = "backend" ]; then
    gm_info "backend : $(gm_public_url "$svc" "$port")  (API 문서 $(gm_public_url "$svc" "$port")/docs)  로그 $(gm_rel "$(gm_service_log "$svc")")"
  else
    gm_info "frontend: $(gm_public_url "$svc" "$port")  로그 $(gm_rel "$(gm_service_log "$svc")")"
  fi
done
if [ "$GM_PORTS_OVERRIDDEN" = 1 ]; then
  gm_info "중지: FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT scripts/stop.sh $GM_TARGET"
else
  gm_info "중지: scripts/stop.sh $GM_TARGET"
fi
