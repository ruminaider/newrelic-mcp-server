/**
 * Performance metrics service for NewRelic
 * Provides methods to analyze golden metrics and transaction performance
 */

import { getNerdGraphClient } from "./nerdgraph-client.js";
import { defaultLogger } from "../utils/logger.js";
import { EntityNotFoundError } from "../utils/errors.js";

/**
 * Golden metric definition
 */
export interface GoldenMetric {
  name: string;
  title: string;
  query: string;
}

/**
 * Golden metrics response for an entity
 */
export interface GoldenMetricsResponse {
  entityGuid: string;
  entityName: string;
  metrics: GoldenMetric[];
}

/**
 * Transaction analysis result
 */
export interface TransactionAnalysis {
  query: string;
  results: TransactionResult[];
  totalCount: number;
  timeRange: {
    since: string;
    until?: string;
  };
}

/**
 * Individual transaction result from NRQL query
 */
export interface TransactionResult {
  name: string;
  count?: number;
  averageDuration?: number;
  totalTime?: number;
  errorRate?: number;
  throughput?: number;
  [key: string]: unknown;
}

/**
 * GraphQL query to get golden metrics for an entity
 */
const GET_GOLDEN_METRICS_QUERY = `
  query GetGoldenMetrics($guid: EntityGuid!) {
    actor {
      entity(guid: $guid) {
        guid
        name
        goldenMetrics {
          metrics {
            name
            title
            query
          }
        }
      }
    }
  }
`;

/**
 * NRQL query template for transaction analysis
 */
const TRANSACTION_ANALYSIS_QUERY_TEMPLATE = `
  query AnalyzeTransactions($accountId: Int!, $nrqlQuery: String!) {
    actor {
      account(id: $accountId) {
        nrql(query: $nrqlQuery) {
          results
        }
      }
    }
  }
`;

/**
 * Response types from NerdGraph
 */
interface GetGoldenMetricsQueryResponse {
  actor: {
    entity: {
      guid: string;
      name: string;
      goldenMetrics: {
        metrics: Array<{
          name: string;
          title: string;
          query: string;
        }>;
      } | null;
    } | null;
  };
}

interface NrqlQueryResponse {
  actor: {
    account: {
      nrql: {
        results: Array<Record<string, unknown>>;
      };
    };
  };
}

/**
 * Gets golden metrics for an entity
 * @param guid - The entity GUID
 * @returns Golden metrics definitions for the entity
 * @throws EntityNotFoundError if entity doesn't exist
 */
export async function analyzeGoldenMetrics(
  guid: string
): Promise<GoldenMetricsResponse> {
  const client = getNerdGraphClient();

  defaultLogger.info("Fetching golden metrics", { guid });

  const response = await client.query<GetGoldenMetricsQueryResponse>(
    GET_GOLDEN_METRICS_QUERY,
    { guid }
  );

  const entity = response.actor.entity;

  if (!entity) {
    throw new EntityNotFoundError(guid);
  }

  const metrics = entity.goldenMetrics?.metrics ?? [];

  defaultLogger.info("Golden metrics fetched successfully", {
    guid: entity.guid,
    name: entity.name,
    metricCount: metrics.length,
  });

  return {
    entityGuid: entity.guid,
    entityName: entity.name,
    metrics: metrics.map((metric) => ({
      name: metric.name,
      title: metric.title,
      query: metric.query,
    })),
  };
}

/**
 * Options for transaction analysis
 */
export interface TransactionAnalysisOptions {
  /** Time range start (NRQL SINCE clause) */
  since?: string;
  /** Time range end (NRQL UNTIL clause) */
  until?: string;
  /** FACET fields for grouping */
  facets?: string[];
  /** WHERE clause conditions */
  where?: string;
  /** Metrics to calculate (default: count, average duration) */
  metrics?: Array<"count" | "averageDuration" | "totalTime" | "errorRate" | "throughput">;
  /** Maximum results to return */
  limit?: number;
  /** Account ID (defaults to configured account) */
  accountId?: string;
  /** Application name filter */
  appName?: string;
}

/**
 * Builds an NRQL query for transaction analysis
 */
function buildTransactionNrqlQuery(options: TransactionAnalysisOptions): string {
  const metrics = options.metrics ?? ["count", "averageDuration"];
  const facets = options.facets ?? ["name"];
  const since = options.since ?? "1 hour ago";
  const limit = options.limit ?? 100;

  // Build SELECT clause
  const selectParts: string[] = [];
  for (const metric of metrics) {
    switch (metric) {
      case "count":
        selectParts.push("count(*) as count");
        break;
      case "averageDuration":
        selectParts.push("average(duration) as averageDuration");
        break;
      case "totalTime":
        selectParts.push("sum(duration) as totalTime");
        break;
      case "errorRate":
        selectParts.push("percentage(count(*), WHERE error IS true) as errorRate");
        break;
      case "throughput":
        selectParts.push("rate(count(*), 1 minute) as throughput");
        break;
    }
  }

  const selectClause = selectParts.join(", ");

  // Build WHERE clause
  const whereParts: string[] = [];
  if (options.appName) {
    whereParts.push(`appName = '${options.appName}'`);
  }
  if (options.where) {
    whereParts.push(options.where);
  }
  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  // Build FACET clause
  const facetClause = facets.length > 0 ? `FACET ${facets.join(", ")}` : "";

  // Build time range
  let timeClause = `SINCE ${since}`;
  if (options.until) {
    timeClause += ` UNTIL ${options.until}`;
  }

  // Build full query
  const query = `SELECT ${selectClause} FROM Transaction ${whereClause} ${facetClause} ${timeClause} LIMIT ${limit}`;

  return query.replace(/\s+/g, " ").trim();
}

/**
 * Analyzes transaction performance with FACET grouping
 * @param options - Analysis options including time range, facets, and filters
 * @returns Transaction analysis results
 */
export async function analyzeTransactions(
  options: TransactionAnalysisOptions = {}
): Promise<TransactionAnalysis> {
  const client = getNerdGraphClient();
  const accountId = options.accountId ?? client.getAccountId();

  const nrqlQuery = buildTransactionNrqlQuery(options);

  defaultLogger.info("Analyzing transactions", {
    accountId,
    query: nrqlQuery,
  });

  const response = await client.query<NrqlQueryResponse>(
    TRANSACTION_ANALYSIS_QUERY_TEMPLATE,
    {
      accountId: parseInt(accountId, 10),
      nrqlQuery,
    }
  );

  const results = response.actor.account.nrql.results;

  defaultLogger.info("Transaction analysis completed", {
    resultCount: results.length,
  });

  return {
    query: nrqlQuery,
    results: results.map((result) => ({
      name: String(result.name ?? result.facet ?? "unknown"),
      count: result.count as number | undefined,
      averageDuration: result.averageDuration as number | undefined,
      totalTime: result.totalTime as number | undefined,
      errorRate: result.errorRate as number | undefined,
      throughput: result.throughput as number | undefined,
      ...result,
    })),
    totalCount: results.length,
    timeRange: {
      since: options.since ?? "1 hour ago",
      until: options.until,
    },
  };
}
