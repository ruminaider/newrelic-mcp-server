/**
 * Utility tools for NewRelic MCP server
 * Local utilities that don't require API calls
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defaultLogger } from "../utils/logger.js";
import { formatResponse } from "../utils/response.js";

/**
 * Schema for convert_time_period_to_epoch_ms tool input
 */
const ConvertTimePeriodSchema = z.object({
  timeString: z
    .string()
    .describe("Human-readable time string to convert. Examples: '1 hour ago', '30 minutes ago', '7 days ago', '2024-01-15', '2024-01-15T10:30:00Z'"),
  timezone: z
    .string()
    .optional()
    .default("UTC")
    .describe("Timezone for interpreting relative times. Default: UTC. Examples: 'America/Los_Angeles', 'America/New_York', 'Europe/London'"),
  referenceTime: z
    .number()
    .optional()
    .describe("Reference timestamp in milliseconds for relative calculations. Defaults to current time."),
});

/**
 * Parses relative time strings like "1 hour ago", "30 minutes ago", etc.
 */
function parseRelativeTime(
  timeString: string,
  referenceTime: number
): number | null {
  const normalized = timeString.toLowerCase().trim();

  // Handle "now"
  if (normalized === "now") {
    return referenceTime;
  }

  // Pattern: "X unit(s) ago"
  const agoPattern = /^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago$/i;
  const agoMatch = normalized.match(agoPattern);

  if (agoMatch) {
    const value = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2].toLowerCase();

    const msMultipliers: Record<string, number> = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000, // Approximate
      year: 365 * 24 * 60 * 60 * 1000, // Approximate
    };

    const multiplier = msMultipliers[unit];
    if (multiplier) {
      return referenceTime - value * multiplier;
    }
  }

  return null;
}

/**
 * Parses ISO 8601 date strings
 */
function parseIsoDate(timeString: string): number | null {
  const date = new Date(timeString);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }
  return null;
}

/**
 * Parses various date formats
 */
function parseDateFormats(timeString: string): number | null {
  const normalized = timeString.trim();

  // Try common formats
  const formats = [
    // ISO 8601
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/,
    // YYYY/MM/DD
    /^\d{4}\/\d{2}\/\d{2}$/,
    // MM/DD/YYYY
    /^\d{2}\/\d{2}\/\d{4}$/,
  ];

  for (const format of formats) {
    if (format.test(normalized)) {
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }
  }

  return null;
}

/**
 * Converts a time string to epoch milliseconds
 */
function convertToEpochMs(
  timeString: string,
  timezone: string,
  referenceTime: number
): { epochMs: number; isoString: string; utcString: string } | null {
  // Try relative time first
  let epochMs = parseRelativeTime(timeString, referenceTime);

  // Try ISO date format
  if (epochMs === null) {
    epochMs = parseIsoDate(timeString);
  }

  // Try other date formats
  if (epochMs === null) {
    epochMs = parseDateFormats(timeString);
  }

  if (epochMs === null) {
    return null;
  }

  const date = new Date(epochMs);

  return {
    epochMs,
    isoString: date.toISOString(),
    utcString: date.toUTCString(),
  };
}

/**
 * Registers the convert_time_period_to_epoch_ms tool
 */
export function registerConvertTimePeriodTool(server: McpServer): void {
  server.tool(
    "convert_time_period_to_epoch_ms",
    "Convert human-readable time strings to epoch milliseconds. Supports relative times like '1 hour ago', '30 minutes ago', '7 days ago' and absolute times like ISO 8601 dates. Useful for constructing NRQL time ranges or comparing timestamps. This is a local utility that does not make API calls.",
    ConvertTimePeriodSchema.shape,
    async (params) => {
      try {
        defaultLogger.info("convert_time_period_to_epoch_ms tool called", {
          timeString: params.timeString,
          timezone: params.timezone,
        });

        const referenceTime = params.referenceTime ?? Date.now();
        const result = convertToEpochMs(
          params.timeString,
          params.timezone,
          referenceTime
        );

        if (!result) {
          return {
            content: [
              {
                type: "text" as const,
                text: formatResponse({
                  error: "Unable to parse time string",
                  input: params.timeString,
                  supportedFormats: [
                    "Relative: '1 hour ago', '30 minutes ago', '7 days ago', 'now'",
                    "ISO 8601: '2024-01-15', '2024-01-15T10:30:00Z'",
                    "Date: 'YYYY-MM-DD', 'YYYY/MM/DD', 'MM/DD/YYYY'",
                  ],
                }),
              },
            ],
            isError: true,
          };
        }

        const formattedResponse = {
          input: params.timeString,
          timezone: params.timezone,
          referenceTime: {
            epochMs: referenceTime,
            isoString: new Date(referenceTime).toISOString(),
          },
          result: {
            epochMs: result.epochMs,
            epochSeconds: Math.floor(result.epochMs / 1000),
            isoString: result.isoString,
            utcString: result.utcString,
            relativeToNow: formatRelativeTime(referenceTime - result.epochMs),
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
        defaultLogger.error("convert_time_period_to_epoch_ms tool failed", error);
        throw error;
      }
    }
  );

  defaultLogger.info("Registered convert_time_period_to_epoch_ms tool");
}

/**
 * Formats a duration in milliseconds as a human-readable relative time
 */
function formatRelativeTime(durationMs: number): string {
  if (durationMs < 0) {
    return `${formatRelativeTime(-durationMs)} in the future`;
  }

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""} ago`;
  }
  if (months > 0) {
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  if (weeks > 0) {
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  if (seconds > 0) {
    return `${seconds} second${seconds > 1 ? "s" : ""} ago`;
  }
  return "now";
}

/**
 * Registers all utility tools
 */
export function registerUtilityTools(server: McpServer): number {
  registerConvertTimePeriodTool(server);
  return 1; // Number of tools registered
}
