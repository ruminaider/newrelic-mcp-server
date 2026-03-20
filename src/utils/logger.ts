/**
 * Structured JSON logger for MCP server
 * Logs to stderr to avoid interfering with stdio transport on stdout
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	data?: unknown;
	error?: {
		name: string;
		message: string;
		stack?: string;
	};
}

/**
 * Patterns to redact from log output
 */
const REDACT_PATTERNS = [
	/API-Key:\s*[A-Za-z0-9_-]+/gi,
	/apiKey["']?\s*[:=]\s*["']?[A-Za-z0-9_-]+["']?/gi,
	/NRAK-[A-Z0-9]+/gi,
];

/**
 * Redacts sensitive information from strings
 */
function redact(value: string): string {
	let result = value;
	for (const pattern of REDACT_PATTERNS) {
		result = result.replace(pattern, "[REDACTED]");
	}
	return result;
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export interface Logger {
	debug(message: string, data?: unknown): void;
	info(message: string, data?: unknown): void;
	warn(message: string, data?: unknown): void;
	error(message: string, error?: unknown): void;
	setLevel(level: LogLevel): void;
}

/**
 * Creates a structured JSON logger
 * @param minLevel Minimum log level to output (default: info)
 */
export function createLogger(minLevel: LogLevel = "info"): Logger {
	let currentLevel = minLevel;

	function shouldLog(level: LogLevel): boolean {
		return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
	}

	function formatError(error: unknown): LogEntry["error"] | undefined {
		if (error instanceof Error) {
			return {
				name: error.name,
				message: error.message,
				stack: error.stack,
			};
		}
		if (error !== undefined && error !== null) {
			return {
				name: "Unknown",
				message: String(error),
			};
		}
		return undefined;
	}

	function log(
		level: LogLevel,
		message: string,
		data?: unknown,
		error?: unknown,
	): void {
		if (!shouldLog(level)) return;

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message: redact(message),
		};

		if (data !== undefined) {
			// Redact sensitive data from stringified output
			const dataStr = JSON.stringify(data);
			entry.data = JSON.parse(redact(dataStr));
		}

		if (error !== undefined) {
			entry.error = formatError(error);
			if (entry.error?.stack) {
				entry.error.stack = redact(entry.error.stack);
			}
		}

		// Write to stderr to avoid interfering with stdio transport
		process.stderr.write(`${JSON.stringify(entry)}\n`);
	}

	return {
		debug(message: string, data?: unknown): void {
			log("debug", message, data);
		},
		info(message: string, data?: unknown): void {
			log("info", message, data);
		},
		warn(message: string, data?: unknown): void {
			log("warn", message, data);
		},
		error(message: string, error?: unknown): void {
			log("error", message, undefined, error);
		},
		setLevel(level: LogLevel): void {
			currentLevel = level;
		},
	};
}

/**
 * Default logger instance
 */
export const defaultLogger = createLogger("info");
