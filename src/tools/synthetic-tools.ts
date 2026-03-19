/**
 * Synthetic monitoring tools for NewRelic MCP server
 * Provides tools to list and monitor synthetic monitors
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defaultLogger } from "../utils/logger.js";
import { formatResponse } from "../utils/response.js";
import { listSyntheticMonitors } from "../services/synthetic-service.js";

/**
 * Schema for list_synthetic_monitors tool input
 */
const ListSyntheticMonitorsSchema = z.object({
  accountId: z
    .string()
    .optional()
    .describe("NewRelic account ID to filter by (defaults to configured account)"),
  status: z
    .enum(["ENABLED", "DISABLED"])
    .optional()
    .describe("Filter monitors by status (ENABLED or DISABLED)"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor for fetching next page of results"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe("Maximum number of monitors to return (1-200, default: 50)"),
});

/**
 * Registers the list_synthetic_monitors tool
 */
export function registerListSyntheticMonitorsTool(server: McpServer): void {
  server.tool(
    "list_synthetic_monitors",
    "List NewRelic synthetic monitors with status and success rate information. Synthetic monitors are automated tests that check endpoint availability and performance. Filter by account or status. Returns monitor GUIDs, names, current status, and success rates.",
    ListSyntheticMonitorsSchema.shape,
    async (params) => {
      try {
        defaultLogger.info("list_synthetic_monitors tool called", {
          accountId: params.accountId,
          status: params.status,
          cursor: params.cursor,
          limit: params.limit,
        });

        const response = await listSyntheticMonitors(
          params.accountId,
          params.status,
          params.cursor,
          params.limit
        );

        // Format response with status summaries
        const statusSummary = {
          total: response.monitors.length,
          passing: 0,
          failing: 0,
          unknown: 0,
        };

        for (const monitor of response.monitors) {
          if (monitor.monitorSummary) {
            const successRate = monitor.monitorSummary.successRate;
            if (successRate === null) {
              statusSummary.unknown++;
            } else if (successRate >= 95) {
              statusSummary.passing++;
            } else {
              statusSummary.failing++;
            }
          } else {
            statusSummary.unknown++;
          }
        }

        const formattedResponse = {
          summary: statusSummary,
          monitors: response.monitors.map((monitor) => ({
            guid: monitor.guid,
            name: monitor.name,
            status: monitor.monitorSummary?.status ?? "UNKNOWN",
            successRate: monitor.monitorSummary?.successRate ?? null,
            health: (() => {
              const successRate = monitor.monitorSummary?.successRate;
              if (successRate === null || successRate === undefined) {
                return "UNKNOWN";
              }
              if (successRate >= 95) return "HEALTHY";
              if (successRate >= 80) return "WARNING";
              return "CRITICAL";
            })(),
          })),
          pagination: {
            returnedCount: response.monitors.length,
            totalCount: response.totalCount,
            hasMore: !!response.nextCursor,
            nextCursor: response.nextCursor,
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: formatResponse(formattedResponse),
            },
          ],
        };
      } catch (error) {
        defaultLogger.error("list_synthetic_monitors tool failed", error);
        throw error;
      }
    }
  );

  defaultLogger.info("Registered list_synthetic_monitors tool");
}

/**
 * Registers all synthetic monitoring tools
 */
export function registerSyntheticTools(server: McpServer): number {
  registerListSyntheticMonitorsTool(server);
  return 1; // Number of tools registered
}
