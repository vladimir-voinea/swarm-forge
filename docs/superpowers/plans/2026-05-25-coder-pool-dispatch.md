# Coder Pool Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a coder pool so `notify-agent.sh coder "..."` dispatches to the first free coder and queued coder work is picked up by the next coder that becomes free.

**Architecture:** Keep the topology config-driven and implement pooling in the generated notification helper. Numbered coder roles reuse the shared coder prompt, and runtime state stays in project-local `.swarmforge/agent-status/` and `.swarmforge/queues/` directories.

**Tech Stack:** zsh, tmux, git worktrees, shell contract tests.

---

### Task 1: Coder Pool Dispatch Contract

**Files:**
- Create: `tests/coder_pool_dispatch_test.zsh`
- Modify: `swarmforge.sh`
- Modify: `swarmforge/swarmforge.conf`
- Modify: `swarmforge/coder.prompt`
- Modify: `README.md`

- [x] **Step 1: Write the failing dispatch test**

Create `tests/coder_pool_dispatch_test.zsh` with test setup that extracts `notify-agent.sh`, stubs `tmux`, writes fake `sessions.tsv`, and asserts pooled coder routing.

- [x] **Step 2: Run the test to verify it fails**

Run: `zsh tests/coder_pool_dispatch_test.zsh`

Expected: FAIL because `notify-agent.sh coder "..."` cannot resolve a pool when only `coder-1` and `coder-2` exist.

- [x] **Step 3: Allow numbered coder roles to reuse coder prompt**

In `swarmforge.sh`, add a helper that maps `coder-<number>` prompt lookup to `swarmforge/coder.prompt`, and use it wherever role prompts are validated or read.

- [x] **Step 4: Implement generated helper pool state**

In the generated `notify-agent.sh`, add:

- `STATE_DIR="$PROJECT_DIR/.swarmforge"`
- `STATUS_DIR="$STATE_DIR/agent-status"`
- `QUEUE_DIR="$STATE_DIR/queues"`
- role classification for `coder` and `coder-<number>`
- `dispatch_to_session`
- `enqueue_pool_message`
- `dispatch_pool_message`
- `mark_role_free`

- [x] **Step 5: Run the test to verify it passes**

Run: `zsh tests/coder_pool_dispatch_test.zsh`

Expected: PASS.

- [x] **Step 6: Update default config and prompts**

Change `swarmforge/swarmforge.conf` to include `coder-1` and `coder-2`. Update `swarmforge/coder.prompt` so each coder marks itself free with `notify-agent.sh --free <own-role>` after completing a task.

- [x] **Step 7: Update documentation**

Update `README.md` to document coder pools, numbered coder prompt reuse, busy markers, queueing, and the `--free` command.

- [x] **Step 8: Run all tests**

Run: `for t in tests/*.zsh; do zsh "$t"; done`

Expected: all tests pass.

- [x] **Step 9: Commit implementation**

Commit the complete implementation with a detailed message explaining the routing contract, state files, and docs changes.
