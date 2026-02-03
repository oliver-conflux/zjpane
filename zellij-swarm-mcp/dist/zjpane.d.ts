export interface Pane {
    id: number;
    title: string;
}
export declare class ZjpaneError extends Error {
    readonly command: string;
    constructor(message: string, command: string);
}
/**
 * Validate that a pane with the given name does NOT exist (for pre-spawn check)
 * Throws if a pane with this name already exists
 */
export declare function validatePaneNotExists(name: string): void;
/**
 * Poll until a pane with the given name exists (for post-spawn verification)
 * Throws if pane doesn't appear within timeout
 */
export declare function waitForPaneCreated(name: string): Promise<void>;
/**
 * Execute a zjpane command via zellij pipe
 */
export declare function zjpaneCommand(cmd: string, timeout?: number): string;
/**
 * List all panes in the current zellij session
 */
export declare function listPanes(): Pane[];
/**
 * Spawn a new named pane with full validation
 * - Pre-spawn: validates no duplicate name exists
 * - Post-spawn: polls until pane appears or times out
 * Throws ZjpaneError on duplicate name or spawn failure
 */
export declare function spawnPane(name: string, direction?: 'up' | 'down' | 'left' | 'right'): Promise<void>;
/**
 * Write text to a pane by name (with auto carriage return)
 */
export declare function writeToPane(name: string, text: string): void;
/**
 * Write text to a pane by ID (with auto carriage return)
 */
export declare function writeToPaneById(id: number, text: string): void;
/**
 * Write text to a pane by name WITHOUT carriage return
 * Use this with sendEnter() for multi-step input
 */
export declare function writeRawToPane(name: string, text: string): void;
/**
 * Write text to a pane by ID WITHOUT carriage return
 */
export declare function writeRawToPaneById(id: number, text: string): void;
/**
 * Send Enter/carriage return to a pane by name
 */
export declare function sendEnter(name: string): void;
/**
 * Send Enter/carriage return to a pane by ID
 */
export declare function sendEnterById(id: number): void;
/**
 * Read pane contents by name
 * @param name Pane title
 * @param full If true, returns entire scrollback; otherwise returns viewport only
 */
export declare function readPane(name: string, full?: boolean): string;
/**
 * Read pane contents by ID
 */
export declare function readPaneById(id: number, full?: boolean): string;
/**
 * Close a pane by name
 */
export declare function closePane(name: string): void;
/**
 * Close a pane by ID
 */
export declare function closePaneById(id: number): void;
/**
 * Focus a pane by name
 */
export declare function focusPane(name: string): void;
/**
 * Spawn a new Claude Code agent in a pane with a task
 * Validates pane creation before sending the command
 */
export declare function spawnAgent(name: string, task: string, options?: {
    direction?: 'up' | 'down' | 'left' | 'right';
    workingDir?: string;
}): Promise<void>;
/**
 * Check if zjpane plugin is loaded by attempting a list command
 */
export declare function isZjpaneLoaded(): boolean;
