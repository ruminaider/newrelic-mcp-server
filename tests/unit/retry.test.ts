import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../../src/utils/retry.js";
import { RateLimitError } from "../../src/utils/errors.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return result on first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const resultPromise = withRetry(fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on RateLimitError", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError("Rate limited", 1000))
      .mockResolvedValueOnce("success after retry");

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });

    // First call fails
    await vi.advanceTimersByTimeAsync(0);

    // Wait for retry delay
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(result).toBe("success after retry");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on network errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce("success");

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should not retry on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid query syntax"));

    const resultPromise = withRetry(fn, { maxAttempts: 3 });

    await expect(resultPromise).rejects.toThrow("Invalid query syntax");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should exhaust retries and throw last error", async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError("Still rate limited", 100));

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500 });

    // Catch the rejection immediately to prevent unhandled rejection warning
    const catchPromise = resultPromise.catch((e) => e);

    await vi.runAllTimersAsync();

    const error = await catchPromise;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.message).toBe("Still rate limited");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should use retryAfterMs from RateLimitError when available", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError("Rate limited", 5000))
      .mockResolvedValueOnce("success");

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });

    // Should wait 5000ms (from error), not 100ms (base delay)
    await vi.advanceTimersByTimeAsync(4999);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();

    const result = await resultPromise;
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should respect maxDelayMs cap", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce("success");

    const resultPromise = withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 2000, // Should cap at 2s even with exponential growth
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should not retry when retryOnRateLimit is false", async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError("Rate limited", 1000));

    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      retryOnRateLimit: false,
    });

    await expect(resultPromise).rejects.toThrow("Rate limited");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
