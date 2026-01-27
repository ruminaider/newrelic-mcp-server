/**
 * Alert service for NewRelic alert and incident operations
 * Handles GraphQL queries for alerts, incidents, and change tracking
 */

import { getNerdGraphClient } from "./nerdgraph-client.js";
import { defaultLogger } from "../utils/logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Alert policy incident preference
 */
export type IncidentPreference =
  | "PER_CONDITION"
  | "PER_CONDITION_AND_TARGET"
  | "PER_POLICY";

/**
 * Alert policy from NewRelic
 */
export interface AlertPolicy {
  id: string;
  name: string;
  incidentPreference: IncidentPreference;
}

/**
 * NRQL alert condition from NewRelic
 */
export interface NrqlAlertCondition {
  id: string;
  name: string;
  enabled: boolean;
  type: string;
  policyId?: string;
  description?: string;
  runbookUrl?: string;
  nrql?: {
    query: string;
  };
  signal?: {
    aggregationWindow?: number;
    evaluationOffset?: number;
  };
  terms?: Array<{
    threshold: number;
    thresholdDuration: number;
    thresholdOccurrences: string;
    operator: string;
    priority: string;
  }>;
  expiration?: {
    closeViolationsOnExpiration?: boolean;
    expirationDuration?: number;
    openViolationOnExpiration?: boolean;
  };
}

/**
 * AI Issue from NewRelic
 */
export interface AiIssue {
  issueId: string;
  title: string;
  priority: string;
  state: string;
  activatedAt: number;
  closedAt?: number;
  sources?: string[];
  conditionFamilyId?: string;
  policyIds?: string[];
  entityGuids?: string[];
  description?: string[];
}

/**
 * Incident from NewRelic
 */
export interface Incident {
  incidentId: string;
  title: string;
  priority: string;
  state: string;
  openTime: number;
  closeTime?: number;
  description?: string;
  entityGuids?: string[];
}

/**
 * Deployment event from NewRelic
 */
export interface DeploymentEvent {
  timestamp: number;
  deploymentType?: string;
  version?: string;
  description?: string;
  user?: string;
  changelog?: string;
  commit?: string;
  entityGuid?: string;
  entityName?: string;
  groupId?: string;
}

/**
 * Change event from NewRelic
 */
export interface ChangeEvent {
  timestamp: number;
  changeType: string;
  version?: string;
  description?: string;
  user?: string;
  entityGuid?: string;
  entityName?: string;
  deploymentId?: string;
  groupId?: string;
  changelog?: string;
  commit?: string;
}

/**
 * Error group from TransactionError
 */
export interface ErrorGroup {
  errorClass: string;
  errorMessage: string;
  count: number;
  firstSeen?: number;
  lastSeen?: number;
  transactionName?: string;
  entityGuid?: string;
  entityName?: string;
}

// ============================================================================
// GraphQL Queries
// ============================================================================

const LIST_ALERT_POLICIES_QUERY = `
query ListAlertPolicies($accountId: Int!, $searchCriteria: AlertsPoliciesSearchCriteriaInput, $cursor: String) {
  actor {
    account(id: $accountId) {
      alerts {
        policiesSearch(searchCriteria: $searchCriteria, cursor: $cursor) {
          policies {
            id
            name
            incidentPreference
          }
          nextCursor
          totalCount
        }
      }
    }
  }
}
`;

const LIST_ALERT_CONDITIONS_QUERY = `
query ListAlertConditions($accountId: Int!, $searchCriteria: AlertsNrqlConditionsSearchCriteriaInput, $cursor: String) {
  actor {
    account(id: $accountId) {
      alerts {
        nrqlConditionsSearch(searchCriteria: $searchCriteria, cursor: $cursor) {
          nrqlConditions {
            id
            name
            enabled
            type
            policyId
            description
            runbookUrl
            nrql {
              query
            }
            signal {
              aggregationWindow
              evaluationOffset
            }
            expiration {
              closeViolationsOnExpiration
              expirationDuration
              openViolationOnExpiration
            }
          }
          nextCursor
          totalCount
        }
      }
    }
  }
}
`;

const LIST_AI_ISSUES_QUERY = `
query ListAiIssues($accountId: Int!, $filter: AiIssuesFilterInput) {
  actor {
    account(id: $accountId) {
      aiIssues {
        issues(filter: $filter) {
          issues {
            issueId
            title
            priority
            state
            activatedAt
            closedAt
            sources
            conditionFamilyId
            policyIds
            entityGuids
            description
          }
        }
      }
    }
  }
}
`;

const SEARCH_INCIDENTS_NRQL = `
SELECT *
FROM NrAiIncident
WHERE 1=1
`;

const DEPLOYMENT_EVENTS_NRQL = `
SELECT *
FROM Deployment
WHERE 1=1
`;

const CHANGE_EVENTS_NRQL = `
SELECT timestamp, changeType, version, description, user, entityGuid, entity.name as entityName, deploymentId, groupId, changelog, commit
FROM NrChangeTracking
WHERE 1=1
`;

const ERROR_GROUPS_NRQL = `
SELECT count(*) as count, latest(timestamp) as lastSeen, earliest(timestamp) as firstSeen, latest(transactionName) as transactionName, latest(entityGuid) as entityGuid, latest(entity.name) as entityName
FROM TransactionError
FACET error.class, error.message
`;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Lists alert policies with optional name filtering
 */
export async function listAlertPolicies(options: {
  nameFilter?: string;
  limit?: number;
}): Promise<{
  policies: AlertPolicy[];
  totalCount: number;
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const policies: AlertPolicy[] = [];
  let cursor: string | null = null;
  const limit = options.limit ?? 100;

  defaultLogger.debug("Listing alert policies", { nameFilter: options.nameFilter, limit });

  do {
    const searchCriteria: Record<string, unknown> = {};
    if (options.nameFilter) {
      searchCriteria.name = options.nameFilter;
    }

    type PolicyResponse = {
      actor: {
        account: {
          alerts: {
            policiesSearch: {
              policies: AlertPolicy[];
              nextCursor: string | null;
              totalCount: number;
            };
          };
        };
      };
    };

    const response: PolicyResponse = await client.query<PolicyResponse>(LIST_ALERT_POLICIES_QUERY, {
      accountId,
      searchCriteria: Object.keys(searchCriteria).length > 0 ? searchCriteria : undefined,
      cursor,
    });

    const result: PolicyResponse["actor"]["account"]["alerts"]["policiesSearch"] = response.actor.account.alerts.policiesSearch;
    policies.push(...result.policies);
    cursor = result.nextCursor;

    if (policies.length >= limit) {
      return {
        policies: policies.slice(0, limit),
        totalCount: result.totalCount,
      };
    }
  } while (cursor);

  return {
    policies,
    totalCount: policies.length,
  };
}

/**
 * Lists NRQL alert conditions with optional filtering
 */
export async function listAlertConditions(options: {
  policyId?: string;
  nameFilter?: string;
  enabledOnly?: boolean;
  limit?: number;
}): Promise<{
  conditions: NrqlAlertCondition[];
  totalCount: number;
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const conditions: NrqlAlertCondition[] = [];
  let cursor: string | null = null;
  const limit = options.limit ?? 100;

  defaultLogger.debug("Listing alert conditions", options);

  do {
    const searchCriteria: Record<string, unknown> = {};
    if (options.policyId) {
      searchCriteria.policyId = options.policyId;
    }
    if (options.nameFilter) {
      searchCriteria.name = options.nameFilter;
    }

    type ConditionResponse = {
      actor: {
        account: {
          alerts: {
            nrqlConditionsSearch: {
              nrqlConditions: NrqlAlertCondition[];
              nextCursor: string | null;
              totalCount: number;
            };
          };
        };
      };
    };

    const response: ConditionResponse = await client.query<ConditionResponse>(LIST_ALERT_CONDITIONS_QUERY, {
      accountId,
      searchCriteria: Object.keys(searchCriteria).length > 0 ? searchCriteria : undefined,
      cursor,
    });

    const result: ConditionResponse["actor"]["account"]["alerts"]["nrqlConditionsSearch"] = response.actor.account.alerts.nrqlConditionsSearch;
    let filteredConditions = result.nrqlConditions;

    // Apply enabled filter if specified
    if (options.enabledOnly) {
      filteredConditions = filteredConditions.filter((c: NrqlAlertCondition) => c.enabled);
    }

    conditions.push(...filteredConditions);
    cursor = result.nextCursor;

    if (conditions.length >= limit) {
      return {
        conditions: conditions.slice(0, limit),
        totalCount: result.totalCount,
      };
    }
  } while (cursor);

  return {
    conditions,
    totalCount: conditions.length,
  };
}

/**
 * Lists recent AI issues (requires experimental header)
 */
export async function listRecentIssues(options: {
  states?: Array<"ACTIVATED" | "CREATED" | "CLOSED" | "DEACTIVATED">;
  priorities?: Array<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW">;
  entityGuids?: string[];
  limit?: number;
}): Promise<{
  issues: AiIssue[];
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const limit = options.limit ?? 50;

  defaultLogger.debug("Listing recent AI issues", options);

  const filter: Record<string, unknown> = {};
  if (options.states && options.states.length > 0) {
    filter.states = options.states;
  } else {
    // Default to active issues
    filter.states = ["ACTIVATED", "CREATED"];
  }
  if (options.priorities && options.priorities.length > 0) {
    filter.priorities = options.priorities;
  }
  if (options.entityGuids && options.entityGuids.length > 0) {
    filter.entityGuids = options.entityGuids;
  }

  const response = await client.query<{
    actor: {
      account: {
        aiIssues: {
          issues: {
            issues: AiIssue[];
          };
        };
      };
    };
  }>(
    LIST_AI_ISSUES_QUERY,
    {
      accountId,
      filter,
    },
    { includeAiIssuesHeader: true }
  );

  const issues = response.actor.account.aiIssues.issues.issues;

  return {
    issues: issues.slice(0, limit),
  };
}

/**
 * Searches incidents using NRQL
 */
export async function searchIncidents(options: {
  state?: string;
  priority?: string;
  entityGuid?: string;
  sinceDays?: number;
  limit?: number;
}): Promise<{
  incidents: Incident[];
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const limit = options.limit ?? 50;
  const sinceDays = options.sinceDays ?? 7;

  defaultLogger.debug("Searching incidents", options);

  let nrql = SEARCH_INCIDENTS_NRQL;

  if (options.state) {
    nrql += ` AND state = '${options.state}'`;
  }
  if (options.priority) {
    nrql += ` AND priority = '${options.priority}'`;
  }
  if (options.entityGuid) {
    nrql += ` AND entityGuid = '${options.entityGuid}'`;
  }

  nrql += ` SINCE ${sinceDays} days ago LIMIT ${limit}`;

  const response = await client.query<{
    actor: {
      account: {
        nrql: {
          results: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    `
    query SearchIncidents($accountId: Int!, $query: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $query) {
            results
          }
        }
      }
    }
    `,
    {
      accountId,
      query: nrql,
    }
  );

  const results = response.actor.account.nrql.results;

  const incidents: Incident[] = results.map((r) => ({
    incidentId: String(r.incidentId ?? r.id ?? ""),
    title: String(r.title ?? ""),
    priority: String(r.priority ?? ""),
    state: String(r.state ?? ""),
    openTime: Number(r.openTime ?? r.timestamp ?? 0),
    closeTime: r.closeTime ? Number(r.closeTime) : undefined,
    description: r.description ? String(r.description) : undefined,
    entityGuids: r.entityGuids ? (r.entityGuids as string[]) : undefined,
  }));

  return { incidents };
}

/**
 * Gets deployment events for change tracking analysis
 */
export async function getDeploymentEvents(options: {
  entityGuid?: string;
  sinceDays?: number;
  limit?: number;
}): Promise<{
  deployments: DeploymentEvent[];
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const limit = options.limit ?? 50;
  const sinceDays = options.sinceDays ?? 7;

  defaultLogger.debug("Getting deployment events", options);

  let nrql = DEPLOYMENT_EVENTS_NRQL;

  if (options.entityGuid) {
    nrql += ` AND entityGuid = '${options.entityGuid}'`;
  }

  nrql += ` SINCE ${sinceDays} days ago LIMIT ${limit}`;

  const response = await client.query<{
    actor: {
      account: {
        nrql: {
          results: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    `
    query GetDeployments($accountId: Int!, $query: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $query) {
            results
          }
        }
      }
    }
    `,
    {
      accountId,
      query: nrql,
    }
  );

  const results = response.actor.account.nrql.results;

  const deployments: DeploymentEvent[] = results.map((r) => ({
    timestamp: Number(r.timestamp ?? 0),
    deploymentType: r.deploymentType ? String(r.deploymentType) : undefined,
    version: r.version ? String(r.version) : undefined,
    description: r.description ? String(r.description) : undefined,
    user: r.user ? String(r.user) : undefined,
    changelog: r.changelog ? String(r.changelog) : undefined,
    commit: r.commit ? String(r.commit) : undefined,
    entityGuid: r.entityGuid ? String(r.entityGuid) : undefined,
    entityName: r.entityName ? String(r.entityName) : undefined,
    groupId: r.groupId ? String(r.groupId) : undefined,
  }));

  return { deployments };
}

/**
 * Gets change events from NrChangeTracking
 */
export async function getChangeEvents(options: {
  entityGuid?: string;
  changeType?: string;
  sinceDays?: number;
  limit?: number;
}): Promise<{
  changes: ChangeEvent[];
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const limit = options.limit ?? 50;
  const sinceDays = options.sinceDays ?? 7;

  defaultLogger.debug("Getting change events", options);

  let nrql = CHANGE_EVENTS_NRQL;

  if (options.entityGuid) {
    nrql += ` AND entityGuid = '${options.entityGuid}'`;
  }
  if (options.changeType) {
    nrql += ` AND changeType = '${options.changeType}'`;
  }

  nrql += ` SINCE ${sinceDays} days ago LIMIT ${limit}`;

  const response = await client.query<{
    actor: {
      account: {
        nrql: {
          results: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    `
    query GetChangeEvents($accountId: Int!, $query: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $query) {
            results
          }
        }
      }
    }
    `,
    {
      accountId,
      query: nrql,
    }
  );

  const results = response.actor.account.nrql.results;

  const changes: ChangeEvent[] = results.map((r) => ({
    timestamp: Number(r.timestamp ?? 0),
    changeType: String(r.changeType ?? ""),
    version: r.version ? String(r.version) : undefined,
    description: r.description ? String(r.description) : undefined,
    user: r.user ? String(r.user) : undefined,
    entityGuid: r.entityGuid ? String(r.entityGuid) : undefined,
    entityName: r.entityName ? String(r.entityName) : undefined,
    deploymentId: r.deploymentId ? String(r.deploymentId) : undefined,
    groupId: r.groupId ? String(r.groupId) : undefined,
    changelog: r.changelog ? String(r.changelog) : undefined,
    commit: r.commit ? String(r.commit) : undefined,
  }));

  return { changes };
}

/**
 * Gets error groups from TransactionError
 */
export async function getEntityErrorGroups(options: {
  entityGuid?: string;
  transactionName?: string;
  sinceDays?: number;
  limit?: number;
}): Promise<{
  errorGroups: ErrorGroup[];
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const limit = options.limit ?? 50;
  const sinceDays = options.sinceDays ?? 7;

  defaultLogger.debug("Getting entity error groups", options);

  let nrql = ERROR_GROUPS_NRQL;

  if (options.entityGuid) {
    nrql += ` WHERE entityGuid = '${options.entityGuid}'`;
  }
  if (options.transactionName) {
    nrql += ` WHERE transactionName LIKE '%${options.transactionName}%'`;
  }

  nrql += ` SINCE ${sinceDays} days ago LIMIT ${limit}`;

  const response = await client.query<{
    actor: {
      account: {
        nrql: {
          results: Array<Record<string, unknown>>;
        };
      };
    };
  }>(
    `
    query GetErrorGroups($accountId: Int!, $query: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $query) {
            results
          }
        }
      }
    }
    `,
    {
      accountId,
      query: nrql,
    }
  );

  const results = response.actor.account.nrql.results;

  const errorGroups: ErrorGroup[] = results.map((r) => ({
    errorClass: String(r["error.class"] ?? r.errorClass ?? "Unknown"),
    errorMessage: String(r["error.message"] ?? r.errorMessage ?? ""),
    count: Number(r.count ?? 0),
    firstSeen: r.firstSeen ? Number(r.firstSeen) : undefined,
    lastSeen: r.lastSeen ? Number(r.lastSeen) : undefined,
    transactionName: r.transactionName ? String(r.transactionName) : undefined,
    entityGuid: r.entityGuid ? String(r.entityGuid) : undefined,
    entityName: r.entityName ? String(r.entityName) : undefined,
  }));

  return { errorGroups };
}

/**
 * Analyzes deployment impact by correlating deployments with metrics
 */
export async function analyzeDeploymentImpact(options: {
  entityGuid: string;
  deploymentTimestamp?: number;
  beforeMinutes?: number;
  afterMinutes?: number;
}): Promise<{
  deployment?: DeploymentEvent;
  metrics: {
    errorRateBefore: number;
    errorRateAfter: number;
    throughputBefore: number;
    throughputAfter: number;
    responseTimeBefore: number;
    responseTimeAfter: number;
  };
  impact: {
    errorRateChange: number;
    throughputChange: number;
    responseTimeChange: number;
    hasNegativeImpact: boolean;
  };
}> {
  const client = getNerdGraphClient();
  const accountId = parseInt(client.getAccountId(), 10);
  const beforeMinutes = options.beforeMinutes ?? 30;
  const afterMinutes = options.afterMinutes ?? 30;

  defaultLogger.debug("Analyzing deployment impact", options);

  // Get the most recent deployment if timestamp not provided
  let deploymentTimestamp = options.deploymentTimestamp;
  let deployment: DeploymentEvent | undefined;

  if (!deploymentTimestamp) {
    const deploymentsResult = await getDeploymentEvents({
      entityGuid: options.entityGuid,
      sinceDays: 7,
      limit: 1,
    });

    if (deploymentsResult.deployments.length > 0) {
      deployment = deploymentsResult.deployments[0];
      deploymentTimestamp = deployment.timestamp;
    }
  }

  if (!deploymentTimestamp) {
    return {
      deployment: undefined,
      metrics: {
        errorRateBefore: 0,
        errorRateAfter: 0,
        throughputBefore: 0,
        throughputAfter: 0,
        responseTimeBefore: 0,
        responseTimeAfter: 0,
      },
      impact: {
        errorRateChange: 0,
        throughputChange: 0,
        responseTimeChange: 0,
        hasNegativeImpact: false,
      },
    };
  }

  // Query metrics before and after deployment
  const beforeQuery = `
    SELECT
      percentage(count(*), WHERE error IS true) as errorRate,
      rate(count(*), 1 minute) as throughput,
      average(duration) * 1000 as responseTime
    FROM Transaction
    WHERE entityGuid = '${options.entityGuid}'
    SINCE ${deploymentTimestamp - beforeMinutes * 60 * 1000}
    UNTIL ${deploymentTimestamp}
  `;

  const afterQuery = `
    SELECT
      percentage(count(*), WHERE error IS true) as errorRate,
      rate(count(*), 1 minute) as throughput,
      average(duration) * 1000 as responseTime
    FROM Transaction
    WHERE entityGuid = '${options.entityGuid}'
    SINCE ${deploymentTimestamp}
    UNTIL ${deploymentTimestamp + afterMinutes * 60 * 1000}
  `;

  const [beforeResponse, afterResponse] = await Promise.all([
    client.query<{
      actor: {
        account: {
          nrql: {
            results: Array<Record<string, number>>;
          };
        };
      };
    }>(
      `
      query GetMetricsBefore($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
            }
          }
        }
      }
      `,
      { accountId, query: beforeQuery }
    ),
    client.query<{
      actor: {
        account: {
          nrql: {
            results: Array<Record<string, number>>;
          };
        };
      };
    }>(
      `
      query GetMetricsAfter($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
            }
          }
        }
      }
      `,
      { accountId, query: afterQuery }
    ),
  ]);

  const beforeMetrics = beforeResponse.actor.account.nrql.results[0] ?? {};
  const afterMetrics = afterResponse.actor.account.nrql.results[0] ?? {};

  const metrics = {
    errorRateBefore: beforeMetrics.errorRate ?? 0,
    errorRateAfter: afterMetrics.errorRate ?? 0,
    throughputBefore: beforeMetrics.throughput ?? 0,
    throughputAfter: afterMetrics.throughput ?? 0,
    responseTimeBefore: beforeMetrics.responseTime ?? 0,
    responseTimeAfter: afterMetrics.responseTime ?? 0,
  };

  // Calculate impact
  const errorRateChange =
    metrics.errorRateBefore > 0
      ? ((metrics.errorRateAfter - metrics.errorRateBefore) / metrics.errorRateBefore) * 100
      : metrics.errorRateAfter > 0
      ? 100
      : 0;

  const throughputChange =
    metrics.throughputBefore > 0
      ? ((metrics.throughputAfter - metrics.throughputBefore) / metrics.throughputBefore) * 100
      : 0;

  const responseTimeChange =
    metrics.responseTimeBefore > 0
      ? ((metrics.responseTimeAfter - metrics.responseTimeBefore) / metrics.responseTimeBefore) * 100
      : 0;

  // Negative impact if error rate increased significantly or response time increased
  const hasNegativeImpact =
    errorRateChange > 10 || responseTimeChange > 20;

  return {
    deployment,
    metrics,
    impact: {
      errorRateChange,
      throughputChange,
      responseTimeChange,
      hasNegativeImpact,
    },
  };
}

/**
 * Generates a combined alert insights report with AI issues and entity metrics
 */
export async function generateAlertInsightsReport(options: {
  entityGuid?: string;
  sinceDays?: number;
}): Promise<{
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    activeIssues: number;
    resolvedIssues: number;
  };
  issues: AiIssue[];
  errorGroups: ErrorGroup[];
  recentDeployments: DeploymentEvent[];
  recommendations: string[];
}> {
  const sinceDays = options.sinceDays ?? 7;

  defaultLogger.debug("Generating alert insights report", options);

  // Fetch data in parallel
  const [issuesResult, errorGroupsResult, deploymentsResult] = await Promise.all([
    listRecentIssues({
      states: ["ACTIVATED", "CREATED", "CLOSED"],
      entityGuids: options.entityGuid ? [options.entityGuid] : undefined,
      limit: 100,
    }),
    getEntityErrorGroups({
      entityGuid: options.entityGuid,
      sinceDays,
      limit: 20,
    }),
    getDeploymentEvents({
      entityGuid: options.entityGuid,
      sinceDays,
      limit: 10,
    }),
  ]);

  const issues = issuesResult.issues;
  const errorGroups = errorGroupsResult.errorGroups;
  const deployments = deploymentsResult.deployments;

  // Calculate summary
  const summary = {
    totalIssues: issues.length,
    criticalIssues: issues.filter((i) => i.priority === "CRITICAL").length,
    highIssues: issues.filter((i) => i.priority === "HIGH").length,
    activeIssues: issues.filter((i) => i.state === "ACTIVATED" || i.state === "CREATED").length,
    resolvedIssues: issues.filter((i) => i.state === "CLOSED" || i.state === "DEACTIVATED").length,
  };

  // Generate recommendations based on data
  const recommendations: string[] = [];

  if (summary.criticalIssues > 0) {
    recommendations.push(
      `There are ${summary.criticalIssues} critical issues that require immediate attention.`
    );
  }

  if (errorGroups.length > 0) {
    const topError = errorGroups[0];
    recommendations.push(
      `Most frequent error: "${topError.errorClass}" with ${topError.count} occurrences. Consider investigating this first.`
    );
  }

  if (deployments.length > 0 && summary.activeIssues > 0) {
    const latestDeployment = deployments[0];
    const deploymentTime = new Date(latestDeployment.timestamp).toISOString();
    recommendations.push(
      `Recent deployment at ${deploymentTime} may be related to active issues. Consider checking deployment impact.`
    );
  }

  if (summary.activeIssues === 0) {
    recommendations.push("No active issues. System appears to be healthy.");
  }

  return {
    summary,
    issues,
    errorGroups,
    recentDeployments: deployments,
    recommendations,
  };
}
