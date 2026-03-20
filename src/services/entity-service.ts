/**
 * Entity management service for NewRelic NerdGraph API
 * Handles entity retrieval, relationships, and search operations
 */

import { EntityNotFoundError } from "../utils/errors.js";
import { defaultLogger } from "../utils/logger.js";
import { getNerdGraphClient } from "./nerdgraph-client.js";

/**
 * Tag key-value pair from NewRelic entity
 */
export interface EntityTag {
	key: string;
	values: string[];
}

/**
 * APM application summary metrics
 */
export interface ApmSummary {
	throughput?: number;
	responseTimeAverage?: number;
	errorRate?: number;
}

/**
 * Browser application summary metrics
 */
export interface BrowserSummary {
	pageViewCount?: number;
	ajaxRequestCount?: number;
	jsErrorRate?: number;
}

/**
 * Base entity information from NewRelic
 */
export interface Entity {
	guid: string;
	name: string;
	type: string;
	domain: string;
	entityType: string;
	reporting?: boolean;
	tags?: EntityTag[];
	/** APM-specific summary data */
	apmSummary?: ApmSummary;
	/** Browser-specific summary data */
	browserSummary?: BrowserSummary;
	/** Account ID the entity belongs to */
	accountId?: number;
	/** Alerting severity (if applicable) */
	alertSeverity?: string;
}

/**
 * Related entity information
 */
export interface RelatedEntityResult {
	source: {
		guid: string;
		name: string;
		type: string;
	};
	target: {
		guid: string;
		name: string;
		type: string;
	};
	type: string;
}

/**
 * Entity search results with pagination
 */
export interface EntitySearchResults {
	entities: Entity[];
	nextCursor?: string;
	totalCount?: number;
}

/**
 * Available entity types in NewRelic
 */
export interface EntityType {
	domain: string;
	type: string;
	displayName?: string;
}

/**
 * NewRelic account information
 */
export interface Account {
	id: number;
	name: string;
}

// GraphQL Queries

const GET_ENTITY_QUERY = `
query GetEntity($guid: EntityGuid!) {
  actor {
    entity(guid: $guid) {
      guid
      name
      type
      domain
      entityType
      reporting
      accountId
      alertSeverity
      tags {
        key
        values
      }
      ... on ApmApplicationEntity {
        apmSummary {
          throughput
          responseTimeAverage
          errorRate
        }
      }
      ... on BrowserApplicationEntity {
        browserSummary {
          pageViewCount
          ajaxRequestCount
          jsErrorRate
        }
      }
    }
  }
}
`;

const SEARCH_ENTITIES_QUERY = `
query SearchEntities($query: String!, $cursor: String) {
  actor {
    entitySearch(query: $query) {
      count
      results(cursor: $cursor) {
        entities {
          guid
          name
          type
          domain
          entityType
          reporting
          accountId
          alertSeverity
          tags {
            key
            values
          }
        }
        nextCursor
      }
    }
  }
}
`;

const LIST_RELATED_ENTITIES_QUERY = `
query ListRelatedEntities($guid: EntityGuid!) {
  actor {
    entity(guid: $guid) {
      guid
      name
      relatedEntities {
        results {
          source {
            entity {
              guid
              name
              type
            }
          }
          target {
            entity {
              guid
              name
              type
            }
          }
          type
        }
      }
    }
  }
}
`;

const LIST_ACCOUNTS_QUERY = `
query ListAccounts {
  actor {
    accounts {
      id
      name
    }
  }
}
`;

const LIST_ENTITY_TYPES_QUERY = `
query ListEntityTypes {
  actor {
    entitySearch(query: "reporting = true") {
      types {
        domain
        type
        count
      }
    }
  }
}
`;

// Response Types for GraphQL queries

interface GetEntityResponse {
	actor: {
		entity: Entity | null;
	};
}

interface SearchEntitiesResponse {
	actor: {
		entitySearch: {
			count: number;
			results: {
				entities: Entity[];
				nextCursor: string | null;
			};
		};
	};
}

interface RelatedEntitiesResponse {
	actor: {
		entity: {
			guid: string;
			name: string;
			relatedEntities: {
				results: Array<{
					source: {
						entity: {
							guid: string;
							name: string;
							type: string;
						};
					};
					target: {
						entity: {
							guid: string;
							name: string;
							type: string;
						};
					};
					type: string;
				}>;
			};
		} | null;
	};
}

interface ListAccountsResponse {
	actor: {
		accounts: Account[];
	};
}

interface ListEntityTypesResponse {
	actor: {
		entitySearch: {
			types: Array<{
				domain: string;
				type: string;
				count: number;
			}>;
		};
	};
}

/**
 * Entity management service
 */
export class EntityService {
	/**
	 * Retrieves a single entity by its GUID
	 * @param guid Entity GUID
	 * @returns Entity details
	 * @throws EntityNotFoundError if entity doesn't exist
	 */
	async getEntity(guid: string): Promise<Entity> {
		const client = getNerdGraphClient();

		defaultLogger.info("Fetching entity", { guid });

		const response = await client.query<GetEntityResponse>(GET_ENTITY_QUERY, {
			guid,
		});

		const entity = response.actor.entity;

		if (!entity) {
			throw new EntityNotFoundError(guid);
		}

		defaultLogger.info("Entity fetched successfully", {
			guid,
			name: entity.name,
			type: entity.type,
		});

		return entity;
	}

	/**
	 * Searches for entities using NerdGraph query syntax
	 * @param query Entity search query (e.g., "domain = 'APM' AND type = 'APPLICATION'")
	 * @param cursor Pagination cursor for subsequent pages
	 * @param maxResults Maximum results to return (fetches multiple pages if needed)
	 * @returns Search results with entities and pagination info
	 */
	async searchEntities(
		query: string,
		cursor?: string,
		maxResults = 200,
	): Promise<EntitySearchResults> {
		const client = getNerdGraphClient();

		defaultLogger.info("Searching entities", { query, cursor, maxResults });

		const allEntities: Entity[] = [];
		let currentCursor = cursor;
		let totalCount = 0;

		// Fetch pages until we have enough results or run out
		while (allEntities.length < maxResults) {
			const response = await client.query<SearchEntitiesResponse>(
				SEARCH_ENTITIES_QUERY,
				{
					query,
					cursor: currentCursor,
				},
			);

			const { entities, nextCursor } = response.actor.entitySearch.results;
			totalCount = response.actor.entitySearch.count;

			allEntities.push(...entities);

			// Stop if no more pages
			if (!nextCursor) {
				break;
			}

			currentCursor = nextCursor;
		}

		// Trim to maxResults if we fetched too many
		const trimmedEntities = allEntities.slice(0, maxResults);

		defaultLogger.info("Entity search complete", {
			query,
			foundCount: trimmedEntities.length,
			totalCount,
		});

		return {
			entities: trimmedEntities,
			nextCursor: currentCursor,
			totalCount,
		};
	}

	/**
	 * Searches for entities with specific tags
	 * Uses NerdGraph queryBuilder syntax for tag filtering
	 * @param tagKey Tag key to filter by
	 * @param tagValue Tag value to filter by (optional)
	 * @param additionalFilters Additional query filters
	 * @param maxResults Maximum results to return
	 * @returns Matching entities
	 */
	async searchEntitiesWithTag(
		tagKey: string,
		tagValue?: string,
		additionalFilters?: string,
		maxResults = 200,
	): Promise<EntitySearchResults> {
		// Build the query with tag filter
		let query = tagValue
			? `tags.${tagKey} = '${tagValue}'`
			: `tags.${tagKey} IS NOT NULL`;

		if (additionalFilters) {
			query = `${query} AND ${additionalFilters}`;
		}

		defaultLogger.info("Searching entities by tag", {
			tagKey,
			tagValue,
			query,
		});

		return this.searchEntities(query, undefined, maxResults);
	}

	/**
	 * Gets related entities for a given entity GUID
	 * @param guid Source entity GUID
	 * @returns List of related entity relationships
	 */
	async getRelatedEntities(guid: string): Promise<RelatedEntityResult[]> {
		const client = getNerdGraphClient();

		defaultLogger.info("Fetching related entities", { guid });

		const response = await client.query<RelatedEntitiesResponse>(
			LIST_RELATED_ENTITIES_QUERY,
			{ guid },
		);

		const entity = response.actor.entity;

		if (!entity) {
			throw new EntityNotFoundError(guid);
		}

		const results = entity.relatedEntities.results.map((rel) => ({
			source: {
				guid: rel.source.entity.guid,
				name: rel.source.entity.name,
				type: rel.source.entity.type,
			},
			target: {
				guid: rel.target.entity.guid,
				name: rel.target.entity.name,
				type: rel.target.entity.type,
			},
			type: rel.type,
		}));

		defaultLogger.info("Related entities fetched", {
			guid,
			count: results.length,
		});

		return results;
	}

	/**
	 * Lists all available entity types in the account
	 * @returns List of entity types with domains
	 */
	async listEntityTypes(): Promise<EntityType[]> {
		const client = getNerdGraphClient();

		defaultLogger.info("Listing entity types");

		const response = await client.query<ListEntityTypesResponse>(
			LIST_ENTITY_TYPES_QUERY,
		);

		const types = response.actor.entitySearch.types.map((t) => ({
			domain: t.domain,
			type: t.type,
			displayName: `${t.domain}/${t.type}`,
		}));

		defaultLogger.info("Entity types fetched", { count: types.length });

		return types;
	}

	/**
	 * Lists all accessible NewRelic accounts
	 * @returns List of accounts
	 */
	async listAccounts(): Promise<Account[]> {
		const client = getNerdGraphClient();

		defaultLogger.info("Listing NewRelic accounts");

		const response =
			await client.query<ListAccountsResponse>(LIST_ACCOUNTS_QUERY);

		const accounts = response.actor.accounts;

		defaultLogger.info("Accounts fetched", { count: accounts.length });

		return accounts;
	}
}

/**
 * Global entity service instance
 */
let entityServiceInstance: EntityService | null = null;

/**
 * Gets the entity service singleton instance
 */
export function getEntityService(): EntityService {
	if (!entityServiceInstance) {
		entityServiceInstance = new EntityService();
	}
	return entityServiceInstance;
}
