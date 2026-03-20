/**
 * Custom error classes for the NewRelic MCP server
 */

/**
 * Base error class for NewRelic MCP errors
 */
export class NewRelicMcpError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "NewRelicMcpError";
	}
}

/**
 * Error thrown when NewRelic API authentication fails
 */
export class AuthenticationError extends NewRelicMcpError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, "AUTHENTICATION_ERROR", details);
		this.name = "AuthenticationError";
	}
}

/**
 * Error thrown when a NewRelic API request fails
 */
export class ApiError extends NewRelicMcpError {
	constructor(
		message: string,
		public readonly statusCode?: number,
		details?: Record<string, unknown>,
	) {
		super(message, "API_ERROR", { ...details, statusCode });
		this.name = "ApiError";
	}
}

/**
 * Error thrown when rate limited by NewRelic API
 */
export class RateLimitError extends NewRelicMcpError {
	constructor(
		message: string,
		public readonly retryAfterMs?: number,
		details?: Record<string, unknown>,
	) {
		super(message, "RATE_LIMIT_ERROR", { ...details, retryAfterMs });
		this.name = "RateLimitError";
	}
}

/**
 * Error thrown when an NRQL query is invalid
 */
export class NrqlSyntaxError extends NewRelicMcpError {
	constructor(
		message: string,
		public readonly query: string,
	) {
		super(message, "NRQL_SYNTAX_ERROR", { query });
		this.name = "NrqlSyntaxError";
	}
}

/**
 * Error thrown when an entity is not found
 */
export class EntityNotFoundError extends NewRelicMcpError {
	constructor(entityGuid: string) {
		super(`Entity not found: ${entityGuid}`, "ENTITY_NOT_FOUND", {
			entityGuid,
		});
		this.name = "EntityNotFoundError";
	}
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends NewRelicMcpError {
	constructor(operationName: string, timeoutMs: number) {
		super(
			`Operation '${operationName}' timed out after ${timeoutMs}ms`,
			"TIMEOUT_ERROR",
			{ operationName, timeoutMs },
		);
		this.name = "TimeoutError";
	}
}
