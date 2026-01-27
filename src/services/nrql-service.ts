/**
 * NRQL Query Service
 * Handles execution of arbitrary NRQL queries against NewRelic
 */

import { getNerdGraphClient } from "./nerdgraph-client.js";
import { defaultLogger } from "../utils/logger.js";
import { NrqlSyntaxError, ApiError } from "../utils/errors.js";

/**
 * Metadata returned from NRQL query execution
 */
export interface NrqlMetadata {
  /** Facet fields used in the query, if any */
  facets: string[] | null;
  /** Time window of the query results */
  timeWindow: {
    /** Start time in epoch milliseconds */
    begin: number;
    /** End time in epoch milliseconds */
    end: number;
  } | null;
}

/**
 * Result of an NRQL query execution
 */
export interface NrqlQueryResult {
  /** Array of result objects */
  results: Record<string, unknown>[];
  /** Query metadata */
  metadata: NrqlMetadata;
  /** Original query string */
  query: string;
  /** Execution time in milliseconds */
  elapsedTime: number;
}

/**
 * GraphQL response structure for NRQL queries
 */
interface NrqlGraphQLResponse {
  actor: {
    account: {
      nrql: {
        results: Record<string, unknown>[];
        metadata: {
          facets: string[] | null;
          timeWindow: {
            begin: number;
            end: number;
          } | null;
        };
      };
    };
  };
}

/**
 * GraphQL query for executing NRQL
 */
const NRQL_QUERY = `
  query ExecuteNrqlQuery($accountId: Int!, $nrqlQuery: Nrql!, $timeout: Seconds) {
    actor {
      account(id: $accountId) {
        nrql(query: $nrqlQuery, timeout: $timeout) {
          results
          metadata {
            facets
            timeWindow {
              begin
              end
            }
          }
        }
      }
    }
  }
`;

/**
 * Service for executing NRQL queries
 */
export class NrqlService {
  /**
   * Executes an NRQL query and returns the results
   *
   * @param query - The NRQL query to execute
   * @param timeoutSeconds - Query timeout in seconds (default: 30)
   * @returns Query results with metadata
   * @throws NrqlSyntaxError if the query syntax is invalid
   * @throws ApiError for other API errors
   */
  async executeQuery(
    query: string,
    timeoutSeconds = 30
  ): Promise<NrqlQueryResult> {
    const startTime = Date.now();

    defaultLogger.info("Executing NRQL query", {
      queryLength: query.length,
      timeout: timeoutSeconds,
    });

    try {
      const client = getNerdGraphClient();
      const accountId = parseInt(client.getAccountId(), 10);

      const response = await client.query<NrqlGraphQLResponse>(NRQL_QUERY, {
        accountId,
        nrqlQuery: query,
        timeout: timeoutSeconds,
      });

      const elapsedTime = Date.now() - startTime;
      const nrqlResult = response.actor.account.nrql;

      defaultLogger.info("NRQL query executed successfully", {
        resultCount: nrqlResult.results.length,
        elapsedTime,
        hasFacets: !!nrqlResult.metadata.facets,
      });

      return {
        results: nrqlResult.results,
        metadata: {
          facets: nrqlResult.metadata.facets,
          timeWindow: nrqlResult.metadata.timeWindow,
        },
        query,
        elapsedTime,
      };
    } catch (error) {
      const elapsedTime = Date.now() - startTime;

      // Check for NRQL syntax errors in the error message
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes("nrql") &&
          (message.includes("syntax") ||
            message.includes("invalid") ||
            message.includes("parse"))
        ) {
          defaultLogger.error("NRQL syntax error", error);
          throw new NrqlSyntaxError(
            `Invalid NRQL query: ${error.message}`,
            query
          );
        }
      }

      defaultLogger.error("Failed to execute NRQL query", error);
      throw new ApiError(
        `Failed to execute NRQL query: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        { query, elapsedTime }
      );
    }
  }

  /**
   * Validates an NRQL query by attempting to execute it with a limit of 1
   * Useful for checking syntax before running expensive queries
   *
   * @param query - The NRQL query to validate
   * @returns True if valid, throws NrqlSyntaxError if invalid
   */
  async validateQuery(query: string): Promise<boolean> {
    // Add LIMIT 1 if not present to minimize data transfer
    const validationQuery = query.toLowerCase().includes("limit")
      ? query
      : `${query} LIMIT 1`;

    await this.executeQuery(validationQuery, 10);
    return true;
  }
}

/**
 * Singleton instance of the NRQL service
 */
let nrqlServiceInstance: NrqlService | null = null;

/**
 * Gets the singleton NRQL service instance
 */
export function getNrqlService(): NrqlService {
  if (!nrqlServiceInstance) {
    nrqlServiceInstance = new NrqlService();
  }
  return nrqlServiceInstance;
}
