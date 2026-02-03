# zjpane Plugin Fix - Session Notes

## What we're doing
Fixing the zjpane zellij plugin so Claude Code can focus specific panes by name/ID.

## The problem
- zjpane was compiled against `zellij-tile = "0.41.2"`
- You're running Zellij 0.43.1
- The plugin crashes with `"invalid_key"` panic due to API incompatibility

## What we did
1. Found the pulled repo at `/home/osmcgraw/repos/zjpane`
2. Updated `Cargo.toml` to use `zellij-tile = "0.43.1"`
3. Installed wasm target: `rustup target add wasm32-wasip1`
4. Built: `cargo build --release --target wasm32-wasip1`
5. Copied to plugins: `cp target/wasm32-wasip1/release/zjpane.wasm ~/.config/zellij/plugins/`
6. Cleared cache: `rm -rf ~/.cache/zellij/*`

## Next steps after restart
1. Press `Alt+y` to launch zjpane
2. If prompted for permissions, type `y` to grant
3. Test pipe commands:
   ```bash
   zellij pipe "zjpane::focus::PANE_NAME"
   zellij pipe "zjpane::focus_at::0"
   zellij pipe "zjpane::focus_id::PANE_ID"
   ```

## If it still crashes
The `"invalid_key"` error might be deeper in zellij-tile's key event handling. May need to:
- Check zellij-tile changelog for breaking changes
- Look at how key events are serialized/deserialized in 0.43.x
- Possibly patch zjpane's key handling code

## Goal
Let Claude Code select specific panes by name when running multi-pane workflows.
