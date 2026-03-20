/**
 * Log Query Service
 * Handles querying logs from NewRelic Log event type
 */

import { defaultLogger } from "../utils/logger.js";
import { type NrqlQueryResult, getNrqlService } from "./nrql-service.js";

/**
 * Options for listing recent logs
 */
export interface ListRecentLogsOptions {
	/** Number of logs to retrieve (default: 100, max: 2000) */
	limit?: number;
	/** Time range in minutes to look back (default: 60) */
	sinceMinutesAgo?: number;
	/** Log level filter (e.g., 'ERROR', 'WARN', 'INFO') */
	level?: string;
	/** Additional NRQL WHERE clause conditions */
	whereClause?: string;
}

/**
 * Options for analyzing entity logs
 */
export interface AnalyzeEntityLogsOptions {
	/** The entity GUID to filter logs by */
	entityGuid: string;
	/** Number of logs to retrieve (default: 100, max: 2000) */
	limit?: number;
	/** Time range in minutes to look back (default: 60) */
	sinceMinutesAgo?: number;
	/** Log level filter (e.g., 'ERROR', 'WARN', 'INFO') */
	level?: string;
	/** Additional fields to select (comma-separated) */
	additionalFields?: string;
}

/**
 * Options for querying logs with field/value search
 */
export interface QueryLogsOptions {
	/** Field name to search on */
	field: string;
	/** Value to search for (supports wildcards with %) */
	value: string;
	/** Number of logs to retrieve (default: 100, max: 2000) */
	limit?: number;
	/** Start time in epoch milliseconds (optional, defaults to 1 hour ago) */
	startTime?: number;
	/** End time in epoch milliseconds (optional, defaults to now) */
	endTime?: number;
	/** Additional fields to select (comma-separated) */
	additionalFields?: string;
}

/**
 * Processed log entry with common fields
 */
export interface LogEntry {
	/** Timestamp of the log entry */
	timestamp: number;
	/** Log level */
	level?: string;
	/** Log message */
	message?: string;
	/** Service name */
	serviceName?: string;
	/** Entity GUID */
	entityGuid?: string;
	/** All other fields */
	[key: string]: unknown;
}

/**
 * Result of a log query
 */
export interface LogQueryResult {
	/** Array of log entries */
	logs: LogEntry[];
	/** Total count of matching logs */
	count: number;
	/** Query execution time in milliseconds */
	elapsedTime: number;
	/** Time window of the query */
	timeWindow: {
		begin: string;
		end: string;
	} | null;
}

/**
 * Service for querying NewRelic logs
 */
export class LogService {
	private readonly nrqlService = getNrqlService();

	/**
	 * Default fields to select in log queries
	 */
	private readonly defaultLogFields = [
		"timestamp",
		"message",
		"level",
		"service.name",
		"entity.guid",
		"hostname",
		"error.message",
		"error.class",
	];

	/**
	 * Lists recent logs from the Log event type
	 *
	 * @param options - Query options
	 * @returns Log query results
	 */
	async listRecentLogs(
		options: ListRecentLogsOptions = {},
	): Promise<LogQueryResult> {
		const { limit = 100, sinceMinutesAgo = 60, level, whereClause } = options;

		const effectiveLimit = Math.min(limit, 2000);

		defaultLogger.info("Listing recent logs", {
			limit: effectiveLimit,
			sinceMinutesAgo,
			level,
			hasWhereClause: !!whereClause,
		});

		// Build WHERE clause conditions
		const conditions: string[] = [];
		if (level) {
			conditions.push(`level = '${this.escapeNrqlString(level)}'`);
		}
		if (whereClause) {
			conditions.push(`(${whereClause})`);
		}

		const whereStatement =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		const query = `
      SELECT ${this.defaultLogFields.join(", ")}
      FROM Log
      ${whereStatement}
      SINCE ${sinceMinutesAgo} MINUTES AGO
      LIMIT ${effectiveLimit}
    `.trim();

		const result = await this.nrqlService.executeQuery(query);
		return this.processLogResults(result);
	}

	/**
	 * Analyzes logs for a specific entity
	 *
	 * @param options - Query options with entity GUID
	 * @returns Log query results
	 */
	async analyzeEntityLogs(
		options: AnalyzeEntityLogsOptions,
	): Promise<LogQueryResult> {
		const {
			entityGuid,
			limit = 100,
			sinceMinutesAgo = 60,
			level,
			additionalFields,
		} = options;

		const effectiveLimit = Math.min(limit, 2000);

		defaultLogger.info("Analyzing entity logs", {
			entityGuid,
			limit: effectiveLimit,
			sinceMinutesAgo,
			level,
		});

		// Build field list
		const fields = [...this.defaultLogFields];
		if (additionalFields) {
			const extraFields = additionalFields.split(",").map((f) => f.trim());
			fields.push(...extraFields);
		}
		const uniqueFields = [...new Set(fields)];

		// Build WHERE clause conditions
		const conditions: string[] = [
			`entity.guid = '${this.escapeNrqlString(entityGuid)}'`,
		];
		if (level) {
			conditions.push(`level = '${this.escapeNrqlString(level)}'`);
		}

		const query = `
      SELECT ${uniqueFields.join(", ")}
      FROM Log
      WHERE ${conditions.join(" AND ")}
      SINCE ${sinceMinutesAgo} MINUTES AGO
      LIMIT ${effectiveLimit}
    `.trim();

		const result = await this.nrqlService.executeQuery(query);
		return this.processLogResults(result);
	}

	/**
	 * Queries logs with field/value search and time range
	 *
	 * @param options - Query options with field/value filter
	 * @returns Log query results
	 */
	async queryLogs(options: QueryLogsOptions): Promise<LogQueryResult> {
		const {
			field,
			value,
			limit = 100,
			startTime,
			endTime,
			additionalFields,
		} = options;

		const effectiveLimit = Math.min(limit, 2000);

		// Default time range: 1 hour ago to now
		const now = Date.now();
		const effectiveStartTime = startTime || now - 60 * 60 * 1000;
		const effectiveEndTime = endTime || now;

		defaultLogger.info("Querying logs with field filter", {
			field,
			value,
			limit: effectiveLimit,
			startTime: effectiveStartTime,
			endTime: effectiveEndTime,
		});

		// Build field list
		const fields = [...this.defaultLogFields];
		if (!fields.includes(field)) {
			fields.push(field);
		}
		if (additionalFields) {
			const extraFields = additionalFields.split(",").map((f) => f.trim());
			fields.push(...extraFields);
		}
		const uniqueFields = [...new Set(fields)];

		// Determine if we need LIKE (for wildcards) or = (for exact match)
		const escapedValue = this.escapeNrqlString(value);
		const operator = value.includes("%") ? "LIKE" : "=";

		const query = `
      SELECT ${uniqueFields.join(", ")}
      FROM Log
      WHERE \`${field}\` ${operator} '${escapedValue}'
      SINCE ${effectiveStartTime}
      UNTIL ${effectiveEndTime}
      LIMIT ${effectiveLimit}
    `.trim();

		const result = await this.nrqlService.executeQuery(query);
		return this.processLogResults(result);
	}

	/**
	 * Processes NRQL results into structured log entries
	 */
	private processLogResults(result: NrqlQueryResult): LogQueryResult {
		const logs: LogEntry[] = result.results.map((row) => ({
			timestamp: row.timestamp as number,
			level: row.level as string | undefined,
			message: row.message as string | undefined,
			serviceName: row["service.name"] as string | undefined,
			entityGuid: row["entity.guid"] as string | undefined,
			...row,
		}));

		// Sort by timestamp descending (most recent first)
		logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

		return {
			logs,
			count: logs.length,
			elapsedTime: result.elapsedTime,
			timeWindow: result.metadata.timeWindow
				? {
						begin: new Date(result.metadata.timeWindow.begin).toISOString(),
						end: new Date(result.metadata.timeWindow.end).toISOString(),
					}
				: null,
		};
	}

	/**
	 * Escapes special characters in NRQL string values
	 */
	private escapeNrqlString(value: string): string {
		// Escape single quotes by doubling them
		return value.replace(/'/g, "''");
	}
}

/**
 * Singleton instance of the Log service
 */
let logServiceInstance: LogService | null = null;

/**
 * Gets the singleton Log service instance
 */
export function getLogService(): LogService {
	if (!logServiceInstance) {
		logServiceInstance = new LogService();
	}
	return logServiceInstance;
}
