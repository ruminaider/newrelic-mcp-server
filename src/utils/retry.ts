/**
 * Retry utility with exponential backoff
 */

import { defaultLogger } from "./logger.js";
import { RateLimitError } from "./errors.js";

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Whether to retry on rate limit errors */
  retryOnRateLimit: boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryOnRateLimit: true,
};

/**
 * Calculates delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  // Add jitter (0-25% of delay)
  const jitter = exponentialDelay * Math.random() * 0.25;
  // Cap at max delay
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown, retryOnRateLimit: boolean): boolean {
  if (error instanceof RateLimitError && retryOnRateLimit) {
    return true;
  }

  // Retry on network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("socket")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a function with retry logic
 * @param fn Function to execute
 * @param options Retry options
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === opts.maxAttempts - 1;
      const shouldRetry = isRetryableError(error, opts.retryOnRateLimit);

      if (isLastAttempt || !shouldRetry) {
        throw error;
      }

      // Use retry-after from rate limit error if available
      let delayMs: number;
      if (error instanceof RateLimitError && error.retryAfterMs) {
        delayMs = error.retryAfterMs;
      } else {
        delayMs = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      }

      defaultLogger.warn(
        `Retrying after error (attempt ${attempt + 1}/${opts.maxAttempts})`,
        { delayMs, error: error instanceof Error ? error.message : String(error) }
      );

      await sleep(delayMs);
    }
  }

  throw lastError;
}
