/**
 * Performance analysis tools for NewRelic MCP server
 * Provides tools to analyze golden metrics and transaction performance
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defaultLogger } from "../utils/logger.js";
import {
  analyzeGoldenMetrics,
  analyzeTransactions,
} from "../services/performance-service.js";
import { EntityNotFoundError } from "../utils/errors.js";
import { formatResponse } from "../utils/response.js";

/**
 * Schema for analyze_golden_metrics tool input
 */
const AnalyzeGoldenMetricsSchema = z.object({
  guid: z
    .string()
    .describe("The entity GUID to analyze golden metrics for"),
});

/**
 * Schema for analyze_transactions tool input
 */
const AnalyzeTransactionsSchema = z.object({
  since: z
    .string()
    .optional()
    .default("1 hour ago")
    .describe("Time range start (NRQL SINCE clause). Examples: '1 hour ago', '24 hours ago', '7 days ago', '2024-01-01'"),
  until: z
    .string()
    .optional()
    .describe("Time range end (NRQL UNTIL clause). Examples: 'now', '1 hour ago', '2024-01-02'"),
  facets: z
    .array(z.string())
    .optional()
    .default(["name"])
    .describe("Fields to group results by. Default: ['name']. Common: 'name', 'host', 'request.uri'"),
  appName: z
    .string()
    .optional()
    .describe("Filter by application name"),
  where: z
    .string()
    .optional()
    .describe("Additional WHERE clause conditions. Example: \"duration > 1\" or \"error IS true\""),
  metrics: z
    .array(z.enum(["count", "averageDuration", "totalTime", "errorRate", "throughput"]))
    .optional()
    .default(["count", "averageDuration"])
    .describe("Metrics to calculate. Options: count, averageDuration, totalTime, errorRate, throughput"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(100)
    .describe("Maximum number of results (1-1000, default: 100)"),
  accountId: z
    .string()
    .optional()
    .describe("NewRelic account ID (defaults to configured account)"),
});

/**
 * Registers the analyze_golden_metrics tool
 */
export function registerAnalyzeGoldenMetricsTool(server: McpServer): void {
  server.tool(
    "analyze_golden_metrics",
    "Get the golden metrics defined for a NewRelic entity. Golden metrics are the key performance indicators that NewRelic recommends monitoring for each entity type (APM applications, hosts, etc.). Returns metric names, titles, and the NRQL queries used to calculate them. Use these queries to understand what metrics are important for an entity.",
    AnalyzeGoldenMetricsSchema.shape,
    async (params) => {
      try {
        defaultLogger.info("analyze_golden_metrics tool called", {
          guid: params.guid,
        });

        const response = await analyzeGoldenMetrics(params.guid);

        const formattedResponse = {
          entity: {
            guid: response.entityGuid,
            name: response.entityName,
          },
          goldenMetrics: {
            count: response.metrics.length,
            metrics: response.metrics.map((metric) => ({
              name: metric.name,
              title: metric.title,
              query: metric.query,
            })),
          },
          usage: response.metrics.length > 0
            ? "Use the NRQL queries to fetch actual metric values. These are the key indicators for this entity type."
            : "No golden metrics defined for this entity type.",
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
        if (error instanceof EntityNotFoundError) {
          return {
            content: [
              {
                type: "text" as const,
                text: formatResponse({
                  error: "Entity not found",
                  guid: params.guid,
                  message: error.message,
                }),
              },
            ],
            isError: true,
          };
        }

        defaultLogger.error("analyze_golden_metrics tool failed", error);
        throw error;
      }
    }
  );

  defaultLogger.info("Registered analyze_golden_metrics tool");
}

/**
 * Registers the analyze_transactions tool
 */
export function registerAnalyzeTransactionsTool(server: McpServer): void {
  server.tool(
    "analyze_transactions",
    "Analyze transaction performance using NRQL with FACET grouping. Query the Transaction event type to analyze web requests, API calls, and background jobs. Group by transaction name, host, or other attributes. Calculate metrics like count, average duration, error rate, and throughput. Useful for identifying slow transactions, high-error endpoints, or traffic patterns.",
    AnalyzeTransactionsSchema.shape,
    async (params) => {
      try {
        defaultLogger.info("analyze_transactions tool called", {
          since: params.since,
          until: params.until,
          facets: params.facets,
          appName: params.appName,
          metrics: params.metrics,
          limit: params.limit,
        });

        const response = await analyzeTransactions({
          since: params.since,
          until: params.until,
          facets: params.facets,
          appName: params.appName,
          where: params.where,
          metrics: params.metrics,
          limit: params.limit,
          accountId: params.accountId,
        });

        // Calculate summary statistics
        const summary = {
          totalTransactions: 0,
          avgDuration: 0,
          maxDuration: 0,
          minDuration: Number.MAX_VALUE,
          avgErrorRate: 0,
        };

        let durationCount = 0;
        let errorRateCount = 0;

        for (const result of response.results) {
          if (result.count) {
            summary.totalTransactions += result.count;
          }
          if (result.averageDuration !== undefined) {
            summary.avgDuration += result.averageDuration;
            summary.maxDuration = Math.max(summary.maxDuration, result.averageDuration);
            summary.minDuration = Math.min(summary.minDuration, result.averageDuration);
            durationCount++;
          }
          if (result.errorRate !== undefined) {
            summary.avgErrorRate += result.errorRate;
            errorRateCount++;
          }
        }

        if (durationCount > 0) {
          summary.avgDuration /= durationCount;
        }
        if (errorRateCount > 0) {
          summary.avgErrorRate /= errorRateCount;
        }
        if (summary.minDuration === Number.MAX_VALUE) {
          summary.minDuration = 0;
        }

        const formattedResponse = {
          query: response.query,
          timeRange: response.timeRange,
          summary: {
            resultCount: response.totalCount,
            totalTransactions: summary.totalTransactions,
            averageDurationMs: Math.round(summary.avgDuration * 1000 * 100) / 100,
            maxDurationMs: Math.round(summary.maxDuration * 1000 * 100) / 100,
            minDurationMs: Math.round(summary.minDuration * 1000 * 100) / 100,
            averageErrorRate: Math.round(summary.avgErrorRate * 100) / 100,
          },
          results: response.results.map((result) => ({
            name: result.name,
            count: result.count,
            averageDurationMs: result.averageDuration
              ? Math.round(result.averageDuration * 1000 * 100) / 100
              : undefined,
            totalTimeMs: result.totalTime
              ? Math.round(result.totalTime * 1000 * 100) / 100
              : undefined,
            errorRate: result.errorRate
              ? Math.round(result.errorRate * 100) / 100
              : undefined,
            throughputPerMinute: result.throughput
              ? Math.round(result.throughput * 100) / 100
              : undefined,
          })),
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
        defaultLogger.error("analyze_transactions tool failed", error);
        throw error;
      }
    }
  );

  defaultLogger.info("Registered analyze_transactions tool");
}

/**
 * Registers all performance analysis tools
 */
export function registerPerformanceTools(server: McpServer): number {
  registerAnalyzeGoldenMetricsTool(server);
  registerAnalyzeTransactionsTool(server);
  return 2; // Number of tools registered
}
