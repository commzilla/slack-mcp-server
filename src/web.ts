#!/usr/bin/env node

/**
 * Web Admin Dashboard
 *
 * Lightweight HTTP server for managing the Slack MCP system.
 * Uses Node.js built-in http module — zero additional dependencies.
 *
 * Endpoints serve JSON for interactive UI components and
 * tool text output for display-only views.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { loadConfig, getProfile, type AppConfig } from "./config.js";
import { getDb, syncProfiles, closeDb } from "./db/database.js";
import {
  getWatchedChannels,
  getPendingReplies,
  addWatchedChannel,
  removeWatchedChannel,
} from "./db/messages.js";
import { listChannels } from "./slack/history.js";
import { SlackClientManager } from "./slack/client.js";
import { readChannel } from "./tools/read-channel.js";
import { getThread } from "./tools/get-thread.js";
import { searchSlackMessages } from "./tools/search-messages.js";
import { getMyStyle } from "./tools/get-style.js";
import { sendMessageTool } from "./tools/send-message.js";
import { getHtml } from "./web-ui.js";
import type Database from "better-sqlite3";

// ─── Initialization (same pattern as daemon.ts) ───

let config: AppConfig;
let db: Database.Database;
let clientManager: SlackClientManager;

try {
  config = loadConfig();
  db = getDb(config);
  syncProfiles(db, config.profiles);
  clientManager = new SlackClientManager(config.profiles);
  console.error(
    `[web] Initialized with ${config.profiles.length} profile(s).`
  );
} catch (error) {
  console.error("[web] Fatal: Failed to initialize:", error);
  process.exit(1);
}

// ─── Helpers ───

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.substring(idx + 1) : "");
}

function parsePath(url: string): string {
  const idx = url.indexOf("?");
  return idx >= 0 ? url.substring(0, idx) : url;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function getProfileId(q: URLSearchParams): string {
  return q.get("profile") || clientManager.getPrimaryProfileId();
}

// ─── Route Handlers ───

async function handleProfiles(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const data = config.profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    is_primary: p.is_primary,
    user_id: p.user_id,
  }));
  json(res, { ok: true, data });
}

async function handleChannels(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const q = parseQuery(req.url || "");
  const profileId = getProfileId(q);
  const limit = parseInt(q.get("limit") || "500", 10);

  try {
    const channels = await listChannels(clientManager, profileId, limit);
    json(res, { ok: true, data: channels });
  } catch (error) {
    json(res, { ok: false, error: errorMsg(error) }, 500);
  }
}

async function handleWatchedChannels(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const method = req.method?.toUpperCase();

  if (method === "GET") {
    const q = parseQuery(req.url || "");
    const profileId = getProfileId(q);
    const data = getWatchedChannels(db, profileId);
    json(res, { ok: true, data });
    return;
  }

  if (method === "POST") {
    const body = await readBody(req);
    const profileId = (body.profile as string) || clientManager.getPrimaryProfileId();
    const channel = body.channel as string;
    const priority = (body.priority as "high" | "normal" | "low") || "normal";
    const description = body.description as string | undefined;

    if (!channel) {
      json(res, { ok: false, error: "channel is required" }, 400);
      return;
    }

    try {
      // Resolve channel name if needed
      const channelInfo = await resolveChannelForAdd(profileId, channel);
      addWatchedChannel(db, profileId, channelInfo.id, channelInfo.name, priority, description);
      json(res, { ok: true, message: `Added #${channelInfo.name} to watched channels.` });
    } catch (error) {
      json(res, { ok: false, error: errorMsg(error) }, 500);
    }
    return;
  }

  if (method === "DELETE") {
    const body = await readBody(req);
    const profileId = (body.profile as string) || clientManager.getPrimaryProfileId();
    const channel = body.channel as string;

    if (!channel) {
      json(res, { ok: false, error: "channel is required" }, 400);
      return;
    }

    try {
      removeWatchedChannel(db, profileId, channel);
      json(res, { ok: true, message: "Channel removed from watched list." });
    } catch (error) {
      json(res, { ok: false, error: errorMsg(error) }, 500);
    }
    return;
  }

  json(res, { ok: false, error: "Method not allowed" }, 405);
}

async function handleMessages(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const q = parseQuery(req.url || "");
  const profileId = getProfileId(q);
  const channel = q.get("channel");
  const limit = parseInt(q.get("limit") || "30", 10);

  if (!channel) {
    json(res, { ok: false, error: "channel is required" }, 400);
    return;
  }

  try {
    const text = await readChannel(db, clientManager, profileId, channel, limit);
    json(res, { ok: true, text });
  } catch (error) {
    json(res, { ok: false, error: errorMsg(error) }, 500);
  }
}

async function handleThread(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const q = parseQuery(req.url || "");
  const profileId = getProfileId(q);
  const channel = q.get("channel");
  const threadTs = q.get("thread_ts");

  if (!channel || !threadTs) {
    json(res, { ok: false, error: "channel and thread_ts are required" }, 400);
    return;
  }

  try {
    const text = await getThread(clientManager, profileId, channel, threadTs);
    json(res, { ok: true, text });
  } catch (error) {
    json(res, { ok: false, error: errorMsg(error) }, 500);
  }
}

async function handlePending(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const q = parseQuery(req.url || "");
  const profileId = q.get("profile") || undefined;
  const limit = parseInt(q.get("limit") || "50", 10);

  const data = getPendingReplies(db, profileId, undefined, limit);
  json(res, { ok: true, data });
}

async function handleSearch(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const q = parseQuery(req.url || "");
  const profileId = getProfileId(q);
  const query = q.get("query");
  const limit = parseInt(q.get("limit") || "20", 10);

  if (!query) {
    json(res, { ok: false, error: "query is required" }, 400);
    return;
  }

  try {
    const text = await searchSlackMessages(clientManager, profileId, query, limit);
    json(res, { ok: true, text });
  } catch (error) {
    json(res, { ok: false, error: errorMsg(error) }, 500);
  }
}

async function handleStyle(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const q = parseQuery(req.url || "");
  const profileId = getProfileId(q);
  const refresh = q.get("refresh") === "true";

  try {
    const text = await getMyStyle(db, clientManager, config, profileId, refresh);
    json(res, { ok: true, text });
  } catch (error) {
    json(res, { ok: false, error: errorMsg(error) }, 500);
  }
}

async function handleSend(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method?.toUpperCase() !== "POST") {
    json(res, { ok: false, error: "Method not allowed" }, 405);
    return;
  }

  const body = await readBody(req);
  const profileId = (body.profile as string) || clientManager.getPrimaryProfileId();
  const channel = body.channel as string;
  const text = body.text as string;
  const threadTs = body.thread_ts as string | undefined;

  if (!channel || !text) {
    json(res, { ok: false, error: "channel and text are required" }, 400);
    return;
  }

  try {
    const result = await sendMessageTool(db, clientManager, profileId, channel, text, threadTs);
    json(res, { ok: true, message: result });
  } catch (error) {
    json(res, { ok: false, error: errorMsg(error) }, 500);
  }
}

// ─── Channel Resolution for Add ───

async function resolveChannelForAdd(
  profileId: string,
  channel: string
): Promise<{ id: string; name: string }> {
  // Already an ID
  if (/^[CDG][A-Z0-9]+$/.test(channel)) {
    try {
      const { userClient } = clientManager.getClients(profileId);
      const info = await userClient.conversations.info({ channel });
      return {
        id: channel,
        name: ((info.channel as Record<string, unknown>)?.name as string) || channel,
      };
    } catch {
      return { id: channel, name: channel };
    }
  }

  // Name-based lookup
  const channelName = channel.replace(/^#/, "");
  const channels = await listChannels(clientManager, profileId, 1000);
  const found = channels.find((ch) => ch.name === channelName);

  if (!found) {
    throw new Error(`Channel "${channel}" not found.`);
  }

  return { id: found.id, name: found.name };
}

// ─── Error Helper ───

function errorMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Router ───

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const method = req.method?.toUpperCase() || "GET";
  const path = parsePath(req.url || "/");

  // CORS preflight
  if (method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    switch (path) {
      case "/":
        html(res, getHtml());
        break;
      case "/api/profiles":
        await handleProfiles(req, res);
        break;
      case "/api/channels":
        await handleChannels(req, res);
        break;
      case "/api/channels/watched":
        await handleWatchedChannels(req, res);
        break;
      case "/api/messages":
        await handleMessages(req, res);
        break;
      case "/api/thread":
        await handleThread(req, res);
        break;
      case "/api/pending":
        await handlePending(req, res);
        break;
      case "/api/search":
        await handleSearch(req, res);
        break;
      case "/api/style":
        await handleStyle(req, res);
        break;
      case "/api/send":
        await handleSend(req, res);
        break;
      default:
        json(res, { ok: false, error: "Not found" }, 404);
    }
  } catch (error) {
    console.error("[web] Unhandled error:", error);
    json(res, { ok: false, error: errorMsg(error) }, 500);
  }
}

// ─── Server ───

const PORT = parseInt(process.env.WEB_PORT || "3456", 10);

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error("[web] Request error:", error);
    if (!res.headersSent) {
      json(res, { ok: false, error: "Internal server error" }, 500);
    }
  });
});

server.listen(PORT, () => {
  console.error(`[web] Admin dashboard running at http://0.0.0.0:${PORT}`);
});

// ─── Graceful Shutdown ───

function shutdown(): void {
  console.error("[web] Shutting down...");
  server.close(() => {
    closeDb();
    console.error("[web] Server closed. Goodbye.");
    process.exit(0);
  });

  // Force close after 5s
  setTimeout(() => {
    console.error("[web] Force closing.");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (error) => {
  console.error("[web] Uncaught exception:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[web] Unhandled rejection:", reason);
});
