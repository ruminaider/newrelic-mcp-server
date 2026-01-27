/**
 * Configuration module for the NewRelic MCP server
 * Loads and validates environment variables
 */

export interface NewRelicConfig {
  /** NewRelic User API key */
  apiKey: string;
  /** NewRelic Account ID */
  accountId: string;
  /** NewRelic region (US or EU) */
  region: "US" | "EU";
}

export interface ServerConfig {
  /** Server name for MCP identification */
  name: string;
  /** Server version */
  version: string;
  /** Log level */
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface Config {
  newRelic: NewRelicConfig;
  server: ServerConfig;
}

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  "NEW_RELIC_API_KEY",
  "NEW_RELIC_ACCOUNT_ID",
] as const;

/**
 * Validates that all required environment variables are present
 * @throws Error if any required variable is missing
 */
function validateEnvVars(): void {
  const missing: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

/**
 * Loads configuration from environment variables
 * @returns Validated configuration object
 */
export function loadConfig(): Config {
  validateEnvVars();

  const region = (process.env.NEW_RELIC_REGION || "US").toUpperCase();
  if (region !== "US" && region !== "EU") {
    throw new Error(`Invalid NEW_RELIC_REGION: ${region}. Must be US or EU.`);
  }

  return {
    newRelic: {
      apiKey: process.env.NEW_RELIC_API_KEY!,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID!,
      region: region as "US" | "EU",
    },
    server: {
      name: process.env.SERVER_NAME || "newrelic-mcp-server",
      version: process.env.SERVER_VERSION || "1.0.0",
      logLevel: (process.env.LOG_LEVEL || "info") as
        | "debug"
        | "info"
        | "warn"
        | "error",
    },
  };
}

/**
 * Global config instance - initialized once at startup
 */
let globalConfig: Config | null = null;

/**
 * Gets the global configuration, loading it if necessary
 */
export function getConfig(): Config {
  if (!globalConfig) {
    globalConfig = loadConfig();
  }
  return globalConfig;
}
