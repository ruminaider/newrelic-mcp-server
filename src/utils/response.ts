/**
 * Response optimization for MCP tool outputs.
 * Strips verbose NerdGraph metadata and uses compact JSON to reduce token usage.
 */

// Fields commonly returned by NerdGraph that add no value for LLM consumption
const STRIP_FIELDS = new Set([
	"__typename",
	"permalink",
	"accountId",
	"runningAgentVersions",
	"tags",
	"reporting",
	"alertSeverity",
	"entityType",
	"indexedAt",
	"nrdbQuery",
	"rawConfiguration",
	"embeddedChartUrl",
]);

// Additional fields to strip from list/search responses (more aggressive)
const LIST_STRIP_FIELDS = new Set([
	...STRIP_FIELDS,
	"settings",
	"summaryMetrics",
	"recentAlertViolations",
	"nrdbQuery",
]);

function stripFields(obj: unknown, fieldsToStrip: Set<string>): unknown {
	if (obj === null || obj === undefined) return obj;
	if (Array.isArray(obj)) return obj.map((item) => stripFields(item, fieldsToStrip));
	if (typeof obj !== "object") return obj;

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
		if (fieldsToStrip.has(key)) continue;
		result[key] = typeof value === "object" && value !== null ? stripFields(value, fieldsToStrip) : value;
	}
	return result;
}

/**
 * Optimize a detail response (get_entity, get_dashboard, etc.)
 * Strips NerdGraph metadata while keeping functional fields.
 */
export function optimizeDetail(data: unknown): string {
	return JSON.stringify(stripFields(data, STRIP_FIELDS));
}

/**
 * Optimize a list/search response.
 * More aggressive stripping for bulk results.
 */
export function optimizeList(data: unknown): string {
	return JSON.stringify(stripFields(data, LIST_STRIP_FIELDS));
}

/**
 * Format a response with compact JSON (no whitespace).
 */
export function formatResponse(data: unknown): string {
	return JSON.stringify(data);
}
