#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}

find_project_dir() {
  local git_common_dir

  if git_common_dir=$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir 2>/dev/null); then
    if [[ "$git_common_dir" != /* ]]; then
      git_common_dir="$(cd "$SCRIPT_DIR/$git_common_dir" && pwd)"
    fi
    local project_dir="${git_common_dir:h}"
    if [[ -f "$project_dir/.swarmforge/sessions.tsv" ]]; then
      echo "$project_dir"
      return 0
    fi
  fi

  echo "${SCRIPT_DIR:h}"
}

PROJECT_DIR="$(find_project_dir)"
SESSIONS_FILE="$PROJECT_DIR/.swarmforge/sessions.tsv"
LOG_FILE="$PROJECT_DIR/logs/agent_messages.log"
STATE_DIR="$PROJECT_DIR/.swarmforge"
STATUS_DIR="$STATE_DIR/agent-status"
QUEUE_DIR="$STATE_DIR/queues"

if [[ $# -lt 1 ]]; then
  echo "Usage: notify-agent.sh <target-role-or-index> \"message\"" >&2
  echo "       notify-agent.sh --free <role>" >&2
  exit 1
fi

if [[ ! -f "$SESSIONS_FILE" ]]; then
  echo "Sessions file not found: $SESSIONS_FILE" >&2
  exit 1
fi

resolve_session() {
  local target="${1:l}"
  local index role session display agent

  while IFS=$'\t' read -r index role session display agent; do
    if [[ "$target" == "${index:l}" || "$target" == "${role:l}" ]]; then
      echo "$session"
      return 0
    fi
  done < "$SESSIONS_FILE"

  return 1
}

resolve_role_session() {
  local target="${1:l}"
  local index role session display agent

  while IFS=$'\t' read -r index role session display agent; do
    if [[ "$target" == "${index:l}" || "$target" == "${role:l}" ]]; then
      printf '%s\t%s\n' "$role" "$session"
      return 0
    fi
  done < "$SESSIONS_FILE"

  return 1
}

is_coder_pool_role() {
  local role="${1:l}"
  [[ "$role" == "coder" || "$role" == coder-<-> ]]
}

pool_for_target() {
  local target="${1:l}"

  if [[ "$target" == "coder" ]]; then
    echo "coder"
    return 0
  fi

  return 1
}

role_is_in_pool() {
  local pool="$1"
  local role="${2:l}"

  case "$pool" in
    coder) is_coder_pool_role "$role" ;;
    *) return 1 ;;
  esac
}

role_is_busy() {
  local role="$1"
  [[ -f "$STATUS_DIR/$role.busy" ]]
}

mark_role_busy() {
  local role="$1"
  local timestamp

  mkdir -p "$STATUS_DIR"
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  printf '%s\n' "$timestamp" > "$STATUS_DIR/$role.busy"
}

dispatch_to_session() {
  local session="$1"
  local message="$2"
  local timestamp

  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  mkdir -p "$PROJECT_DIR/logs"
  echo "[$timestamp] [$session] $message" >> "$LOG_FILE"
  tmux send-keys -t "${session}.0" -l -- "$message"
  sleep 0.15
  tmux send-keys -t "${session}.0" C-m
  sleep 0.05
  tmux send-keys -t "${session}.0" C-j
}

dispatch_to_role() {
  local role="$1"
  local session="$2"
  local message="$3"

  mark_role_busy "$role"
  dispatch_to_session "$session" "$message"
}

dispatch_pool_message() {
  local pool="$1"
  local message="$2"
  local index role session display agent

  mkdir -p "$STATUS_DIR"
  while IFS=$'\t' read -r index role session display agent; do
    if role_is_in_pool "$pool" "$role" && ! role_is_busy "$role"; then
      dispatch_to_role "$role" "$session" "$message"
      return 0
    fi
  done < "$SESSIONS_FILE"

  return 1
}

enqueue_pool_message() {
  local pool="$1"
  local message="$2"
  local pool_queue="$QUEUE_DIR/$pool"
  local queue_file

  mkdir -p "$pool_queue"
  queue_file="$pool_queue/$(date '+%Y%m%d%H%M%S').$$.$RANDOM.msg"
  printf '%s\n' "$message" > "$queue_file"
  echo "Queued $pool message: $queue_file" >&2
}

dispatch_oldest_queued_to_role() {
  local pool="$1"
  local role="$2"
  local session="$3"
  local pool_queue="$QUEUE_DIR/$pool"
  local queue_file message

  [[ -d "$pool_queue" ]] || return 1
  queue_file=$(find "$pool_queue" -type f | sort | head -n 1)
  [[ -n "$queue_file" ]] || return 1

  message="$(<"$queue_file")"
  rm -f "$queue_file"
  dispatch_to_role "$role" "$session" "$message"
}

mark_role_free() {
  local role_session role session pool

  role_session=$(resolve_role_session "$1") || {
    echo "Unknown role: $1" >&2
    exit 1
  }
  role="${role_session%%$'\t'*}"
  session="${role_session#*$'\t'}"

  rm -f "$STATUS_DIR/$role.busy"

  if is_coder_pool_role "$role"; then
    pool="coder"
    dispatch_oldest_queued_to_role "$pool" "$role" "$session" || true
  fi
}

if [[ "$1" == "--free" ]]; then
  if [[ $# -ne 2 ]]; then
    echo "Usage: notify-agent.sh --free <role>" >&2
    exit 1
  fi

  mark_role_free "$2"
  exit 0
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: notify-agent.sh <target-role-or-index> \"message\"" >&2
  echo "       notify-agent.sh --free <role>" >&2
  exit 1
fi

MESSAGE="${*:2}"

if pool=$(pool_for_target "$1"); then
  if ! dispatch_pool_message "$pool" "$MESSAGE"; then
    enqueue_pool_message "$pool" "$MESSAGE"
  fi
  exit 0
fi

TARGET_PANE=$(resolve_session "$1") || {
  echo "Unknown target: $1" >&2
  exit 1
}

dispatch_to_session "$TARGET_PANE" "$MESSAGE"
