# zjpane Plugin - Development Notes

## Goal
Enable Claude Code to manage zellij panes programmatically:
1. Create named panes for observable agents
2. List panes with their names/IDs
3. Focus specific panes by name/ID
4. Send commands to specific panes

## Current Status (Session 4)
**All core features working!**

## What Works
- `zellij pipe "zjpane::list"` - returns JSON array of panes with id and title
- `zellij pipe "zjpane::focus_at::INDEX"` - focuses pane by index in zjpane's list
- `zellij pipe "zjpane::focus_id::ID"` - focuses pane by numeric ID
- `zellij pipe "zjpane::focus::PANE_NAME"` - focuses pane by title
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

## Useful References
- zellij plugin pipes: https://zellij.dev/documentation/plugin-pipes
- cli_pipe_output API: https://docs.rs/zellij-tile/latest/zellij_tile/shim/fn.cli_pipe_output.html
- PipeMessage struct: https://docs.rs/zellij-tile/latest/zellij_tile/prelude/struct.PipeMessage.html
- zjstatus plugin (may have pipe examples): https://github.com/dj95/zjstatus
