# NewRelic MCP Server

A full-featured Model Context Protocol (MCP) server for NewRelic, providing 26+ tools for querying, monitoring, and analyzing NewRelic data from Claude Code sessions.

## Features

- **26+ Tools** covering all major NewRelic capabilities
- **Stdio Transport** for reliable multi-session support via Docker
- **Rate Limiting** with exponential backoff (25 concurrent requests)
- **Full NerdGraph API** coverage including experimental aiIssues endpoints
- **Production Ready** with comprehensive error handling and logging

## Quick Start

### Prerequisites

- Docker Desktop running
- NewRelic User API key
- NewRelic Account ID

### Build the Image

```bash
docker build -t newrelic-mcp:local .
```

### Configure Environment

Create a `.env` file (or export these variables):

```bash
export NEW_RELIC_API_KEY="NRAK-XXXXXXXXXXXX"
export NEW_RELIC_ACCOUNT_ID="1234567"
export NEW_RELIC_REGION="US"  # or EU
```

### Add to Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "newrelic": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "NEW_RELIC_API_KEY",
        "-e", "NEW_RELIC_ACCOUNT_ID",
        "-e", "NEW_RELIC_REGION",
        "newrelic-mcp:local"
      ],
      "env": {
        "NEW_RELIC_API_KEY": "${NEW_RELIC_API_KEY}",
        "NEW_RELIC_ACCOUNT_ID": "${NEW_RELIC_ACCOUNT_ID}",
        "NEW_RELIC_REGION": "US"
      }
    }
  }
}
```

## Available Tools

### Data Access (5 tools)

| Tool | Description |
|------|-------------|
| `execute_nrql_query` | Execute arbitrary NRQL queries |
| `list_recent_logs` | List recent logs with filtering |
| `analyze_entity_logs` | Analyze logs for a specific entity |
| `query_logs` | Search logs by field/value |
| `natural_language_to_nrql_query` | Get NRQL query suggestions from natural language |

### Entity Management (5 tools)

| Tool | Description |
|------|-------------|
| `get_entity` | Get entity details by GUID |
| `list_related_entities` | Find related entities |
| `search_entity_with_tag` | Search entities by tags |
| `list_entity_types` | List available entity types |
| `list_available_new_relic_accounts` | List accessible accounts |

### Alerts & Incidents (8 tools)

| Tool | Description |
|------|-------------|
| `list_alert_policies` | List alert policies |
| `list_alert_conditions` | List NRQL alert conditions |
| `list_recent_issues` | List recent AI issues |
| `search_incident` | Search incidents |
| `analyze_deployment_impact` | Analyze deployment effects |
| `generate_alert_insights_report` | Generate alert reports |
| `get_entity_error_groups` | Get error groups for entity |
| `list_change_events` | List deployment/change events |

### Dashboards & Synthetics (3 tools)

| Tool | Description |
|------|-------------|
| `get_dashboard` | Get dashboard details |
| `list_dashboards` | List all dashboards |
| `list_synthetic_monitors` | List synthetic monitors |

### Performance Analysis (4 tools)

| Tool | Description |
|------|-------------|
| `analyze_golden_metrics` | Analyze entity golden metrics |
| `analyze_transactions` | Analyze transaction performance |
| `analyze_entity_logs` | Analyze entity logs (in Data Access) |
| `convert_time_period_to_epoch_ms` | Time period utility |

## Example Usage

### Query Error Rates

```
Use execute_nrql_query with:
query: "SELECT percentage(count(*), WHERE error IS true) FROM Transaction SINCE 1 hour ago"
```

### Find Slow Transactions

```
Use analyze_transactions with:
entityGuid: "YOUR_APM_ENTITY_GUID"
sinceMinutesAgo: 60
```

### Search Logs for Errors

```
Use query_logs with:
field: "level"
value: "ERROR"
limit: 100
```

### Get Help Writing NRQL

```
Use natural_language_to_nrql_query with:
description: "Show me error rates by service over the last 6 hours"
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Run tests
npm test

# Build
npm run build

# Run locally (requires env vars)
npm run dev
```

### Docker Development

```bash
# Build and run
docker compose build
docker compose run --rm newrelic-mcp

# Development mode with hot reload
docker compose --profile dev up newrelic-mcp-dev
```

## Architecture

```
src/
├── index.ts          # Entry point
├── server.ts         # MCP server setup
├── config.ts         # Environment configuration
├── services/         # NerdGraph API services
│   ├── nerdgraph-client.ts
│   ├── entity-service.ts
│   ├── alert-service.ts
│   ├── nrql-service.ts
│   └── ...
├── tools/            # MCP tool definitions
│   ├── nrql-tools.ts
│   ├── entity-tools.ts
│   ├── alert-tools.ts
│   └── ...
├── types/            # TypeScript types
└── utils/            # Utilities (logger, retry, errors)
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `NEW_RELIC_API_KEY` | Yes | - | NewRelic User API key |
| `NEW_RELIC_ACCOUNT_ID` | Yes | - | NewRelic Account ID |
| `NEW_RELIC_REGION` | No | `US` | API region (US or EU) |
| `LOG_LEVEL` | No | `info` | Log level (debug/info/warn/error) |

## Rate Limiting

The server implements NewRelic's rate limits:
- **25 concurrent requests** per user
- **Exponential backoff** on 429 responses
- **Automatic retry** for rate limit and network errors

## Troubleshooting

### "Missing required environment variables"

Ensure `NEW_RELIC_API_KEY` and `NEW_RELIC_ACCOUNT_ID` are set and passed to Docker.

### "Authentication failed"

Verify your API key has appropriate permissions. User API keys are recommended over license keys.

### "Rate limit exceeded"

The server automatically retries. If persistent, reduce query frequency.

### aiIssues endpoints failing

These require experimental headers. The server handles this automatically for `list_recent_issues` and `search_incident`.

## License

MIT
