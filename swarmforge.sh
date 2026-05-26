#!/usr/bin/env zsh
set -euo pipefail

SESSION_PREFIX="swarmforge"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

WORKING_DIR="${1:-$PWD}"
WORKING_DIR="$(cd "$WORKING_DIR" && pwd)"
SCRIPT_DIR=${0:A:h}
SWARM_FORGE_DIR="$SCRIPT_DIR/swarmforge"
SWARM_TOOLS_DIR="$WORKING_DIR/swarmtools"
WORKTREES_DIR="$WORKING_DIR/.worktrees"
CONFIG_FILE="$SWARM_FORGE_DIR/swarmforge.conf"
ROLES_DIR="$SWARM_FORGE_DIR"
CONSTITUTION_FILE="$SWARM_FORGE_DIR/constitution.prompt"
STATE_DIR="$WORKING_DIR/.swarmforge"
SESSIONS_FILE="$STATE_DIR/sessions.tsv"
PROMPTS_DIR="$STATE_DIR/prompts"
TMUX_SOCKET_DIR="/private/tmp/swarmforge-${UID}"
PROJECT_SOCKET_ID="$(printf '%s' "$WORKING_DIR" | cksum)"
PROJECT_SOCKET_ID="${PROJECT_SOCKET_ID%% *}"
TMUX_SOCKET="$TMUX_SOCKET_DIR/$PROJECT_SOCKET_ID.sock"
TMUX_SOCKET_FILE="$STATE_DIR/tmux-socket"

typeset -a ROLES=()
typeset -a AGENTS=()
typeset -a AGENT_MODELS=()
typeset -a SESSIONS=()
typeset -a DISPLAY_NAMES=()
typeset -a WORKTREE_NAMES=()
typeset -a WORKTREE_PATHS=()
typeset -A ROLE_INDEX=()
typeset -A WORKTREE_INDEX=()
typeset -i i=0

check_dependency() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}Error:${RESET} '$1' is required but not installed."
    exit 1
  fi
}

ensure_initial_gitignore() {
  local gitignore_file="$WORKING_DIR/.gitignore"

  if [[ ! -f "$gitignore_file" ]]; then
    cat > "$gitignore_file" <<'EOF'
.swarmforge/
.worktrees/
swarmtools/
logs/
agent_context/
EOF
    return
  fi

  if ! grep -qx 'logs/' "$gitignore_file"; then
    echo 'logs/' >> "$gitignore_file"
  fi

  if ! grep -qx 'agent_context/' "$gitignore_file"; then
    echo 'agent_context/' >> "$gitignore_file"
  fi

  if ! grep -qx '.swarmforge/' "$gitignore_file"; then
    echo '.swarmforge/' >> "$gitignore_file"
  fi

  if ! grep -qx '.worktrees/' "$gitignore_file"; then
    echo '.worktrees/' >> "$gitignore_file"
  fi

  if ! grep -qx 'swarmtools/' "$gitignore_file"; then
    echo 'swarmtools/' >> "$gitignore_file"
  fi
}

ensure_runtime_git_excludes() {
  local exclude_file
  exclude_file="$(git -C "$WORKING_DIR" rev-parse --git-path info/exclude)"
  mkdir -p "${exclude_file:h}"
  touch "$exclude_file"

  local pattern
  for pattern in ".swarmforge/" ".worktrees/" "swarmtools/" "logs/" "agent_context/"; do
    if ! grep -qx "$pattern" "$exclude_file"; then
      echo "$pattern" >> "$exclude_file"
    fi
  done
}

initialize_git_repo() {
  if git -C "$WORKING_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return
  fi

  git init "$WORKING_DIR" >/dev/null
  git -C "$WORKING_DIR" branch -M master >/dev/null
  ensure_initial_gitignore
  git -C "$WORKING_DIR" add .
  git -C "$WORKING_DIR" commit -m "Initial swarmforge repository" >/dev/null
}

remove_nonessential_clone_files() {
  if [[ "${WORKING_DIR:t}" == "swarm-forge" ]]; then
    return
  fi

  if [[ -d "$STATE_DIR" ]]; then
    return
  fi

  rm -rf "$WORKING_DIR/README.md" "$WORKING_DIR/SwarmForgeInitSpec.md" "$WORKING_DIR/examples"
}

display_name_for_role() {
  local role="$1"
  local normalized="${role//[-_]/ }"
  local -a parts
  local part
  local label=""

  parts=(${=normalized})
  for part in "${parts[@]}"; do
    part="${(C)part}"
    if [[ -n "$label" ]]; then
      label+=" "
    fi
    label+="$part"
  done

  echo "$label"
}

session_name_for_role() {
  echo "${SESSION_PREFIX}:$1"
}

worktree_path_for_name() {
  echo "$WORKTREES_DIR/$1"
}

append_role() {
  local role="$1"
  local agent="$2"
  local worktree="$3"
  local model="${4:-}"

  ROLE_INDEX[$role]=${#ROLES[@]}
  if [[ "$worktree" != "none" && "$worktree" != "master" ]]; then
    WORKTREE_INDEX[$worktree]=${#ROLES[@]}
  fi
  ROLES+=("$role")
  AGENTS+=("$agent")
  AGENT_MODELS+=("$model")
  SESSIONS+=("$(session_name_for_role "$role")")
  DISPLAY_NAMES+=("$(display_name_for_role "$role")")
  WORKTREE_NAMES+=("$worktree")
  if [[ "$worktree" == "none" || "$worktree" == "master" ]]; then
    WORKTREE_PATHS+=("$WORKING_DIR")
  else
    WORKTREE_PATHS+=("$(worktree_path_for_name "$worktree")")
  fi
}

parse_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo -e "${RED}Error:${RESET} Config not found at $CONFIG_FILE"
    exit 1
  fi

  if [[ ! -f "$CONSTITUTION_FILE" ]]; then
    echo -e "${RED}Error:${RESET} Constitution prompt not found at $CONSTITUTION_FILE"
    exit 1
  fi

  local line keyword role agent model worktree line_no=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line_no=$((line_no + 1))
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "${line[1]}" == "#" ]] && continue

    local -a fields
    fields=(${=line})
    if (( ${#fields[@]} != 4 && ${#fields[@]} != 5 )); then
      echo -e "${RED}Error:${RESET} Invalid config line $line_no: $line"
      exit 1
    fi

    keyword="${fields[1]}"
    role="${fields[2]}"
    agent="${fields[3]:l}"
    model=""
    if (( ${#fields[@]} == 5 )); then
      if [[ "$agent" != "opencode" ]]; then
        echo -e "${RED}Error:${RESET} Model selection is only supported for opencode roles on line $line_no"
        exit 1
      fi
      model="${fields[4]}"
      worktree="${fields[5]}"
    else
      worktree="${fields[4]}"
    fi

    if [[ "$keyword" != "window" ]]; then
      echo -e "${RED}Error:${RESET} Unknown config directive on line $line_no: $keyword"
      exit 1
    fi

    if [[ -n "${ROLE_INDEX[$role]:-}" ]]; then
      echo -e "${RED}Error:${RESET} Duplicate role '$role' in $CONFIG_FILE"
      exit 1
    fi

    if [[ "$worktree" != "none" && "$worktree" != "master" && -n "${WORKTREE_INDEX[$worktree]:-}" ]]; then
      echo -e "${RED}Error:${RESET} Duplicate worktree '$worktree' in $CONFIG_FILE"
      exit 1
    fi

    if [[ "$worktree" == *"/"* || "$worktree" == "." || "$worktree" == ".." ]]; then
      echo -e "${RED}Error:${RESET} Invalid worktree '$worktree' for role '$role'"
      exit 1
    fi

    case "$agent" in
      claude|codex|opencode|none) ;;
      *)
        echo -e "${RED}Error:${RESET} Unsupported agent '$agent' for role '$role'"
        exit 1
        ;;
    esac

    if [[ "$agent" != "none" && ! -f "$ROLES_DIR/$role.prompt" ]]; then
      echo -e "${RED}Error:${RESET} Missing role prompt $ROLES_DIR/$role.prompt"
      exit 1
    fi

    append_role "$role" "$agent" "$worktree" "$model"
  done < "$CONFIG_FILE"

  if (( ${#ROLES[@]} == 0 )); then
    echo -e "${RED}Error:${RESET} No windows defined in $CONFIG_FILE"
    exit 1
  fi
}

ensure_logger_window() {
  if [[ -n "${ROLE_INDEX[logger]:-}" ]]; then
    return
  fi

  append_role "logger" "none" "none"
}

write_sessions_file() {
  : > "$SESSIONS_FILE"
  local i
  for (( i = 1; i <= ${#ROLES[@]}; i++ )); do
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "$i" \
      "${ROLES[$i]}" \
      "${SESSIONS[$i]}" \
      "${DISPLAY_NAMES[$i]}" \
      "${AGENTS[$i]}" >> "$SESSIONS_FILE"
  done
}

check_helper_scripts() {
  local helper
  for helper in swarmlog.sh; do
    if [[ ! -x "$SCRIPT_DIR/$helper" ]]; then
      echo -e "${RED}Error:${RESET} Required helper script not found or not executable: $SCRIPT_DIR/$helper"
      exit 1
    fi
  done
}

remove_obsolete_terminal_window_state() {
  rm -f \
    "$STATE_DIR/window-ids" \
    "$STATE_DIR/windows.tsv" \
    "$STATE_DIR/window-watchdog.log"
}

write_notify_script() {
  cat > "$SWARM_TOOLS_DIR/notify-agent.sh" <<'EOF'
#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}

find_project_dir() {
  local git_common_dir

  if git_common_dir=$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir 2>/dev/null); then
    if [[ "$git_common_dir" != /* ]]; then
      git_common_dir="$(cd "$SCRIPT_DIR/$git_common_dir" && pwd)"
    fi
    local project_dir="${git_common_dir:h}"
    if [[ -f "$project_dir/.swarmforge/sessions.tsv" ]]; then
      echo "$project_dir"
      return 0
    fi
  fi

  echo "${SCRIPT_DIR:h}"
}

PROJECT_DIR="$(find_project_dir)"
SESSIONS_FILE="$PROJECT_DIR/.swarmforge/sessions.tsv"
TMUX_SOCKET_FILE="$PROJECT_DIR/.swarmforge/tmux-socket"
if [[ ! -f "$TMUX_SOCKET_FILE" ]]; then
  echo "Tmux socket file not found: $TMUX_SOCKET_FILE" >&2
  exit 1
fi
TMUX_SOCKET="$(< "$TMUX_SOCKET_FILE")"

if [[ $# -lt 2 ]]; then
  echo "Usage: notify-agent.sh <target-role-or-index> \"message\"" >&2
  echo "       notify-agent.sh <target-role-or-index> --file <message-file>" >&2
  exit 1
fi

if [[ ! -f "$SESSIONS_FILE" ]]; then
  echo "Sessions file not found: $SESSIONS_FILE" >&2
  exit 1
fi

resolve_session() {
  local target="${1:l}"
  local index role session display agent

  while IFS=$'\t' read -r index role session display agent; do
    if [[ "$target" == "${index:l}" || "$target" == "${role:l}" ]]; then
      echo "$session"
      return 0
    fi
  done < "$SESSIONS_FILE"

  return 1
}

TARGET_PANE=$(resolve_session "$1") || {
  echo "Unknown target: $1" >&2
  exit 1
}

shift
if [[ "${1:-}" == "--file" ]]; then
  if [[ $# -ne 2 ]]; then
    echo "Usage: notify-agent.sh <target-role-or-index> --file <message-file>" >&2
    exit 1
  fi
  MESSAGE_FILE="$2"
  if [[ ! -f "$MESSAGE_FILE" ]]; then
    echo "Message file not found: $MESSAGE_FILE" >&2
    exit 1
  fi
  MESSAGE="$(< "$MESSAGE_FILE")"
else
  MESSAGE="$*"
fi

tmux -S "$TMUX_SOCKET" send-keys -t "${TARGET_SESSION}:0.0" -l -- "$MESSAGE"
sleep 0.15
tmux -S "$TMUX_SOCKET" send-keys -t "${TARGET_SESSION}:0.0" C-m
sleep 0.05
tmux -S "$TMUX_SOCKET" send-keys -t "${TARGET_SESSION}:0.0" C-j
EOF

  chmod +x "$SWARM_TOOLS_DIR/notify-agent.sh"
}

write_log_formatter_script() {
  cat > "$SWARM_TOOLS_DIR/format-agent-log.sh" <<'EOF'
#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
PROJECT_DIR="${SCRIPT_DIR:h}"
SESSIONS_FILE="$PROJECT_DIR/.swarmforge/sessions.tsv"
LOG_FILE="$PROJECT_DIR/logs/agent_messages.log"

mkdir -p "$PROJECT_DIR/logs"
touch "$LOG_FILE"

awk -F '\t' '
  BEGIN {
    cyan = "\033[0;36m"
    green = "\033[0;32m"
    yellow = "\033[1;33m"
    bold = "\033[1m"
    reset = "\033[0m"
    printf "%s%s%-19s  %-18s  %s%s\n", bold, cyan, "TIME", "TARGET", "MESSAGE", reset
    printf "%s%s\n", cyan, "-------------------  ------------------  -----------------------------------------------", reset
  }
  FILENAME == ARGV[1] {
    target_label[$3] = $4
    next
  }
  {
    if ($0 ~ /^\[[^]]+\] \[[^]]+\] /) {
      time = $0
      sub(/^\[/, "", time)
      sub(/\].*/, "", time)

      target = $0
      sub(/^\[[^]]+\] \[/, "", target)
      sub(/\].*/, "", target)

      message = $0
      sub(/^\[[^]]+\] \[[^]]+\] /, "", message)

      if (target in target_label) {
        target = target_label[target]
      }
      printf "%s%-19s%s  %s%-18s%s  %s\n", yellow, time, reset, green, target, reset, message
    } else {
      printf "%s\n", $0
    }
    fflush()
  }
' "$SESSIONS_FILE" <(tail -n +1 -F "$LOG_FILE")
EOF

  chmod +x "$SWARM_TOOLS_DIR/format-agent-log.sh"
}

prepare_workspace() {
  mkdir -p "$WORKING_DIR/logs" "$WORKING_DIR/agent_context" "$STATE_DIR" "$PROMPTS_DIR" "$SWARM_TOOLS_DIR" "$WORKTREES_DIR" "$TMUX_SOCKET_DIR"
  printf '%s\n' "$TMUX_SOCKET" > "$TMUX_SOCKET_FILE"
  remove_obsolete_terminal_window_state
  check_helper_scripts
  write_sessions_file
  write_notify_script
  write_log_formatter_script
}

write_worktree_notify_wrapper() {
  local worktree_path="$1"
  local wrapper_dir="$worktree_path/swarmtools"
  local wrapper="$wrapper_dir/notify-agent.sh"
  local canonical_notify="$SWARM_TOOLS_DIR/notify-agent.sh"

  mkdir -p "$wrapper_dir"
  {
    echo '#!/usr/bin/env zsh'
    echo 'set -euo pipefail'
    printf 'CANONICAL_NOTIFY_AGENT=%q\n' "$canonical_notify"
    echo 'exec "$CANONICAL_NOTIFY_AGENT" "$@"'
  } > "$wrapper"
  chmod +x "$wrapper"
}

prepare_worktrees() {
  local i worktree_name worktree_path branch_name
  for (( i = 1; i <= ${#ROLES[@]}; i++ )); do
    worktree_name="${WORKTREE_NAMES[$i]}"
    worktree_path="${WORKTREE_PATHS[$i]}"
    branch_name="swarmforge-${worktree_name}"

    if [[ "$worktree_name" == "none" || "$worktree_name" == "master" ]]; then
      continue
    fi

    if [[ ! -e "$worktree_path/.git" && ! -d "$worktree_path/.git" ]]; then
      git -C "$WORKING_DIR" worktree add --force -B "$branch_name" "$worktree_path" HEAD >/dev/null
    fi

    write_worktree_notify_wrapper "$worktree_path"
  done
}

check_backend_dependencies() {
  local i
  for (( i = 1; i <= ${#AGENTS[@]}; i++ )); do
    case "${AGENTS[$i]}" in
      claude) check_dependency claude ;;
      codex) check_dependency codex ;;
      opencode) check_dependency opencode ;;
    esac
  done
}

create_swarm_session() {
  local role="${ROLES[1]}"

  tmux -S "$TMUX_SOCKET" new-session -d -s "$SESSION_PREFIX" -n "$role"
  tmux -S "$TMUX_SOCKET" set-window-option -t "$SESSION_PREFIX:$role" allow-rename off
}

create_role_window() {
  local index="$1"
  local role="${ROLES[$index]}"

  if (( index == 1 )); then
    return
  fi

  tmux -S "$TMUX_SOCKET" new-window -t "$SESSION_PREFIX" -n "$role"
  tmux -S "$TMUX_SOCKET" set-window-option -t "$SESSION_PREFIX:$role" allow-rename off
}

write_agent_instruction_file() {
  local role="$1"
  local prompt_file="$2"
  local agent="$3"

  cat > "$prompt_file" <<EOF
Read swarmforge/constitution.prompt, then read every file it refers to recursively, and obey all of those instructions.
Read swarmforge/${role}.prompt, then read every file it refers to recursively, and follow all of those instructions.
Your configured agent backend for this role is: ${agent}.
For handoffs, run $SWARM_TOOLS_DIR/notify-agent.sh directly instead of relying on PATH lookup.
EOF
}

launch_role() {
  local index="$1"
  local role="${ROLES[$index]}"
  local agent="${AGENTS[$index]}"
  local model="${AGENT_MODELS[$index]}"
  local target="${SESSIONS[$index]}"
  local display="${DISPLAY_NAMES[$index]}"
  local role_worktree="${WORKTREE_PATHS[$index]}"
  local prompt_file="$PROMPTS_DIR/${role}.md"
  local launch_cmd=""

  write_agent_instruction_file "$role" "$prompt_file" "$agent"

  case "$agent" in
    claude)
      launch_cmd="export PATH='$SWARM_TOOLS_DIR:$SCRIPT_DIR':\$PATH && cd '$role_worktree' && claude --append-system-prompt-file '$prompt_file' --permission-mode acceptEdits -n 'SwarmForge ${display}' \"\$(cat '$prompt_file')\""
      ;;
    codex)
      launch_cmd="export PATH='$SWARM_TOOLS_DIR:$SCRIPT_DIR':\$PATH && cd '$role_worktree' && codex -C '$role_worktree' \"\$(cat '$prompt_file')\""
      ;;
    opencode)
      local opencode_model_args=""
      if [[ -n "$model" ]]; then
        opencode_model_args=" --model '$model'"
      fi
      launch_cmd="export PATH='$SWARM_TOOLS_DIR:$SCRIPT_DIR':\$PATH && cd '$role_worktree' && opencode '$role_worktree'$opencode_model_args --prompt \"\$(cat '$prompt_file')\""
      ;;
  esac

  tmux -S "$TMUX_SOCKET" send-keys -t "${target}.0" "$launch_cmd" Enter
  echo -e "  ${CYAN}[${display}]${RESET} started in tmux window ${target}"
}

check_dependency tmux
check_dependency git
remove_nonessential_clone_files
initialize_git_repo
ensure_runtime_git_excludes
parse_config
ensure_logger_window
check_backend_dependencies
prepare_workspace
prepare_worktrees

if tmux -S "$TMUX_SOCKET" has-session -t "$SESSION_PREFIX" 2>/dev/null; then
  echo -e "${YELLOW}Existing SwarmForge session found: ${SESSION_PREFIX}. Killing it...${RESET}"
  tmux -S "$TMUX_SOCKET" kill-session -t "$SESSION_PREFIX"
fi

echo -e "${CYAN}${BOLD}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║           SwarmForge v1.0 Starting            ║"
echo "  ║   Disciplined agents build better software    ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${RESET}"

echo -e "${GREEN}Launching SwarmForge tmux session...${RESET}"
create_swarm_session
for (( i = 1; i <= ${#ROLES[@]}; i++ )); do
  create_role_window "$i"
done

echo -e "${GREEN}Starting agents...${RESET}"
for (( i = 1; i <= ${#ROLES[@]}; i++ )); do
  launch_role "$i"
done

echo ""
echo -e "${GREEN}${BOLD}SwarmForge is ready.${RESET}"
echo -e "Working directory: ${WORKING_DIR}"
echo -e "Tmux session: ${SESSION_PREFIX}"
echo -e "Windows:"
for (( i = 1; i <= ${#ROLES[@]}; i++ )); do
  echo -e "  ${DISPLAY_NAMES[$i]}: ${SESSIONS[$i]}"
done
echo ""
echo -e "${GREEN}Tip: Use $WORKING_DIR/swarmtools/notify-agent.sh <role-or-index> --file <message-file> while the swarm is running.${RESET}"
echo -e "${GREEN}Tip: Reattach manually with 'tmux -S $TMUX_SOCKET attach-session -t $SESSION_PREFIX' if needed.${RESET}"
echo ""

tmux -S "$TMUX_SOCKET" attach-session -t "$SESSION_PREFIX"
