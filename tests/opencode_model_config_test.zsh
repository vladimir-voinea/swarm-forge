#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT_DIR/swarmforge.sh"
README="$ROOT_DIR/README.md"

assert_contains() {
  local file="$1"
  local expected="$2"

  if ! grep -Fq -- "$expected" "$file"; then
    echo "Expected $file to contain: $expected" >&2
    exit 1
  fi
}

assert_contains "$SCRIPT" 'typeset -a AGENT_MODELS=()'
assert_contains "$SCRIPT" 'if (( ${#fields[@]} != 4 && ${#fields[@]} != 5 )); then'
assert_contains "$SCRIPT" 'if (( ${#fields[@]} == 5 )); then'
assert_contains "$SCRIPT" 'if [[ "$agent" != "opencode" ]]; then'
assert_contains "$SCRIPT" 'model="${fields[4]}"'
assert_contains "$SCRIPT" 'worktree="${fields[5]}"'
assert_contains "$SCRIPT" 'append_role "$role" "$agent" "$worktree" "$model"'
assert_contains "$SCRIPT" 'local model="${AGENT_MODELS[$index]}"'
assert_contains "$SCRIPT" 'opencode_model_args'
assert_contains "$SCRIPT" '--model '"'"'$model'"'"
assert_contains "$README" 'window <role> opencode <model> <worktree>'
