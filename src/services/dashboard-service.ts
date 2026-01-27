/**
 * Dashboard service for NewRelic Dashboard operations
 * Provides methods to fetch and list dashboards via NerdGraph API
 */

import { getNerdGraphClient } from "./nerdgraph-client.js";
import { defaultLogger } from "../utils/logger.js";
import { EntityNotFoundError } from "../utils/errors.js";

/**
 * Widget configuration from a dashboard
 */
export interface DashboardWidget {
  id: string;
  title: string;
  rawConfiguration: Record<string, unknown>;
}

/**
 * Dashboard page containing widgets
 */
export interface DashboardPage {
  guid: string;
  name: string;
  widgets: DashboardWidget[];
}

/**
 * Full dashboard entity with pages and widgets
 */
export interface Dashboard {
  guid: string;
  name: string;
  pages: DashboardPage[];
}

/**
 * Dashboard list item (summary without full widget details)
 */
export interface DashboardListItem {
  guid: string;
  name: string;
}

/**
 * Response from list dashboards query
 */
export interface ListDashboardsResponse {
  dashboards: DashboardListItem[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * GraphQL query to get a single dashboard with full details
 */
const GET_DASHBOARD_QUERY = `
  query GetDashboard($guid: EntityGuid!) {
    actor {
      entity(guid: $guid) {
        ... on DashboardEntity {
          guid
          name
          pages {
            guid
            name
            widgets {
              id
              title
              rawConfiguration
            }
          }
        }
      }
    }
  }
`;

/**
 * GraphQL query to list dashboards by account
 */
const LIST_DASHBOARDS_QUERY = `
  query ListDashboards($searchQuery: String!, $cursor: String) {
    actor {
      entitySearch(query: $searchQuery) {
        results(cursor: $cursor) {
          entities {
            guid
            name
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
interface GetDashboardResponse {
  actor: {
    entity: {
      guid: string;
      name: string;
      pages: Array<{
        guid: string;
        name: string;
        widgets: Array<{
          id: string;
          title: string;
          rawConfiguration: Record<string, unknown>;
        }>;
      }>;
    } | null;
  };
}

interface ListDashboardsQueryResponse {
  actor: {
    entitySearch: {
      results: {
        entities: Array<{
          guid: string;
          name: string;
        }>;
        nextCursor: string | null;
      };
      count: number;
    };
  };
}

/**
 * Gets a dashboard by GUID with full page and widget details
 * @param guid - The entity GUID of the dashboard
 * @returns Dashboard with all pages and widgets
 * @throws EntityNotFoundError if dashboard doesn't exist
 */
export async function getDashboard(guid: string): Promise<Dashboard> {
  const client = getNerdGraphClient();

  defaultLogger.info("Fetching dashboard", { guid });

  const response = await client.query<GetDashboardResponse>(
    GET_DASHBOARD_QUERY,
    { guid }
  );

  const entity = response.actor.entity;

  if (!entity) {
    throw new EntityNotFoundError(guid);
  }

  defaultLogger.info("Dashboard fetched successfully", {
    guid: entity.guid,
    name: entity.name,
    pageCount: entity.pages?.length ?? 0,
  });

  return {
    guid: entity.guid,
    name: entity.name,
    pages: (entity.pages ?? []).map((page) => ({
      guid: page.guid,
      name: page.name,
      widgets: (page.widgets ?? []).map((widget) => ({
        id: widget.id,
        title: widget.title,
        rawConfiguration: widget.rawConfiguration,
      })),
    })),
  };
}

/**
 * Lists dashboards with optional account filtering
 * @param accountId - Optional account ID to filter by (defaults to configured account)
 * @param cursor - Optional cursor for pagination
 * @param limit - Maximum number of results per page (max 200)
 * @returns List of dashboards with pagination info
 */
export async function listDashboards(
  accountId?: string,
  cursor?: string,
  limit: number = 50
): Promise<ListDashboardsResponse> {
  const client = getNerdGraphClient();
  const effectiveAccountId = accountId ?? client.getAccountId();

  defaultLogger.info("Listing dashboards", {
    accountId: effectiveAccountId,
    cursor,
    limit,
  });

  // Build search query for dashboards in the specified account
  const searchQuery = `type = 'DASHBOARD' AND accountId = ${effectiveAccountId}`;

  const response = await client.query<ListDashboardsQueryResponse>(
    LIST_DASHBOARDS_QUERY,
    {
      searchQuery,
      cursor: cursor || null,
    }
  );

  const { entities, nextCursor } = response.actor.entitySearch.results;
  const totalCount = response.actor.entitySearch.count;

  // Apply limit (NerdGraph doesn't support limit directly in entitySearch)
  const limitedEntities = entities.slice(0, limit);

  defaultLogger.info("Dashboards listed successfully", {
    returnedCount: limitedEntities.length,
    totalCount,
    hasMore: !!nextCursor,
  });

  return {
    dashboards: limitedEntities.map((entity) => ({
      guid: entity.guid,
      name: entity.name,
    })),
    nextCursor,
    totalCount,
  };
}
