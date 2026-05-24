<p align="center" style="color: red; font-weight: bold; font-size: 2em; font-style: italic; text-decoration: underline;">
Do not spend any money on a bankrbot SWARM token.
</p>

# SwarmForge

**A disciplined tmux-based agent orchestration platform that turns swarms of AI agents into reliable, professional software engineers.**

## Intent

SwarmForge is an agent coordination system that facilitates communication between agents working in different git worktrees.

It provides a shared structure for role-specific prompts, worktree assignment, tmux windows, and message passing so multiple agents can collaborate on the same project without stepping on each other.

## What SwarmForge Does

SwarmForge is a lightweight, tmux-based orchestration layer that:

- Launches a **config-driven swarm** from a project-local `swarmforge/swarmforge.conf`
- Creates one tmux session with one tmux window per configured role, plus an automatic logger window
- Reads behavior from project-local `swarmforge/<role>.prompt` files plus a layered `swarmforge/constitution.prompt`
- Supports per-role backends such as `claude`, `codex`, `opencode`, or `none`
- Creates a project-local `swarmtools/` directory with notification helpers for the active swarm
- Creates one git worktree per configured role under `.worktrees/`
- Adds a `logger` utility window automatically when the config does not define one
- Initializes a git repository in a new working directory and creates a first commit with `logs/` and `agent_context/` ignored
- Keeps all swarm state local to the working directory in `.swarmforge/`

## Core Features

- **Config-Driven Topology** — The swarm shape comes from `swarmforge/swarmforge.conf`, not hardcoded shell variables.
- **Project-Local Roles** — Each role is defined by `swarmforge/<role>.prompt` in the working tree being orchestrated.
- **Layered Constitution** — `swarmforge/constitution.prompt` can delegate to subordinate files such as `swarmforge/constitution/project.prompt`, `engineering.prompt`, and `workflow.prompt`.
- **Backend Selection Per Role** — A role can launch `claude`, `codex`, `opencode`, or no agent at all.
- **Observable Swarm** — Attach one terminal to tmux and switch between role windows in real time. A logger window shows formatted inter-agent messages from `logs/agent_messages.log`.
- **Self-Hosted & Lightweight** — Runs locally in tmux and Terminal with minimal machinery.

## Constitution And Roles

In a configuration with an `architect`, `coder`, and `reviewer`, the recommended prompt layout is:

```text
swarmforge/
  swarmforge.conf
  constitution.prompt
  constitution/
    project.prompt
    engineering.prompt
    workflow.prompt
  architect.prompt
  coder.prompt
  reviewer.prompt
```

`constitution.prompt` is the entry point. It can define precedence and direct agents to read subordinate constitution files in order. That lets you separate project-specific rules from engineering rules and workflow rules without forcing everything into one large prompt.

The default three-agent workflow is:

- `architect` defines behavior, plans, and acceptance-level intent
- `coder` implements one small slice at a time and hands off completed work
- `reviewer` performs deeper verification and quality checks before final handoff

`logger` is an automatic utility role with no agent backend unless the project defines its own logger window.

## How It Works (High Level)

1. Create a `swarmforge/` directory in the target working directory.
2. Put `swarmforge.conf`, `constitution.prompt`, and one `<role>.prompt` file per configured role inside it. If needed, add subordinate files under `swarmforge/constitution/`.
3. In `swarmforge/swarmforge.conf`, define each window as `window <role> <agent> <worktree>`.
4. Add `swarmforge.sh` to your shell `PATH` before startup.
5. Run `swarmforge.sh <working-directory>` or run it from inside that directory.
6. If the working directory is not already a git repo, startup runs `git init`, renames the initial branch to `master`, writes `.gitignore` entries for `.swarmforge/`, `.worktrees/`, `swarmtools/`, `logs/`, and `agent_context/`, and makes the first commit from the current project state.
7. Startup adds a `logger` utility window automatically unless `swarmforge.conf` already defines one.
8. Startup creates a git worktree for each window under `.worktrees/<worktree>`, unless the worktree field is `none` or `master`.
9. Startup creates `swarmtools/notify-agent.sh` and `swarmtools/format-agent-log.sh` for that project.
10. SwarmForge creates one tmux session, creates a tmux window for each role, launches each configured backend in its assigned worktree, and attaches the current terminal to the session.
11. Roles communicate through helper commands such as `notify-agent.sh`.

## The `swarmforge.conf` File

`swarmforge/swarmforge.conf` defines the swarm window-by-window. Each line has this form:

```conf
window <role> <agent> <worktree>
```

You can define as many windows as your project needs. Each `role` maps to a corresponding prompt file at `swarmforge/<role>.prompt`, so a config containing `architect`, `coder`, `reviewer`, `research`, and `release` windows would expect:

- `swarmforge/architect.prompt`
- `swarmforge/coder.prompt`
- `swarmforge/reviewer.prompt`
- `swarmforge/research.prompt`
- `swarmforge/release.prompt`

This lets each project choose its own swarm shape instead of being locked to a fixed set of roles. The only special case is a utility role such as `logger` using the `none` backend, which opens a window without launching an agent.

SwarmForge opens all roles in a single tmux session named `swarmforge`. Each configured `window` line becomes a tmux window inside that session. The first config line is selected when SwarmForge attaches, and you can use normal tmux window navigation to switch roles.

Supported backend values are `claude`, `codex`, `opencode`, and `none`.

Example config:

```conf
window coordinator codex master
window coder codex coder
window refactorer opencode refactorer
window architect codex architect
```

`logger` is a utility role. SwarmForge adds it automatically when the config does not include it. The logger runs with the `none` backend and displays `logs/agent_messages.log` as a formatted terminal table with message time, target role, and message text.

In the example above, the agents run in these worktrees:

- `coordinator` -> main working directory on `master`, and is the initially selected tmux window because it is listed first
- `coder` -> `.worktrees/coder`
- `refactorer` -> `.worktrees/refactorer`
- `architect` -> `.worktrees/architect`

If a window uses `master` as its worktree name, SwarmForge does not create `.worktrees/master`; that role runs in the main working directory on the `master` branch.

## Examples

The repository includes example swarm definitions under `examples/`.

- `examples/clojureHTW/swarmforge/` shows a layered constitution and agent prompts for a Clojure Hunt The Wumpus project, including a queueing rule for messages that arrive while an agent is busy.

Use these example directories as starting points for project-local `swarmforge/` folders.

## Getting Started

- In the directory where you want to use SwarmForge, pull the repository contents without creating a Git remote:

  ```sh
  curl -L https://github.com/vladimir-voinea/swarm-forge/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1
  ```
	
## Running SwarmForge

Just type `swarm`. SwarmForge attaches the current terminal to the `swarmforge` tmux session; use tmux window navigation to move between roles.
