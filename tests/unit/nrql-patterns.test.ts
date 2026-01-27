import { describe, it, expect } from "vitest";

/**
 * Tests for natural language to NRQL pattern matching
 * We test the pattern matching logic that's used in the natural_language_to_nrql_query tool
 */

// Recreate the pattern matching logic for testing (copied from nrql-tools.ts)
const NRQL_PATTERNS = {
  error_rate: {
    name: "Error Rate",
    keywords: ["error", "errors", "failure", "failures", "error rate", "exception"],
  },
  response_time: {
    name: "Response Time / Latency",
    keywords: ["response time", "latency", "duration", "slow", "performance", "p99", "p95", "percentile"],
  },
  throughput: {
    name: "Throughput / Traffic",
    keywords: ["throughput", "traffic", "requests", "volume", "count", "rpm", "tps"],
  },
  logs: {
    name: "Log Analysis",
    keywords: ["logs", "log", "logging", "message", "error logs", "warn"],
  },
  database: {
    name: "Database Performance",
    keywords: ["database", "db", "query", "queries", "sql", "datastore", "postgres", "mysql"],
  },
  time_comparison: {
    name: "Time Comparison",
    keywords: ["compare", "comparison", "versus", "vs", "change", "difference", "week over week", "day over day"],
  },
};

function analyzeNaturalLanguage(description: string): string[] {
  const lowerDesc = description.toLowerCase();
  const matchedPatterns: string[] = [];

  for (const [key, pattern] of Object.entries(NRQL_PATTERNS)) {
    for (const keyword of pattern.keywords) {
      if (lowerDesc.includes(keyword)) {
        if (!matchedPatterns.includes(pattern.name)) {
          matchedPatterns.push(pattern.name);
        }
        break;
      }
    }
  }

  return matchedPatterns;
}

describe("NRQL Pattern Matching", () => {
  describe("analyzeNaturalLanguage", () => {
    it("should match error-related queries", () => {
      const patterns = analyzeNaturalLanguage("Show me the error rate for my application");
      expect(patterns).toContain("Error Rate");
    });

    it("should match response time queries", () => {
      const patterns = analyzeNaturalLanguage("What is the average response time?");
      expect(patterns).toContain("Response Time / Latency");
    });

    it("should match latency queries", () => {
      const patterns = analyzeNaturalLanguage("Show me latency percentiles");
      expect(patterns).toContain("Response Time / Latency");
    });

    it("should match throughput queries", () => {
      const patterns = analyzeNaturalLanguage("How many requests per minute are we getting?");
      expect(patterns).toContain("Throughput / Traffic");
    });

    it("should match log queries", () => {
      const patterns = analyzeNaturalLanguage("Search the logs for timeout messages");
      expect(patterns).toContain("Log Analysis");
    });

    it("should match database queries", () => {
      const patterns = analyzeNaturalLanguage("Show me slow database queries");
      expect(patterns).toContain("Database Performance");
    });

    it("should match comparison queries", () => {
      const patterns = analyzeNaturalLanguage("Compare this week vs last week");
      expect(patterns).toContain("Time Comparison");
    });

    it("should match multiple patterns when applicable", () => {
      const patterns = analyzeNaturalLanguage("Compare error rates and response times");
      expect(patterns).toContain("Error Rate");
      expect(patterns).toContain("Time Comparison");
    });

    it("should be case insensitive", () => {
      const patterns = analyzeNaturalLanguage("SHOW ME THE ERROR RATE");
      expect(patterns).toContain("Error Rate");
    });

    it("should return empty array when no patterns match", () => {
      const patterns = analyzeNaturalLanguage("hello world");
      expect(patterns).toHaveLength(0);
    });

    it("should match partial keywords", () => {
      const patterns = analyzeNaturalLanguage("check postgresql performance");
      expect(patterns).toContain("Database Performance");
    });

    it("should handle complex queries", () => {
      const patterns = analyzeNaturalLanguage(
        "I need to compare error rates and database query latency from last week"
      );
      expect(patterns).toContain("Error Rate");
      expect(patterns).toContain("Database Performance");
      expect(patterns).toContain("Response Time / Latency");
      expect(patterns).toContain("Time Comparison");
    });
  });
});
