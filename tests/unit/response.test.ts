import { describe, expect, it } from "vitest";
import {
	formatResponse,
	optimizeDetail,
	optimizeList,
} from "../../src/utils/response.js";

describe("optimizeDetail", () => {
	it("strips __typename and verbose NerdGraph fields", () => {
		const input = {
			guid: "ABC123",
			name: "My App",
			__typename: "ApmApplicationEntity",
			permalink: "https://one.newrelic.com/...",
			accountId: 12345,
			reporting: true,
			alertSeverity: "NOT_CONFIGURED",
			domain: "APM",
		};
		const parsed = JSON.parse(optimizeDetail(input));
		expect(parsed.guid).toBe("ABC123");
		expect(parsed.name).toBe("My App");
		expect(parsed.domain).toBe("APM");
		expect(parsed.__typename).toBeUndefined();
		expect(parsed.permalink).toBeUndefined();
		expect(parsed.accountId).toBeUndefined();
		expect(parsed.reporting).toBeUndefined();
		expect(parsed.alertSeverity).toBeUndefined();
	});

	it("returns compact JSON", () => {
		const result = optimizeDetail({ guid: "ABC", name: "Test" });
		expect(result).not.toContain("\n");
		expect(result).toBe('{"guid":"ABC","name":"Test"}');
	});

	it("handles nested objects", () => {
		const input = {
			name: "App",
			apmSummary: {
				throughput: 100,
				__typename: "ApmApplicationSummaryData",
			},
		};
		const parsed = JSON.parse(optimizeDetail(input));
		expect(parsed.apmSummary.throughput).toBe(100);
		expect(parsed.apmSummary.__typename).toBeUndefined();
	});

	it("handles null and undefined values", () => {
		expect(optimizeDetail(null)).toBe("null");
		expect(optimizeDetail(undefined)).toBeUndefined();
	});

	it("handles arrays at top level", () => {
		const input = [
			{ guid: "A", __typename: "Entity" },
			{ guid: "B", __typename: "Entity" },
		];
		const parsed = JSON.parse(optimizeDetail(input));
		expect(parsed).toHaveLength(2);
		expect(parsed[0].guid).toBe("A");
		expect(parsed[0].__typename).toBeUndefined();
	});

	it("strips all specified detail fields", () => {
		const input = {
			guid: "ABC",
			__typename: "X",
			permalink: "url",
			accountId: 1,
			runningAgentVersions: ["1.0"],
			tags: [{ key: "env", values: ["prod"] }],
			reporting: true,
			alertSeverity: "CRITICAL",
			entityType: "APM_APPLICATION_ENTITY",
			indexedAt: 123456,
			nrdbQuery: "SELECT *",
			rawConfiguration: { a: 1 },
			embeddedChartUrl: "url",
			keepThis: "yes",
		};
		const parsed = JSON.parse(optimizeDetail(input));
		expect(parsed.guid).toBe("ABC");
		expect(parsed.keepThis).toBe("yes");
		expect(Object.keys(parsed)).toEqual(["guid", "keepThis"]);
	});
});

describe("optimizeList", () => {
	it("strips list-specific fields in addition to common fields", () => {
		const input = [
			{
				guid: "ABC",
				name: "App",
				settings: { apdexTarget: 0.5 },
				summaryMetrics: [{ name: "errorRate", value: { average: 0.01 } }],
			},
		];
		const parsed = JSON.parse(optimizeList(input));
		expect(parsed[0].guid).toBe("ABC");
		expect(parsed[0].name).toBe("App");
		expect(parsed[0].settings).toBeUndefined();
		expect(parsed[0].summaryMetrics).toBeUndefined();
	});

	it("strips recentAlertViolations from list responses", () => {
		const input = {
			entities: [
				{
					guid: "X",
					recentAlertViolations: [{ id: 1 }],
					name: "Svc",
				},
			],
		};
		const parsed = JSON.parse(optimizeList(input));
		expect(parsed.entities[0].guid).toBe("X");
		expect(parsed.entities[0].name).toBe("Svc");
		expect(parsed.entities[0].recentAlertViolations).toBeUndefined();
	});
});

describe("formatResponse", () => {
	it("returns compact JSON", () => {
		expect(formatResponse({ a: 1 })).toBe('{"a":1}');
	});

	it("does not add whitespace", () => {
		const result = formatResponse({ nested: { key: "value" }, arr: [1, 2, 3] });
		expect(result).not.toContain("\n");
		expect(result).not.toContain("  ");
	});

	it("handles primitive values", () => {
		expect(formatResponse("hello")).toBe('"hello"');
		expect(formatResponse(42)).toBe("42");
		expect(formatResponse(null)).toBe("null");
		expect(formatResponse(true)).toBe("true");
	});
});
