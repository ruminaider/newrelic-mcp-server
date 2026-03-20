import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the config module to test validation logic directly
describe("Config", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Clear module cache for fresh imports
		vi.resetModules();
		// Reset env to a clean state
		process.env = { ...originalEnv };
		// Clear any NEW_RELIC env vars from parent process
		process.env.NEW_RELIC_API_KEY = undefined;
		process.env.NEW_RELIC_ACCOUNT_ID = undefined;
		process.env.NEW_RELIC_REGION = undefined;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("loadConfig", () => {
		it("should load config from environment variables", async () => {
			process.env.NEW_RELIC_API_KEY = "test-api-key";
			process.env.NEW_RELIC_ACCOUNT_ID = "12345";
			process.env.NEW_RELIC_REGION = "US";

			const { loadConfig } = await import("../../src/config.js");
			const config = loadConfig();

			expect(config.newRelic.apiKey).toBe("test-api-key");
			expect(config.newRelic.accountId).toBe("12345");
			expect(config.newRelic.region).toBe("US");
		});

		it("should default region to US if not specified", async () => {
			process.env.NEW_RELIC_API_KEY = "test-api-key";
			process.env.NEW_RELIC_ACCOUNT_ID = "12345";

			const { loadConfig } = await import("../../src/config.js");
			const config = loadConfig();

			expect(config.newRelic.region).toBe("US");
		});

		it("should throw error if API key is missing", async () => {
			process.env.NEW_RELIC_ACCOUNT_ID = "12345";

			const { loadConfig } = await import("../../src/config.js");

			expect(() => loadConfig()).toThrow("NEW_RELIC_API_KEY");
		});

		it("should throw error if account ID is missing", async () => {
			process.env.NEW_RELIC_API_KEY = "test-api-key";

			const { loadConfig } = await import("../../src/config.js");

			expect(() => loadConfig()).toThrow("NEW_RELIC_ACCOUNT_ID");
		});

		it("should accept EU region", async () => {
			process.env.NEW_RELIC_API_KEY = "test-api-key";
			process.env.NEW_RELIC_ACCOUNT_ID = "12345";
			process.env.NEW_RELIC_REGION = "EU";

			const { loadConfig } = await import("../../src/config.js");
			const config = loadConfig();

			expect(config.newRelic.region).toBe("EU");
		});

		it("should normalize lowercase region to uppercase", async () => {
			process.env.NEW_RELIC_API_KEY = "test-api-key";
			process.env.NEW_RELIC_ACCOUNT_ID = "12345";
			process.env.NEW_RELIC_REGION = "eu";

			const { loadConfig } = await import("../../src/config.js");
			const config = loadConfig();

			expect(config.newRelic.region).toBe("EU");
		});

		it("should throw error for invalid region", async () => {
			process.env.NEW_RELIC_API_KEY = "test-api-key";
			process.env.NEW_RELIC_ACCOUNT_ID = "12345";
			process.env.NEW_RELIC_REGION = "INVALID";

			const { loadConfig } = await import("../../src/config.js");

			expect(() => loadConfig()).toThrow("Invalid NEW_RELIC_REGION");
		});

		it("should use default server name if not specified", async () => {
			process.env.NEW_RELIC_API_KEY = "test-api-key";
			process.env.NEW_RELIC_ACCOUNT_ID = "12345";

			const { loadConfig } = await import("../../src/config.js");
			const config = loadConfig();

			expect(config.server.name).toBe("newrelic-mcp-server");
		});
	});
});
