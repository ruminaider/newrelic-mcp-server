/**
 * Incident tools for MCP server
 * Provides tools for searching incidents, analyzing deployments, and error groups
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	type AiIssue,
	type ChangeEvent,
	type DeploymentEvent,
	type ErrorGroup,
	analyzeDeploymentImpact,
	generateAlertInsightsReport,
	getChangeEvents,
	getDeploymentEvents,
	getEntityErrorGroups,
	searchIncidents,
} from "../services/alert-service.js";
import { defaultLogger } from "../utils/logger.js";

// ============================================================================
// Zod Schemas
// ============================================================================

const SearchIncidentSchema = z.object({
	state: z
		.string()
		.optional()
		.describe("Filter by incident state (e.g., 'open', 'closed')"),
	priority: z
		.string()
		.optional()
		.describe(
			"Filter by incident priority (e.g., 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW')",
		),
	entityGuid: z.string().optional().describe("Filter by entity GUID"),
	sinceDays: z
		.number()
		.int()
		.min(1)
		.max(30)
		.optional()
		.default(7)
		.describe("Number of days to look back (default: 7, max: 30)"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.default(50)
		.describe("Maximum number of incidents to return (default: 50, max: 200)"),
});

const AnalyzeDeploymentImpactSchema = z.object({
	entityGuid: z
		.string()
		.describe("Entity GUID to analyze deployment impact for"),
	deploymentTimestamp: z
		.number()
		.optional()
		.describe(
			"Unix timestamp (ms) of the deployment to analyze. If not provided, uses the most recent deployment.",
		),
	beforeMinutes: z
		.number()
		.int()
		.min(5)
		.max(120)
		.optional()
		.default(30)
		.describe("Minutes before deployment to analyze (default: 30)"),
	afterMinutes: z
		.number()
		.int()
		.min(5)
		.max(120)
		.optional()
		.default(30)
		.describe("Minutes after deployment to analyze (default: 30)"),
});

const GenerateAlertInsightsReportSchema = z.object({
	entityGuid: z
		.string()
		.optional()
		.describe("Optional entity GUID to focus the report on"),
	sinceDays: z
		.number()
		.int()
		.min(1)
		.max(30)
		.optional()
		.default(7)
		.describe("Number of days to include in the report (default: 7, max: 30)"),
});

const GetEntityErrorGroupsSchema = z.object({
	entityGuid: z.string().optional().describe("Filter errors by entity GUID"),
	transactionName: z
		.string()
		.optional()
		.describe("Filter errors by transaction name (partial match)"),
	sinceDays: z
		.number()
		.int()
		.min(1)
		.max(30)
		.optional()
		.default(7)
		.describe("Number of days to look back (default: 7, max: 30)"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(100)
		.optional()
		.default(50)
		.describe(
			"Maximum number of error groups to return (default: 50, max: 100)",
		),
});

const ListChangeEventsSchema = z.object({
	entityGuid: z.string().optional().describe("Filter changes by entity GUID"),
	changeType: z
		.string()
		.optional()
		.describe("Filter by change type (e.g., 'DEPLOYMENT')"),
	sinceDays: z
		.number()
		.int()
		.min(1)
		.max(30)
		.optional()
		.default(7)
		.describe("Number of days to look back (default: 7, max: 30)"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.default(50)
		.describe(
			"Maximum number of change events to return (default: 50, max: 200)",
		),
});

// ============================================================================
// Tool Registration Functions
// ============================================================================

/**
 * Registers the search_incident tool
 */
export function registerSearchIncidentTool(server: McpServer): void {
	server.tool(
		"search_incident",
		"Search NewRelic incidents with filtering by state, priority, and entity. Uses NRQL to query the NrAiIncident event type.",
		SearchIncidentSchema.shape,
		async (args) => {
			defaultLogger.info("Executing search_incident", { args });

			try {
				const validatedArgs = SearchIncidentSchema.parse(args);
				const result = await searchIncidents({
					state: validatedArgs.state,
					priority: validatedArgs.priority,
					entityGuid: validatedArgs.entityGuid,
					sinceDays: validatedArgs.sinceDays,
					limit: validatedArgs.limit,
				});

				const content = formatIncidentsResult(result.incidents);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in search_incident", error);
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
 * Registers the analyze_deployment_impact tool
 */
export function registerAnalyzeDeploymentImpactTool(server: McpServer): void {
	server.tool(
		"analyze_deployment_impact",
		"Analyze the impact of a deployment by comparing metrics (error rate, throughput, response time) before and after the deployment. Helps identify if a deployment caused performance degradation.",
		AnalyzeDeploymentImpactSchema.shape,
		async (args) => {
			defaultLogger.info("Executing analyze_deployment_impact", { args });

			try {
				const validatedArgs = AnalyzeDeploymentImpactSchema.parse(args);
				const result = await analyzeDeploymentImpact({
					entityGuid: validatedArgs.entityGuid,
					deploymentTimestamp: validatedArgs.deploymentTimestamp,
					beforeMinutes: validatedArgs.beforeMinutes,
					afterMinutes: validatedArgs.afterMinutes,
				});

				const content = formatDeploymentImpactResult(result);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in analyze_deployment_impact", error);
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
 * Registers the generate_alert_insights_report tool
 */
export function registerGenerateAlertInsightsReportTool(
	server: McpServer,
): void {
	server.tool(
		"generate_alert_insights_report",
		"Generate a comprehensive alert insights report combining AI issues, error groups, and recent deployments. Provides actionable recommendations based on the current state of alerts and incidents.",
		GenerateAlertInsightsReportSchema.shape,
		async (args) => {
			defaultLogger.info("Executing generate_alert_insights_report", { args });

			try {
				const validatedArgs = GenerateAlertInsightsReportSchema.parse(args);
				const result = await generateAlertInsightsReport({
					entityGuid: validatedArgs.entityGuid,
					sinceDays: validatedArgs.sinceDays,
				});

				const content = formatAlertInsightsReport(result);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in generate_alert_insights_report", error);
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
 * Registers the get_entity_error_groups tool
 */
export function registerGetEntityErrorGroupsTool(server: McpServer): void {
	server.tool(
		"get_entity_error_groups",
		"Get error groups from TransactionError events. Groups errors by class and message to identify the most frequent and impactful errors.",
		GetEntityErrorGroupsSchema.shape,
		async (args) => {
			defaultLogger.info("Executing get_entity_error_groups", { args });

			try {
				const validatedArgs = GetEntityErrorGroupsSchema.parse(args);
				const result = await getEntityErrorGroups({
					entityGuid: validatedArgs.entityGuid,
					transactionName: validatedArgs.transactionName,
					sinceDays: validatedArgs.sinceDays,
					limit: validatedArgs.limit,
				});

				const content = formatErrorGroupsResult(result.errorGroups);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in get_entity_error_groups", error);
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
 * Registers the list_change_events tool
 */
export function registerListChangeEventsTool(server: McpServer): void {
	server.tool(
		"list_change_events",
		"List change events from NrChangeTracking. Includes deployments, configuration changes, and other tracked changes with version and user information.",
		ListChangeEventsSchema.shape,
		async (args) => {
			defaultLogger.info("Executing list_change_events", { args });

			try {
				const validatedArgs = ListChangeEventsSchema.parse(args);
				const result = await getChangeEvents({
					entityGuid: validatedArgs.entityGuid,
					changeType: validatedArgs.changeType,
					sinceDays: validatedArgs.sinceDays,
					limit: validatedArgs.limit,
				});

				const content = formatChangeEventsResult(result.changes);

				return {
					content: [{ type: "text" as const, text: content }],
				};
			} catch (error) {
				defaultLogger.error("Error in list_change_events", error);
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
 * Registers all incident tools with the MCP server
 */
export function registerIncidentTools(server: McpServer): number {
	registerSearchIncidentTool(server);
	registerAnalyzeDeploymentImpactTool(server);
	registerGenerateAlertInsightsReportTool(server);
	registerGetEntityErrorGroupsTool(server);
	registerListChangeEventsTool(server);

	defaultLogger.info("Registered 5 incident tools");
	return 5;
}

// ============================================================================
// Formatting Functions
// ============================================================================

function formatIncidentsResult(
	incidents: Array<{
		incidentId: string;
		title: string;
		priority: string;
		state: string;
		openTime: number;
		closeTime?: number;
		description?: string;
		entityGuids?: string[];
	}>,
): string {
	const lines: string[] = [];

	lines.push(`# Incidents (${incidents.length})`);
	lines.push("");

	if (incidents.length === 0) {
		lines.push("No incidents found matching the criteria.");
		return lines.join("\n");
	}

	for (const incident of incidents) {
		lines.push(`## ${incident.title}`);
		lines.push(`- **Incident ID:** ${incident.incidentId}`);
		lines.push(`- **State:** ${incident.state}`);
		lines.push(`- **Priority:** ${incident.priority}`);
		lines.push(`- **Opened:** ${new Date(incident.openTime).toISOString()}`);

		if (incident.closeTime) {
			lines.push(`- **Closed:** ${new Date(incident.closeTime).toISOString()}`);
			const duration = incident.closeTime - incident.openTime;
			lines.push(`- **Duration:** ${formatDuration(duration)}`);
		}

		if (incident.description) {
			lines.push(`- **Description:** ${incident.description}`);
		}

		if (incident.entityGuids && incident.entityGuids.length > 0) {
			lines.push(`- **Affected Entities:** ${incident.entityGuids.join(", ")}`);
		}

		lines.push("");
	}

	return lines.join("\n");
}

function formatDeploymentImpactResult(result: {
	deployment?: DeploymentEvent;
	metrics: {
		errorRateBefore: number;
		errorRateAfter: number;
		throughputBefore: number;
		throughputAfter: number;
		responseTimeBefore: number;
		responseTimeAfter: number;
	};
	impact: {
		errorRateChange: number;
		throughputChange: number;
		responseTimeChange: number;
		hasNegativeImpact: boolean;
	};
}): string {
	const lines: string[] = [];

	lines.push("# Deployment Impact Analysis");
	lines.push("");

	if (!result.deployment) {
		lines.push("No deployment found for analysis.");
		lines.push("");
		lines.push("To analyze deployment impact, ensure:");
		lines.push("- Deployments are being tracked in NewRelic");
		lines.push("- The entity has recent deployment events");
		return lines.join("\n");
	}

	lines.push("## Deployment Details");
	lines.push(
		`- **Timestamp:** ${new Date(result.deployment.timestamp).toISOString()}`,
	);
	if (result.deployment.version) {
		lines.push(`- **Version:** ${result.deployment.version}`);
	}
	if (result.deployment.user) {
		lines.push(`- **User:** ${result.deployment.user}`);
	}
	if (result.deployment.description) {
		lines.push(`- **Description:** ${result.deployment.description}`);
	}
	if (result.deployment.commit) {
		lines.push(`- **Commit:** ${result.deployment.commit}`);
	}
	lines.push("");

	lines.push("## Metrics Comparison");
	lines.push("");
	lines.push("| Metric | Before | After | Change |");
	lines.push("|--------|--------|-------|--------|");
	lines.push(
		`| Error Rate | ${result.metrics.errorRateBefore.toFixed(2)}% | ${result.metrics.errorRateAfter.toFixed(2)}% | ${formatChange(result.impact.errorRateChange)}% |`,
	);
	lines.push(
		`| Throughput | ${result.metrics.throughputBefore.toFixed(1)} rpm | ${result.metrics.throughputAfter.toFixed(1)} rpm | ${formatChange(result.impact.throughputChange)}% |`,
	);
	lines.push(
		`| Response Time | ${result.metrics.responseTimeBefore.toFixed(1)} ms | ${result.metrics.responseTimeAfter.toFixed(1)} ms | ${formatChange(result.impact.responseTimeChange)}% |`,
	);
	lines.push("");

	lines.push("## Impact Assessment");
	lines.push("");

	if (result.impact.hasNegativeImpact) {
		lines.push("**WARNING: Negative impact detected!**");
		lines.push("");
		if (result.impact.errorRateChange > 10) {
			lines.push(
				`- Error rate increased by ${result.impact.errorRateChange.toFixed(1)}%`,
			);
		}
		if (result.impact.responseTimeChange > 20) {
			lines.push(
				`- Response time increased by ${result.impact.responseTimeChange.toFixed(1)}%`,
			);
		}
		lines.push("");
		lines.push("**Recommendations:**");
		lines.push("- Consider rolling back the deployment");
		lines.push("- Investigate error logs for the affected period");
		lines.push("- Check for configuration changes that may have caused issues");
	} else {
		lines.push("Deployment appears to have neutral or positive impact.");
		lines.push("");
		if (result.impact.errorRateChange < -5) {
			lines.push(
				`- Error rate improved by ${Math.abs(result.impact.errorRateChange).toFixed(1)}%`,
			);
		}
		if (result.impact.responseTimeChange < -10) {
			lines.push(
				`- Response time improved by ${Math.abs(result.impact.responseTimeChange).toFixed(1)}%`,
			);
		}
	}

	return lines.join("\n");
}

function formatAlertInsightsReport(result: {
	summary: {
		totalIssues: number;
		criticalIssues: number;
		highIssues: number;
		activeIssues: number;
		resolvedIssues: number;
	};
	issues: AiIssue[];
	errorGroups: ErrorGroup[];
	recentDeployments: DeploymentEvent[];
	recommendations: string[];
}): string {
	const lines: string[] = [];

	lines.push("# Alert Insights Report");
	lines.push("");

	// Summary Section
	lines.push("## Summary");
	lines.push("");
	lines.push("| Metric | Count |");
	lines.push("|--------|-------|");
	lines.push(`| Total Issues | ${result.summary.totalIssues} |`);
	lines.push(`| Critical | ${result.summary.criticalIssues} |`);
	lines.push(`| High | ${result.summary.highIssues} |`);
	lines.push(`| Active | ${result.summary.activeIssues} |`);
	lines.push(`| Resolved | ${result.summary.resolvedIssues} |`);
	lines.push("");

	// Recommendations Section
	if (result.recommendations.length > 0) {
		lines.push("## Recommendations");
		lines.push("");
		for (const rec of result.recommendations) {
			lines.push(`- ${rec}`);
		}
		lines.push("");
	}

	// Top Error Groups
	if (result.errorGroups.length > 0) {
		lines.push("## Top Error Groups");
		lines.push("");
		lines.push("| Error Class | Message | Count | Last Seen |");
		lines.push("|-------------|---------|-------|-----------|");
		for (const eg of result.errorGroups.slice(0, 10)) {
			const lastSeen = eg.lastSeen
				? new Date(eg.lastSeen).toISOString()
				: "N/A";
			const message =
				eg.errorMessage.length > 50
					? `${eg.errorMessage.substring(0, 47)}...`
					: eg.errorMessage;
			lines.push(
				`| ${eg.errorClass} | ${message} | ${eg.count} | ${lastSeen} |`,
			);
		}
		lines.push("");
	}

	// Recent Deployments
	if (result.recentDeployments.length > 0) {
		lines.push("## Recent Deployments");
		lines.push("");
		for (const dep of result.recentDeployments.slice(0, 5)) {
			lines.push(`### ${new Date(dep.timestamp).toISOString()}`);
			if (dep.version) {
				lines.push(`- **Version:** ${dep.version}`);
			}
			if (dep.user) {
				lines.push(`- **User:** ${dep.user}`);
			}
			if (dep.description) {
				lines.push(`- **Description:** ${dep.description}`);
			}
			lines.push("");
		}
	}

	// Active Issues (top 5)
	const activeIssues = result.issues.filter(
		(i) => i.state === "ACTIVATED" || i.state === "CREATED",
	);
	if (activeIssues.length > 0) {
		lines.push("## Active Issues (Top 5)");
		lines.push("");
		for (const issue of activeIssues.slice(0, 5)) {
			lines.push(`### ${issue.title}`);
			lines.push(`- **Priority:** ${issue.priority}`);
			lines.push(`- **State:** ${issue.state}`);
			lines.push(
				`- **Activated:** ${new Date(issue.activatedAt).toISOString()}`,
			);
			if (issue.entityGuids && issue.entityGuids.length > 0) {
				lines.push(`- **Entities:** ${issue.entityGuids.length} affected`);
			}
			lines.push("");
		}
	}

	return lines.join("\n");
}

function formatErrorGroupsResult(errorGroups: ErrorGroup[]): string {
	const lines: string[] = [];

	lines.push(`# Error Groups (${errorGroups.length})`);
	lines.push("");

	if (errorGroups.length === 0) {
		lines.push("No error groups found matching the criteria.");
		return lines.join("\n");
	}

	lines.push("| Error Class | Message | Count | First Seen | Last Seen |");
	lines.push("|-------------|---------|-------|------------|-----------|");

	for (const eg of errorGroups) {
		const firstSeen = eg.firstSeen
			? new Date(eg.firstSeen).toISOString()
			: "N/A";
		const lastSeen = eg.lastSeen ? new Date(eg.lastSeen).toISOString() : "N/A";
		const message =
			eg.errorMessage.length > 60
				? `${eg.errorMessage.substring(0, 57)}...`
				: eg.errorMessage;
		lines.push(
			`| ${eg.errorClass} | ${message} | ${eg.count} | ${firstSeen} | ${lastSeen} |`,
		);
	}

	lines.push("");

	// Add detailed view for top errors
	lines.push("## Detailed View (Top 5)");
	lines.push("");

	for (const eg of errorGroups.slice(0, 5)) {
		lines.push(`### ${eg.errorClass}`);
		lines.push(`- **Message:** ${eg.errorMessage}`);
		lines.push(`- **Count:** ${eg.count}`);
		if (eg.transactionName) {
			lines.push(`- **Transaction:** ${eg.transactionName}`);
		}
		if (eg.entityName) {
			lines.push(`- **Entity:** ${eg.entityName}`);
		}
		if (eg.entityGuid) {
			lines.push(`- **Entity GUID:** ${eg.entityGuid}`);
		}
		if (eg.firstSeen) {
			lines.push(`- **First Seen:** ${new Date(eg.firstSeen).toISOString()}`);
		}
		if (eg.lastSeen) {
			lines.push(`- **Last Seen:** ${new Date(eg.lastSeen).toISOString()}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function formatChangeEventsResult(changes: ChangeEvent[]): string {
	const lines: string[] = [];

	lines.push(`# Change Events (${changes.length})`);
	lines.push("");

	if (changes.length === 0) {
		lines.push("No change events found matching the criteria.");
		return lines.join("\n");
	}

	for (const change of changes) {
		lines.push(`## ${new Date(change.timestamp).toISOString()}`);
		lines.push(`- **Type:** ${change.changeType}`);

		if (change.version) {
			lines.push(`- **Version:** ${change.version}`);
		}
		if (change.user) {
			lines.push(`- **User:** ${change.user}`);
		}
		if (change.description) {
			lines.push(`- **Description:** ${change.description}`);
		}
		if (change.entityName) {
			lines.push(`- **Entity:** ${change.entityName}`);
		}
		if (change.entityGuid) {
			lines.push(`- **Entity GUID:** ${change.entityGuid}`);
		}
		if (change.commit) {
			lines.push(`- **Commit:** ${change.commit}`);
		}
		if (change.changelog) {
			lines.push(`- **Changelog:** ${change.changelog}`);
		}
		if (change.deploymentId) {
			lines.push(`- **Deployment ID:** ${change.deploymentId}`);
		}
		if (change.groupId) {
			lines.push(`- **Group ID:** ${change.groupId}`);
		}

		lines.push("");
	}

	return lines.join("\n");
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days}d ${hours % 24}h`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${seconds}s`;
}

function formatChange(value: number): string {
	const sign = value >= 0 ? "+" : "";
	return `${sign}${value.toFixed(1)}`;
}
