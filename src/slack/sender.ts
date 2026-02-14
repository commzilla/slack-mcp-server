import type { SlackClientManager } from "./client.js";

export interface SendResult {
  ok: boolean;
  ts: string;
  channel: string;
  message_text: string;
}

export async function sendMessage(
  clientManager: SlackClientManager,
  profileId: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<SendResult> {
  const { userClient } = clientManager.getClients(profileId);

  const result = await userClient.chat.postMessage({
    channel,
    text,
    thread_ts: threadTs,
    // Do NOT set as_user — it's deprecated.
    // User token (xoxp-) automatically posts as the user.
    // Disable link previews for cleaner messages (optional)
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!result.ok) {
    throw new Error(`Failed to send message: ${result.error}`);
  }

  return {
    ok: true,
    ts: result.ts as string,
    channel: result.channel as string,
    message_text: text,
  };
}
