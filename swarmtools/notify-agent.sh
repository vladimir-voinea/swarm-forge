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

if [[ $# -lt 2 ]]; then
  echo "Usage: notify-agent.sh <target-role-or-index> \"message\"" >&2
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

TARGET_SESSION=$(resolve_session "$1") || {
  echo "Unknown target: $1" >&2
  exit 1
}

MESSAGE="${*:2}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
mkdir -p "$PROJECT_DIR/logs"
echo "[$TIMESTAMP] [$TARGET_SESSION] $MESSAGE" >> "$LOG_FILE"
tmux send-keys -t "${TARGET_SESSION}.0" -l -- "$MESSAGE"
sleep 0.15
tmux send-keys -t "${TARGET_SESSION}.0" C-m
sleep 0.05
tmux send-keys -t "${TARGET_SESSION}.0" C-j
