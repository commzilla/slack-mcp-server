import type Database from "better-sqlite3";
import { getPendingReplies } from "../db/messages.js";

export function getPendingRepliesTool(
  db: Database.Database,
  profileId?: string,
  channelId?: string,
  limit: number = 20
): string {
  const pending = getPendingReplies(db, profileId, channelId, limit);

  if (pending.length === 0) {
    const scope = profileId
      ? `profile "${profileId}"`
      : "any profile";
    return `No pending replies for ${scope}. All caught up!`;
  }

  // Group by profile
  const byProfile = new Map<
    string,
    typeof pending
  >();

  for (const msg of pending) {
    const list = byProfile.get(msg.profile_id) || [];
    list.push(msg);
    byProfile.set(msg.profile_id, list);
  }

  const sections: string[] = [];

  for (const [pid, messages] of byProfile) {
    const lines = messages.map((m) => {
      const channel = m.channel_name || m.channel_id;
      const user = m.username || m.user_id;
      const priority =
        m.channel_priority !== "normal"
          ? ` [${m.channel_priority.toUpperCase()}]`
          : "";
      const thread = m.thread_ts ? ` (thread: ${m.thread_ts})` : "";
      const age = getRelativeTime(m.ts);
      return `  - ${priority}#${channel} — ${user}: "${truncate(m.text, 100)}"${thread} (${age})`;
    });

    sections.push(`**[${pid}]** (${messages.length} pending):\n${lines.join("\n")}`);
  }

  return `**Pending Replies (${pending.length} total):**\n\n${sections.join("\n\n")}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "...";
}

function getRelativeTime(slackTs: string): string {
  const msgTime = parseFloat(slackTs) * 1000;
  const now = Date.now();
  const diffMs = now - msgTime;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}
