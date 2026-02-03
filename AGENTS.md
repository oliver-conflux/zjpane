# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## zjpane: Multi-Agent Pane Control

zjpane enables Claude Code agents to coordinate across zellij panes. Agents can spawn other agents, send them tasks, read their output, and clean up when done.

### Prerequisites

The zjpane plugin must be running. Launch it once per zellij session:
```bash
zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating
```

### Core Commands

| Command | Description |
|---------|-------------|
| `zellij pipe "zjpane::list"` | Returns JSON array: `[{"id":0,"title":"pane1"},...]` |
| `zellij pipe "zjpane::spawn::NAME[::DIRECTION]"` | Create pane. Direction: up/down/left/right |
| `zellij pipe "zjpane::write::NAME::TEXT"` | Send text + newline to pane by title |
| `zellij pipe "zjpane::write_id::ID::TEXT"` | Send text + newline to pane by ID |
| `zellij pipe "zjpane::read::NAME[::full]"` | Read pane output (viewport or full scrollback) |
| `zellij pipe "zjpane::read_id::ID[::full]"` | Read pane output by ID |
| `zellij pipe "zjpane::close::NAME"` | Close pane by title |
| `zellij pipe "zjpane::close_id::ID"` | Close pane by ID |

### Example: Spawn a Worker Agent

```bash
# Create a pane for the worker
zellij pipe "zjpane::spawn::worker::right"

# Send it a task
zellij pipe "zjpane::write::worker::claude \"Implement feature X in /path/to/project\""

# Later, check its output
zellij pipe "zjpane::read::worker"

# Clean up when done
zellij pipe "zjpane::close::worker"
```

### Example: Orchestrator Pattern

```bash
# List existing panes
panes=$(zellij pipe "zjpane::list")

# Spawn specialized agents
zellij pipe "zjpane::spawn::researcher::right"
zellij pipe "zjpane::spawn::implementer::down"

# Assign tasks
zellij pipe "zjpane::write::researcher::claude \"Research how X works in this codebase\""
zellij pipe "zjpane::write::implementer::claude \"Wait for researcher, then implement\""

# Monitor progress
zellij pipe "zjpane::read::researcher"
zellij pipe "zjpane::read::implementer"
```

### Agent Communication Protocol

When agents communicate via write_to_pane, use these message prefixes for coordination:

| Prefix | Usage | Example |
|--------|-------|---------|
| `[TASK]` | Assign work to an agent | `[TASK] Explore src/ and find auth handlers` |
| `[CLAIM]` | Claim files before editing | `[CLAIM] target:"src/auth/*" goal:"add validation"` |
| `[ACK]` | Acknowledge a claim | `[ACK] Claim accepted, staying out of src/auth/*` |
| `[DONE]` | Report task completion | `[DONE] Found 3 auth handlers in src/auth/` |
| `[CONFLICT]` | Report file conflicts | `[CONFLICT] worker-2 already claimed src/auth/*` |

**Example conversation:**
```
Maestro → worker-1: [TASK] Fix validation in zellij-swarm-mcp/src/index.ts
worker-1 → Maestro: [CLAIM] target:"zellij-swarm-mcp/*" goal:"add pane validation"
Maestro → worker-1: [ACK] Claim accepted
worker-1 → Maestro: [DONE] Added validation, pane existence now checked before write
```

### CRITICAL: Pane Naming Issue

**Claude Code dynamically changes pane titles!** By default, the pane title reflects the current task/activity and includes an animated spinner prefix (⠂, ⠐, ⠴, ✳, etc.). This causes **messages to silently fail** when the target pane name changes between when you look it up and when you send.

**The Fix: Set a stable pane name using zellij:**

```bash
zellij action rename-pane "Maestro"    # For the orchestrator/main agent
zellij action rename-pane "worker-1"   # For worker agents
zellij action rename-pane "a12"        # Use bead IDs for task-specific workers
```

**Best practices for multi-agent coordination:**

1. **Rename your pane immediately on startup** - Before any inter-agent communication
2. **Use meaningful names** - Task IDs, role names (Maestro, worker-1), or descriptive names
3. **Spawned panes keep their names** - `zjpane::spawn::worker-1` creates a stable "worker-1" pane
4. **Always list_panes first** - Verify pane names before sending messages

### Agent Naming Convention

**The first/main agent MUST rename itself immediately.** Claude Code's default pane title is dynamic and unstable - other agents won't be able to reply to you! Pick a fun name:

```bash
zellij action rename-pane "Maestro"    # or "Bossman", "Padre", "Conductor", etc.
```

**Then name spawned agents after their task in the project's task management system.** This creates a clear link between the agent and the work it's doing.

| Task System | Example Agent Names |
|-------------|---------------------|
| **beads (bd)** | `zjpane-bsi`, `auth-x4f`, `fix-login-abc` |
| **conflux kanban** | `PROJ-123`, `feature-456` |
| **generic** | `worker-1`, `test-runner`, `feature-auth` |

**Workflow:**
```bash
# 1. Create a task/issue for the work
bd create --title "Fix authentication bug"
# → Created issue: auth-x4f

# 2. Spawn an agent named after the task
spawn_agent: name="auth-x4f", task="Run 'bd show auth-x4f' and fix the issue"

# 3. When done, close the task
bd close auth-x4f
```

This pattern makes it easy to:
- See what each agent is working on at a glance
- Track which tasks are in progress
- Clean up agents when their task is complete

### Notes

- Pane names must be unique for `write`/`read`/`close` by name
- Use `_id` variants if you need to target by numeric ID
- `read` returns viewport by default; append `::full` for full scrollback
- Text sent via `write` automatically gets a newline appended
- MCP tools validate pane existence and return `available_panes` list on error
- Raw `zellij pipe` commands bypass validation - prefer MCP tools for reliability

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

