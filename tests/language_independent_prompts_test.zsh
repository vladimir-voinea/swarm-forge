#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

assert_contains() {
  local file="$1"
  local expected="$2"

  if ! grep -Fq -- "$expected" "$file"; then
    echo "Expected $file to contain: $expected" >&2
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"

  if grep -Fq -- "$unexpected" "$file"; then
    echo "Expected $file not to contain: $unexpected" >&2
    exit 1
  fi
}

assert_contains "$ROOT_DIR/swarmforge.sh" 'Your configured agent backend for this role is: ${agent}.'
assert_contains "$ROOT_DIR/swarmforge.sh" 'write_agent_instruction_file "$role" "$prompt_file" "$agent"'

for prompt in architect coder refactorer reviewer; do
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "mutate4go"
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "mutate4clj"
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "dry4go"
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "crap4go"
done

assert_not_contains "$ROOT_DIR/swarmforge/coder.prompt" "written in go"
assert_not_contains "$ROOT_DIR/swarmforge/reviewer.prompt" "CRAP"
