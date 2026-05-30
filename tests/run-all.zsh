#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

for test_file in "$ROOT_DIR"/tests/*.zsh; do
  [[ "${test_file:t}" == "run-all.zsh" ]] && continue
  zsh "$test_file"
done

node --test "$ROOT_DIR"/tests/*.test.js
