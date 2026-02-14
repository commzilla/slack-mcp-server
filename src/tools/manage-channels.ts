import type Database from "better-sqlite3";
import type { SlackClientManager } from "../slack/client.js";
import {
  addWatchedChannel,
  removeWatchedChannel,
  getWatchedChannels,
} from "../db/messages.js";
import { listChannels } from "../slack/history.js";

export async function manageChannels(
  db: Database.Database,
  clientManager: SlackClientManager,
  profileId: string,
  action: "add" | "remove" | "list",
  channel?: string,
  priority?: "high" | "normal" | "low",
  description?: string
): Promise<string> {
  switch (action) {
    case "list": {
      const channels = getWatchedChannels(db, profileId);

      if (channels.length === 0) {
        return `No watched channels for profile "${profileId}". Use manage_channels with action "add" to start watching channels.`;
      }

      const lines = channels.map((ch) => {
        const desc = ch.description ? ` — ${ch.description}` : "";
        const prio =
          ch.priority === "normal" ? "" : ` [${ch.priority.toUpperCase()}]`;
        return `- #${ch.channel_name} (${ch.channel_id})${prio}${desc}`;
      });

      return `**Watched channels for "${profileId}" (${channels.length}):**\n${lines.join("\n")}`;
    }

    case "add": {
      if (!channel) {
        throw new Error(
          'Channel is required for "add" action. Provide a channel name (e.g., "#general") or ID.'
        );
      }

      // Resolve channel name to ID
      const resolved = await resolveChannel(clientManager, profileId, channel);

      addWatchedChannel(
        db,
        profileId,
        resolved.id,
        resolved.name,
        priority || "normal",
        description
      );

      const prioLabel = priority ? ` with ${priority} priority` : "";
      return `Added #${resolved.name} (${resolved.id}) to watched channels for "${profileId}"${prioLabel}.`;
    }

    case "remove": {
      if (!channel) {
        throw new Error(
          'Channel is required for "remove" action. Provide a channel name or ID.'
        );
      }

      const resolved = await resolveChannel(clientManager, profileId, channel);
      removeWatchedChannel(db, profileId, resolved.id);

      return `Removed #${resolved.name} (${resolved.id}) from watched channels for "${profileId}".`;
    }

    default:
      throw new Error(
        `Invalid action "${action}". Must be "add", "remove", or "list".`
      );
  }
}

async function resolveChannel(
  clientManager: SlackClientManager,
  profileId: string,
  channel: string
): Promise<{ id: string; name: string }> {
  // Already an ID
  if (/^[CDG][A-Z0-9]+$/.test(channel)) {
    // Try to get the name
    try {
      const { userClient } = clientManager.getClients(profileId);
      const info = await userClient.conversations.info({ channel });
      return {
        id: channel,
        name: (info.channel as Record<string, unknown>)?.name as string || channel,
      };
    } catch {
      return { id: channel, name: channel };
    }
  }

  // Strip # prefix
  const channelName = channel.replace(/^#/, "");

  // Look up by name
  const channels = await listChannels(clientManager, profileId, 1000);
  const found = channels.find((ch) => ch.name === channelName);

  if (!found) {
    throw new Error(
      `Channel "${channel}" not found for profile "${profileId}". Make sure the profile is a member of this channel.`
    );
  }

  return { id: found.id, name: found.name };
}
