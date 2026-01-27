/**
 * Dashboard tools for NewRelic MCP server
 * Provides tools to get and list dashboards
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defaultLogger } from "../utils/logger.js";
import { getDashboard, listDashboards } from "../services/dashboard-service.js";
import { EntityNotFoundError } from "../utils/errors.js";

/**
 * Schema for get_dashboard tool input
 */
const GetDashboardSchema = z.object({
  guid: z
    .string()
    .describe("The entity GUID of the dashboard to retrieve"),
});

/**
 * Schema for list_dashboards tool input
 */
const ListDashboardsSchema = z.object({
  accountId: z
    .string()
    .optional()
    .describe("NewRelic account ID to filter by (defaults to configured account)"),
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
    .describe("Maximum number of dashboards to return (1-200, default: 50)"),
});

/**
 * Registers the get_dashboard tool
 */
export function registerGetDashboardTool(server: McpServer): void {
  server.tool(
    "get_dashboard",
    "Get a NewRelic dashboard with full page and widget details. Returns the dashboard structure including all pages, their widgets, and widget configurations. Use this to understand dashboard layout and widget queries.",
    GetDashboardSchema.shape,
    async (params) => {
      try {
        defaultLogger.info("get_dashboard tool called", { guid: params.guid });

        const dashboard = await getDashboard(params.guid);

        // Format response for Claude
        const widgetCount = dashboard.pages.reduce(
          (sum, page) => sum + page.widgets.length,
          0
        );

        const formattedResponse = {
          dashboard: {
            guid: dashboard.guid,
            name: dashboard.name,
            pageCount: dashboard.pages.length,
            totalWidgetCount: widgetCount,
            pages: dashboard.pages.map((page) => ({
              guid: page.guid,
              name: page.name,
              widgetCount: page.widgets.length,
              widgets: page.widgets.map((widget) => ({
                id: widget.id,
                title: widget.title,
                configuration: widget.rawConfiguration,
              })),
            })),
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formattedResponse, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof EntityNotFoundError) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Dashboard not found",
                  guid: params.guid,
                  message: error.message,
                }),
              },
            ],
            isError: true,
          };
        }

        defaultLogger.error("get_dashboard tool failed", error);
        throw error;
      }
    }
  );

  defaultLogger.info("Registered get_dashboard tool");
}

/**
 * Registers the list_dashboards tool
 */
export function registerListDashboardsTool(server: McpServer): void {
  server.tool(
    "list_dashboards",
    "List NewRelic dashboards with optional account filtering. Returns dashboard names and GUIDs. Use pagination cursor for large result sets. Useful for discovering available dashboards before fetching full details.",
    ListDashboardsSchema.shape,
    async (params) => {
      try {
        defaultLogger.info("list_dashboards tool called", {
          accountId: params.accountId,
          cursor: params.cursor,
          limit: params.limit,
        });

        const response = await listDashboards(
          params.accountId,
          params.cursor,
          params.limit
        );

        const formattedResponse = {
          dashboards: response.dashboards,
          pagination: {
            returnedCount: response.dashboards.length,
            totalCount: response.totalCount,
            hasMore: !!response.nextCursor,
            nextCursor: response.nextCursor,
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formattedResponse, null, 2),
            },
          ],
        };
      } catch (error) {
        defaultLogger.error("list_dashboards tool failed", error);
        throw error;
      }
    }
  );

  defaultLogger.info("Registered list_dashboards tool");
}

/**
 * Registers all dashboard-related tools
 */
export function registerDashboardTools(server: McpServer): number {
  registerGetDashboardTool(server);
  registerListDashboardsTool(server);
  return 2; // Number of tools registered
}
