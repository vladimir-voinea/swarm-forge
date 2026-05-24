#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT_DIR/swarmforge.sh"

assert_contains() {
  local expected="$1"

  if ! grep -Fq -- "$expected" "$SCRIPT"; then
    echo "Expected swarmforge.sh to contain: $expected" >&2
    exit 1
  fi
}

assert_contains 'ensure_logger_window()'
assert_contains 'append_role "logger" "none" "none"'
assert_contains 'write_log_formatter_script'
assert_contains 'format-agent-log.sh'
assert_contains 'target_label['
assert_contains 'cd '"'"'$WORKING_DIR'"'"' && '"'"'$SWARM_TOOLS_DIR/format-agent-log.sh'"'"''

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/swarmtools" "$TMP_DIR/.swarmforge" "$TMP_DIR/logs"

sed -n "/format-agent-log.sh.*<<'EOF'/,/^EOF$/p" "$SCRIPT" \
  | sed '1d;$d' > "$TMP_DIR/swarmtools/format-agent-log.sh"
chmod +x "$TMP_DIR/swarmtools/format-agent-log.sh"

printf '1\tcoder\tswarmforge:coder\tCoder\topencode\n' > "$TMP_DIR/.swarmforge/sessions.tsv"
printf '[2026-05-24 23:30:00] [swarmforge:coder] Review your rules.\n' > "$TMP_DIR/logs/agent_messages.log"

"$TMP_DIR/swarmtools/format-agent-log.sh" > "$TMP_DIR/output" &
FORMATTER_PID=$!
sleep 1
kill "$FORMATTER_PID" >/dev/null 2>&1 || true
wait "$FORMATTER_PID" >/dev/null 2>&1 || true

if ! grep -Fq "Coder" "$TMP_DIR/output"; then
  echo "Expected formatted log output to include resolved target display name" >&2
  exit 1
fi

if ! grep -Fq "Review your rules." "$TMP_DIR/output"; then
  echo "Expected formatted log output to include message text" >&2
  exit 1
fi
