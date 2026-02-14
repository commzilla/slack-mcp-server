import type { SlackClientManager } from "../slack/client.js";
import { getThreadReplies } from "../slack/history.js";

export async function getThread(
  clientManager: SlackClientManager,
  profileId: string,
  channel: string,
  threadTs: string
): Promise<string> {
  const channelId = await resolveChannelId(clientManager, profileId, channel);

  const messages = await getThreadReplies(
    clientManager,
    profileId,
    channelId,
    threadTs
  );

  if (messages.length === 0) {
    return `No replies found for thread ${threadTs} in channel ${channel}.`;
  }

  const lines = messages.map((m, i) => {
    const user = m.username || m.user || "unknown";
    const isParent = i === 0 ? " (parent)" : "";
    return `[${m.ts}] ${user}${isParent}: ${m.text || "(no text)"}`;
  });

  return `**Thread ${threadTs} (${messages.length} messages):**\n${lines.join("\n")}`;
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
