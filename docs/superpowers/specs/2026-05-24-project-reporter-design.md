# Project Reporter Design

## Context

SwarmForge currently starts a tmux session from `swarmforge/swarmforge.conf`, launches one window per configured role, and automatically adds a `logger` utility window when no `logger` role is configured. The logger is intentionally not an agent. It runs `swarmtools/format-agent-log.sh` and displays formatted messages from `logs/agent_messages.log`.

The new reporter must not replace that logger. The logger remains a passive log viewer. The reporter is a separate opencode-backed tmux window that observes project state and explains what is going on to the human.

## Chosen Approach

Add the reporter to the bundled default topology rather than injecting it automatically from the launcher.

The default `swarmforge/swarmforge.conf` will include:

```conf
window reporter opencode none
```

This keeps startup behavior simple and avoids changing existing projects that already provide their own `swarmforge.conf`. Projects that want the reporter can add the same line. Projects that do not want it can omit it.

## Role Semantics

The reporter is a read-only observing agent.

It may inspect project state with read-only commands such as:

- `git status`, `git log`, `git diff --stat`, and branch/worktree inspection commands
- `ls`, `find`, `rg`, `sed`, `tail`, and other commands that only read local files
- `tmux capture-pane` or similar tmux inspection commands when useful for understanding active windows

It must not:

- edit files
- create commits
- push branches
- merge branches
- create or delete worktrees
- run destructive commands
- send handoffs to other agents unless the human explicitly asks it to

Its job is to report current activity, branch and worktree state, recent agent messages, blockers, risks, and likely next actions. It reports in its own tmux window.

## Files And Components

- `swarmforge/reporter.prompt`: defines the reporter role, read-only constraints, reporting responsibilities, and useful inspection commands.
- `swarmforge/swarmforge.conf`: adds the reporter to the default bundled swarm topology using the `opencode` backend and `none` worktree.
- `README.md`: documents the reporter as separate from the logger.
- `tests/*`: adds focused coverage for the default reporter role and keeps logger coverage intact.

## Data Flow

The reporter receives the same generated instruction preamble as other agent roles. It reads the constitution and `swarmforge/reporter.prompt`, then runs under opencode from the main working directory because its worktree is `none`.

It reads existing project artifacts:

- `logs/agent_messages.log`
- `.swarmforge/sessions.tsv`
- `agent_context/`
- git status, branches, and worktrees
- relevant repo files and tmux pane output

It produces human-facing summaries in the reporter tmux window only.

## Error Handling

If opencode is unavailable, startup already fails through the existing backend dependency checks for configured opencode roles. No new launcher behavior is needed.

If logs or agent context are missing or empty, the reporter should say that explicitly and base its report on git, worktree, and tmux state.

If the reporter sees a task that appears to require action, it should describe the action and ask the human to direct an appropriate writing agent. It must not perform the action itself.

## Testing

Tests will cover:

- the existing logger window remains automatic and uses the `none` backend
- the default config contains a reporter role using `opencode` and `none`
- the reporter prompt exists and contains read-only prohibitions against editing, committing, pushing, and merging
- prompt language keeps reporter duties distinct from logger duties

## Out Of Scope

- Automatic reporter injection for all projects
- Reporter opt-out directives in `swarmforge.conf`
- Structured report files
- Reporter-to-agent routing or autonomous handoffs
