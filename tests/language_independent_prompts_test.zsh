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

assert_contains "$ROOT_DIR/swarmforge/swarmforge.conf" "window reporter opencode none"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "read-only project reporter"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not edit files"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not create commits"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not push branches"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not merge branches"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "The logger remains a separate passive log viewer"

assert_contains "$ROOT_DIR/swarmforge.sh" 'Your configured agent backend for this role is: ${agent}.'
assert_contains "$ROOT_DIR/swarmforge.sh" 'write_agent_instruction_file "$role" "$prompt_file" "$agent"'

for prompt in architect coder refactorer specifier; do
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "mutate4go"
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "mutate4clj"
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "dry4go"
  assert_not_contains "$ROOT_DIR/swarmforge/$prompt.prompt" "crap4go"
done

assert_not_contains "$ROOT_DIR/swarmforge/coder.prompt" "written in go"
assert_not_contains "$ROOT_DIR/swarmforge/specifier.prompt" "CRAP"
