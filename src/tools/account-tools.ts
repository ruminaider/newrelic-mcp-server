/**
 * Account management tools for the NewRelic MCP server
 * Provides tools for listing and managing NewRelic accounts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEntityService } from "../services/entity-service.js";
import { getNerdGraphClient } from "../services/nerdgraph-client.js";
import { defaultLogger } from "../utils/logger.js";
import { formatResponse } from "../utils/response.js";

/**
 * Registers the list_available_new_relic_accounts tool
 * Lists all NewRelic accounts accessible to the API key
 */
export function registerListAccountsTool(server: McpServer): void {
	server.tool(
		"list_available_new_relic_accounts",
		"List all NewRelic accounts accessible with the current API key. Shows account IDs and names. Also indicates the currently configured account.",
		{},
		async () => {
			defaultLogger.info("Tool list_available_new_relic_accounts called");

			const entityService = getEntityService();
			const client = getNerdGraphClient();

			const accounts = await entityService.listAccounts();
			const currentAccountId = client.getAccountId();

			const response = {
				currentAccountId,
				totalAccounts: accounts.length,
				accounts: accounts.map((account) => ({
					id: account.id,
					name: account.name,
					isCurrent: String(account.id) === currentAccountId,
				})),
			};

			return {
				content: [
					{
						type: "text" as const,
						text: formatResponse(response),
					},
				],
			};
		},
	);

	defaultLogger.info("Registered tool: list_available_new_relic_accounts");
}

/**
 * Registers all account management tools
 */
export function registerAccountTools(server: McpServer): number {
	registerListAccountsTool(server);

	return 1; // Number of tools registered
}
