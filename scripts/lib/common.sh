# shellcheck shell=bash
# 감자마켓 로컬 dev 서비스 스크립트(start.sh / stop.sh / restart.sh) 공통 함수.
#
# - 단독 실행하지 않고 scripts/*.sh 에서 source 한다.
# - macOS 기본 /bin/bash 3.2 호환을 유지한다: 연관배열, ${var,,}, wait -n, mapfile, BASHPID 사용 금지.
#   빈 배열 + set -u 문제를 피하려고 배열 대신 공백 구분 문자열을 쓴다.
# - BSD 도구 기준으로 작성한다: GNU timeout, readlink -f, sed -i 사용 금지.
# - 판단의 1차 근거는 항상 "포트 LISTEN 프로세스 + 그 cwd" 실측이고, PID 파일은 보조 기록이다.

# ---------------------------------------------------------------------------
# 경로·설정
# ---------------------------------------------------------------------------
GM_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
GM_SCRIPTS_DIR=$(cd "$GM_LIB_DIR/.." && pwd -P)
GM_REPO_ROOT=$(cd "$GM_SCRIPTS_DIR/.." && pwd -P)
GM_BACKEND_DIR="$GM_REPO_ROOT/backend"
GM_FRONTEND_DIR="$GM_REPO_ROOT/frontend"

GM_DEFAULT_FRONTEND_PORT=3000
GM_DEFAULT_BACKEND_PORT=8000
FRONTEND_PORT=${FRONTEND_PORT:-$GM_DEFAULT_FRONTEND_PORT}
BACKEND_PORT=${BACKEND_PORT:-$GM_DEFAULT_BACKEND_PORT}

GM_DB_HOST=127.0.0.1
GM_DB_PORT=${POSTGRES_PORT:-5432}

GM_KILL_TIMEOUT=${GAMJA_KILL_TIMEOUT:-10}
GM_BACKEND_READY_TIMEOUT=${GAMJA_BACKEND_READY_TIMEOUT:-60}
GM_FRONTEND_READY_TIMEOUT=${GAMJA_FRONTEND_READY_TIMEOUT:-90}
GM_DB_READY_TIMEOUT=${GAMJA_DB_READY_TIMEOUT:-60}
GM_LOCK_TIMEOUT=${GAMJA_LOCK_TIMEOUT:-300}

# 모든 워크트리가 공유하는 런타임 디렉토리(PID/메타 파일, 실행 잠금)
GM_TMP_BASE=${TMPDIR:-/tmp}
GM_RUNTIME_DIR=${GAMJA_RUNTIME_DIR:-${GM_TMP_BASE%/}/gamja-market}

GM_TARGET=all
GM_FORCE=0
GM_LAUNCHED_PID=""
GM_LOCK_DIR=""
GM_WORKTREES=""

# ---------------------------------------------------------------------------
# 출력
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  GM_C_RESET=$'\033[0m'
  GM_C_BOLD=$'\033[1m'
  GM_C_RED=$'\033[31m'
  GM_C_GREEN=$'\033[32m'
  GM_C_YELLOW=$'\033[33m'
  GM_C_BLUE=$'\033[34m'
else
  GM_C_RESET=""
  GM_C_BOLD=""
  GM_C_RED=""
  GM_C_GREEN=""
  GM_C_YELLOW=""
  GM_C_BLUE=""
fi

gm_step() { printf '%s==>%s %s%s%s\n' "$GM_C_BLUE" "$GM_C_RESET" "$GM_C_BOLD" "$*" "$GM_C_RESET"; }
gm_info() { printf '    %s\n' "$*"; }
gm_ok() { printf '%s  ✔%s %s\n' "$GM_C_GREEN" "$GM_C_RESET" "$*"; }
gm_warn() { printf '%s  ! 경고:%s %s\n' "$GM_C_YELLOW" "$GM_C_RESET" "$*" >&2; }
gm_error() { printf '%s  ✘ 오류:%s %s\n' "$GM_C_RED" "$GM_C_RESET" "$*" >&2; }
gm_die() {
  gm_error "$*"
  exit 1
}

# 리포 루트 기준 상대 경로로 표시
gm_rel() {
  case $1 in
    "$GM_REPO_ROOT"/*) printf '%s' "${1#"$GM_REPO_ROOT"/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# ---------------------------------------------------------------------------
# 인자 처리
# ---------------------------------------------------------------------------
# 사용법: gm_parse_args "$@"
# 호출 스크립트는 usage 함수를 먼저 정의해야 한다.
gm_parse_args() {
  local target=""
  while [ $# -gt 0 ]; do
    case $1 in
      -h | --help)
        usage
        exit 0
        ;;
      --force)
        GM_FORCE=1
        ;;
      all | frontend | backend)
        if [ -n "$target" ]; then
          usage >&2
          gm_die "대상은 하나만 지정할 수 있습니다: '$target', '$1'"
        fi
        target=$1
        ;;
      *)
        usage >&2
        gm_die "알 수 없는 인자입니다: $1"
        ;;
    esac
    shift
  done
  GM_TARGET=${target:-all}
  gm_validate_ports
}

gm_validate_port() {
  case $2 in
    '' | *[!0-9]*) gm_die "$1 값이 올바른 포트 번호가 아닙니다: '$2'" ;;
  esac
  if [ "$2" -lt 1 ] || [ "$2" -gt 65535 ]; then
    gm_die "$1 값이 포트 범위(1~65535)를 벗어났습니다: $2"
  fi
}

gm_validate_ports() {
  gm_validate_port FRONTEND_PORT "$FRONTEND_PORT"
  gm_validate_port BACKEND_PORT "$BACKEND_PORT"
  if [ "$FRONTEND_PORT" = "$BACKEND_PORT" ]; then
    gm_die "FRONTEND_PORT와 BACKEND_PORT가 같습니다: $FRONTEND_PORT"
  fi
  # 포트를 override 하면 CORS origin / API 주소를 실행 프로세스 env로 함께 넘긴다.
  if [ "$FRONTEND_PORT" != "$GM_DEFAULT_FRONTEND_PORT" ] || [ "$BACKEND_PORT" != "$GM_DEFAULT_BACKEND_PORT" ]; then
    GM_PORTS_OVERRIDDEN=1
  else
    GM_PORTS_OVERRIDDEN=0
  fi
  GM_FRONTEND_ORIGIN="http://localhost:$FRONTEND_PORT"
  GM_API_BASE_URL="http://localhost:$BACKEND_PORT"
}

# 대상 → 서비스 목록. start는 backend → frontend, stop은 frontend → backend 순서.
gm_services() {
  case "$GM_TARGET:$1" in
    all:start) printf '%s' "backend frontend" ;;
    all:stop) printf '%s' "frontend backend" ;;
    *) printf '%s' "$GM_TARGET" ;;
  esac
}

gm_service_port() {
  case $1 in
    backend) printf '%s' "$BACKEND_PORT" ;;
    frontend) printf '%s' "$FRONTEND_PORT" ;;
  esac
}

gm_port_env() {
  case $1 in
    backend) printf '%s' "BACKEND_PORT" ;;
    frontend) printf '%s' "FRONTEND_PORT" ;;
  esac
}

gm_service_dir() {
  case $1 in
    backend) printf '%s' "$GM_BACKEND_DIR" ;;
    frontend) printf '%s' "$GM_FRONTEND_DIR" ;;
  esac
}

gm_service_log() { printf '%s/logs/dev-server.log' "$(gm_service_dir "$1")"; }

gm_health_url() {
  case $1 in
    backend) printf 'http://127.0.0.1:%s/api/health' "$2" ;;
    frontend) printf 'http://localhost:%s/' "$2" ;;
  esac
}

gm_public_url() { printf 'http://localhost:%s' "$2"; }

# ---------------------------------------------------------------------------
# 프로세스 조회
# ---------------------------------------------------------------------------
gm_ps_field() { # <ps 필드> <pid>
  ps -o "$1=" -p "$2" 2>/dev/null | sed -e 's/^ *//' -e 's/ *$//' || true
}

gm_proc_alive() {
  local stat
  kill -0 "$1" 2>/dev/null || return 1
  stat=$(gm_ps_field stat "$1")
  case $stat in
    '' | Z*) return 1 ;;
  esac
  return 0
}

gm_proc_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true
}

gm_describe_pid() { # 사람이 읽을 한 줄 설명(PID, 명령, cwd)
  local args cwd
  args=$(gm_ps_field args "$1")
  cwd=$(gm_proc_cwd "$1")
  if [ "${#args}" -gt 140 ]; then args="${args:0:137}..."; fi
  printf 'PID %s | %s | cwd=%s' "$1" "${args:-?}" "${cwd:-?}"
}

gm_port_listeners() { # 포트를 LISTEN 중인 PID 목록(공백 구분)
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | sort -un | tr '\n' ' ' || true
}

gm_unique_words() { printf '%s\n' "$@" | awk 'NF && !seen[$0]++' | tr '\n' ' '; }

# 이 스크립트 자신과 조상 프로세스(호출한 셸, 터미널, Orca 등)는 어떤 경우에도 종료하지 않는다.
GM_SELF_ANCESTORS=" "
gm__p=$$
while [ -n "$gm__p" ] && [ "$gm__p" -gt 1 ] 2>/dev/null; do
  GM_SELF_ANCESTORS="$GM_SELF_ANCESTORS$gm__p "
  gm__p=$(gm_ps_field ppid "$gm__p")
done
unset gm__p

gm_comm_base() {
  local c
  c=$(gm_ps_field comm "$1")
  c=${c##*/}
  printf '%s' "${c#-}"
}

gm_is_shell() {
  case "$(gm_comm_base "$1")" in
    sh | bash | zsh | fish | dash | ksh | mksh | tcsh | csh) return 0 ;;
  esac
  return 1
}

# 절대 종료하면 안 되는 프로세스: PID 1, 자기 자신·조상, 로그인/대화형 셸,
# macOS 앱 번들(터미널·Orca·IDE), 터미널 멀티플렉서 등.
gm_is_protected() {
  local pid=$1 comm base args
  case $pid in
    '' | *[!0-9]*) return 0 ;;
  esac
  [ "$pid" -gt 1 ] || return 0
  case "$GM_SELF_ANCESTORS" in
    *" $pid "*) return 0 ;;
  esac
  comm=$(gm_ps_field comm "$pid")
  base=${comm##*/}
  case $base in
    -*) return 0 ;; # 로그인 셸(-zsh 등)
  esac
  case $comm in
    *.app/Contents/*) return 0 ;;
  esac
  case $base in
    launchd | login | sshd | tmux* | screen | Terminal | iTerm* | Orca* | orca* | Electron* | Code* | Cursor* | Warp* | \
      wezterm* | kitty | alacritty | Alacritty | ghostty | Ghostty | Hyper | claude*)
      return 0
      ;;
  esac
  if gm_is_shell "$pid"; then
    # 셸은 `-c` 로 실행된 비대화형 래퍼(npm 스크립트의 sh -c 등)만 정리 대상이 될 수 있다.
    args=$(gm_ps_field args "$pid")
    case " $args " in
      *" -c "* | *" -lc "*) return 1 ;;
    esac
    return 0
  fi
  return 1
}

# dev 서비스 또는 그 래퍼(uv run, npm run dev, next dev 등)의 명령줄인지
gm_is_service_cmd() {
  local args
  args=" $(gm_ps_field args "$1") "
  case $args in
    *uvicorn* | *" uv run "* | *"/uv run "*) return 0 ;;
    *next-server* | *" next dev"* | *"/next dev"* | *" next start"* | *"/next start"*) return 0 ;;
    *"npm run "* | *"npm exec "* | *" npx "* | *"/npx "*) return 0 ;;
  esac
  return 1
}

gm__is_npm_cmd() {
  case " $(gm_ps_field args "$1") " in
    *"npm run "* | *"npm exec "* | *" npx "* | *"/npx "*) return 0 ;;
  esac
  return 1
}

# ---------------------------------------------------------------------------
# 워크트리 판별
# ---------------------------------------------------------------------------
gm_load_worktrees() { # GM_WORKTREES: "경로<TAB>브랜치" 줄 목록(경로는 pwd -P로 정규화)
  local raw line path="" branch=""
  GM_WORKTREES=""
  raw=$(git -C "$GM_REPO_ROOT" worktree list --porcelain 2>/dev/null || true)
  while IFS= read -r line; do
    case $line in
      "worktree "*)
        if [ -n "$path" ]; then gm__add_worktree "$path" "$branch"; fi
        path=${line#worktree }
        branch=""
        ;;
      "branch "*) branch=${line#branch refs/heads/} ;;
      detached) branch="(detached HEAD)" ;;
    esac
  done <<EOF
$raw
EOF
  if [ -n "$path" ]; then gm__add_worktree "$path" "$branch"; fi
  case "$GM_WORKTREES" in
    "$GM_REPO_ROOT"$'\t'* | *$'\n'"$GM_REPO_ROOT"$'\t'*) ;;
    *) gm__add_worktree "$GM_REPO_ROOT" "" ;;
  esac
}

gm__add_worktree() {
  local p=$1
  if [ -d "$p" ]; then p=$(cd "$p" 2>/dev/null && pwd -P) || p=$1; fi
  GM_WORKTREES="$GM_WORKTREES$p"$'\t'"$2"$'\n'
}

# 경로가 속한 이 리포의 워크트리(가장 긴 접두 일치). 없으면 빈 문자열.
gm_owner_worktree() {
  local path=$1 best="" wt _branch
  [ -n "$path" ] || return 0
  while IFS=$'\t' read -r wt _branch; do
    [ -n "$wt" ] || continue
    case "$path/" in
      "$wt"/*)
        if [ "${#wt}" -gt "${#best}" ]; then best=$wt; fi
        ;;
    esac
  done <<EOF
$GM_WORKTREES
EOF
  printf '%s' "$best"
}

gm_worktree_label() {
  local wt=$1 line branch=""
  while IFS= read -r line; do
    case $line in
      "$wt"$'\t'*) branch=${line#*$'\t'} ;;
    esac
  done <<EOF
$GM_WORKTREES
EOF
  if [ "$wt" = "$GM_REPO_ROOT" ]; then
    printf '%s (브랜치 %s, 현재 워크트리)' "$wt" "${branch:-?}"
  else
    printf '%s (브랜치 %s)' "$wt" "${branch:-?}"
  fi
}

# ---------------------------------------------------------------------------
# 프로세스 트리 정리
# ---------------------------------------------------------------------------
# LISTEN PID에서 부모 방향으로 올라가며 같은 워크트리의 서비스 래퍼(uv run, npm run dev, next dev 등)까지
# 서비스 루트를 찾는다. 보호 대상(셸·터미널·Orca·자기 자신)이나 서비스가 아닌 부모를 만나면 멈춘다.
gm_find_root() { # <listener pid> <소유 워크트리(무관하면 빈 문자열)>
  local cur=$1 owner=$2 parent gparent
  while :; do
    parent=$(gm_ps_field ppid "$cur")
    case $parent in
      '' | *[!0-9]*) break ;;
    esac
    [ "$parent" -gt 1 ] || break
    if gm_is_protected "$parent"; then break; fi
    if gm_is_shell "$parent"; then
      # npm이 스크립트 실행용으로 띄운 `sh -c "next dev"` 만 통과
      gparent=$(gm_ps_field ppid "$parent")
      if [ -z "$gparent" ] || ! gm__is_npm_cmd "$gparent"; then break; fi
    elif ! gm_is_service_cmd "$parent"; then
      break
    fi
    if [ "$(gm_owner_worktree "$(gm_proc_cwd "$parent")")" != "$owner" ]; then break; fi
    cur=$parent
  done
  printf '%s' "$cur"
}

# 루트와 모든 자손 + (루트가 리더인 경우에만) 같은 프로세스 그룹 구성원. 보호 대상은 제외한다.
gm_collect_tree() { # <root pid>
  local root=$1 snapshot out queue next pid child
  snapshot=$(ps -axo pid=,ppid=,pgid= 2>/dev/null || true)
  out=" $root "
  queue=$root
  while [ -n "$queue" ]; do
    next=""
    for pid in $queue; do
      for child in $(printf '%s\n' "$snapshot" | awk -v p="$pid" '$2 == p { print $1 }'); do
        case "$out" in
          *" $child "*) continue ;;
        esac
        if gm_is_protected "$child"; then
          gm_warn "보호 대상 프로세스는 종료하지 않습니다: $(gm_describe_pid "$child")"
          continue
        fi
        out="$out$child "
        next="$next $child"
      done
    done
    queue=$next
  done
  # 리더가 서비스 루트 자신인 그룹만 함께 정리한다(셸이 리더인 그룹은 통째로 건드리지 않음).
  if [ "$(gm_ps_field pgid "$root")" = "$root" ]; then
    for pid in $(printf '%s\n' "$snapshot" | awk -v g="$root" '$3 == g { print $1 }'); do
      case "$out" in
        *" $pid "*) continue ;;
      esac
      if gm_is_protected "$pid"; then continue; fi
      out="$out$pid "
    done
  fi
  printf '%s' "$out"
}

# 기록해 둔 (pid, 시작시각)이 아직 살아 있는 PID만 출력(PID 재사용 방지)
gm__still_alive() { # <"pid|lstart" 줄 목록>
  local line pid lstart
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    pid=${line%%|*}
    lstart=${line#*|}
    if gm_proc_alive "$pid" && [ "$(gm_ps_field lstart "$pid")" = "$lstart" ]; then
      printf '%s ' "$pid"
    fi
  done <<EOF
$1
EOF
}

# SIGTERM → 최대 GM_KILL_TIMEOUT초 대기 → 남은 프로세스 SIGKILL
gm_terminate_pids() { # <pid>...
  local pid lstart records="" remaining i max
  [ $# -gt 0 ] || return 0
  for pid in "$@"; do
    lstart=$(gm_ps_field lstart "$pid")
    [ -n "$lstart" ] || continue # 이미 종료됨
    records="$records$pid|$lstart"$'\n'
    kill -TERM "$pid" 2>/dev/null || true
  done
  i=0
  max=$((GM_KILL_TIMEOUT * 4))
  while :; do
    remaining=$(gm__still_alive "$records")
    [ -n "$remaining" ] || return 0
    [ "$i" -lt "$max" ] || break
    sleep 0.25
    i=$((i + 1))
  done
  gm_warn "SIGTERM 후 ${GM_KILL_TIMEOUT}초 안에 종료되지 않아 SIGKILL 합니다: $remaining"
  for pid in $remaining; do kill -KILL "$pid" 2>/dev/null || true; done
  i=0
  while [ "$i" -lt 20 ]; do
    remaining=$(gm__still_alive "$records")
    [ -n "$remaining" ] || return 0
    sleep 0.25
    i=$((i + 1))
  done
  gm_error "프로세스를 종료하지 못했습니다: $remaining"
  return 1
}

gm_kill_roots() { # <라벨> <루트 pid>...
  local label=$1 root all="" pid
  shift
  for root in "$@"; do all="$all $(gm_collect_tree "$root")"; done
  # shellcheck disable=SC2086 # PID 목록은 의도적으로 단어 분리한다
  all=$(gm_unique_words $all)
  [ -n "${all// /}" ] || return 0
  gm_info "[$label] 프로세스 트리 종료 (SIGTERM → 최대 ${GM_KILL_TIMEOUT}초 → SIGKILL):"
  for pid in $all; do
    gm_info "    - PID $pid (ppid $(gm_ps_field ppid "$pid")) $(gm_ps_field args "$pid" | cut -c 1-110)"
  done
  # shellcheck disable=SC2086
  gm_terminate_pids $all
}

gm_wait_port_free() { # <port> [초]
  local i=0 max=$((${2:-10} * 4)) left
  while :; do
    left=$(gm_port_listeners "$1")
    [ -n "${left// /}" ] || return 0
    [ "$i" -lt "$max" ] || break
    sleep 0.25
    i=$((i + 1))
  done
  gm_error "포트 $1: 아직 LISTEN 중인 프로세스가 있습니다(PID $left)"
  return 1
}

# ---------------------------------------------------------------------------
# PID/메타 파일 (보조 기록)
# ---------------------------------------------------------------------------
gm_pidfile() { printf '%s/%s-%s.pid' "$GM_RUNTIME_DIR" "$1" "$2"; }

gm_meta_get() { # <파일> <키>
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1 || true
}

gm_write_pidfile() { # <svc> <port> <pid> <source: started|adopted>
  local file tmp
  mkdir -p "$GM_RUNTIME_DIR"
  file=$(gm_pidfile "$1" "$2")
  tmp="$file.tmp.$$"
  {
    printf 'service=%s\n' "$1"
    printf 'port=%s\n' "$2"
    printf 'pid=%s\n' "$3"
    printf 'pgid=%s\n' "$(gm_ps_field pgid "$3")"
    printf 'lstart=%s\n' "$(gm_ps_field lstart "$3")"
    printf 'worktree=%s\n' "$GM_REPO_ROOT"
    printf 'started_at=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
    printf 'log=%s\n' "$(gm_service_log "$1")"
    printf 'source=%s\n' "$4"
  } >"$tmp"
  mv -f "$tmp" "$file"
}

# PID 파일의 프로세스가 (살아 있음 + 시작시각 일치 + 서비스 명령 + cwd가 기록된 워크트리)면 PID 출력
gm_pidfile_live() { # <파일>
  local pid lstart wt
  pid=$(gm_meta_get "$1" pid)
  lstart=$(gm_meta_get "$1" lstart)
  wt=$(gm_meta_get "$1" worktree)
  case $pid in
    '' | *[!0-9]*) return 1 ;;
  esac
  gm_proc_alive "$pid" || return 1
  [ "$(gm_ps_field lstart "$pid")" = "$lstart" ] || return 1
  gm_is_service_cmd "$pid" || return 1
  [ "$(gm_owner_worktree "$(gm_proc_cwd "$pid")")" = "$wt" ] || return 1
  printf '%s' "$pid"
}

gm_prune_stale_pidfiles() { # <svc>
  local f
  for f in "$GM_RUNTIME_DIR/$1"-*.pid; do
    [ -f "$f" ] || continue
    if ! gm_pidfile_live "$f" >/dev/null; then
      rm -f "$f"
      gm_info "PID 파일 정리(프로세스 없음): $f"
    fi
  done
}

# ---------------------------------------------------------------------------
# 실행 잠금 (워크트리 간 동시 실행 방지)
# ---------------------------------------------------------------------------
gm_acquire_lock() {
  local lockdir="$GM_RUNTIME_DIR/lock" holder waited=0
  if [ "${GAMJA_SCRIPTS_LOCK_HELD:-}" = "1" ]; then return 0; fi
  mkdir -p "$GM_RUNTIME_DIR"
  while ! mkdir "$lockdir" 2>/dev/null; do
    holder=$(cat "$lockdir/pid" 2>/dev/null || true)
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      gm_warn "종료된 프로세스(PID $holder)의 잠금을 정리합니다: $lockdir"
      rm -rf "$lockdir"
      continue
    fi
    if [ -z "$holder" ] && [ "$waited" -ge 5 ]; then
      rm -rf "$lockdir"
      continue
    fi
    if [ "$waited" -eq 0 ]; then
      gm_info "다른 감자마켓 서비스 스크립트(PID ${holder:-?})가 실행 중이라 끝날 때까지 기다립니다..."
    fi
    if [ "$waited" -ge "$GM_LOCK_TIMEOUT" ]; then
      gm_die "${GM_LOCK_TIMEOUT}초 동안 잠금을 얻지 못했습니다: $lockdir (PID ${holder:-?})"
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo $$ >"$lockdir/pid"
  GM_LOCK_DIR=$lockdir
  export GAMJA_SCRIPTS_LOCK_HELD=1
  trap gm_release_lock EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

gm_release_lock() {
  if [ -n "$GM_LOCK_DIR" ] && [ "$(cat "$GM_LOCK_DIR/pid" 2>/dev/null || true)" = "$$" ]; then
    rm -rf "$GM_LOCK_DIR"
  fi
}

# ---------------------------------------------------------------------------
# 사전 점검
# ---------------------------------------------------------------------------
gm_require_cmds() {
  local c missing=""
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || missing="$missing $c"
  done
  if [ -n "$missing" ]; then
    gm_die "필수 명령을 찾을 수 없습니다:$missing (설치 후 다시 실행하세요)"
  fi
}

gm_ensure_env_file() { # <대상> <예시 파일>  (대상이 이미 있으면 절대 덮어쓰지 않음)
  if [ -e "$1" ] || [ -L "$1" ]; then return 0; fi
  if [ ! -f "$2" ]; then
    gm_warn "$(gm_rel "$1") 없음, 예시 파일 $(gm_rel "$2") 도 없어 생성을 건너뜁니다."
    return 0
  fi
  cp "$2" "$1"
  gm_info "$(gm_rel "$1") 없음 → $(gm_rel "$2") 복사"
}

gm_tcp_open() { (exec 3<>"/dev/tcp/$1/$2") >/dev/null 2>&1; }

gm_ensure_db() {
  local compose="$GM_REPO_ROOT/compose.yaml" start cid status
  if gm_tcp_open "$GM_DB_HOST" "$GM_DB_PORT"; then
    gm_info "Postgres 응답 확인 ($GM_DB_HOST:$GM_DB_PORT)"
    return 0
  fi
  gm_warn "Postgres($GM_DB_HOST:$GM_DB_PORT)가 응답하지 않습니다."
  if ! command -v docker >/dev/null 2>&1; then
    gm_warn "docker 명령이 없어 Postgres를 자동으로 띄울 수 없습니다. Docker를 설치하거나 Postgres를 직접 띄우세요."
    gm_warn "백엔드는 기동되지만 DB를 쓰는 API(회원가입·로그인 등)는 실패합니다."
    return 0
  fi
  if ! docker info >/dev/null 2>&1; then
    gm_warn "Docker 데몬에 연결할 수 없습니다(Docker Desktop 실행 여부 확인). DB를 쓰는 API는 실패합니다."
    return 0
  fi
  gm_info "docker compose up -d postgres (compose project 'gamja-market' — 모든 워크트리 공유)"
  if ! docker compose -f "$compose" up -d postgres; then
    gm_warn "docker compose up 에 실패했습니다. DB를 쓰는 API는 실패합니다."
    return 0
  fi
  start=$SECONDS
  while [ $((SECONDS - start)) -lt "$GM_DB_READY_TIMEOUT" ]; do
    cid=$(docker compose -f "$compose" ps -q postgres 2>/dev/null || true)
    status=""
    if [ -n "$cid" ]; then
      status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)
    fi
    if [ "$status" = "healthy" ] && gm_tcp_open "$GM_DB_HOST" "$GM_DB_PORT"; then
      gm_info "Postgres healthy ($GM_DB_HOST:$GM_DB_PORT)"
      return 0
    fi
    sleep 2
  done
  gm_warn "${GM_DB_READY_TIMEOUT}초 안에 Postgres가 healthy 상태가 되지 않았습니다(상태: ${status:-알 수 없음})."
  return 0
}

gm_preflight_start() {
  local svc need="lsof curl ps"
  for svc in $(gm_services start); do
    case $svc in
      backend) need="$need uv" ;;
      frontend) need="$need npm" ;;
    esac
  done
  # shellcheck disable=SC2086
  gm_require_cmds $need
  command -v git >/dev/null 2>&1 || gm_warn "git이 없어 다른 워크트리를 판별할 수 없습니다(현재 워크트리만 인식)."

  for svc in $(gm_services start); do
    case $svc in
      backend)
        gm_ensure_env_file "$GM_BACKEND_DIR/.env" "$GM_BACKEND_DIR/.env.example"
        if [ ! -d "$GM_BACKEND_DIR/.venv" ]; then
          gm_info "backend/.venv 없음 → uv sync"
          (cd "$GM_BACKEND_DIR" && uv sync) || gm_die "uv sync 에 실패했습니다."
        fi
        gm_ensure_db
        ;;
      frontend)
        gm_ensure_env_file "$GM_FRONTEND_DIR/.env.local" "$GM_FRONTEND_DIR/.env.example"
        if [ ! -d "$GM_FRONTEND_DIR/node_modules" ]; then
          gm_info "frontend/node_modules 없음 → npm ci"
          (cd "$GM_FRONTEND_DIR" && npm ci) || gm_die "npm ci 에 실패했습니다."
        fi
        ;;
    esac
  done
  if [ "$GM_PORTS_OVERRIDDEN" = 1 ]; then
    gm_info "포트 override: frontend=$FRONTEND_PORT, backend=$BACKEND_PORT"
    gm_info "  → backend env FRONTEND_ORIGIN=$GM_FRONTEND_ORIGIN, frontend env NEXT_PUBLIC_API_BASE_URL=$GM_API_BASE_URL"
  fi
}

# ---------------------------------------------------------------------------
# 기동·헬스체크
# ---------------------------------------------------------------------------
gm_http_code() { # <url> <max-time>
  curl -s -o /dev/null -w '%{http_code}' --max-time "$2" "$1" 2>/dev/null || true
}

gm_health_ok() { # <svc> <port>
  local t=3
  if [ "$1" = "frontend" ]; then t=15; fi # next dev 첫 컴파일 대기
  [ "$(gm_http_code "$(gm_health_url "$1" "$2")" "$t")" = "200" ]
}

# 기동마다 직전 로그를 dev-server.log.1 로 1세대 회전하고 새 로그를 시작한다.
gm_rotate_log() {
  mkdir -p "$(dirname "$1")"
  if [ -s "$1" ]; then mv -f "$1" "$1.1"; fi
  : >"$1"
}

# nohup + 자체 프로세스 그룹(set -m)으로 백그라운드 분리 실행. 결과 PID는 GM_LAUNCHED_PID.
gm_launch_service() { # <svc> <port>
  local svc=$1 port=$2 log
  log=$(gm_service_log "$svc")
  gm_rotate_log "$log"
  printf '=== %s %s 기동 (worktree=%s, port=%s) ===\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$svc" "$GM_REPO_ROOT" "$port" >>"$log"
  set -m
  case $svc in
    backend)
      (
        cd "$GM_BACKEND_DIR" || exit 1
        unset GAMJA_SCRIPTS_LOCK_HELD
        if [ "$GM_PORTS_OVERRIDDEN" = 1 ]; then export FRONTEND_ORIGIN="$GM_FRONTEND_ORIGIN"; fi
        exec nohup uv run uvicorn app.main:app --host 127.0.0.1 --port "$port" --reload
      ) >>"$log" 2>&1 </dev/null &
      ;;
    frontend)
      (
        cd "$GM_FRONTEND_DIR" || exit 1
        unset GAMJA_SCRIPTS_LOCK_HELD
        if [ "$GM_PORTS_OVERRIDDEN" = 1 ]; then export NEXT_PUBLIC_API_BASE_URL="$GM_API_BASE_URL"; fi
        exec nohup npm run dev -- --port "$port"
      ) >>"$log" 2>&1 </dev/null &
      ;;
  esac
  GM_LAUNCHED_PID=$!
  set +m
  disown "$GM_LAUNCHED_PID" 2>/dev/null || true
}

gm_wait_ready() { # <svc> <port> <pid>
  local svc=$1 port=$2 pid=$3 timeout start
  if [ "$svc" = "backend" ]; then timeout=$GM_BACKEND_READY_TIMEOUT; else timeout=$GM_FRONTEND_READY_TIMEOUT; fi
  gm_info "[$svc] readiness 대기 (최대 ${timeout}초): $(gm_health_url "$svc" "$port")"
  start=$SECONDS
  while [ $((SECONDS - start)) -lt "$timeout" ]; do
    if ! gm_proc_alive "$pid"; then
      gm_error "[$svc] 프로세스(PID $pid)가 기동 중 종료되었습니다."
      return 1
    fi
    if gm_health_ok "$svc" "$port"; then return 0; fi
    sleep 1
  done
  gm_error "[$svc] ${timeout}초 안에 헬스체크(200)를 통과하지 못했습니다."
  return 1
}

gm_print_log_tail() { # <svc>
  local log
  log=$(gm_service_log "$1")
  gm_info "---- $(gm_rel "$log") 마지막 40줄 ----"
  tail -n 40 "$log" 2>/dev/null | sed 's/^/    | /' || true
  gm_info "--------------------------------------------"
}

gm_print_listeners() { # <port>
  local pid
  for pid in $(gm_port_listeners "$1"); do
    gm_info "    LISTEN $(gm_describe_pid "$pid")"
  done
}

# ---------------------------------------------------------------------------
# 서비스 단위 동작
# ---------------------------------------------------------------------------
gm_start_service() { # <svc>
  local svc=$1 port pid cwd owner cur="" others="" unrelated="" roots="" pidfile live
  port=$(gm_service_port "$svc")
  gm_step "[$svc] 포트 $port 점검"
  gm_prune_stale_pidfiles "$svc"

  for pid in $(gm_port_listeners "$port"); do
    cwd=$(gm_proc_cwd "$pid")
    owner=$(gm_owner_worktree "$cwd")
    if [ -z "$owner" ]; then
      unrelated="$unrelated $pid"
    elif [ "$owner" = "$GM_REPO_ROOT" ]; then
      cur="$cur $pid"
    else
      others="$others $pid"
      gm_info "포트 $port: 다른 워크트리의 서비스가 사용 중 — $(gm_worktree_label "$owner")"
      gm_info "    $(gm_describe_pid "$pid")"
    fi
  done

  if [ -n "$unrelated" ]; then
    for pid in $unrelated; do
      gm_warn "포트 $port: 이 리포와 무관한 프로세스가 점유 중 — $(gm_describe_pid "$pid")"
    done
    if [ "$GM_FORCE" != 1 ]; then
      gm_error "[$svc] 무관한 프로세스는 --force 없이 종료하지 않습니다. 직접 종료하거나 --force 로 다시 실행하세요(또는 $(gm_port_env "$svc")로 다른 포트 사용)."
      return 1
    fi
    gm_warn "--force 지정: 무관한 프로세스를 종료합니다."
  fi

  if [ -n "$cur" ] && [ -z "$others" ] && [ -z "$unrelated" ]; then
    if gm_health_ok "$svc" "$port"; then
      gm_ok "[$svc] 현재 워크트리 서비스가 이미 실행 중입니다(중복 기동하지 않음): $(gm_public_url "$svc" "$port")"
      gm_print_listeners "$port"
      pidfile=$(gm_pidfile "$svc" "$port")
      if ! gm_pidfile_live "$pidfile" >/dev/null 2>&1; then
        pid=${cur# }
        gm_write_pidfile "$svc" "$port" "$(gm_find_root "${pid%% *}" "$GM_REPO_ROOT")" adopted
      fi
      return 0
    fi
    gm_warn "[$svc] 현재 워크트리 서비스가 포트를 점유하고 있지만 헬스체크에 응답하지 않아 재기동합니다."
  fi

  for pid in $cur; do roots="$roots $(gm_find_root "$pid" "$GM_REPO_ROOT")"; done
  for pid in $others; do roots="$roots $(gm_find_root "$pid" "$(gm_owner_worktree "$(gm_proc_cwd "$pid")")")"; done
  for pid in $unrelated; do roots="$roots $(gm_find_root "$pid" "")"; done
  # PID 파일(보조): 같은 포트로 기록된 이 리포 서비스가 아직 LISTEN 전이어도 정리한다.
  pidfile=$(gm_pidfile "$svc" "$port")
  if [ -f "$pidfile" ] && live=$(gm_pidfile_live "$pidfile"); then
    case " $roots " in
      *" $live "*) ;;
      *)
        gm_info "PID 파일 기준 실행 중인 프로세스도 정리합니다: $(gm_describe_pid "$live")"
        roots="$roots $live"
        ;;
    esac
  fi
  if [ -n "${roots// /}" ]; then
    # shellcheck disable=SC2086
    gm_kill_roots "$svc" $roots || return 1
    gm_wait_port_free "$port" 10 || return 1
    gm_info "포트 $port: LISTEN 없음 확인"
  fi
  rm -f "$pidfile"

  gm_step "[$svc] 기동 ($(gm_rel "$(gm_service_dir "$svc")")/, 포트 $port)"
  gm_launch_service "$svc" "$port"
  gm_write_pidfile "$svc" "$port" "$GM_LAUNCHED_PID" started
  gm_info "PID $GM_LAUNCHED_PID (프로세스 그룹 $(gm_ps_field pgid "$GM_LAUNCHED_PID")), 로그 $(gm_rel "$(gm_service_log "$svc")")"
  if ! gm_wait_ready "$svc" "$port" "$GM_LAUNCHED_PID"; then
    gm_print_log_tail "$svc"
    gm_kill_roots "$svc" "$GM_LAUNCHED_PID" || true
    rm -f "$pidfile"
    return 1
  fi

  # 실측 재확인: 포트의 LISTEN 프로세스가 현재 워크트리 소속인지
  for pid in $(gm_port_listeners "$port"); do
    owner=$(gm_owner_worktree "$(gm_proc_cwd "$pid")")
    if [ "$owner" != "$GM_REPO_ROOT" ]; then
      gm_error "[$svc] 포트 $port 의 LISTEN 프로세스가 현재 워크트리 소속이 아닙니다: $(gm_describe_pid "$pid")"
      return 1
    fi
  done
  gm_ok "[$svc] 준비 완료: $(gm_public_url "$svc" "$port")"
  gm_print_listeners "$port"
}

gm_stop_service() { # <svc>
  local svc=$1 port pid owner roots="" skipped="" f live wt fport extra_ports="" freed p
  port=$(gm_service_port "$svc")
  gm_step "[$svc] 포트 $port 서비스 종료"

  for pid in $(gm_port_listeners "$port"); do
    owner=$(gm_owner_worktree "$(gm_proc_cwd "$pid")")
    if [ -n "$owner" ]; then
      gm_info "워크트리 $(gm_worktree_label "$owner") 의 서비스를 종료합니다."
      gm_info "    $(gm_describe_pid "$pid")"
      roots="$roots $(gm_find_root "$pid" "$owner")"
    elif [ "$GM_FORCE" = 1 ]; then
      gm_warn "--force 지정: 무관한 프로세스를 종료합니다: $(gm_describe_pid "$pid")"
      roots="$roots $(gm_find_root "$pid" "")"
    else
      skipped="$skipped $pid"
      gm_warn "이 리포와 무관한 프로세스라 건드리지 않습니다(--force 로 강제 종료): $(gm_describe_pid "$pid")"
    fi
  done

  # PID 파일(보조): 같은 포트로 기록됐거나 현재 워크트리가 다른 포트로 띄운 서비스
  for f in "$GM_RUNTIME_DIR/$svc"-*.pid; do
    [ -f "$f" ] || continue
    if live=$(gm_pidfile_live "$f"); then
      wt=$(gm_meta_get "$f" worktree)
      fport=$(gm_meta_get "$f" port)
      if [ "$fport" = "$port" ] || [ "$wt" = "$GM_REPO_ROOT" ]; then
        case " $roots " in
          *" $live "*) ;;
          *)
            gm_info "PID 파일 기준 실행 중인 서비스도 종료합니다(worktree=$wt, port=$fport): PID $live"
            roots="$roots $live"
            if [ "$fport" != "$port" ]; then extra_ports="$extra_ports $fport"; fi
            ;;
        esac
      fi
    fi
  done

  if [ -z "${roots// /}" ]; then
    gm_prune_stale_pidfiles "$svc"
    if [ -n "$skipped" ]; then
      gm_warn "[$svc] 종료할 감자마켓 서비스가 없습니다(포트 $port: 무관한 프로세스가 사용 중)."
    else
      gm_ok "[$svc] 실행 중인 서비스가 없습니다(포트 $port 비어 있음)."
    fi
    return 0
  fi

  # shellcheck disable=SC2086
  gm_kill_roots "$svc" $roots || return 1
  freed=""
  if [ -z "$skipped" ]; then
    gm_wait_port_free "$port" 10 || return 1
    freed=$port
  fi
  for p in $extra_ports; do
    if gm_wait_port_free "$p" 5 2>/dev/null; then
      freed="${freed:+$freed, }$p"
    else
      gm_warn "포트 $p: 아직 LISTEN 중인 프로세스가 있습니다(PID $(gm_port_listeners "$p"))"
    fi
  done
  gm_prune_stale_pidfiles "$svc"
  if [ -n "$skipped" ]; then
    gm_ok "[$svc] 감자마켓 서비스 종료 완료(포트 $port 는 무관한 프로세스가 계속 사용 중)"
  else
    gm_ok "[$svc] 종료 완료(포트 $freed LISTEN 없음)"
  fi
}

gm_print_header() { # <동작 이름>
  gm_load_worktrees
  gm_step "감자마켓 dev 서비스 $1 — 대상: $GM_TARGET"
  gm_info "워크트리: $(gm_worktree_label "$GM_REPO_ROOT")"
  gm_info "포트: frontend=$FRONTEND_PORT, backend=$BACKEND_PORT / 런타임 디렉토리: $GM_RUNTIME_DIR"
}
