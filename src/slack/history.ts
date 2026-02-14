import type { SlackClientManager } from "./client.js";

export interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  reply_count?: number;
  subtype?: string;
  username?: string;
}

export interface SearchMatch {
  ts: string;
  channel: { id: string; name: string };
  user: string;
  username: string;
  text: string;
  permalink: string;
}

export async function getChannelHistory(
  clientManager: SlackClientManager,
  profileId: string,
  channelId: string,
  limit: number = 50
): Promise<SlackMessage[]> {
  const { userClient } = clientManager.getClients(profileId);
  const allMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const result = await userClient.conversations.history({
      channel: channelId,
      limit: Math.min(limit - allMessages.length, 100),
      cursor,
    });

    if (result.messages) {
      allMessages.push(...(result.messages as SlackMessage[]));
    }

    cursor = result.response_metadata?.next_cursor;

    if (allMessages.length >= limit || !result.has_more) break;
  } while (cursor);

  return allMessages.slice(0, limit).reverse(); // Chronological order
}

export async function getThreadReplies(
  clientManager: SlackClientManager,
  profileId: string,
  channelId: string,
  threadTs: string
): Promise<SlackMessage[]> {
  const { userClient } = clientManager.getClients(profileId);
  const allMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const result = await userClient.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 100,
      cursor,
    });

    if (result.messages) {
      allMessages.push(...(result.messages as SlackMessage[]));
    }

    cursor = result.response_metadata?.next_cursor;

    if (!result.has_more) break;
  } while (cursor);

  return allMessages;
}

export async function searchMessages(
  clientManager: SlackClientManager,
  profileId: string,
  query: string,
  limit: number = 50
): Promise<SearchMatch[]> {
  const { userClient } = clientManager.getClients(profileId);
  const allMatches: SearchMatch[] = [];
  let page = 1;
  const MAX_PAGES = 20; // Safety limit to prevent runaway pagination

  do {
    const result = (await userClient.search.messages({
      query,
      count: Math.min(limit - allMatches.length, 100),
      page,
      sort: "timestamp",
      sort_dir: "desc",
    })) as unknown as {
      messages?: {
        matches?: SearchMatch[];
        paging?: { pages: number };
      };
    };

    if (result.messages?.matches) {
      allMatches.push(...result.messages.matches);
    }

    const totalPages = result.messages?.paging?.pages ?? 0;
    if (page >= totalPages || allMatches.length >= limit || page >= MAX_PAGES) break;

    page++;
  } while (true);

  return allMatches.slice(0, limit);
}

export async function searchUserMessages(
  clientManager: SlackClientManager,
  profileId: string,
  userId: string,
  limit: number = 200
): Promise<SearchMatch[]> {
  return searchMessages(
    clientManager,
    profileId,
    `from:<@${userId}>`,
    limit
  );
}

export async function listChannels(
  clientManager: SlackClientManager,
  profileId: string,
  limit: number = 200
): Promise<{ id: string; name: string; is_member: boolean; num_members: number }[]> {
  const { userClient } = clientManager.getClients(profileId);
  const channels: {
    id: string;
    name: string;
    is_member: boolean;
    num_members: number;
  }[] = [];
  let cursor: string | undefined;

  do {
    const result = await userClient.conversations.list({
      limit: 200,
      cursor,
      types: "public_channel,private_channel",
      exclude_archived: true,
    });

    if (result.channels) {
      for (const ch of result.channels) {
        if (ch.is_member) {
          channels.push({
            id: ch.id as string,
            name: ch.name as string,
            is_member: true,
            num_members: (ch.num_members as number) || 0,
          });
        }
      }
    }

    cursor = result.response_metadata?.next_cursor;
    if (!cursor || channels.length >= limit) break;
  } while (cursor);

  return channels.slice(0, limit);
}
