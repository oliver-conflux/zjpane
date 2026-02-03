# zjpane Plugin - Development Notes

## Goal
Enable Claude Code to manage zellij panes programmatically:
1. Create named panes for observable agents
2. List panes with their names/IDs
3. Focus specific panes by name/ID
4. Send commands to specific panes

## Current Status (Session 7)
**All core features working including pane read!**

## What Works
- `zellij pipe "zjpane::list"` - returns JSON array of panes with id and title
- `zellij pipe "zjpane::focus_at::INDEX"` - focuses pane by index in zjpane's list
- `zellij pipe "zjpane::focus_id::ID"` - focuses pane by numeric ID
- `zellij pipe "zjpane::focus::PANE_NAME"` - focuses pane by title
- `zellij pipe "zjpane::spawn::NAME[::DIRECTION]"` - creates named tiled pane (direction: up/down/left/right)
- `zellij pipe "zjpane::write::NAME::TEXT"` - writes text to pane by title
- `zellij pipe "zjpane::write_id::ID::TEXT"` - writes text to pane by numeric ID
- `zellij pipe "zjpane::read::NAME[::full]"` - reads pane scrollback by title (viewport or full)
- `zellij pipe "zjpane::read_id::ID[::full]"` - reads pane scrollback by ID (viewport or full)
- `zellij pipe "zjpane::close::NAME"` - closes pane by title
- `zellij pipe "zjpane::close_id::ID"` - closes pane by numeric ID
- `zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating` - launches zjpane via CLI

### Example Workflow
```bash
# Launch zjpane first (REQUIRED for pipe commands to work)
zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating

# List all panes as JSON
zellij pipe "zjpane::list"
# Output: [{"id":0,"title":"zsh"},{"id":1,"title":"nvim"}]

# Focus a pane by index, ID, or name
zellij pipe "zjpane::focus_at::0"
zellij pipe "zjpane::focus_id::1"
zellij pipe "zjpane::focus::nvim"
```

## Session 1: Fixed zellij-tile Version

### Problem
- zjpane was compiled against `zellij-tile = "0.41.2"`
- Running Zellij 0.43.1
- Plugin crashed with `"invalid_key"` panic due to API incompatibility

### Solution
Updated `Cargo.toml`:
```toml
zellij-tile = "0.43.1"  # was 0.41.2
```

## Session 2: Added "list" Command & Forked Repo

### Forked to oliver-conflux/zjpane
- Original: FuriouZz/zjpane
- Fork: https://github.com/oliver-conflux/zjpane

### Code Changes in src/main.rs

1. **Changed `parse_pipe` signature** to receive full `PipeMessage`:
```rust
fn parse_pipe(&mut self, pipe_message: &PipeMessage) -> bool
```

2. **Updated pipe() to pass full message**:
```rust
fn pipe(&mut self, pipe_message: PipeMessage) -> bool {
    match pipe_message.source {
        PipeSource::Cli(_) | PipeSource::Plugin(_) | PipeSource::Keybind => {
            should_render = self.parse_pipe(&pipe_message);
        }
    }
    should_render
}
```

3. **Allow 2-part commands** (zjpane::list) not just 3-part:
```rust
if parts.len() < 2 {  // was < 3
    return false;
}
let payload = if parts.len() > 2 { parts[2] } else { "" };
```

4. **Added "list" action**:
```rust
"list" => {
    if let PipeSource::Cli(pipe_id) = &pipe_message.source {
        let panes_json: Vec<String> = self.panes.iter().map(|p| {
            format!("{{\"id\":{},\"title\":\"{}\"}}", p.id, p.title.replace("\"", "\\\""))
        }).collect();
        let output = format!("[{}]", panes_json.join(","));
        cli_pipe_output(pipe_id, &output);
    }
}
```

### Problem
The `zellij pipe "zjpane::list"` command hangs. Possible causes:
- `cli_pipe_output` may need additional calls to signal EOF/completion
- May need `unblock_cli_pipe_input` or similar
- Zellij may need full restart for plugin changes to take effect

## Build & Install Commands
```bash
cd ~/repos/zjpane
cargo build --release --target wasm32-wasip1
cp target/wasm32-wasip1/release/zjpane.wasm ~/.config/zellij/plugins/
rm -rf ~/.cache/zellij/*
# IMPORTANT: Restart zellij entirely for changes to take effect
```

## Test Commands (After Zellij Restart)
```bash
# Launch zjpane first (REQUIRED for pipe commands to work)
zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating

# Or press Alt+y

# Test list (our new command)
zellij pipe "zjpane::list"

# Test focus by index (known working)
zellij pipe "zjpane::focus_at::0"
```

## Session 3: Fixed Regression & Updated List Pattern

### Problem Found
The unstaged changes from Session 2 broke `focus_at` by checking `pipe_message.name` first.

When you run `zellij pipe "message"`, the message goes into `payload`, NOT `name`:
```
zellij pipe [OPTIONS] [--] <PAYLOAD>
ARGS:
    <PAYLOAD>    The data to send down this pipe
```

### Fixes Applied
1. **Reverted to use `payload`** - Fixed the focus_at regression
2. **Updated list to follow strider filepicker pattern**:
   ```rust
   block_cli_pipe_input(pipe_id);   // Block first
   cli_pipe_output(pipe_id, &output);  // Send data
   unblock_cli_pipe_input(pipe_id);  // Unblock to complete
   ```

### References Used
- Strider filepicker source: https://github.com/zellij-org/zellij (default-plugins/strider/)
- Zellij pipe docs: https://zellij.dev/documentation/plugin-pipes

## Session 4: Fixed cli_pipe_output - Missing Permission!

### Root Cause Found
The `cli_pipe_output` function requires `PermissionType::ReadCliPipes` permission. Without it, zellij server silently drops the output - no error, no warning, just nothing.

### The Fix
Added the missing permission to `load()`:
```rust
request_permission(&[
    PermissionType::ReadApplicationState,
    PermissionType::ChangeApplicationState,
    PermissionType::OpenTerminalsOrPlugins,
    PermissionType::RunCommands,
    PermissionType::ReadCliPipes,  // <-- THIS WAS MISSING
]);
```

### How We Found It
Traced through zellij source code in `~/repos/zellij`:
- `zellij-server/src/plugins/zellij_exports.rs` line ~3899
- `PluginCommand::CliPipeOutput` checks for `PermissionType::ReadCliPipes`
- Plugin wasn't requesting this permission, so output was silently ignored

### Why Original Plugin Didn't Need It
The original zjpane was one-way only - it received commands and took actions (focus pane, etc.) but never sent data back to CLI. So it never needed `ReadCliPipes`.

## Session 5: Built Zellij from Source for Read Pane API

### Why This Was Necessary
The `get_pane_scrollback(pane_id, get_full)` API needed for reading pane contents is not available in any official Zellij release (as of February 2025). It only exists on the main branch.

### What We Did
Built Zellij from the main branch to get access to the new plugin APIs:
```bash
cd ~/repos/zellij
git pull origin main
cargo build --release
# Use the built binary instead of system zellij
```

### New APIs Now Available
With the main branch build, we now have access to:
```rust
// Read pane contents directly - THE KEY API FOR AGENT SWARMING
get_pane_scrollback(pane_id: PaneId, get_full: bool) -> Result<PaneContents, String>
```

This eliminates the need for the workaround (focus → dump-screen → read file) and enables true bi-directional communication between agents.

### Next Steps
- Update zellij-tile dependency to match main branch (or use git dependency)
- Add `zjpane::read::ID` command using `get_pane_scrollback`
- Add `zjpane::write::ID::TEXT` command using `write_chars_to_pane_id`

---

## Future: Claude Code Agent Swarming

### The Vision
Enable Claude Code instances to work together across zellij panes:
- Agents can send messages to each other ("report back to Bob when done")
- Run subprocesses in visible panes (human can watch AND Claude gets output)
- True multi-agent orchestration from an MCP server

### Discovered Zellij APIs (zellij-tile 0.43.1)

**Available NOW:**
```rust
// Write to a specific pane by ID (not just focused pane)
write_chars_to_pane_id(chars: &str, pane_id: PaneId)
write_to_pane_id(bytes: Vec<u8>, pane_id: PaneId)
```

**Available in newer zellij (not in 0.43.1):**
```rust
// Read pane contents directly
get_pane_scrollback(pane_id: PaneId, get_full: bool) -> Result<PaneContents, String>
```

**CLI limitations:**
```bash
zellij action write-chars "text"     # focused pane only, no --pane-id flag
zellij action dump-screen /path      # focused pane only, no --pane-id flag
```

### Architecture Decision: Plugin vs Fork Zellij

**Option A: Extend zjpane plugin (current approach)**
```
MCP Server → zellij pipe "zjpane::write::ID::text" → plugin → write_chars_to_pane_id()
```
- Pro: Works with stock zellij, no fork needed
- Con: Extra hop, plugin must be running

**Option B: Fork zellij, add --pane-id flags**
```
MCP Server → zellij action write-chars --pane-id 5 "text"
```
- Pro: Direct, clean, one less moving part
- Con: Maintain a zellij fork, PRs might not merge upstream

**Decision: TBD** - Plugin approach works today; fork is cleaner long-term.

### Proposed MCP Server Tools

```typescript
// Pane management
list_panes()                         → [{id, name, title}]
focus_pane(name_or_id)               → focuses pane
spawn_agent(name, command)           → new Claude in visible pane

// I/O to specific panes
write_to_pane(name_or_id, text)      → sends keystrokes
read_pane(name_or_id)                → gets terminal contents (needs workaround or newer zellij)

// Agent messaging (stateful in MCP server)
send_message(to_agent, message)      → queues message
receive_messages()                   → gets messages for this agent

// Visible subprocess execution
run_visible(command, pane_name)      → {pane_id, output_file}
read_output(pane_name)               → gets captured output
```

### Next Steps
1. ~~Add `zjpane::write::ID::TEXT` command using `write_chars_to_pane_id`~~ ✓ Done
2. ~~Add `zjpane::read::ID` command using `get_pane_scrollback`~~ ✓ Done (Session 7)
3. ~~Add `zjpane::close` commands~~ ✓ Done (Session 6)
4. ~~Plan MCP server~~ ✓ Done (Session 8)
5. **BUILD MCP SERVER** - See Session 8 for full plan

## Session 6: Added Close Commands

### What We Added
- `zjpane::close::NAME` - closes pane by title
- `zjpane::close_id::ID` - closes pane by numeric ID

Uses `close_terminal_pane(pane_id)` from zellij-tile.

### Agent Swarming Demo
Successfully demonstrated multi-agent coordination:
1. `zjpane::spawn::planner::right` - created a new pane
2. `zjpane::write::planner::claude "task..."` - sent Claude to work in that pane
3. `zjpane::list` - enumerated all panes

The infrastructure for agent swarming is now functional - spawn, write, close, list, focus all working.

## Session 7: Added Read Commands

### What We Added
- `zjpane::read::NAME[::full]` - reads pane scrollback by title
- `zjpane::read_id::ID[::full]` - reads pane scrollback by numeric ID

Uses `get_pane_scrollback(PaneId, get_full)` from zellij-tile main branch.

### Implementation Details
- Added `PermissionType::ReadPaneContents` permission
- Uses deferred output pattern (like `list`) with timer event
- `::full` suffix returns entire scrollback; without it returns viewport only
- Returns `PaneContents.viewport` (and `lines_above/below_viewport` when full)

### API Notes
- `get_pane_scrollback` is synchronous, blocks up to 5 seconds
- Requires zellij built from main branch (not in 0.43.x releases)

## Session 9: Added write_raw and send_enter commands

### Problem
When sending text to Claude Code's interactive input, the text appears but doesn't submit. The issue is that Claude Code's TUI needs a delay between receiving text and receiving Enter.

### Solution (from tmux workaround research)
The tmux community uses this pattern:
```bash
tmux send-keys -t "$target" "$message" && sleep 0.1 && tmux send-keys -t "$target" Enter
```

We added new commands to support this pattern:
- `zjpane::write_raw::NAME::TEXT` - writes text WITHOUT carriage return
- `zjpane::write_raw_id::ID::TEXT` - same but by pane ID
- `zjpane::send_enter::NAME` - sends just carriage return
- `zjpane::send_enter_id::ID` - same but by pane ID

### Changes Made
1. **src/main.rs** - Added 4 new commands (write_raw, write_raw_id, send_enter, send_enter_id)
2. **zellij-swarm-mcp/src/zjpane.ts** - Added wrapper functions
3. **zellij-swarm-mcp/src/index.ts** - Added `send_enter` tool and `send_enter` param to `write_to_pane`

### Build Status
- Plugin built: `cargo build --release` ✓
- Plugin installed: `cp target/wasm32-wasip1/release/zjpane.wasm ~/.config/zellij/plugins/` ✓
- MCP server built: `cd zellij-swarm-mcp && npm run build` ✓

### To Test (after zellij restart)
1. Restart zellij session to reload plugin
2. Restart MCP server (or restart Claude Code)
3. Test the new pattern:
   ```
   spawn_pane("test-claude")
   write_to_pane("test-claude", "claude", send_enter=true)  # start claude
   # wait for claude to load
   write_to_pane("test-claude", "Hello!", send_enter=false)  # type message
   # wait 100ms
   send_enter("test-claude")  # submit
   ```

### Sources
- [claude-commander](https://github.com/sstraus/claude-commander) - socket-based approach
- [GitHub Issue #2929](https://github.com/anthropics/claude-code/issues/2929) - tmux workaround

---

## Session 8: MCP Server Planning

### Goal
Build `zellij-swarm-mcp` - an MCP server that exposes zjpane commands as tools for Claude Code agents.

### Why MCP?
- Claude Code natively supports MCP servers
- Tools are discoverable and self-documenting
- Structured input/output (JSON schemas)
- No need to remember pipe command syntax

### Proposed Tools

```typescript
// Core pane operations
list_panes() → { panes: [{id: number, title: string}] }
spawn_pane(name: string, direction?: "up"|"down"|"left"|"right") → { success: boolean }
write_to_pane(name: string, text: string) → { success: boolean }
read_pane(name: string, full?: boolean) → { content: string }
close_pane(name: string) → { success: boolean }

// Convenience: spawn + start claude in one call
spawn_agent(name: string, task: string, direction?: string) → { success: boolean }
```

### Implementation Plan

**Language:** TypeScript with `@modelcontextprotocol/sdk`
- Well-documented, standard MCP approach
- Easy JSON handling
- Good subprocess support via Node

**Directory Structure:**
```
zellij-swarm-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── tools.ts          # Tool definitions
│   └── zjpane.ts         # Wrapper for zellij pipe commands
└── README.md
```

**Core Implementation (src/zjpane.ts):**
```typescript
import { execSync } from 'child_process';

export function zjpaneCommand(cmd: string): string {
  return execSync(`zellij pipe "zjpane::${cmd}"`, { encoding: 'utf-8' });
}

export function listPanes(): {id: number, title: string}[] {
  const output = zjpaneCommand('list');
  return JSON.parse(output);
}

export function spawnPane(name: string, direction?: string): void {
  const cmd = direction ? `spawn::${name}::${direction}` : `spawn::${name}`;
  zjpaneCommand(cmd);
}

export function writeToPane(name: string, text: string): void {
  // Escape :: in text to avoid command injection
  const safeText = text.replace(/::/g, ':\\:');
  zjpaneCommand(`write::${name}::${safeText}`);
}

export function readPane(name: string, full = false): string {
  const cmd = full ? `read::${name}::full` : `read::${name}`;
  return zjpaneCommand(cmd);
}

export function closePane(name: string): void {
  zjpaneCommand(`close::${name}`);
}
```

**MCP Server (src/index.ts):**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as zjpane from './zjpane.js';

const server = new Server({ name: 'zellij-swarm', version: '1.0.0' }, {
  capabilities: { tools: {} }
});

server.setRequestHandler('tools/list', async () => ({
  tools: [
    { name: 'list_panes', description: 'List all terminal panes', inputSchema: { type: 'object', properties: {} } },
    { name: 'spawn_pane', description: 'Create a new named pane', inputSchema: { ... } },
    { name: 'write_to_pane', description: 'Send text to a pane', inputSchema: { ... } },
    { name: 'read_pane', description: 'Read pane contents', inputSchema: { ... } },
    { name: 'close_pane', description: 'Close a pane', inputSchema: { ... } },
    { name: 'spawn_agent', description: 'Spawn a Claude agent with a task', inputSchema: { ... } },
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  switch (request.params.name) {
    case 'list_panes':
      return { content: [{ type: 'text', text: JSON.stringify(zjpane.listPanes()) }] };
    case 'spawn_pane':
      zjpane.spawnPane(request.params.arguments.name, request.params.arguments.direction);
      return { content: [{ type: 'text', text: 'Pane spawned' }] };
    // ... etc
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Configuration

**Claude Code MCP config (~/.claude/mcp.json or project .mcp.json):**
```json
{
  "mcpServers": {
    "zellij-swarm": {
      "command": "node",
      "args": ["/path/to/zellij-swarm-mcp/dist/index.js"]
    }
  }
}
```

### Prerequisites
- zjpane plugin must be loaded in zellij session
- MCP server runs inside the zellij session (so `zellij pipe` works)
- Node.js installed

### Edge Cases to Handle
1. **zjpane not loaded** - detect and return helpful error
2. **Pane doesn't exist** - handle gracefully in read/write/close
3. **Command escaping** - `::` in text could break parsing (need escape mechanism)
4. **Timeout** - `read` with full scrollback on huge output could be slow

### Future Enhancements
- `wait_for_pattern(pane, regex, timeout)` - wait until output matches
- `send_message(from, to, msg)` - higher-level agent messaging (stateful)
- `get_agent_status(name)` - parse pane for completion indicators
- Resource exposure: list panes as MCP resources for context

### Next Steps
1. Create `zellij-swarm-mcp/` directory
2. Initialize npm project with TypeScript
3. Implement zjpane.ts wrapper
4. Implement MCP server with tool handlers
5. Test with Claude Code
6. Document usage in README

## Useful References
- zellij plugin pipes: https://zellij.dev/documentation/plugin-pipes
- cli_pipe_output API: https://docs.rs/zellij-tile/latest/zellij_tile/shim/fn.cli_pipe_output.html
- PipeMessage struct: https://docs.rs/zellij-tile/latest/zellij_tile/prelude/struct.PaneContents.html
- zellij source (cloned): ~/repos/zellij
- zjstatus plugin (pipe examples): https://github.com/dj95/zjstatus
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP Server Examples: https://github.com/modelcontextprotocol/servers
