#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_DIR="${SCRIPT_DIR:h}"
SESSIONS_FILE="$PROJECT_DIR/.swarmforge/sessions.tsv"
LOG_FILE="$PROJECT_DIR/logs/agent_messages.log"

mkdir -p "$PROJECT_DIR/logs"
touch "$LOG_FILE"

awk -F '\t' '
  BEGIN {
    cyan = "\033[0;36m"
    green = "\033[0;32m"
    yellow = "\033[1;33m"
    bold = "\033[1m"
    reset = "\033[0m"
    printf "%s%s%-19s  %-18s  %s%s\n", bold, cyan, "TIME", "TARGET", "MESSAGE", reset
    printf "%s%s\n", cyan, "-------------------  ------------------  -----------------------------------------------", reset
  }
  FILENAME == ARGV[1] {
    target_label[$3] = $4
    next
  }
  {
    if ($0 ~ /^\[[^]]+\] \[[^]]+\] /) {
      time = $0
      sub(/^\[/, "", time)
      sub(/\].*/, "", time)

      target = $0
      sub(/^\[[^]]+\] \[/, "", target)
      sub(/\].*/, "", target)

      message = $0
      sub(/^\[[^]]+\] \[[^]]+\] /, "", message)

      if (target in target_label) {
        target = target_label[target]
      }
      printf "%s%-19s%s  %s%-18s%s  %s\n", yellow, time, reset, green, target, reset, message
    } else {
      printf "%s\n", $0
    }
    fflush()
  }
' "$SESSIONS_FILE" <(tail -n +1 -F "$LOG_FILE")
