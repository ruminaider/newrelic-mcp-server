/**
 * Alert tools for MCP server
 * Provides tools for listing and managing NewRelic alert policies and conditions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	listAlertConditions,
	listAlertPolicies,
	listRecentIssues,
} from "../services/alert-service.js";
import { defaultLogger } from "../utils/logger.js";

// ============================================================================
// Zod Schemas
// ============================================================================

const ListAlertPoliciesSchema = z.object({
	nameFilter: z
		.string()
		.optional()
		.describe(
			"Optional filter to search policies by name (case-insensitive partial match)",
		),
	limit: z
		.number()
		.int()
		.min(1)
		.max(500)
		.optional()
		.default(100)
		.describe("Maximum number of policies to return (default: 100, max: 500)"),
});

const ListAlertConditionsSchema = z.object({
	policyId: z.string().optional().describe("Filter conditions by policy ID"),
	nameFilter: z
		.string()
		.optional()
		.describe(
			"Optional filter to search conditions by name (case-insensitive partial match)",
		),
	enabledOnly: z
		.boolean()
		.optional()
		.default(false)
		.describe("If true, only return enabled conditions"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(500)
		.optional()
		.default(100)
		.describe(
			"Maximum number of conditions to return (default: 100, max: 500)",
		),
});

const ListRecentIssuesSchema = z.object({
	states: z
		.array(z.enum(["ACTIVATED", "CREATED", "CLOSED", "DEACTIVATED"]))
		.optional()
		.describe("Filter by issue states (default: ACTIVATED, CREATED)"),
	priorities: z
		.array(z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]))
		.optional()
		.describe("Filter by issue priorities"),
	entityGuids: z
		.array(z.string())
		.optional()
		.describe("Filter by entity GUIDs"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.default(50)
		.describe("Maximum number of issues to return (default: 50, max: 200)"),
});

// ============================================================================
// Tool Registration Functions
// ============================================================================

/**
 * Registers the list_alert_policies tool
 */
export function registerListAlertPoliciesTool(server: McpServer): void {
	server.tool(
		"list_alert_policies",
		"List NewRelic alert policies with optional name filtering. Returns policy ID, name, and incident preference settings.",
		ListAlertPoliciesSchema.shape,
		async (args) => {
			defaultLogger.info("Executing list_alert_policies", { args });

			try {
				const validatedArgs = ListAlertPoliciesSchema.parse(args);
				const result = await listAlertPolicies({
					nameFilter: validatedArgs.nameFilter,
					limit: validatedArgs.limit,
				});

				const content = formatAlertPoliciesResult(result);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in list_alert_policies", error);
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred";
				return {
					content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
					isError: true,
				};
			}
		},
	);
}

/**
 * Registers the list_alert_conditions tool
 */
export function registerListAlertConditionsTool(server: McpServer): void {
	server.tool(
		"list_alert_conditions",
		"List NewRelic NRQL alert conditions with optional filtering by policy, name, or enabled status. Returns condition details including NRQL query, thresholds, and configuration.",
		ListAlertConditionsSchema.shape,
		async (args) => {
			defaultLogger.info("Executing list_alert_conditions", { args });

			try {
				const validatedArgs = ListAlertConditionsSchema.parse(args);
				const result = await listAlertConditions({
					policyId: validatedArgs.policyId,
					nameFilter: validatedArgs.nameFilter,
					enabledOnly: validatedArgs.enabledOnly,
					limit: validatedArgs.limit,
				});

				const content = formatAlertConditionsResult(result);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in list_alert_conditions", error);
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred";
				return {
					content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
					isError: true,
				};
			}
		},
	);
}

/**
 * Registers the list_recent_issues tool
 */
export function registerListRecentIssuesTool(server: McpServer): void {
	server.tool(
		"list_recent_issues",
		"List recent AI-detected issues from NewRelic. Uses the experimental aiIssues API to fetch active and recent incidents with priority and state information.",
		ListRecentIssuesSchema.shape,
		async (args) => {
			defaultLogger.info("Executing list_recent_issues", { args });

			try {
				const validatedArgs = ListRecentIssuesSchema.parse(args);
				const result = await listRecentIssues({
					states: validatedArgs.states,
					priorities: validatedArgs.priorities,
					entityGuids: validatedArgs.entityGuids,
					limit: validatedArgs.limit,
				});

				const content = formatRecentIssuesResult(result);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in list_recent_issues", error);
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error occurred";
				return {
					content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
					isError: true,
				};
			}
		},
	);
}

/**
 * Registers all alert tools with the MCP server
 */
export function registerAlertTools(server: McpServer): number {
	registerListAlertPoliciesTool(server);
	registerListAlertConditionsTool(server);
	registerListRecentIssuesTool(server);

	defaultLogger.info("Registered 3 alert tools");
	return 3;
}

// ============================================================================
// Formatting Functions
// ============================================================================

function formatAlertPoliciesResult(result: {
	policies: Array<{
		id: string;
		name: string;
		incidentPreference: string;
	}>;
	totalCount: number;
}): string {
	const lines: string[] = [];

	lines.push(
		`# Alert Policies (${result.policies.length} of ${result.totalCount} total)`,
	);
	lines.push("");

	if (result.policies.length === 0) {
		lines.push("No alert policies found matching the criteria.");
		return lines.join("\n");
	}

	for (const policy of result.policies) {
		lines.push(`## ${policy.name}`);
		lines.push(`- **ID:** ${policy.id}`);
		lines.push(
			`- **Incident Preference:** ${formatIncidentPreference(policy.incidentPreference)}`,
		);
		lines.push("");
	}

	return lines.join("\n");
}

function formatIncidentPreference(preference: string): string {
	switch (preference) {
		case "PER_POLICY":
			return "Per Policy (one incident per policy)";
		case "PER_CONDITION":
			return "Per Condition (one incident per condition)";
		case "PER_CONDITION_AND_TARGET":
			return "Per Condition and Target (one incident per condition and entity)";
		default:
			return preference;
	}
}

function formatAlertConditionsResult(result: {
	conditions: Array<{
		id: string;
		name: string;
		enabled: boolean;
		type: string;
		policyId?: string;
		description?: string;
		runbookUrl?: string;
		nrql?: { query: string };
		signal?: { aggregationWindow?: number; evaluationOffset?: number };
		expiration?: {
			closeViolationsOnExpiration?: boolean;
			expirationDuration?: number;
			openViolationOnExpiration?: boolean;
		};
	}>;
	totalCount: number;
}): string {
	const lines: string[] = [];

	lines.push(
		`# Alert Conditions (${result.conditions.length} of ${result.totalCount} total)`,
	);
	lines.push("");

	if (result.conditions.length === 0) {
		lines.push("No alert conditions found matching the criteria.");
		return lines.join("\n");
	}

	for (const condition of result.conditions) {
		lines.push(`## ${condition.name}`);
		lines.push(`- **ID:** ${condition.id}`);
		lines.push(`- **Type:** ${condition.type}`);
		lines.push(`- **Enabled:** ${condition.enabled ? "Yes" : "No"}`);

		if (condition.policyId) {
			lines.push(`- **Policy ID:** ${condition.policyId}`);
		}

		if (condition.description) {
			lines.push(`- **Description:** ${condition.description}`);
		}

		if (condition.runbookUrl) {
			lines.push(`- **Runbook:** ${condition.runbookUrl}`);
		}

		if (condition.nrql?.query) {
			lines.push("- **NRQL Query:**");
			lines.push("  ```nrql");
			lines.push(`  ${condition.nrql.query}`);
			lines.push("  ```");
		}

		if (condition.signal) {
			if (condition.signal.aggregationWindow) {
				lines.push(
					`- **Aggregation Window:** ${condition.signal.aggregationWindow}s`,
				);
			}
			if (condition.signal.evaluationOffset) {
				lines.push(
					`- **Evaluation Offset:** ${condition.signal.evaluationOffset}s`,
				);
			}
		}

		lines.push("");
	}

	return lines.join("\n");
}

function formatRecentIssuesResult(result: {
	issues: Array<{
		issueId: string;
		title: string;
		priority: string;
		state: string;
		activatedAt: number;
		closedAt?: number;
		sources?: string[];
		conditionFamilyId?: string;
		policyIds?: string[];
		entityGuids?: string[];
		description?: string[];
	}>;
}): string {
	const lines: string[] = [];

	lines.push(`# Recent AI Issues (${result.issues.length})`);
	lines.push("");

	if (result.issues.length === 0) {
		lines.push("No issues found matching the criteria.");
		return lines.join("\n");
	}

	// Group by priority for better readability
	const criticalIssues = result.issues.filter((i) => i.priority === "CRITICAL");
	const highIssues = result.issues.filter((i) => i.priority === "HIGH");
	const mediumIssues = result.issues.filter((i) => i.priority === "MEDIUM");
	const lowIssues = result.issues.filter((i) => i.priority === "LOW");

	if (criticalIssues.length > 0) {
		lines.push(`## Critical Priority (${criticalIssues.length})`);
		lines.push("");
		for (const issue of criticalIssues) {
			lines.push(formatIssue(issue));
		}
	}

	if (highIssues.length > 0) {
		lines.push(`## High Priority (${highIssues.length})`);
		lines.push("");
		for (const issue of highIssues) {
			lines.push(formatIssue(issue));
		}
	}

	if (mediumIssues.length > 0) {
		lines.push(`## Medium Priority (${mediumIssues.length})`);
		lines.push("");
		for (const issue of mediumIssues) {
			lines.push(formatIssue(issue));
		}
	}

	if (lowIssues.length > 0) {
		lines.push(`## Low Priority (${lowIssues.length})`);
		lines.push("");
		for (const issue of lowIssues) {
			lines.push(formatIssue(issue));
		}
	}

	return lines.join("\n");
}

function formatIssue(issue: {
	issueId: string;
	title: string;
	priority: string;
	state: string;
	activatedAt: number;
	closedAt?: number;
	sources?: string[];
	conditionFamilyId?: string;
	policyIds?: string[];
	entityGuids?: string[];
	description?: string[];
}): string {
	const lines: string[] = [];

	lines.push(`### ${issue.title}`);
	lines.push(`- **Issue ID:** ${issue.issueId}`);
	lines.push(`- **State:** ${issue.state}`);
	lines.push(`- **Priority:** ${issue.priority}`);
	lines.push(
		`- **Activated At:** ${new Date(issue.activatedAt).toISOString()}`,
	);

	if (issue.closedAt) {
		lines.push(`- **Closed At:** ${new Date(issue.closedAt).toISOString()}`);
	}

	if (issue.sources && issue.sources.length > 0) {
		lines.push(`- **Sources:** ${issue.sources.join(", ")}`);
	}

	if (issue.entityGuids && issue.entityGuids.length > 0) {
		lines.push(`- **Affected Entities:** ${issue.entityGuids.length} entities`);
		for (const guid of issue.entityGuids.slice(0, 5)) {
			lines.push(`  - ${guid}`);
		}
		if (issue.entityGuids.length > 5) {
			lines.push(`  - ... and ${issue.entityGuids.length - 5} more`);
		}
	}

	if (issue.description && issue.description.length > 0) {
		lines.push("- **Description:**");
		for (const desc of issue.description.slice(0, 3)) {
			lines.push(`  - ${desc}`);
		}
	}

	lines.push("");
	return lines.join("\n");
}
