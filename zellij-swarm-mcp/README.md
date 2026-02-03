# zellij-swarm-mcp

MCP server for managing zellij panes via the zjpane plugin. Enables Claude Code agents to spawn, read, write, and close terminal panes programmatically.

## Prerequisites

1. **Zellij** with the zjpane plugin installed and loaded
2. **Node.js** v18+
3. **zjpane plugin** must be running in your zellij session:
   ```bash
   zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating
   ```

## Installation

```bash
cd zellij-swarm-mcp
npm install
npm run build
```

## Configuration

Add to your Claude Code MCP config (`~/.claude/mcp.json` or project `.mcp.json`):

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

## Tools

### list_panes
List all terminal panes with their IDs and titles.

```json
{ "panes": [{"id": 0, "title": "zsh"}, {"id": 1, "title": "nvim"}] }
```

### spawn_pane
Create a new named pane.

**Parameters:**
- `name` (required): Name/title for the new pane
- `direction` (optional): `up`, `down`, `left`, `right`

### write_to_pane
Send text/keystrokes to a pane.

**Parameters:**
- `name` (required): Pane name/title
- `text` (required): Text to send (include `\n` for Enter)

### read_pane
Read terminal contents from a pane.

**Parameters:**
- `name` (required): Pane name/title
- `full` (optional): If true, returns entire scrollback

### close_pane
Close a pane by name.

**Parameters:**
- `name` (required): Pane name/title

### spawn_agent
Convenience tool: spawn a pane and start a Claude Code agent with a task.

**Parameters:**
- `name` (required): Agent pane name
- `task` (required): Task/prompt for the agent
- `direction` (optional): Split direction
- `working_dir` (optional): Working directory

## Usage Example

From Claude Code, once the MCP server is configured:

1. List existing panes: `list_panes`
2. Spawn a worker agent: `spawn_agent(name: "worker", task: "Fix the bug in auth.ts", direction: "right")`
3. Check worker progress: `read_pane(name: "worker")`
4. Clean up: `close_pane(name: "worker")`

## Troubleshooting

**"zjpane command timed out"**
- Ensure zjpane plugin is loaded: `zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating`

**"Pane not found"**
- Use `list_panes` to see available pane names
- Pane names are case-sensitive

**Commands not working**
- Ensure you're running Claude Code inside a zellij session
- The MCP server must run in the same zellij session as the panes you want to control
