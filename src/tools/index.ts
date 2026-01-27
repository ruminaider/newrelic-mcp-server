/**
 * Tool registration index
 * All tools are registered here with the MCP server
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defaultLogger } from "../utils/logger.js";

// Phase 2: NRQL and Logs
import { registerNrqlTools } from "./nrql-tools.js";

// Phase 3: Entity Management
import { registerEntityTools } from "./entity-tools.js";
import { registerAccountTools } from "./account-tools.js";

// Phase 4: Alerts and Incidents
import { registerAlertTools } from "./alert-tools.js";
import { registerIncidentTools } from "./incident-tools.js";

// Phase 5: Dashboards, Synthetics, Performance
import { registerDashboardTools } from "./dashboard-tools.js";
import { registerSyntheticTools } from "./synthetic-tools.js";
import { registerPerformanceTools } from "./performance-tools.js";
import { registerUtilityTools } from "./utility-tools.js";

/**
 * Registers all tools with the MCP server
 */
export function registerAllTools(server: McpServer): void {
  defaultLogger.info("Registering all tools");

  // Tool count for logging
  let toolCount = 0;

  // Phase 2: Core Data Access Tools
  // - execute_nrql_query
  // - list_recent_logs
  // - analyze_entity_logs
  // - query_logs
  toolCount += registerNrqlTools(server);

  // Phase 3: Entity Management Tools
  // - get_entity
  // - list_related_entities
  // - search_entity_with_tag
  // - list_entity_types
  // - list_available_new_relic_accounts
  toolCount += registerEntityTools(server);
  toolCount += registerAccountTools(server);

  // Phase 4: Alerts & Incidents Tools
  // - list_alert_policies
  // - list_alert_conditions
  // - list_recent_issues
  // - search_incident
  // - analyze_deployment_impact
  // - generate_alert_insights_report
  // - get_entity_error_groups
  // - list_change_events
  toolCount += registerAlertTools(server);
  toolCount += registerIncidentTools(server);

  // Phase 5: Dashboards, Synthetics & Performance Tools
  // - get_dashboard
  // - list_dashboards
  // - list_synthetic_monitors
  // - analyze_golden_metrics
  // - analyze_transactions
  // - convert_time_period_to_epoch_ms
  toolCount += registerDashboardTools(server);
  toolCount += registerSyntheticTools(server);
  toolCount += registerPerformanceTools(server);
  toolCount += registerUtilityTools(server);

  // Phase 6: Additional Tools (TODO)
  // - natural_language_to_nrql_query

  defaultLogger.info(`Registered ${toolCount} tools`);
}
