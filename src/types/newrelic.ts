/**
 * NewRelic API response types
 * Used across all services for type safety
 */

// Entity types
export interface Entity {
	guid: string;
	name: string;
	type: string;
	domain: string;
	entityType?: string;
	reporting?: boolean;
	tags?: Tag[];
}

export interface Tag {
	key: string;
	values: string[];
}

export interface ApmSummary {
	throughput: number;
	responseTimeAverage: number;
	errorRate: number;
}

export interface ApmApplicationEntity extends Entity {
	apmSummary?: ApmSummary;
}

export interface RelatedEntity {
	source: { guid: string; name: string; type: string };
	target: { guid: string; name: string; type: string };
	type: string;
}

// Dashboard types
export interface DashboardWidget {
	id: string;
	title: string;
	rawConfiguration: Record<string, unknown>;
}

export interface DashboardPage {
	guid: string;
	name: string;
	widgets: DashboardWidget[];
}

export interface Dashboard {
	guid: string;
	name: string;
	pages?: DashboardPage[];
}

// Alert types
export interface AlertPolicy {
	id: string;
	name: string;
	incidentPreference: string;
}

export interface AlertCondition {
	id: string;
	name: string;
	enabled: boolean;
	type: string;
}

export interface AiIssue {
	issueId: string;
	title: string;
	priority: string;
	state: string;
	activatedAt: number;
	closedAt?: number;
}

export interface Incident {
	incidentId: string;
	title: string;
	priority: string;
	state: string;
	activatedAt: number;
	closedAt?: number;
}

// Synthetic types
export interface SyntheticMonitorSummary {
	status: string;
	successRate: number;
}

export interface SyntheticMonitor extends Entity {
	monitorSummary?: SyntheticMonitorSummary;
}

// NRQL types
export interface NrqlResult {
	results: Record<string, unknown>[];
	metadata: {
		facets: string[] | null;
		timeWindow: {
			begin: number;
			end: number;
		};
	};
}

export interface NrqlQueryResponse {
	actor: {
		account: {
			nrql: NrqlResult;
		};
	};
}

// Golden Metrics types
export interface GoldenMetric {
	name: string;
	title: string;
	query: string;
}

export interface GoldenMetrics {
	metrics: GoldenMetric[];
}

// Account types
export interface Account {
	id: number;
	name: string;
}

// Pagination types
export interface PaginatedResults<T> {
	results: T[];
	nextCursor?: string;
}

// Common response wrappers
export interface EntitySearchResponse {
	actor: {
		entitySearch: {
			results: {
				entities: Entity[];
				nextCursor?: string;
			};
		};
	};
}

export interface EntityResponse {
	actor: {
		entity: Entity | null;
	};
}

export interface AccountsResponse {
	actor: {
		accounts: Account[];
	};
}
