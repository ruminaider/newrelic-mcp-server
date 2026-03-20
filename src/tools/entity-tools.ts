/**
 * Entity management tools for the NewRelic MCP server
 * Provides tools for entity retrieval, relationships, and search
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getEntityService } from "../services/entity-service.js";
import { EntityNotFoundError } from "../utils/errors.js";
import { defaultLogger } from "../utils/logger.js";
import { formatResponse } from "../utils/response.js";

/**
 * Formats entity tags for display
 */
function formatTags(
	tags?: Array<{ key: string; values: string[] }>,
): Record<string, string[]> | undefined {
	if (!tags || tags.length === 0) return undefined;
	return tags.reduce(
		(acc, tag) => {
			acc[tag.key] = tag.values;
			return acc;
		},
		{} as Record<string, string[]>,
	);
}

/**
 * Registers the get_entity tool
 * Retrieves detailed information about a specific entity by GUID
 */
export function registerGetEntityTool(server: McpServer): void {
	server.tool(
		"get_entity",
		"Retrieve detailed information about a NewRelic entity by its GUID. Returns entity metadata, tags, and type-specific metrics (APM throughput/error rate, Browser page views, etc).",
		{
			guid: z
				.string()
				.describe(
					"The entity GUID (e.g., 'MXxBUE18QVBQTElDQVRJT058MTIzNDU2Nzg5')",
				),
		},
		async ({ guid }) => {
			defaultLogger.info("Tool get_entity called", { guid });

			try {
				const entityService = getEntityService();
				const entity = await entityService.getEntity(guid);

				// Build response with entity details
				const response = {
					guid: entity.guid,
					name: entity.name,
					type: entity.type,
					domain: entity.domain,
					entityType: entity.entityType,
					reporting: entity.reporting,
					accountId: entity.accountId,
					alertSeverity: entity.alertSeverity,
					tags: formatTags(entity.tags),
					...(entity.apmSummary && {
						apmMetrics: {
							throughput: entity.apmSummary.throughput,
							responseTimeAverage: entity.apmSummary.responseTimeAverage,
							errorRate: entity.apmSummary.errorRate,
						},
					}),
					...(entity.browserSummary && {
						browserMetrics: {
							pageViewCount: entity.browserSummary.pageViewCount,
							ajaxRequestCount: entity.browserSummary.ajaxRequestCount,
							jsErrorRate: entity.browserSummary.jsErrorRate,
						},
					}),
				};

				return {
					content: [
						{
							type: "text" as const,
							text: formatResponse(response),
						},
					],
				};
			} catch (error) {
				if (error instanceof EntityNotFoundError) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Entity not found: ${guid}. Please verify the GUID is correct.`,
							},
						],
						isError: true,
					};
				}
				throw error;
			}
		},
	);

	defaultLogger.info("Registered tool: get_entity");
}

/**
 * Registers the list_related_entities tool
 * Gets relationships between entities
 */
export function registerListRelatedEntitiesTool(server: McpServer): void {
	server.tool(
		"list_related_entities",
		"Get entities that are related to a specific entity. Shows connections like service dependencies, infrastructure relationships, and dashboard associations.",
		{
			guid: z.string().describe("The entity GUID to find relationships for"),
		},
		async ({ guid }) => {
			defaultLogger.info("Tool list_related_entities called", { guid });

			try {
				const entityService = getEntityService();
				const relationships = await entityService.getRelatedEntities(guid);

				if (relationships.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No related entities found for GUID: ${guid}`,
							},
						],
					};
				}

				// Group relationships by type
				const byType = relationships.reduce(
					(acc, rel) => {
						const type = rel.type;
						if (!acc[type]) {
							acc[type] = [];
						}
						acc[type].push({
							source: {
								guid: rel.source.guid,
								name: rel.source.name,
								type: rel.source.type,
							},
							target: {
								guid: rel.target.guid,
								name: rel.target.name,
								type: rel.target.type,
							},
						});
						return acc;
					},
					{} as Record<
						string,
						Array<{
							source: { guid: string; name: string; type: string };
							target: { guid: string; name: string; type: string };
						}>
					>,
				);

				const response = {
					entityGuid: guid,
					totalRelationships: relationships.length,
					relationshipsByType: byType,
				};

				return {
					content: [
						{
							type: "text" as const,
							text: formatResponse(response),
						},
					],
				};
			} catch (error) {
				if (error instanceof EntityNotFoundError) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Entity not found: ${guid}. Please verify the GUID is correct.`,
							},
						],
						isError: true,
					};
				}
				throw error;
			}
		},
	);

	defaultLogger.info("Registered tool: list_related_entities");
}

/**
 * Registers the search_entity_with_tag tool
 * Searches for entities using tags and other filters
 */
export function registerSearchEntityWithTagTool(server: McpServer): void {
	server.tool(
		"search_entity_with_tag",
		"Search for NewRelic entities using tags and NerdGraph query syntax. Use this to find entities by environment, team, service name, or any custom tag.",
		{
			query: z
				.string()
				.optional()
				.describe(
					"Full NerdGraph entity search query (e.g., \"domain = 'APM' AND type = 'APPLICATION'\"). If provided, tagKey/tagValue are ignored.",
				),
			tagKey: z
				.string()
				.optional()
				.describe(
					"Tag key to search for (e.g., 'environment', 'team'). Used when query is not provided.",
				),
			tagValue: z
				.string()
				.optional()
				.describe(
					"Tag value to match (e.g., 'production'). If omitted, matches any value for tagKey.",
				),
			additionalFilters: z
				.string()
				.optional()
				.describe(
					"Additional query filters to combine with tag search (e.g., \"domain = 'APM'\")",
				),
			maxResults: z
				.number()
				.min(1)
				.max(500)
				.default(100)
				.describe(
					"Maximum number of results to return (default: 100, max: 500)",
				),
		},
		async ({ query, tagKey, tagValue, additionalFilters, maxResults }) => {
			defaultLogger.info("Tool search_entity_with_tag called", {
				query,
				tagKey,
				tagValue,
				additionalFilters,
				maxResults,
			});

			const entityService = getEntityService();
			let results: Awaited<ReturnType<typeof entityService.searchEntities>> | undefined;

			if (query) {
				// Use direct query if provided
				results = await entityService.searchEntities(
					query,
					undefined,
					maxResults,
				);
			} else if (tagKey) {
				// Use tag-based search
				results = await entityService.searchEntitiesWithTag(
					tagKey,
					tagValue,
					additionalFilters,
					maxResults,
				);
			} else {
				return {
					content: [
						{
							type: "text" as const,
							text: "Either 'query' or 'tagKey' must be provided for entity search.",
						},
					],
					isError: true,
				};
			}

			// Format entities for output
			const formattedEntities = results.entities.map((entity) => ({
				guid: entity.guid,
				name: entity.name,
				type: entity.type,
				domain: entity.domain,
				entityType: entity.entityType,
				accountId: entity.accountId,
				reporting: entity.reporting,
				alertSeverity: entity.alertSeverity,
				tags: formatTags(entity.tags),
			}));

			const response = {
				totalFound: results.totalCount,
				returned: formattedEntities.length,
				hasMore: !!results.nextCursor,
				entities: formattedEntities,
			};

			return {
				content: [
					{
						type: "text" as const,
						text: formatResponse(response),
					},
				],
			};
		},
	);

	defaultLogger.info("Registered tool: search_entity_with_tag");
}

/**
 * Registers the list_entity_types tool
 * Lists all available entity types in the account
 */
export function registerListEntityTypesTool(server: McpServer): void {
	server.tool(
		"list_entity_types",
		"List all available entity types in NewRelic. Returns domain/type combinations like APM/APPLICATION, INFRA/HOST, BROWSER/APPLICATION, etc.",
		{},
		async () => {
			defaultLogger.info("Tool list_entity_types called");

			const entityService = getEntityService();
			const types = await entityService.listEntityTypes();

			// Group by domain for easier reading
			const byDomain = types.reduce(
				(acc, t) => {
					if (!acc[t.domain]) {
						acc[t.domain] = [];
					}
					acc[t.domain].push(t.type);
					return acc;
				},
				{} as Record<string, string[]>,
			);

			const response = {
				totalTypes: types.length,
				byDomain,
				allTypes: types.map((t) => ({
					domain: t.domain,
					type: t.type,
					displayName: t.displayName,
				})),
			};

			return {
				content: [
					{
						type: "text" as const,
						text: formatResponse(response),
					},
				],
			};
		},
	);

	defaultLogger.info("Registered tool: list_entity_types");
}

/**
 * Registers all entity management tools
 */
export function registerEntityTools(server: McpServer): number {
	registerGetEntityTool(server);
	registerListRelatedEntitiesTool(server);
	registerSearchEntityWithTagTool(server);
	registerListEntityTypesTool(server);

	return 4; // Number of tools registered
}
