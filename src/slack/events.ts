import { SocketModeClient } from "@slack/socket-mode";
import type Database from "better-sqlite3";
import type { SlackProfile } from "../config.js";
import {
  insertMessage,
  getAllWatchedChannelIds,
  hasUserParticipatedInThread,
} from "../db/messages.js";

interface MessageEvent {
  type: string;
  subtype?: string;
  channel: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  username?: string;
}

export function createSocketModeClient(
  profile: SlackProfile
): SocketModeClient {
  return new SocketModeClient({
    appToken: profile.app_token,
  });
}

/**
 * Sets up event handlers for a Socket Mode client.
 * Returns a cleanup function that should be called during shutdown
 * to clear the periodic cache refresh interval.
 */
export function setupEventHandlers(
  socketClient: SocketModeClient,
  db: Database.Database,
  profile: SlackProfile
): { cleanup: () => void } {
  const profileId = profile.id;
  const ownUserId = profile.user_id;

  // Cache watched channel IDs (refreshed periodically)
  let watchedChannels: Set<string> = getAllWatchedChannelIds(db, profileId);
  const CACHE_REFRESH_MS = 60_000; // Refresh every 60 seconds

  const intervalId = setInterval(() => {
    try {
      watchedChannels = getAllWatchedChannelIds(db, profileId);
    } catch (err) {
      console.error(
        `[events:${profileId}] Failed to refresh watched channels:`,
        err
      );
    }
  }, CACHE_REFRESH_MS);

  socketClient.on(
    "message",
    async ({
      event,
      ack,
    }: {
      event: MessageEvent;
      ack: () => Promise<void>;
    }) => {
      // Always acknowledge first
      await ack();

      try {
        // Skip subtypes (message edits, deletes, joins, etc.)
        if (event.subtype) return;

        // Skip if no text or user
        if (!event.text || !event.user) return;

        const channelId = event.channel;

        // Only process messages from watched channels
        if (!watchedChannels.has(channelId)) return;

        const isOwnMessage = event.user === ownUserId;
        const needsReply = detectNeedsReply(
          event,
          ownUserId,
          db,
          profileId,
          channelId
        );

        insertMessage(db, {
          ts: event.ts,
          profile_id: profileId,
          channel_id: channelId,
          channel_name: undefined, // We don't always have the name in events
          user_id: event.user,
          username: event.username,
          text: event.text,
          thread_ts: event.thread_ts,
          is_own_message: isOwnMessage,
          needs_reply: needsReply && !isOwnMessage,
        });

        if (needsReply && !isOwnMessage) {
          console.error(
            `[events:${profileId}] Needs reply in ${channelId}: "${event.text.substring(0, 80)}..."`
          );
        }
      } catch (err) {
        console.error(`[events:${profileId}] Error processing message:`, err);
      }
    }
  );

  // Connection lifecycle logging
  socketClient.on("connected", () => {
    console.error(`[events:${profileId}] Socket Mode connected`);
  });

  socketClient.on("connecting", () => {
    console.error(`[events:${profileId}] Socket Mode connecting...`);
  });

  socketClient.on("reconnecting", () => {
    console.error(`[events:${profileId}] Socket Mode reconnecting...`);
  });

  socketClient.on("disconnecting", () => {
    console.error(`[events:${profileId}] Socket Mode disconnecting...`);
  });

  return {
    cleanup: () => {
      clearInterval(intervalId);
      console.error(`[events:${profileId}] Cleaned up cache refresh interval.`);
    },
  };
}

function detectNeedsReply(
  event: MessageEvent,
  ownUserId: string,
  db: Database.Database,
  profileId: string,
  channelId: string
): boolean {
  const text = event.text || "";

  // 1. Direct mention of the user
  if (text.includes(`<@${ownUserId}>`)) {
    return true;
  }

  // 2. DMs (im or mpim) — always need attention
  if (
    event.channel_type === "im" ||
    event.channel_type === "mpim"
  ) {
    return true;
  }

  // 3. Thread reply where user previously participated
  if (event.thread_ts && event.thread_ts !== event.ts) {
    if (
      hasUserParticipatedInThread(
        db,
        profileId,
        channelId,
        event.thread_ts,
        ownUserId
      )
    ) {
      return true;
    }
  }

  // 4. Question heuristic (for channel messages, not threads)
  if (!event.thread_ts) {
    if (looksLikeQuestion(text)) {
      return true;
    }
  }

  return false;
}

function looksLikeQuestion(text: string): boolean {
  // Ends with question mark
  if (text.trim().endsWith("?")) return true;

  // Starts with question words
  const questionStarters =
    /^(who|what|when|where|why|how|can|could|would|should|does|did|is|are|has|have|will)\b/i;
  if (questionStarters.test(text.trim())) return true;

  // Contains "anyone" or "somebody" patterns
  if (/\b(anyone|somebody|someone|anybody)\b/i.test(text)) return true;

  return false;
}
