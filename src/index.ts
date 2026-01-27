#!/usr/bin/env node
/**
 * Entry point for the NewRelic MCP server
 */

import { loadConfig } from "./config.js";
import { defaultLogger } from "./utils/logger.js";
import { initializeNerdGraphClient } from "./services/nerdgraph-client.js";
import { createMcpServer, startServer } from "./server.js";

const VERSION = "1.0.0";

async function main(): Promise<void> {
  try {
    defaultLogger.info(`Starting NewRelic MCP Server v${VERSION}`);

    // Load and validate configuration
    const config = loadConfig();
    defaultLogger.setLevel(config.server.logLevel);

    defaultLogger.info("Configuration loaded", {
      region: config.newRelic.region,
      accountId: config.newRelic.accountId,
      serverName: config.server.name,
    });

    // Initialize NerdGraph client
    initializeNerdGraphClient(config.newRelic);

    // Create and start MCP server
    const server = createMcpServer({ config: config.server });
    await startServer(server);

    // Handle shutdown signals
    process.on("SIGINT", async () => {
      defaultLogger.info("Received SIGINT, shutting down...");
      await server.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      defaultLogger.info("Received SIGTERM, shutting down...");
      await server.close();
      process.exit(0);
    });

    defaultLogger.info("MCP server is running. Press Ctrl+C to stop.");
  } catch (error) {
    defaultLogger.error("Failed to start MCP server", error);
    process.exit(1);
  }
}

main().catch((error) => {
  defaultLogger.error("Unhandled error", error);
  process.exit(1);
});
