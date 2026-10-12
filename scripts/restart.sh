#!/usr/bin/env bash
# 감자마켓 로컬 dev 서비스 재기동(stop → start). 설계: docs/specs/03-dev-service-scripts.md
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
사용법: scripts/restart.sh [all|frontend|backend] [--force] [-h|--help]

scripts/stop.sh 후 scripts/start.sh 를 실행한다. 인자는 그대로 전달한다.

대상 (기본 all)
  all | frontend | backend

옵션
  --force    이 리포와 무관한 프로세스가 포트를 점유하고 있어도 종료
  -h, --help 도움말

환경변수는 start.sh / stop.sh 와 같다(FRONTEND_PORT, BACKEND_PORT 등).
EOF
}

gm_parse_args "$@"
gm_acquire_lock # 하위 stop/start 는 GAMJA_SCRIPTS_LOCK_HELD=1 로 같은 잠금을 공유한다

stop_args="$GM_TARGET"
if [ "$GM_FORCE" = 1 ]; then stop_args="$stop_args --force"; fi

# shellcheck disable=SC2086 # stop_args 는 의도적으로 단어 분리한다
"$BASH" "$SCRIPT_DIR/stop.sh" $stop_args
"$BASH" "$SCRIPT_DIR/start.sh" "$@"
