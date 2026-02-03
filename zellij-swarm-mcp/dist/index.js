#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import * as zjpane from './zjpane.js';
// Tool definitions
const tools = [
    {
        name: 'list_panes',
        description: 'List all terminal panes in the current zellij session with their IDs and titles',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        name: 'spawn_pane',
        description: 'Create a new named terminal pane. The pane title will be set to the given name.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name/title for the new pane',
                },
                direction: {
                    type: 'string',
                    enum: ['up', 'down', 'left', 'right'],
                    description: 'Direction to split from current pane (optional, defaults to zellij default)',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'write_to_pane',
        description: 'Send text to a terminal pane by name. The text is written directly to the terminal as if typed. IMPORTANT: Do NOT include \\n - text sent to a shell prompt executes automatically. Just send the command text itself (e.g., "ls -la" not "ls -la\\n").',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name/title of the target pane',
                },
                text: {
                    type: 'string',
                    description: 'Text to send. Do NOT include newlines - commands execute automatically when sent to a shell prompt.',
                },
                send_enter: {
                    type: 'boolean',
                    description: 'If true (default), automatically sends Enter after the text. Set to false for multi-step input where you want to send Enter separately.',
                },
            },
            required: ['name', 'text'],
        },
    },
    {
        name: 'send_enter',
        description: 'Send Enter/Return key to a terminal pane. Use this after write_to_pane with send_enter=false for apps that need a delay between text input and Enter (like Claude Code).',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name/title of the target pane',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'read_pane',
        description: 'Read the terminal contents of a pane by name. Returns visible viewport by default, or full scrollback if full=true.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name/title of the pane to read',
                },
                full: {
                    type: 'boolean',
                    description: 'If true, return entire scrollback history; otherwise return visible viewport only',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'close_pane',
        description: 'Close a terminal pane by name',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name/title of the pane to close',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'spawn_agent',
        description: 'Convenience tool: spawn a new pane and start a Claude Code agent with a given task. The agent runs in non-interactive mode.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name for the agent pane (will appear as pane title)',
                },
                task: {
                    type: 'string',
                    description: 'The task/prompt to give to the Claude agent',
                },
                direction: {
                    type: 'string',
                    enum: ['up', 'down', 'left', 'right'],
                    description: 'Direction to split from current pane (optional)',
                },
                working_dir: {
                    type: 'string',
                    description: 'Working directory for the agent (optional)',
                },
            },
            required: ['name', 'task'],
        },
    },
];
// Create MCP server
const server = new Server({
    name: 'zellij-swarm',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
});
// Helper to validate pane exists and return error response if not
function validatePaneExists(paneName) {
    const panes = zjpane.listPanes();
    const paneExists = panes.some(p => p.title === paneName);
    if (!paneExists) {
        return {
            valid: false,
            errorResponse: {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: `Pane "${paneName}" not found`,
                            available_panes: panes.map(p => p.title),
                        }),
                    }],
                isError: true,
            },
        };
    }
    return { valid: true, panes };
}
// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'list_panes': {
                const panes = zjpane.listPanes();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ panes }, null, 2),
                        },
                    ],
                };
            }
            case 'spawn_pane': {
                const { name: paneName, direction } = args;
                await zjpane.spawnPane(paneName, direction);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, message: `Pane "${paneName}" spawned` }),
                        },
                    ],
                };
            }
            case 'write_to_pane': {
                const { name: paneName, text, send_enter: doSendEnter = true } = args;
                // Validate pane exists before writing
                const writeValidation = validatePaneExists(paneName);
                if (!writeValidation.valid) {
                    return writeValidation.errorResponse;
                }
                // Always write raw first
                zjpane.writeRawToPane(paneName, text);
                if (doSendEnter) {
                    // Delay before sending Enter - Claude Code TUI needs time to process input
                    await new Promise(resolve => setTimeout(resolve, 150));
                    zjpane.sendEnter(paneName);
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, message: `Text sent to pane "${paneName}"` }),
                        },
                    ],
                };
            }
            case 'send_enter': {
                const { name: paneName } = args;
                // Validate pane exists before sending enter
                const enterValidation = validatePaneExists(paneName);
                if (!enterValidation.valid) {
                    return enterValidation.errorResponse;
                }
                zjpane.sendEnter(paneName);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, message: `Enter sent to pane "${paneName}"` }),
                        },
                    ],
                };
            }
            case 'read_pane': {
                const { name: paneName, full = false } = args;
                // Validate pane exists before reading
                const readValidation = validatePaneExists(paneName);
                if (!readValidation.valid) {
                    return readValidation.errorResponse;
                }
                const content = zjpane.readPane(paneName, full);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ content }),
                        },
                    ],
                };
            }
            case 'close_pane': {
                const { name: paneName } = args;
                // Validate pane exists before closing
                const closeValidation = validatePaneExists(paneName);
                if (!closeValidation.valid) {
                    return closeValidation.errorResponse;
                }
                zjpane.closePane(paneName);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ success: true, message: `Pane "${paneName}" closed` }),
                        },
                    ],
                };
            }
            case 'spawn_agent': {
                const { name: agentName, task, direction, working_dir } = args;
                await zjpane.spawnAgent(agentName, task, {
                    direction,
                    workingDir: working_dir,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                message: `Agent "${agentName}" spawned with task`,
                            }),
                        },
                    ],
                };
            }
            default:
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                        },
                    ],
                    isError: true,
                };
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ error: message }),
                },
            ],
            isError: true,
        };
    }
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('zellij-swarm MCP server running on stdio');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
