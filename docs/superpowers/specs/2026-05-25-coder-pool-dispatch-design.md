# Coder Pool Dispatch Design

## Context

SwarmForge currently routes handoffs by exact role name or window index through the generated `swarmtools/notify-agent.sh` helper. A project can define multiple windows, but the default configuration has one `coder` role, and `notify-agent.sh coder "..."` always resolves to that single window.

The requested behavior is to have more than one coder and to dispatch coder work to whichever coder is free.

## Design

SwarmForge will support a coder role pool by convention. Any configured role named `coder` or matching `coder-<number>` is a member of the `coder` pool. Each pool member still has its own tmux window, worktree, backend, and role identity. Numbered coder roles reuse `swarmforge/coder.prompt` so projects do not need duplicated prompt files.

The default `swarmforge/swarmforge.conf` will define two coder windows:

- `coder-1` in `.worktrees/coder-1`
- `coder-2` in `.worktrees/coder-2`

The generated `notify-agent.sh` will keep local state under `.swarmforge/agent-status/` and `.swarmforge/queues/`. When the target is `coder`, the helper resolves the target by checking coder pool members in config order. The first member without a busy marker receives the handoff, and the helper creates `.swarmforge/agent-status/<role>.busy` for that role before sending the tmux message.

When all coder pool members are busy, `notify-agent.sh coder "..."` writes the message to `.swarmforge/queues/coder/` instead of dropping it or piling it into one coder pane. A coder that finishes work runs `notify-agent.sh --free <own-role>`. That clears the role busy marker and immediately dispatches the oldest queued coder message to the newly free role if one exists.

## Agent Instructions

Generated agent instructions will include the exact role name and the command to mark the role free. `swarmforge/coder.prompt` will tell coder agents to run that command when they complete their current task and before checking any local pending messages.

## Error Handling

Exact role and numeric dispatch continue to work as they do today. Unknown targets still fail. Pool queue directories are created on demand. Queued file names include a timestamp, process id, and random suffix to preserve lexicographic processing order and avoid collisions.

## Testing

Shell tests will extract the generated `notify-agent.sh` script from `swarmforge.sh` and run it against fake `.swarmforge/sessions.tsv` data with a fake `tmux` executable. Tests will verify:

- `notify-agent.sh coder "..."` sends to the first free numbered coder.
- A busy first coder causes dispatch to the next free coder.
- If every coder is busy, the message is queued.
- `notify-agent.sh --free coder-1` clears the busy marker and dispatches the oldest queued coder task to `coder-1`.
- Numbered coder roles reuse `swarmforge/coder.prompt`.
