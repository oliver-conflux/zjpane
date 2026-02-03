import { execFileSync } from 'child_process';

export interface Pane {
  id: number;
  title: string;
}

export class ZjpaneError extends Error {
  constructor(message: string, public readonly command: string) {
    super(message);
    this.name = 'ZjpaneError';
  }
}

// Constants for spawn verification
const SPAWN_TIMEOUT_MS = 3000;
const SPAWN_POLL_INTERVAL_MS = 50;

/**
 * Sleep helper for async polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate that a pane with the given name does NOT exist (for pre-spawn check)
 * Throws if a pane with this name already exists
 */
export function validatePaneNotExists(name: string): void {
  const panes = listPanes();
  if (panes.some(p => p.title === name)) {
    throw new ZjpaneError(
      `Pane "${name}" already exists`,
      `spawn::${name}`
    );
  }
}

/**
 * Poll until a pane with the given name exists (for post-spawn verification)
 * Throws if pane doesn't appear within timeout
 */
export async function waitForPaneCreated(name: string): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < SPAWN_TIMEOUT_MS) {
    if (listPanes().some(p => p.title === name)) {
      return; // Success - pane exists
    }
    await sleep(SPAWN_POLL_INTERVAL_MS);
  }

  // Timeout - spawn failed
  throw new ZjpaneError(
    `Pane "${name}" failed to spawn within ${SPAWN_TIMEOUT_MS}ms`,
    `spawn::${name}`
  );
}

/**
 * Execute a zjpane command via zellij pipe
 */
export function zjpaneCommand(cmd: string, timeout = 10000): string {
  try {
    const output = execFileSync('zellij', ['pipe', `zjpane::${cmd}`], {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim();
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    if (err.message?.includes('ETIMEDOUT') || err.message?.includes('timed out')) {
      throw new ZjpaneError(
        'zjpane command timed out - is the zjpane plugin loaded? Run: zellij action launch-or-focus-plugin "file:~/.config/zellij/plugins/zjpane.wasm" --floating',
        cmd
      );
    }
    throw new ZjpaneError(
      `zjpane command failed: ${err.message || 'Unknown error'}`,
      cmd
    );
  }
}

/**
 * List all panes in the current zellij session
 */
export function listPanes(): Pane[] {
  const output = zjpaneCommand('list');
  if (!output) {
    return [];
  }
  try {
    return JSON.parse(output) as Pane[];
  } catch {
    throw new ZjpaneError(`Failed to parse pane list: ${output}`, 'list');
  }
}

/**
 * Spawn a new named pane with full validation
 * - Pre-spawn: validates no duplicate name exists
 * - Post-spawn: polls until pane appears or times out
 * Throws ZjpaneError on duplicate name or spawn failure
 */
export async function spawnPane(name: string, direction?: 'up' | 'down' | 'left' | 'right'): Promise<void> {
  // Pre-spawn validation: reject duplicates
  validatePaneNotExists(name);

  // Execute spawn command
  const cmd = direction ? `spawn::${name}::${direction}` : `spawn::${name}`;
  zjpaneCommand(cmd);

  // Post-spawn verification: poll until pane exists
  await waitForPaneCreated(name);
}

/**
 * Write text to a pane by name (with auto carriage return)
 */
export function writeToPane(name: string, text: string): void {
  zjpaneCommand(`write::${name}::${text}`);
}

/**
 * Write text to a pane by ID (with auto carriage return)
 */
export function writeToPaneById(id: number, text: string): void {
  zjpaneCommand(`write_id::${id}::${text}`);
}

/**
 * Write text to a pane by name WITHOUT carriage return
 * Use this with sendEnter() for multi-step input
 */
export function writeRawToPane(name: string, text: string): void {
  zjpaneCommand(`write_raw::${name}::${text}`);
}

/**
 * Write text to a pane by ID WITHOUT carriage return
 */
export function writeRawToPaneById(id: number, text: string): void {
  zjpaneCommand(`write_raw_id::${id}::${text}`);
}

/**
 * Send Enter/carriage return to a pane by name
 */
export function sendEnter(name: string): void {
  zjpaneCommand(`send_enter::${name}`);
}

/**
 * Send Enter/carriage return to a pane by ID
 */
export function sendEnterById(id: number): void {
  zjpaneCommand(`send_enter_id::${id}`);
}

/**
 * Read pane contents by name
 * @param name Pane title
 * @param full If true, returns entire scrollback; otherwise returns viewport only
 */
export function readPane(name: string, full = false): string {
  const cmd = full ? `read::${name}::full` : `read::${name}`;
  return zjpaneCommand(cmd);
}

/**
 * Read pane contents by ID
 */
export function readPaneById(id: number, full = false): string {
  const cmd = full ? `read_id::${id}::full` : `read_id::${id}`;
  return zjpaneCommand(cmd);
}

/**
 * Close a pane by name
 */
export function closePane(name: string): void {
  zjpaneCommand(`close::${name}`);
}

/**
 * Close a pane by ID
 */
export function closePaneById(id: number): void {
  zjpaneCommand(`close_id::${id}`);
}

/**
 * Focus a pane by name
 */
export function focusPane(name: string): void {
  zjpaneCommand(`focus::${name}`);
}

/**
 * Spawn a new Claude Code agent in a pane with a task
 * Validates pane creation before sending the command
 */
export async function spawnAgent(
  name: string,
  task: string,
  options?: {
    direction?: 'up' | 'down' | 'left' | 'right';
    workingDir?: string;
  }
): Promise<void> {
  // Spawn the pane (includes validation and verification)
  await spawnPane(name, options?.direction);

  // Build the claude command using heredoc for robust shell escaping
  // The single-quoted delimiter ('EOF') prevents any shell expansion
  let cmd = `claude "$(cat <<'EOF'
${task}
EOF
)"`;
  if (options?.workingDir) {
    cmd = `cd ${options.workingDir} && ${cmd}`;
  }

  writeToPane(name, cmd);
}

/**
 * Check if zjpane plugin is loaded by attempting a list command
 */
export function isZjpaneLoaded(): boolean {
  try {
    listPanes();
    return true;
  } catch {
    return false;
  }
}
