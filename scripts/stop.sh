#!/usr/bin/env bash
# 감자마켓 로컬 dev 서비스 중지. 설계: docs/specs/03-dev-service-scripts.md
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
사용법: scripts/stop.sh [all|frontend|backend] [--force] [-h|--help]

대상 포트를 점유한 감자마켓 dev 서비스를 종료한다. 어느 워크트리에서 띄웠든 이 리포의 서비스면
소유 워크트리를 출력하고 프로세스 트리(래퍼 uv run / npm run dev 와 모든 자손)를 정리한다.
DB(Postgres) 컨테이너는 모든 워크트리가 공유하므로 중지하지 않는다.

대상 (기본 all)
  all        frontend → backend 순서로 종료
  frontend   Next.js dev 서버만
  backend    FastAPI dev 서버만

옵션
  --force    이 리포와 무관한 프로세스가 포트를 점유하고 있어도 종료
  -h, --help 도움말

환경변수
  FRONTEND_PORT (기본 3000), BACKEND_PORT (기본 8000), GAMJA_KILL_TIMEOUT (기본 10),
  GAMJA_RUNTIME_DIR (기본 ${TMPDIR}/gamja-market)
EOF
}

gm_parse_args "$@"
gm_require_cmds lsof ps
gm_acquire_lock
gm_print_header stop

for svc in $(gm_services stop); do
  if ! gm_stop_service "$svc"; then
    gm_error "[$svc] 종료에 실패했습니다."
    exit 1
  fi
done
