/**
 * Synthetic monitoring service for NewRelic
 * Provides methods to list and query synthetic monitors via NerdGraph API
 */

import { defaultLogger } from "../utils/logger.js";
import { getNerdGraphClient } from "./nerdgraph-client.js";

/**
 * Synthetic monitor summary status
 */
export interface MonitorSummary {
	status: string;
	successRate: number | null;
}

/**
 * Synthetic monitor entity
 */
export interface SyntheticMonitor {
	guid: string;
	name: string;
	monitorSummary: MonitorSummary | null;
}

/**
 * Response from list synthetic monitors query
 */
export interface ListSyntheticMonitorsResponse {
	monitors: SyntheticMonitor[];
	nextCursor: string | null;
	totalCount: number;
}

/**
 * GraphQL query to list synthetic monitors
 */
const LIST_SYNTHETIC_MONITORS_QUERY = `
  query ListSyntheticMonitors($searchQuery: String!, $cursor: String) {
    actor {
      entitySearch(query: $searchQuery) {
        results(cursor: $cursor) {
          entities {
            guid
            name
            ... on SyntheticMonitorEntity {
              monitorSummary {
                status
                successRate
              }
            }
          }
          nextCursor
        }
        count
      }
    }
  }
`;

/**
 * Response types from NerdGraph
 */
interface ListSyntheticMonitorsQueryResponse {
	actor: {
		entitySearch: {
			results: {
				entities: Array<{
					guid: string;
					name: string;
					monitorSummary?: {
						status: string;
						successRate: number | null;
					} | null;
				}>;
				nextCursor: string | null;
			};
			count: number;
		};
	};
}

/**
 * Lists synthetic monitors with optional account filtering
 * @param accountId - Optional account ID to filter by (defaults to configured account)
 * @param status - Optional status filter (e.g., 'ENABLED', 'DISABLED')
 * @param cursor - Optional cursor for pagination
 * @param limit - Maximum number of results per page (max 200)
 * @returns List of synthetic monitors with pagination info
 */
export async function listSyntheticMonitors(
	accountId?: string,
	status?: string,
	cursor?: string,
	limit = 50,
): Promise<ListSyntheticMonitorsResponse> {
	const client = getNerdGraphClient();
	const effectiveAccountId = accountId ?? client.getAccountId();

	defaultLogger.info("Listing synthetic monitors", {
		accountId: effectiveAccountId,
		status,
		cursor,
		limit,
	});

	// Build search query for synthetic monitors in the specified account
	let searchQuery = `domain = 'SYNTH' AND accountId = ${effectiveAccountId}`;

	// Add status filter if provided
	if (status) {
		searchQuery += ` AND reporting = '${status.toUpperCase()}'`;
	}

	const response = await client.query<ListSyntheticMonitorsQueryResponse>(
		LIST_SYNTHETIC_MONITORS_QUERY,
		{
			searchQuery,
			cursor: cursor || null,
		},
	);

	const { entities, nextCursor } = response.actor.entitySearch.results;
	const totalCount = response.actor.entitySearch.count;

	// Apply limit
	const limitedEntities = entities.slice(0, limit);

	defaultLogger.info("Synthetic monitors listed successfully", {
		returnedCount: limitedEntities.length,
		totalCount,
		hasMore: !!nextCursor,
	});

	return {
		monitors: limitedEntities.map((entity) => ({
			guid: entity.guid,
			name: entity.name,
			monitorSummary: entity.monitorSummary
				? {
						status: entity.monitorSummary.status,
						successRate: entity.monitorSummary.successRate,
					}
				: null,
		})),
		nextCursor,
		totalCount,
	};
}
