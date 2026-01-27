/**
 * NerdGraph GraphQL client for NewRelic API
 * Handles authentication, retries, and rate limiting
 */

import { GraphQLClient } from "graphql-request";
import type { NewRelicConfig } from "../config.js";
import { defaultLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import {
  ApiError,
  AuthenticationError,
  RateLimitError,
} from "../utils/errors.js";

/**
 * NerdGraph API endpoints by region
 */
const NERDGRAPH_ENDPOINTS = {
  US: "https://api.newrelic.com/graphql",
  EU: "https://api.eu.newrelic.com/graphql",
} as const;

/**
 * Concurrent request tracking for rate limiting
 * NewRelic allows 25 concurrent requests per user
 */
const MAX_CONCURRENT_REQUESTS = 25;
let activeRequests = 0;

/**
 * Wait for a slot to become available
 */
async function acquireSlot(): Promise<void> {
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  activeRequests++;
}

/**
 * Release a slot
 */
function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

/**
 * NerdGraph client for executing GraphQL queries
 */
export class NerdGraphClient {
  private readonly client: GraphQLClient;
  private readonly accountId: string;

  constructor(config: NewRelicConfig) {
    const endpoint = NERDGRAPH_ENDPOINTS[config.region];

    this.client = new GraphQLClient(endpoint, {
      headers: {
        "Content-Type": "application/json",
        "API-Key": config.apiKey,
      },
    });

    this.accountId = config.accountId;

    defaultLogger.info("Initialized NerdGraph client", {
      endpoint,
      accountId: config.accountId,
      region: config.region,
    });
  }

  /**
   * Gets the account ID
   */
  getAccountId(): string {
    return this.accountId;
  }

  /**
   * Executes a GraphQL query against NerdGraph
   * Automatically handles rate limiting and retries
   */
  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: {
      /** Whether to include aiIssues experimental header */
      includeAiIssuesHeader?: boolean;
      /** Custom timeout in milliseconds */
      timeout?: number;
    }
  ): Promise<T> {
    await acquireSlot();

    try {
      return await withRetry(
        async () => {
          defaultLogger.debug("Executing NerdGraph query", {
            queryLength: query.length,
            hasVariables: !!variables,
          });

          // Add experimental header for aiIssues queries
          const requestHeaders: Record<string, string> = {};
          if (options?.includeAiIssuesHeader) {
            requestHeaders["nerd-graph-unsafe-experimental-opt-in"] = "AiIssues";
          }

          try {
            const result = await this.client.request<T>({
              document: query,
              variables,
              requestHeaders:
                Object.keys(requestHeaders).length > 0
                  ? requestHeaders
                  : undefined,
            });

            defaultLogger.debug("NerdGraph query succeeded");
            return result;
          } catch (error) {
            this.handleError(error);
            throw error; // Re-throw after handling
          }
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          retryOnRateLimit: true,
        }
      );
    } finally {
      releaseSlot();
    }
  }

  /**
   * Handles GraphQL errors and converts to appropriate error types
   */
  private handleError(error: unknown): never {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Check for authentication errors
      if (
        message.includes("unauthorized") ||
        message.includes("forbidden") ||
        message.includes("invalid api key")
      ) {
        throw new AuthenticationError(
          "NewRelic API authentication failed. Check your API key.",
          { originalError: error.message }
        );
      }

      // Check for rate limit errors
      if (message.includes("rate limit") || message.includes("429")) {
        // Try to extract retry-after from error
        const retryAfterMatch = message.match(/retry after (\d+)/i);
        const retryAfterMs = retryAfterMatch
          ? parseInt(retryAfterMatch[1], 10) * 1000
          : 5000;

        throw new RateLimitError(
          "NewRelic API rate limit exceeded",
          retryAfterMs,
          { originalError: error.message }
        );
      }

      // Generic API error
      throw new ApiError(`NewRelic API error: ${error.message}`, undefined, {
        originalError: error.message,
      });
    }

    throw new ApiError(`Unknown NewRelic API error: ${String(error)}`);
  }
}

/**
 * Global NerdGraph client instance
 */
let globalClient: NerdGraphClient | null = null;

/**
 * Initializes the global NerdGraph client
 */
export function initializeNerdGraphClient(config: NewRelicConfig): void {
  globalClient = new NerdGraphClient(config);
}

/**
 * Gets the global NerdGraph client
 * @throws Error if client not initialized
 */
export function getNerdGraphClient(): NerdGraphClient {
  if (!globalClient) {
    throw new Error(
      "NerdGraph client not initialized. Call initializeNerdGraphClient first."
    );
  }
  return globalClient;
}
