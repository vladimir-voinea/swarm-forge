# Project Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only opencode-backed project reporter tmux window to the default SwarmForge topology while preserving the existing logger utility window.

**Architecture:** Keep launcher behavior unchanged: `logger` remains the only automatic injected utility window. Add `reporter` as an explicit role in the bundled default config with its own prompt, so it launches through the existing opencode role path and reads from the main project directory via `none` worktree semantics.

**Tech Stack:** zsh tests, shell launcher/config files, Markdown prompts, README documentation, git.

---

## File Structure

- Modify `tests/language_independent_prompts_test.zsh`: add failing assertions for the default reporter config and read-only prompt requirements.
- Create `swarmforge/reporter.prompt`: define the reporter's read-only behavior, allowed inspection scope, report contents, and prohibition on repo mutation.
- Modify `swarmforge/swarmforge.conf`: add `window reporter opencode none`.
- Modify `README.md`: document `reporter` separately from `logger` and update examples/high-level descriptions.
- Leave `swarmforge.sh` logger injection and formatter code unchanged.

### Task 1: Reporter Contract Test

**Files:**
- Modify: `tests/language_independent_prompts_test.zsh`
- Create later: `swarmforge/reporter.prompt`

- [ ] **Step 1: Write the failing test**

Add these assertions after the existing `assert_not_contains` function in `tests/language_independent_prompts_test.zsh`:

```zsh
assert_contains "$ROOT_DIR/swarmforge/swarmforge.conf" "window reporter opencode none"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "read-only project reporter"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not edit files"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not create commits"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not push branches"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "Do not merge branches"
assert_contains "$ROOT_DIR/swarmforge/reporter.prompt" "The logger remains a separate passive log viewer"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
tests/language_independent_prompts_test.zsh
```

Expected: FAIL because `swarmforge/reporter.prompt` does not exist and `swarmforge/swarmforge.conf` does not yet contain `window reporter opencode none`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/language_independent_prompts_test.zsh
git commit -m "Add project reporter contract test" -m "Introduce a failing test that captures the expected default reporter topology and the key read-only prompt constraints before adding the reporter implementation.\n\nThe assertions require the bundled config to declare an opencode-backed reporter window using the main project directory and require the reporter prompt to prohibit editing, committing, pushing, and merging while keeping the logger as a separate passive log viewer."
```

### Task 2: Reporter Prompt And Config

**Files:**
- Create: `swarmforge/reporter.prompt`
- Modify: `swarmforge/swarmforge.conf`
- Test: `tests/language_independent_prompts_test.zsh`

- [ ] **Step 1: Add minimal implementation**

Create `swarmforge/reporter.prompt` with:

```markdown
You are the read-only project reporter.

Your purpose is to tell the human what is going on in this SwarmForge project. Observe the repository, swarm state, agent messages, worktrees, and tmux-visible activity, then report a clear summary in this reporter window.

The logger remains a separate passive log viewer. Do not replace it, reformat it, or treat yourself as the logger.

Read-only rules:

- Do not edit files.
- Do not create commits.
- Do not push branches.
- Do not merge branches.
- Do not create, delete, or modify git worktrees.
- Do not run destructive commands.
- Do not send handoffs or instructions to other agents unless the human explicitly asks you to.

Useful read-only checks:

- `git status --short --branch`
- `git log --oneline --decorate -10`
- `git worktree list`
- `git diff --stat`
- `tail -n 80 logs/agent_messages.log`
- `ls agent_context`
- `rg -n "blocker|blocked|fail|error|handoff|ready" logs agent_context swarmforge`
- `tmux list-windows -t swarmforge`
- `tmux capture-pane -t swarmforge:<role>.0 -p`

When reporting, include:

- current branch and worktree state
- recent inter-agent messages
- visible active work by role
- blockers, risks, or unclear ownership
- likely next actions and which writing agent should take them

If logs or context files are missing or empty, say that directly and base the report on git, worktree, and tmux state.

If the human asks you to make a change, explain that you are read-only and identify the appropriate writing agent or command path instead of performing the change yourself.
```

Add this line to `swarmforge/swarmforge.conf`:

```conf
window reporter opencode none
```

Place it after the existing agent roles and before any future utility-only roles.

- [ ] **Step 2: Run test to verify it passes**

Run:

```bash
tests/language_independent_prompts_test.zsh
```

Expected: PASS with exit code 0.

- [ ] **Step 3: Commit implementation**

```bash
git add swarmforge/reporter.prompt swarmforge/swarmforge.conf tests/language_independent_prompts_test.zsh
git commit -m "Add read-only project reporter role" -m "Add a default opencode-backed reporter role that runs from the main project directory and gives the human a read-only view of swarm activity.\n\nThe new reporter prompt explicitly separates the role from the existing passive logger, allows only inspection commands, and prohibits editing files, creating commits, pushing branches, merging branches, changing worktrees, destructive commands, and autonomous handoffs.\n\nThe launcher path is unchanged: reporter uses the existing configured-role opencode backend support, while logger remains the only automatically injected utility window."
```

### Task 3: Documentation

**Files:**
- Modify: `README.md`
- Test: `tests/language_independent_prompts_test.zsh`, `tests/logger_window_test.zsh`

- [ ] **Step 1: Update README**

Make these documentation changes:

- In "What SwarmForge Does", change "plus an automatic logger window" to "plus an automatic logger window and any configured observer roles such as reporter".
- Add a bullet after the logger bullet: "Includes a default `reporter` role that runs on opencode as a read-only project observer".
- In "Core Features", keep the logger sentence and add a reporter sentence that says reporter is an opencode-backed read-only agent that summarizes repo, worktree, log, and tmux state.
- In "Constitution And Roles", add a `reporter` bullet after the current default workflow bullets.
- In the config example, add `window reporter opencode none`.
- Replace the existing logger-only paragraph after the example with separate `logger` and `reporter` paragraphs.

- [ ] **Step 2: Run focused tests**

Run:

```bash
tests/language_independent_prompts_test.zsh
tests/logger_window_test.zsh
```

Expected: both commands exit 0. The logger test still proves the automatic logger window and formatter behavior remain intact.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "Document reporter and logger roles" -m "Update the README to describe the default reporter as a configured opencode-backed read-only observer while keeping the logger documented as a separate passive formatted log window.\n\nThe documentation now shows reporter in the example topology, explains that it uses the main project directory through the none worktree setting, and clarifies that logger behavior remains automatic and unchanged."
```

### Task 4: Final Verification

**Files:**
- Verify: `tests/language_independent_prompts_test.zsh`
- Verify: `tests/logger_window_test.zsh`
- Verify: git status

- [ ] **Step 1: Run all repository tests**

Run:

```bash
tests/language_independent_prompts_test.zsh
tests/logger_window_test.zsh
```

Expected: both commands exit 0.

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git status --short
```

Expected: no uncommitted files from the reporter implementation. The pre-existing `swarmforge/constitution/engineering.prompt` change may still appear and must not be modified or committed by this work.

- [ ] **Step 3: Push commits**

Run:

```bash
git push
```

Expected: reporter commits are pushed to the current branch. If the branch has no upstream, run `git push -u origin HEAD`.

## Self-Review

- Spec coverage: reporter prompt, default config, README, tests, logger preservation, opencode backend, and read-only constraints are each covered by a task.
- Placeholder scan: no TBD, TODO, or unspecified implementation steps remain.
- Type consistency: role name is consistently `reporter`, backend is consistently `opencode`, and worktree is consistently `none`.
