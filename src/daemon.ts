#!/usr/bin/env node

/**
 * Socket Mode Daemon
 *
 * Runs as a background process (via PM2) to listen for Slack messages
 * in real-time and store them in SQLite for the MCP server to read.
 *
 * Spawns one SocketModeClient per profile, each connected to its own
 * Slack workspace via the profile's app-level token (xapp-).
 */

import { loadConfig } from "./config.js";
import { getDb, syncProfiles, closeDb } from "./db/database.js";
import { createSocketModeClient, setupEventHandlers } from "./slack/events.js";
import type { SocketModeClient } from "@slack/socket-mode";

const config = loadConfig();
const db = getDb(config);
syncProfiles(db, config.profiles);

console.error(
  `[daemon] Starting with ${config.profiles.length} profile(s)...`
);

const clients: Map<string, SocketModeClient> = new Map();
const cleanups: Array<() => void> = [];

async function startAll(): Promise<void> {
  const startPromises = config.profiles.map(async (profile) => {
    try {
      console.error(`[daemon] Connecting profile "${profile.id}"...`);

      const socketClient = createSocketModeClient(profile);
      const { cleanup } = setupEventHandlers(socketClient, db, profile);
      clients.set(profile.id, socketClient);
      cleanups.push(cleanup);

      await socketClient.start();
      console.error(
        `[daemon] Profile "${profile.id}" connected successfully.`
      );
    } catch (error) {
      console.error(
        `[daemon] Failed to start profile "${profile.id}":`,
        error instanceof Error ? error.message : error
      );
    }
  });

  await Promise.allSettled(startPromises);

  const connected = [...clients.keys()];
  console.error(
    `[daemon] ${connected.length}/${config.profiles.length} profiles connected: ${connected.join(", ")}`
  );
}

// Graceful shutdown
function shutdown(): void {
  console.error("[daemon] Shutting down...");

  // Clear all cache refresh intervals first (prevents access to closed db)
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      console.error("[daemon] Error during cleanup:", error);
    }
  }

  for (const [profileId, client] of clients) {
    try {
      client.disconnect();
      console.error(`[daemon] Disconnected profile "${profileId}".`);
    } catch (error) {
      console.error(
        `[daemon] Error disconnecting "${profileId}":`,
        error
      );
    }
  }

  closeDb();
  console.error("[daemon] Database closed. Goodbye.");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (error) => {
  console.error("[daemon] Uncaught exception:", error);
  // Don't exit — let PM2 decide
});
process.on("unhandledRejection", (reason) => {
  console.error("[daemon] Unhandled rejection:", reason);
});

// Start
startAll().catch((error) => {
  console.error("[daemon] Fatal error during startup:", error);
  process.exit(1);
});
