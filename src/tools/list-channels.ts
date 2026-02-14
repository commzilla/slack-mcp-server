import type { SlackClientManager } from "../slack/client.js";
import { listChannels as slackListChannels } from "../slack/history.js";

export async function listChannels(
  clientManager: SlackClientManager,
  profileId: string,
  limit: number = 200
): Promise<string> {
  const channels = await slackListChannels(clientManager, profileId, limit);

  if (channels.length === 0) {
    return `No channels found for profile "${profileId}". The user may not be a member of any channels.`;
  }

  const lines = channels.map(
    (ch) => `- #${ch.name} (${ch.id}) — ${ch.num_members} members`
  );

  return `**Channels for profile "${profileId}" (${channels.length}):**\n${lines.join("\n")}`;
}
