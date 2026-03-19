# newrelic-mcp-server

A comprehensive MCP server for NewRelic with 25 tools for querying, monitoring, and analyzing your observability data — NRQL, entities, alerts, dashboards, logs, and more.

[![npm version](https://img.shields.io/npm/v/@ruminaider/newrelic-mcp-server)](https://www.npmjs.com/package/@ruminaider/newrelic-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick Start

### Using npx

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "newrelic": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@ruminaider/newrelic-mcp-server"],
      "env": {
        "NEW_RELIC_API_KEY": "NRAK-XXXXXXXXXXXX",
        "NEW_RELIC_ACCOUNT_ID": "1234567"
      }
    }
  }
}
```

### Using Docker

```bash
docker build -t newrelic-mcp-server .
```

```json
{
  "mcpServers": {
    "newrelic": {
      "type": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "NEW_RELIC_API_KEY", "-e", "NEW_RELIC_ACCOUNT_ID", "-e", "NEW_RELIC_REGION", "newrelic-mcp-server"],
      "env": {
        "NEW_RELIC_API_KEY": "NRAK-XXXXXXXXXXXX",
        "NEW_RELIC_ACCOUNT_ID": "1234567",
        "NEW_RELIC_REGION": "US"
      }
    }
  }
}
```

## Authentication

The server authenticates via a NewRelic **User API key** (recommended over license keys):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEW_RELIC_API_KEY` | Yes | - | User API key (format: `NRAK-XXXXXXXXXXXX`) |
| `NEW_RELIC_ACCOUNT_ID` | Yes | - | NewRelic Account ID |
| `NEW_RELIC_REGION` | No | `US` | API region (`US` or `EU`) |
| `LOG_LEVEL` | No | `info` | Log level (`debug` / `info` / `warn` / `error`) |

API keys are automatically redacted in log output.

## Performance

### Response Optimization

All tool responses use compact JSON (no whitespace) to reduce token usage. Tools that build structured response objects include only essential fields — verbose NerdGraph metadata like `__typename`, `permalink`, and `rawConfiguration` is stripped when raw API data is returned.

### Rate Limiting

The server enforces NewRelic's API limits:

- **25 concurrent requests** with semaphore-based backpressure
- **Exponential backoff** on 429 responses (base 1s, max 30s, with jitter)
- **Automatic retry** for rate limit and network errors (3 attempts)

## Tools

### Data Access — 5 tools

| Tool | Description |
|------|-------------|
| `execute_nrql_query` | Execute arbitrary NRQL queries with full result parsing |
| `list_recent_logs` | List recent logs with filtering by time range and entity |
| `analyze_entity_logs` | Analyze logs for a specific entity with pattern detection |
| `query_logs` | Search logs by field/value with configurable limits |
| `natural_language_to_nrql_query` | Get NRQL query suggestions from natural language descriptions |

### Entity Management — 5 tools

| Tool | Description |
|------|-------------|
| `get_entity` | Get entity details by GUID including summary metrics |
| `list_related_entities` | Find entities related to a given entity |
| `search_entity_with_tag` | Search entities by tag key/value pairs |
| `list_entity_types` | List all available entity types and domains |
| `list_available_new_relic_accounts` | List accessible NewRelic accounts |

### Alerts & Incidents — 8 tools

| Tool | Description |
|------|-------------|
| `list_alert_policies` | List alert policies with condition counts |
| `list_alert_conditions` | List NRQL alert conditions for a policy |
| `list_recent_issues` | List recent AI-detected issues (experimental) |
| `search_incident` | Search incidents by time range and entity |
| `analyze_deployment_impact` | Analyze deployment effects on error rates and throughput |
| `generate_alert_insights_report` | Generate comprehensive alert analysis reports |
| `get_entity_error_groups` | Get error groups for an entity with occurrence counts |
| `list_change_events` | List deployment and change tracking events |

### Dashboards & Synthetics — 3 tools

| Tool | Description |
|------|-------------|
| `get_dashboard` | Get dashboard details including widgets and NRQL queries |
| `list_dashboards` | List all dashboards with pagination |
| `list_synthetic_monitors` | List synthetic monitors with status and locations |

### Performance Analysis — 3 tools

| Tool | Description |
|------|-------------|
| `analyze_golden_metrics` | Analyze entity golden metrics (throughput, errors, latency) |
| `analyze_transactions` | Analyze transaction performance with slowest breakdown |
| `convert_time_period_to_epoch_ms` | Convert human-readable time periods to epoch milliseconds |

### Utility — 1 tool

| Tool | Description |
|------|-------------|
| `convert_time_period_to_epoch_ms` | Convert time descriptions like "last 6 hours" to epoch timestamps |

## Example Usage

### Query Error Rates

```
execute_nrql_query with:
  query: "SELECT percentage(count(*), WHERE error IS true) FROM Transaction SINCE 1 hour ago"
```

### Find Slow Transactions

```
analyze_transactions with:
  entityGuid: "YOUR_APM_ENTITY_GUID"
  sinceMinutesAgo: 60
```

### Search Logs for Errors

```
query_logs with:
  field: "level"
  value: "ERROR"
  limit: 100
```

### Get Help Writing NRQL

```
natural_language_to_nrql_query with:
  description: "Show me error rates by service over the last 6 hours"
```

## Development

```bash
pnpm install       # install dependencies
pnpm build         # compile TypeScript
pnpm test          # run tests
pnpm dev           # run with tsx (no build needed)
pnpm watch         # recompile on change
pnpm lint          # lint with Biome
pnpm format        # format with Biome
```

### Project Structure

```
src/
  index.ts                    # Entry point (stdio transport)
  server.ts                   # MCP server creation and tool registration
  config.ts                   # Environment variable parsing and validation
  services/
    nerdgraph-client.ts       # Core GraphQL client with rate limiting and retry
    nrql-service.ts           # NRQL query execution
    log-service.ts            # Log querying and analysis
    entity-service.ts         # Entity retrieval and relationships
    alert-service.ts          # Alert policies, conditions, and incidents
    dashboard-service.ts      # Dashboard retrieval and listing
    synthetic-service.ts      # Synthetic monitor management
    performance-service.ts    # Transaction and golden metrics analysis
  tools/
    nrql-tools.ts             # NRQL query tools
    entity-tools.ts           # Entity management tools
    alert-tools.ts            # Alert and incident tools
    incident-tools.ts         # Incident search and analysis tools
    dashboard-tools.ts        # Dashboard tools
    log-tools.ts              # Log query tools
    performance-tools.ts      # Performance analysis tools
    synthetic-tools.ts        # Synthetic monitor tools
    account-tools.ts          # Account listing tools
    utility-tools.ts          # Time conversion utilities
  types/
    newrelic.ts               # NewRelic API type definitions
  utils/
    errors.ts                 # Custom error types (AuthenticationError, RateLimitError, etc.)
    logger.ts                 # Structured stderr logging with API key redaction
    response.ts               # Response optimization (field stripping, compact JSON)
    retry.ts                  # Exponential backoff retry with jitter
```

### Docker Development

```bash
docker compose build                              # build image
docker compose run --rm newrelic-mcp               # run server
docker compose --profile dev up newrelic-mcp-dev   # dev mode with hot reload
```

## Troubleshooting

### "Missing required environment variables"

Ensure `NEW_RELIC_API_KEY` and `NEW_RELIC_ACCOUNT_ID` are set and passed to Docker.

### "Authentication failed"

Verify your API key has appropriate permissions. User API keys (NRAK-...) are recommended.

### "Rate limit exceeded"

The server automatically retries with backoff. If persistent, reduce query frequency.

### aiIssues endpoints failing

These use experimental NerdGraph headers. The server handles this automatically for `list_recent_issues` and `search_incident`.

## License

MIT
