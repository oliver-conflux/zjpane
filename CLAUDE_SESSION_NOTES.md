# zjpane Plugin - Development Notes

## Goal
Enable Claude Code to manage zellij panes programmatically:
1. Create named panes for observable agents
2. List panes with their names/IDs
3. Focus specific panes by name/ID
4. Send commands to specific panes

## What Works
- `zellij pipe "zjpane::focus_at::INDEX"` - focuses pane by index in zjpane's list
- `zellij pipe "zjpane::focus::PANE_NAME"` - focuses pane by title
- `zellij action list-clients` - shows pane IDs and running commands
- `zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating` - launches zjpane via CLI

## What Doesn't Work (Yet)
- `zjpane::focus_id::ID` - hangs (may be a bug in original zjpane)
- `zjpane::list` - we added this but it hangs; need to debug cli_pipe_output

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

## Next Steps
1. Restart zellij completely and test if "list" works
2. If still hanging, investigate:
   - Check if pipe needs explicit close/EOF signal
   - Look at other zellij plugins that use `cli_pipe_output` for examples (zjstatus?)
   - Try adding debug logging to see if code path is reached
3. Once list works, test full workflow:
   - Create pane: `zellij run --name "agent-1" -- bash`
   - List panes: `zellij pipe "zjpane::list"`
   - Focus pane: `zellij pipe "zjpane::focus::agent-1"`
   - Write to pane: `zellij action write-chars "command"`

## Useful References
- zellij plugin pipes: https://zellij.dev/documentation/plugin-pipes
- cli_pipe_output API: https://docs.rs/zellij-tile/latest/zellij_tile/shim/fn.cli_pipe_output.html
- PipeMessage struct: https://docs.rs/zellij-tile/latest/zellij_tile/prelude/struct.PipeMessage.html
- zjstatus plugin (may have pipe examples): https://github.com/dj95/zjstatus
