import type { SlackClientManager } from "../slack/client.js";
import { searchMessages } from "../slack/history.js";

export async function searchSlackMessages(
  clientManager: SlackClientManager,
  profileId: string,
  query: string,
  limit: number = 20
): Promise<string> {
  const matches = await searchMessages(clientManager, profileId, query, limit);

  if (matches.length === 0) {
    return `No messages found for query "${query}".`;
  }

  const lines = matches.map((m) => {
    const channelName = m.channel?.name || "unknown";
    return `[${m.ts}] #${channelName} — ${m.username || m.user}: ${m.text}`;
  });

  return `**Search results for "${query}" (${matches.length}):**\n${lines.join("\n")}`;
}
