/**
 * MCP Server setup and configuration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerConfig } from "./config.js";
import { defaultLogger } from "./utils/logger.js";

// Tool registrations will be imported here
import { registerAllTools } from "./tools/index.js";

export interface McpServerOptions {
	config: ServerConfig;
}

/**
 * Creates and configures the MCP server
 */
export function createMcpServer(options: McpServerOptions): McpServer {
	const { config } = options;

	defaultLogger.info("Creating MCP server", {
		name: config.name,
		version: config.version,
	});

	const server = new McpServer(
		{
			name: config.name,
			version: config.version,
		},
		{
			capabilities: {
				tools: {},
				logging: {},
			},
		},
	);

	// Register all tools
	registerAllTools(server);

	return server;
}

/**
 * Starts the MCP server with stdio transport
 */
export async function startServer(server: McpServer): Promise<void> {
	defaultLogger.info("Starting MCP server with stdio transport");

	const transport = new StdioServerTransport();

	await server.connect(transport);

	defaultLogger.info("MCP server started successfully");
}
