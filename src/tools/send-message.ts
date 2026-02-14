import type Database from "better-sqlite3";
import type { SlackClientManager } from "../slack/client.js";
import { sendMessage as slackSendMessage } from "../slack/sender.js";
import { markAsReplied } from "../db/messages.js";

export async function sendMessageTool(
  db: Database.Database,
  clientManager: SlackClientManager,
  profileId: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<string> {
  const channelId = await resolveChannelId(clientManager, profileId, channel);

  const result = await slackSendMessage(
    clientManager,
    profileId,
    channelId,
    text,
    threadTs
  );

  // If replying to a thread, mark the parent as replied
  if (threadTs) {
    try {
      markAsReplied(db, profileId, result.channel, threadTs);
    } catch {
      // Non-critical, don't fail the send
    }
  }

  const threadInfo = threadTs ? ` (in thread ${threadTs})` : "";

  return [
    `**Message sent successfully!**`,
    `- **Profile:** ${profileId}`,
    `- **Channel:** ${result.channel}${threadInfo}`,
    `- **Timestamp:** ${result.ts}`,
    `- **Text:** ${result.message_text}`,
  ].join("\n");
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
