/**
 * NRQL and Log Query Tools
 * MCP tools for executing NRQL queries and accessing log data
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { defaultLogger } from "../utils/logger.js";
import { getNrqlService, type NrqlQueryResult } from "../services/nrql-service.js";
import {
  getLogService,
  type LogQueryResult,
} from "../services/log-service.js";
import { NrqlSyntaxError } from "../utils/errors.js";

// ============================================================================
// Zod Schemas for Tool Inputs
// ============================================================================

/**
 * Schema for execute_nrql_query tool
 */
export const ExecuteNrqlQuerySchema = {
  query: z
    .string()
    .min(1)
    .describe(
      "The NRQL query to execute. Example: SELECT count(*) FROM Transaction SINCE 1 hour ago"
    ),
  timeout: z
    .number()
    .min(1)
    .max(120)
    .optional()
    .describe("Query timeout in seconds (default: 30, max: 120)"),
};

/**
 * Schema for list_recent_logs tool
 */
export const ListRecentLogsSchema = {
  limit: z
    .number()
    .min(1)
    .max(2000)
    .optional()
    .describe("Number of logs to retrieve (default: 100, max: 2000)"),
  sinceMinutesAgo: z
    .number()
    .min(1)
    .max(10080) // 7 days
    .optional()
    .describe("Time range in minutes to look back (default: 60)"),
  level: z
    .string()
    .optional()
    .describe("Log level filter (e.g., 'ERROR', 'WARN', 'INFO', 'DEBUG')"),
  whereClause: z
    .string()
    .optional()
    .describe(
      "Additional NRQL WHERE clause conditions. Example: service.name = 'my-service'"
    ),
};

/**
 * Schema for analyze_entity_logs tool
 */
export const AnalyzeEntityLogsSchema = {
  entityGuid: z
    .string()
    .min(1)
    .describe("The entity GUID to filter logs by"),
  limit: z
    .number()
    .min(1)
    .max(2000)
    .optional()
    .describe("Number of logs to retrieve (default: 100, max: 2000)"),
  sinceMinutesAgo: z
    .number()
    .min(1)
    .max(10080)
    .optional()
    .describe("Time range in minutes to look back (default: 60)"),
  level: z
    .string()
    .optional()
    .describe("Log level filter (e.g., 'ERROR', 'WARN', 'INFO')"),
  additionalFields: z
    .string()
    .optional()
    .describe(
      "Additional fields to select, comma-separated. Example: 'trace.id,span.id'"
    ),
};

/**
 * Schema for natural_language_to_nrql_query tool
 */
export const NaturalLanguageToNrqlSchema = {
  description: z
    .string()
    .min(1)
    .describe(
      "Natural language description of what you want to query. Example: 'Show me error rates for the checkout service in the last hour'"
    ),
  eventType: z
    .string()
    .optional()
    .describe(
      "Specific event type to query. Common types: Transaction, Log, Metric, Span, BrowserInteraction, PageView, SyntheticCheck"
    ),
  includeExamples: z
    .boolean()
    .optional()
    .describe("Include example queries for the identified pattern (default: true)"),
};

/**
 * Schema for query_logs tool
 */
export const QueryLogsSchema = {
  field: z
    .string()
    .min(1)
    .describe(
      "Field name to search on. Example: 'message', 'service.name', 'error.class'"
    ),
  value: z
    .string()
    .min(1)
    .describe(
      "Value to search for. Use % for wildcards. Example: '%timeout%' or 'my-service'"
    ),
  limit: z
    .number()
    .min(1)
    .max(2000)
    .optional()
    .describe("Number of logs to retrieve (default: 100, max: 2000)"),
  startTime: z
    .number()
    .optional()
    .describe(
      "Start time in epoch milliseconds. Defaults to 1 hour ago if not specified."
    ),
  endTime: z
    .number()
    .optional()
    .describe(
      "End time in epoch milliseconds. Defaults to now if not specified."
    ),
  additionalFields: z
    .string()
    .optional()
    .describe("Additional fields to select, comma-separated"),
};

// ============================================================================
// NRQL Reference Data for Natural Language Conversion
// ============================================================================

/**
 * Common NRQL query patterns with templates
 */
const NRQL_PATTERNS = {
  error_rate: {
    name: "Error Rate",
    description: "Calculate error rate or count errors",
    templates: [
      "SELECT percentage(count(*), WHERE error IS true) AS 'Error Rate' FROM Transaction SINCE 1 hour ago",
      "SELECT count(*) FROM TransactionError FACET error.message SINCE 1 hour ago",
      "SELECT rate(count(*), 1 minute) FROM TransactionError TIMESERIES SINCE 1 hour ago",
    ],
    keywords: ["error", "errors", "failure", "failures", "error rate", "exception"],
  },
  response_time: {
    name: "Response Time / Latency",
    description: "Measure response times and latency",
    templates: [
      "SELECT average(duration) AS 'Avg Response Time' FROM Transaction SINCE 1 hour ago",
      "SELECT percentile(duration, 50, 90, 95, 99) FROM Transaction SINCE 1 hour ago",
      "SELECT average(duration) FROM Transaction FACET name SINCE 1 hour ago",
      "SELECT histogram(duration, 10, 20) FROM Transaction SINCE 1 hour ago",
    ],
    keywords: ["response time", "latency", "duration", "slow", "performance", "p99", "p95", "percentile"],
  },
  throughput: {
    name: "Throughput / Traffic",
    description: "Measure request volume and throughput",
    templates: [
      "SELECT count(*) FROM Transaction SINCE 1 hour ago",
      "SELECT rate(count(*), 1 minute) AS 'RPM' FROM Transaction TIMESERIES SINCE 1 hour ago",
      "SELECT count(*) FROM Transaction FACET name SINCE 1 hour ago",
      "SELECT count(*) FROM PageView FACET pageUrl SINCE 1 hour ago",
    ],
    keywords: ["throughput", "traffic", "requests", "volume", "count", "rpm", "tps"],
  },
  logs: {
    name: "Log Analysis",
    description: "Query and analyze log data",
    templates: [
      "SELECT * FROM Log WHERE level = 'ERROR' SINCE 1 hour ago LIMIT 100",
      "SELECT count(*) FROM Log FACET level SINCE 1 hour ago",
      "SELECT * FROM Log WHERE message LIKE '%timeout%' SINCE 1 hour ago",
      "SELECT count(*) FROM Log WHERE level IN ('ERROR', 'WARN') TIMESERIES SINCE 6 hours ago",
    ],
    keywords: ["logs", "log", "logging", "message", "error logs", "warn"],
  },
  apdex: {
    name: "Apdex Score",
    description: "Calculate user satisfaction scores",
    templates: [
      "SELECT apdex(duration, 0.5) AS 'Apdex' FROM Transaction SINCE 1 hour ago",
      "SELECT apdex(duration, 0.5) FROM Transaction FACET name SINCE 1 hour ago",
      "SELECT apdex(duration, 0.5) FROM Transaction TIMESERIES SINCE 6 hours ago",
    ],
    keywords: ["apdex", "satisfaction", "user experience", "ux"],
  },
  database: {
    name: "Database Performance",
    description: "Analyze database query performance",
    templates: [
      "SELECT average(databaseDuration) FROM Transaction SINCE 1 hour ago",
      "SELECT count(*) FROM Span WHERE category = 'datastore' FACET db.statement SINCE 1 hour ago",
      "SELECT average(duration) FROM Span WHERE category = 'datastore' FACET db.collection SINCE 1 hour ago",
    ],
    keywords: ["database", "db", "query", "queries", "sql", "datastore", "postgres", "mysql"],
  },
  external_services: {
    name: "External Service Calls",
    description: "Monitor external service dependencies",
    templates: [
      "SELECT average(externalDuration) FROM Transaction SINCE 1 hour ago",
      "SELECT count(*) FROM Span WHERE category = 'http' FACET http.url SINCE 1 hour ago",
      "SELECT average(duration), count(*) FROM Span WHERE category = 'http' FACET peer.hostname SINCE 1 hour ago",
    ],
    keywords: ["external", "http", "api", "service", "dependency", "outbound"],
  },
  top_consumers: {
    name: "Top Consumers / Breakdown",
    description: "Find top endpoints, users, or resources",
    templates: [
      "SELECT count(*), average(duration) FROM Transaction FACET name SINCE 1 hour ago",
      "SELECT count(*) FROM Transaction FACET request.uri SINCE 1 hour ago LIMIT 20",
      "SELECT sum(memoryUsage) FROM Metric FACET host SINCE 1 hour ago",
    ],
    keywords: ["top", "breakdown", "by", "group", "facet", "most", "highest"],
  },
  time_comparison: {
    name: "Time Comparison",
    description: "Compare metrics over time periods",
    templates: [
      "SELECT count(*) FROM Transaction SINCE 1 hour ago COMPARE WITH 1 day ago",
      "SELECT average(duration) FROM Transaction SINCE 1 hour ago COMPARE WITH 1 week ago",
      "SELECT count(*) FROM Transaction TIMESERIES COMPARE WITH 1 day ago SINCE 6 hours ago",
    ],
    keywords: ["compare", "comparison", "versus", "vs", "change", "difference", "week over week", "day over day"],
  },
  synthetics: {
    name: "Synthetic Monitoring",
    description: "Monitor synthetic test results",
    templates: [
      "SELECT average(duration) FROM SyntheticCheck FACET monitorName SINCE 1 day ago",
      "SELECT percentage(count(*), WHERE result = 'SUCCESS') FROM SyntheticCheck SINCE 1 day ago",
      "SELECT * FROM SyntheticCheck WHERE result != 'SUCCESS' SINCE 1 hour ago",
    ],
    keywords: ["synthetic", "monitor", "uptime", "availability", "check"],
  },
};

/**
 * Common NRQL time ranges
 */
const TIME_RANGES = {
  "last 5 minutes": "SINCE 5 minutes ago",
  "last 15 minutes": "SINCE 15 minutes ago",
  "last 30 minutes": "SINCE 30 minutes ago",
  "last hour": "SINCE 1 hour ago",
  "last 6 hours": "SINCE 6 hours ago",
  "last 12 hours": "SINCE 12 hours ago",
  "last day": "SINCE 1 day ago",
  "last week": "SINCE 1 week ago",
  "last month": "SINCE 1 month ago",
  "today": "SINCE today",
  "yesterday": "SINCE yesterday UNTIL today",
};

/**
 * Common NRQL aggregation functions
 */
const AGGREGATION_FUNCTIONS = {
  count: "count(*) - Count of events",
  average: "average(field) - Average value",
  sum: "sum(field) - Sum of values",
  min: "min(field) - Minimum value",
  max: "max(field) - Maximum value",
  percentage: "percentage(count(*), WHERE condition) - Percentage matching condition",
  percentile: "percentile(field, 50, 90, 95, 99) - Percentile values",
  rate: "rate(count(*), 1 minute) - Rate per time unit",
  uniqueCount: "uniqueCount(field) - Count of unique values",
  histogram: "histogram(field, buckets, width) - Distribution histogram",
  apdex: "apdex(duration, threshold) - User satisfaction score",
};

/**
 * Analyzes natural language and suggests NRQL patterns
 */
function analyzeNaturalLanguage(
  description: string,
  eventType?: string
): { patterns: typeof NRQL_PATTERNS[keyof typeof NRQL_PATTERNS][]; suggestions: string[] } {
  const lowerDesc = description.toLowerCase();
  const matchedPatterns: typeof NRQL_PATTERNS[keyof typeof NRQL_PATTERNS][] = [];
  const suggestions: string[] = [];

  // Find matching patterns based on keywords
  for (const pattern of Object.values(NRQL_PATTERNS)) {
    for (const keyword of pattern.keywords) {
      if (lowerDesc.includes(keyword)) {
        if (!matchedPatterns.includes(pattern)) {
          matchedPatterns.push(pattern);
        }
        break;
      }
    }
  }

  // Detect time range mentions
  for (const [phrase, nrql] of Object.entries(TIME_RANGES)) {
    if (lowerDesc.includes(phrase)) {
      suggestions.push(`Time range detected: Use "${nrql}"`);
      break;
    }
  }

  // Detect grouping/breakdown requests
  if (lowerDesc.match(/\b(by|per|for each|grouped by|breakdown)\b/)) {
    suggestions.push("Grouping detected: Use FACET clause to group results");
  }

  // Detect trending/timeseries requests
  if (lowerDesc.match(/\b(over time|trend|timeseries|graph|chart)\b/)) {
    suggestions.push("Time series detected: Add TIMESERIES clause for graphing");
  }

  // Add event type suggestion if specified
  if (eventType) {
    suggestions.push(`Using specified event type: ${eventType}`);
  }

  // If no patterns matched, provide general guidance
  if (matchedPatterns.length === 0) {
    suggestions.push("No specific pattern detected. Starting with a general query template.");
  }

  return { patterns: matchedPatterns, suggestions };
}

// ============================================================================
// Tool Implementation Functions
// ============================================================================

/**
 * Formats NRQL query results for Claude consumption
 */
function formatNrqlResult(result: NrqlQueryResult): CallToolResult {
  const summary = {
    query: result.query,
    resultCount: result.results.length,
    elapsedTime: `${result.elapsedTime}ms`,
    timeWindow: result.metadata.timeWindow
      ? {
          begin: new Date(result.metadata.timeWindow.begin).toISOString(),
          end: new Date(result.metadata.timeWindow.end).toISOString(),
        }
      : null,
    facets: result.metadata.facets,
  };

  // For large result sets, provide a summary
  const resultData =
    result.results.length > 50
      ? {
          note: `Showing first 50 of ${result.results.length} results`,
          results: result.results.slice(0, 50),
        }
      : { results: result.results };

  return {
    content: [
      {
        type: "text",
        text: `NRQL query executed successfully. Found ${result.results.length} results in ${result.elapsedTime}ms.`,
      },
      {
        type: "text",
        text: JSON.stringify({ summary, ...resultData }, null, 2),
      },
    ],
  };
}

/**
 * Formats log query results for Claude consumption
 */
function formatLogResult(result: LogQueryResult, description: string): CallToolResult {
  const summary = {
    logCount: result.count,
    elapsedTime: `${result.elapsedTime}ms`,
    timeWindow: result.timeWindow,
  };

  // Group logs by level for overview
  const levelCounts: Record<string, number> = {};
  for (const log of result.logs) {
    const level = log.level || "UNKNOWN";
    levelCounts[level] = (levelCounts[level] || 0) + 1;
  }

  // For large result sets, provide a summary
  const logData =
    result.logs.length > 50
      ? {
          note: `Showing first 50 of ${result.count} logs`,
          logs: result.logs.slice(0, 50),
        }
      : { logs: result.logs };

  return {
    content: [
      {
        type: "text",
        text: `${description} Found ${result.count} logs in ${result.elapsedTime}ms.`,
      },
      {
        type: "text",
        text: JSON.stringify(
          {
            summary,
            levelDistribution: levelCounts,
            ...logData,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Formats error response for tool failures
 */
function formatErrorResult(error: unknown, context: string): CallToolResult {
  const message =
    error instanceof Error ? error.message : String(error);

  const errorDetails: Record<string, unknown> = {
    context,
    error: message,
  };

  if (error instanceof NrqlSyntaxError) {
    errorDetails.query = error.query;
    errorDetails.suggestion =
      "Please check your NRQL syntax. Common issues include missing quotes around strings, invalid field names, or unsupported functions.";
  }

  return {
    content: [
      {
        type: "text",
        text: `Error: ${message}`,
      },
      {
        type: "text",
        text: JSON.stringify(errorDetails, null, 2),
      },
    ],
    isError: true,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Registers all NRQL and log tools with the MCP server
 * @returns Number of tools registered
 */
export function registerNrqlTools(server: McpServer): number {
  let toolCount = 0;

  // Register execute_nrql_query tool
  server.tool(
    "execute_nrql_query",
    "Execute an arbitrary NRQL query against NewRelic. Returns raw query results with metadata. Use this for custom analytics, metrics, and data exploration.",
    ExecuteNrqlQuerySchema,
    async (args) => {
      try {
        defaultLogger.info("Executing NRQL query tool", {
          queryLength: args.query.length,
          timeout: args.timeout,
        });

        const nrqlService = getNrqlService();
        const result = await nrqlService.executeQuery(
          args.query,
          args.timeout ?? 30
        );

        return formatNrqlResult(result);
      } catch (error) {
        defaultLogger.error("execute_nrql_query failed", error);
        return formatErrorResult(error, "execute_nrql_query");
      }
    }
  );
  toolCount++;

  // Register list_recent_logs tool
  server.tool(
    "list_recent_logs",
    "List recent logs from NewRelic. Useful for getting an overview of recent log activity, filtering by level, or searching with custom conditions.",
    ListRecentLogsSchema,
    async (args) => {
      try {
        defaultLogger.info("Listing recent logs", {
          limit: args.limit,
          sinceMinutesAgo: args.sinceMinutesAgo,
          level: args.level,
        });

        const logService = getLogService();
        const result = await logService.listRecentLogs({
          limit: args.limit,
          sinceMinutesAgo: args.sinceMinutesAgo,
          level: args.level,
          whereClause: args.whereClause,
        });

        return formatLogResult(result, "Successfully retrieved recent logs.");
      } catch (error) {
        defaultLogger.error("list_recent_logs failed", error);
        return formatErrorResult(error, "list_recent_logs");
      }
    }
  );
  toolCount++;

  // Register analyze_entity_logs tool
  server.tool(
    "analyze_entity_logs",
    "Analyze logs for a specific NewRelic entity by GUID. Use this to investigate issues with a particular service, application, or infrastructure component.",
    AnalyzeEntityLogsSchema,
    async (args) => {
      try {
        defaultLogger.info("Analyzing entity logs", {
          entityGuid: args.entityGuid,
          limit: args.limit,
          level: args.level,
        });

        const logService = getLogService();
        const result = await logService.analyzeEntityLogs({
          entityGuid: args.entityGuid,
          limit: args.limit,
          sinceMinutesAgo: args.sinceMinutesAgo,
          level: args.level,
          additionalFields: args.additionalFields,
        });

        return formatLogResult(
          result,
          `Successfully analyzed logs for entity ${args.entityGuid}.`
        );
      } catch (error) {
        defaultLogger.error("analyze_entity_logs failed", error);
        return formatErrorResult(error, "analyze_entity_logs");
      }
    }
  );
  toolCount++;

  // Register query_logs tool
  server.tool(
    "query_logs",
    "Search logs by field and value with optional time range. Supports wildcards (%) for pattern matching. Use this for targeted log searches based on specific criteria.",
    QueryLogsSchema,
    async (args) => {
      try {
        defaultLogger.info("Querying logs", {
          field: args.field,
          value: args.value,
          limit: args.limit,
        });

        const logService = getLogService();
        const result = await logService.queryLogs({
          field: args.field,
          value: args.value,
          limit: args.limit,
          startTime: args.startTime,
          endTime: args.endTime,
          additionalFields: args.additionalFields,
        });

        return formatLogResult(
          result,
          `Successfully queried logs where ${args.field} matches '${args.value}'.`
        );
      } catch (error) {
        defaultLogger.error("query_logs failed", error);
        return formatErrorResult(error, "query_logs");
      }
    }
  );
  toolCount++;

  // Register natural_language_to_nrql_query tool
  server.tool(
    "natural_language_to_nrql_query",
    "Convert a natural language description into NRQL query suggestions. Returns matching query patterns, templates, and NRQL syntax guidance. Use this when you need help constructing NRQL queries for NewRelic.",
    NaturalLanguageToNrqlSchema,
    async (args) => {
      try {
        defaultLogger.info("Converting natural language to NRQL", {
          descriptionLength: args.description.length,
          eventType: args.eventType,
        });

        const { patterns, suggestions } = analyzeNaturalLanguage(
          args.description,
          args.eventType
        );

        const includeExamples = args.includeExamples !== false;

        // Build response with matched patterns
        const matchedPatterns = patterns.map((pattern) => ({
          name: pattern.name,
          description: pattern.description,
          templates: includeExamples ? pattern.templates : undefined,
        }));

        // Build NRQL construction guidance
        const guidance = {
          input: args.description,
          matchedPatterns,
          suggestions,
          nrqlSyntaxReference: {
            basicStructure: "SELECT <fields> FROM <event_type> WHERE <conditions> FACET <grouping> SINCE <time_range>",
            commonEventTypes: [
              "Transaction - APM transactions",
              "TransactionError - Application errors",
              "Log - Log messages",
              "Metric - Custom and system metrics",
              "Span - Distributed tracing spans",
              "PageView - Browser page views",
              "BrowserInteraction - Browser interactions",
              "SyntheticCheck - Synthetic monitoring results",
            ],
            aggregationFunctions: AGGREGATION_FUNCTIONS,
            timeRanges: TIME_RANGES,
            tips: [
              "Use FACET to group results by a field",
              "Use TIMESERIES to create time-based charts",
              "Use COMPARE WITH to compare with previous time periods",
              "Use LIMIT to restrict result count (default is 10 for FACETs)",
              "Use WHERE to filter results",
              "String comparisons are case-sensitive; use LIKE for pattern matching",
            ],
          },
        };

        // Generate a suggested query if we have a good pattern match
        let suggestedQuery: string | undefined;
        if (patterns.length > 0 && patterns[0].templates.length > 0) {
          suggestedQuery = patterns[0].templates[0];
          if (args.eventType) {
            // Try to substitute event type in the suggested query
            suggestedQuery = suggestedQuery.replace(
              /FROM \w+/i,
              `FROM ${args.eventType}`
            );
          }
        }

        return {
          content: [
            {
              type: "text",
              text: suggestedQuery
                ? `Based on your description, here's a suggested NRQL query:\n\n\`\`\`nrql\n${suggestedQuery}\n\`\`\`\n\nYou can modify this query or use the patterns below as starting points.`
                : "I've analyzed your description and provided NRQL guidance below. Use the patterns and syntax reference to construct your query.",
            },
            {
              type: "text",
              text: JSON.stringify(guidance, null, 2),
            },
          ],
        };
      } catch (error) {
        defaultLogger.error("natural_language_to_nrql_query failed", error);
        return formatErrorResult(error, "natural_language_to_nrql_query");
      }
    }
  );
  toolCount++;

  defaultLogger.info(`Registered ${toolCount} NRQL and log tools`);
  return toolCount;
}
