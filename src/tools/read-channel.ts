import type Database from "better-sqlite3";
import type { SlackClientManager } from "../slack/client.js";
import { getChannelMessages } from "../db/messages.js";
import { getChannelHistory } from "../slack/history.js";

export async function readChannel(
  db: Database.Database,
  clientManager: SlackClientManager,
  profileId: string,
  channel: string,
  limit: number = 30
): Promise<string> {
  // Try to resolve channel name to ID if needed
  const channelId = await resolveChannelId(clientManager, profileId, channel);

  // First try SQLite cache
  const cached = getChannelMessages(db, profileId, channelId, limit);

  if (cached.length > 0) {
    const lines = cached.map((m) => {
      const user = m.username || m.user_id;
      const thread = m.thread_ts ? ` [thread: ${m.thread_ts}]` : "";
      const flag = m.needs_reply && !m.replied ? " ⚠️ NEEDS REPLY" : "";
      return `[${m.ts}] ${user}: ${m.text}${thread}${flag}`;
    });

    return `**Channel messages (${cached.length}, from cache):**\n${lines.join("\n")}`;
  }

  // Fallback to API
  const messages = await getChannelHistory(
    clientManager,
    profileId,
    channelId,
    limit
  );

  if (messages.length === 0) {
    return `No messages found in channel ${channel}.`;
  }

  const lines = messages.map((m) => {
    const user = m.username || m.user || "unknown";
    const thread = m.thread_ts ? ` [thread: ${m.thread_ts}]` : "";
    return `[${m.ts}] ${user}: ${m.text || "(no text)"}${thread}`;
  });

  return `**Channel messages (${messages.length}, from API):**\n${lines.join("\n")}`;
}

async function resolveChannelId(
  clientManager: SlackClientManager,
  profileId: string,
  channel: string
): Promise<string> {
  // If it already looks like a channel ID (starts with C, D, or G)
  if (/^[CDG][A-Z0-9]+$/.test(channel)) {
    return channel;
  }

  // Strip # prefix if present
  const channelName = channel.replace(/^#/, "");

  // Look up by name
  const { userClient } = clientManager.getClients(profileId);

  let cursor: string | undefined;
  do {
    const result = await userClient.conversations.list({
      limit: 200,
      cursor,
      types: "public_channel,private_channel",
      exclude_archived: true,
    });

    if (result.channels) {
      const found = result.channels.find((ch) => ch.name === channelName);
      if (found) return found.id as string;
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  throw new Error(
    `Channel "${channel}" not found. Try using the channel ID (e.g., C0123456789) or ensure the profile is a member of this channel.`
  );
}
