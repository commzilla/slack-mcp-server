#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, getProfile } from "./config.js";
import { getDb, syncProfiles, closeDb } from "./db/database.js";
import { SlackClientManager } from "./slack/client.js";

// Import tools
import { listProfiles } from "./tools/list-profiles.js";
import { listChannels } from "./tools/list-channels.js";
import { readChannel } from "./tools/read-channel.js";
import { getThread } from "./tools/get-thread.js";
import { searchSlackMessages } from "./tools/search-messages.js";
import { getMyStyle } from "./tools/get-style.js";
import { sendMessageTool } from "./tools/send-message.js";
import { manageChannels } from "./tools/manage-channels.js";
import { getPendingRepliesTool } from "./tools/get-pending.js";

// --- Initialize (wrapped in try/catch for clear error messages) ---
let config: ReturnType<typeof loadConfig>;
let db: ReturnType<typeof getDb>;
let clientManager: SlackClientManager;

try {
  config = loadConfig();
  db = getDb(config);
  syncProfiles(db, config.profiles);
  clientManager = new SlackClientManager(config.profiles);

  console.error(
    `[mcp] Loaded ${config.profiles.length} profile(s). Primary: "${config.profiles.find((p) => p.is_primary)?.id}"`
  );
} catch (error) {
  console.error(
    `[mcp] Initialization failed: ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
}

// --- Create MCP Server ---
const server = new McpServer({
  name: "slack-assistant",
  version: "1.0.0",
});

// =============================================================
// Tool: list_profiles
// =============================================================
server.tool(
  "list_profiles",
  "List all configured Slack profiles",
  {},
  async () => {
    try {
      const result = listProfiles(config);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: list_channels
// =============================================================
server.tool(
  "list_channels",
  "List Slack channels the profile is a member of",
  {
    profile: z
      .string()
      .optional()
      .describe(
        "Profile ID to use. Omit for the primary profile."
      ),
    limit: z
      .number()
      .optional()
      .default(200)
      .describe("Maximum number of channels to return"),
  },
  async ({ profile, limit }) => {
    try {
      const p = getProfile(config, profile);
      const result = await listChannels(clientManager, p.id, limit);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: read_channel
// =============================================================
server.tool(
  "read_channel",
  "Read recent messages from a Slack channel",
  {
    profile: z
      .string()
      .optional()
      .describe("Profile ID. Omit for primary profile."),
    channel: z
      .string()
      .describe(
        "Channel name (e.g., #general) or channel ID (e.g., C0123456789)"
      ),
    limit: z
      .number()
      .optional()
      .default(30)
      .describe("Maximum number of messages to return"),
  },
  async ({ profile, channel, limit }) => {
    try {
      const p = getProfile(config, profile);
      const result = await readChannel(db, clientManager, p.id, channel, limit);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: get_thread
// =============================================================
server.tool(
  "get_thread",
  "Read all replies in a message thread",
  {
    profile: z
      .string()
      .optional()
      .describe("Profile ID. Omit for primary profile."),
    channel: z
      .string()
      .describe("Channel name or ID where the thread is"),
    thread_ts: z
      .string()
      .describe(
        "Timestamp of the parent message (e.g., 1234567890.123456)"
      ),
  },
  async ({ profile, channel, thread_ts }) => {
    try {
      const p = getProfile(config, profile);
      const result = await getThread(clientManager, p.id, channel, thread_ts);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: search_messages
// =============================================================
server.tool(
  "search_messages",
  "Search Slack messages using Slack search operators (e.g., from:@user, in:#channel, has:link)",
  {
    profile: z
      .string()
      .optional()
      .describe("Profile ID. Omit for primary profile."),
    query: z
      .string()
      .describe(
        'Search query. Supports Slack operators like "from:@user", "in:#channel", "has:link", "before:2025-01-01"'
      ),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of results"),
  },
  async ({ profile, query, limit }) => {
    try {
      const p = getProfile(config, profile);
      const result = await searchSlackMessages(
        clientManager,
        p.id,
        query,
        limit
      );
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: get_my_style
// =============================================================
server.tool(
  "get_my_style",
  "Get a profile's writing style for tone matching. Returns style analysis and sample messages to help match the user's voice.",
  {
    profile: z
      .string()
      .optional()
      .describe("Profile ID. Omit for primary profile."),
    refresh: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Set to true to re-analyze messages and update the cached style profile"
      ),
  },
  async ({ profile, refresh }) => {
    try {
      const p = getProfile(config, profile);
      const result = await getMyStyle(
        db,
        clientManager,
        config,
        p.id,
        refresh
      );
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: send_message
// =============================================================
server.tool(
  "send_message",
  "Send a message in a Slack channel as the specified profile. The message will appear as the user's personal profile (not a bot). IMPORTANT: Always draft the message first and show it to the user for approval before calling this tool.",
  {
    profile: z
      .string()
      .optional()
      .describe("Profile ID. Omit for primary profile."),
    channel: z
      .string()
      .describe("Channel name or ID to send the message to"),
    text: z.string().describe("The message text to send"),
    thread_ts: z
      .string()
      .optional()
      .describe(
        "If replying to a thread, the parent message timestamp"
      ),
  },
  async ({ profile, channel, text, thread_ts }) => {
    try {
      const p = getProfile(config, profile);
      const result = await sendMessageTool(
        db,
        clientManager,
        p.id,
        channel,
        text,
        thread_ts
      );
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: manage_channels
// =============================================================
server.tool(
  "manage_channels",
  "Add, remove, or list watched channels for a profile. Only watched channels are tracked by the background daemon.",
  {
    profile: z
      .string()
      .optional()
      .describe("Profile ID. Omit for primary profile."),
    action: z
      .enum(["add", "remove", "list"])
      .describe("Action to perform"),
    channel: z
      .string()
      .optional()
      .describe(
        'Channel name or ID. Required for "add" and "remove" actions.'
      ),
    priority: z
      .enum(["high", "normal", "low"])
      .optional()
      .default("normal")
      .describe(
        "Channel priority level. High-priority channels surface first in pending replies."
      ),
    description: z
      .string()
      .optional()
      .describe(
        "Optional description of the channel (helps Claude understand context)"
      ),
  },
  async ({ profile, action, channel, priority, description }) => {
    try {
      const p = getProfile(config, profile);
      const result = await manageChannels(
        db,
        clientManager,
        p.id,
        action,
        channel,
        priority,
        description
      );
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Tool: get_pending_replies
// =============================================================
server.tool(
  "get_pending_replies",
  "Get messages that likely need a reply from the user. Shows mentions, DMs, and thread follow-ups across one or all profiles, sorted by priority.",
  {
    profile: z
      .string()
      .optional()
      .describe(
        "Profile ID. Omit to get pending replies across ALL profiles."
      ),
    channel: z
      .string()
      .optional()
      .describe("Filter to a specific channel ID"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of pending items to return"),
  },
  async ({ profile, channel, limit }) => {
    try {
      const profileId = profile
        ? getProfile(config, profile).id
        : undefined;
      const result = getPendingRepliesTool(db, profileId, channel, limit);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// =============================================================
// Start the server
// =============================================================
async function main() {
  // Validate tokens on startup
  console.error("[mcp] Validating Slack tokens...");
  const authResults = await clientManager.validateAllTokens();

  for (const [profileId, result] of authResults) {
    if (!result.ok) {
      console.error(
        `[mcp] WARNING: Profile "${profileId}" failed auth: ${result.error}`
      );
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] Slack MCP Server running on stdio");
}

// Graceful shutdown
function shutdown(): void {
  console.error("[mcp] Shutting down...");
  closeDb();
  console.error("[mcp] Database closed. Goodbye.");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((error) => {
  console.error("[mcp] Fatal error:", error);
  process.exit(1);
});
