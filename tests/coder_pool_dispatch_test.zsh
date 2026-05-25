#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT_DIR/swarmforge.sh"
CONFIG="$ROOT_DIR/swarmforge/swarmforge.conf"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/bin" "$TMP_DIR/swarmtools" "$TMP_DIR/.swarmforge" "$TMP_DIR/logs"

cat > "$TMP_DIR/bin/tmux" <<'EOF'
#!/usr/bin/env zsh
set -euo pipefail

printf '%s\n' "$*" >> "$TMUX_CALLS"
EOF
chmod +x "$TMP_DIR/bin/tmux"

sed -n "/notify-agent.sh.*<<'EOF'/,/^EOF$/p" "$SCRIPT" \
  | sed '1d;$d' > "$TMP_DIR/swarmtools/notify-agent.sh"
chmod +x "$TMP_DIR/swarmtools/notify-agent.sh"

cat > "$TMP_DIR/.swarmforge/sessions.tsv" <<'EOF'
1	coder-1	swarmforge:coder-1	Coder 1	opencode
2	coder-2	swarmforge:coder-2	Coder 2	opencode
3	architect	swarmforge:architect	Architect	codex
EOF

export PATH="$TMP_DIR/bin:$PATH"
export TMUX_CALLS="$TMP_DIR/tmux.calls"

assert_contains() {
  local file="$1"
  local expected="$2"

  if ! grep -Fq -- "$expected" "$file"; then
    echo "Expected $file to contain: $expected" >&2
    echo "--- $file contents ---" >&2
    cat "$file" >&2
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"

  if [[ -f "$file" ]] && grep -Fq -- "$unexpected" "$file"; then
    echo "Expected $file not to contain: $unexpected" >&2
    echo "--- $file contents ---" >&2
    cat "$file" >&2
    exit 1
  fi
}

assert_contains "$SCRIPT" 'prompt_role_for_role()'
assert_contains "$SCRIPT" 'if [[ "$role" == coder-<-> ]]; then'
assert_contains "$SCRIPT" 'Read swarmforge/${prompt_role}.prompt'
assert_contains "$SCRIPT" 'notify-agent.sh --free ${role}'
assert_contains "$CONFIG" 'window coder-1 opencode coder-1'
assert_contains "$CONFIG" 'window coder-2 opencode coder-2'

: > "$TMUX_CALLS"
"$TMP_DIR/swarmtools/notify-agent.sh" coder "Review your rules. Build the parser."
assert_contains "$TMUX_CALLS" "send-keys -t swarmforge:coder-1.0 -l -- Review your rules. Build the parser."
[[ -f "$TMP_DIR/.swarmforge/agent-status/coder-1.busy" ]]

: > "$TMUX_CALLS"
"$TMP_DIR/swarmtools/notify-agent.sh" coder "Review your rules. Build the generator."
assert_contains "$TMUX_CALLS" "send-keys -t swarmforge:coder-2.0 -l -- Review your rules. Build the generator."
[[ -f "$TMP_DIR/.swarmforge/agent-status/coder-2.busy" ]]

: > "$TMUX_CALLS"
"$TMP_DIR/swarmtools/notify-agent.sh" coder "Review your rules. Build the mutator."
assert_not_contains "$TMUX_CALLS" "send-keys -t"
queued_count=$(find "$TMP_DIR/.swarmforge/queues/coder" -type f | wc -l | tr -d ' ')
if [[ "$queued_count" != "1" ]]; then
  echo "Expected one queued coder message, found $queued_count" >&2
  exit 1
fi

: > "$TMUX_CALLS"
"$TMP_DIR/swarmtools/notify-agent.sh" --free coder-1
assert_contains "$TMUX_CALLS" "send-keys -t swarmforge:coder-1.0 -l -- Review your rules. Build the mutator."
[[ -f "$TMP_DIR/.swarmforge/agent-status/coder-1.busy" ]]
remaining_count=$(find "$TMP_DIR/.swarmforge/queues/coder" -type f | wc -l | tr -d ' ')
if [[ "$remaining_count" != "0" ]]; then
  echo "Expected queued coder message to be consumed, found $remaining_count remaining" >&2
  exit 1
fi

"$TMP_DIR/swarmtools/notify-agent.sh" architect "Review your rules. Direct handoff."
assert_contains "$TMUX_CALLS" "send-keys -t swarmforge:architect.0 -l -- Review your rules. Direct handoff."
