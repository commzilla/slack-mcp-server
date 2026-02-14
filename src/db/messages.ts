import type Database from "better-sqlite3";

export interface StoredMessage {
  id: number;
  ts: string;
  profile_id: string;
  channel_id: string;
  channel_name: string | null;
  user_id: string;
  username: string | null;
  text: string;
  thread_ts: string | null;
  is_own_message: boolean;
  needs_reply: boolean;
  replied: boolean;
  created_at: string;
}

export interface InsertMessage {
  ts: string;
  profile_id: string;
  channel_id: string;
  channel_name?: string;
  user_id: string;
  username?: string;
  text: string;
  thread_ts?: string;
  is_own_message: boolean;
  needs_reply: boolean;
}

export interface WatchedChannel {
  channel_id: string;
  profile_id: string;
  channel_name: string;
  priority: "high" | "normal" | "low";
  description: string | null;
  added_at: string;
}

export function insertMessage(db: Database.Database, msg: InsertMessage): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO messages
      (ts, profile_id, channel_id, channel_name, user_id, username, text, thread_ts, is_own_message, needs_reply)
    VALUES
      (@ts, @profile_id, @channel_id, @channel_name, @user_id, @username, @text, @thread_ts, @is_own_message, @needs_reply)
  `);

  stmt.run({
    ts: msg.ts,
    profile_id: msg.profile_id,
    channel_id: msg.channel_id,
    channel_name: msg.channel_name || null,
    user_id: msg.user_id,
    username: msg.username || null,
    text: msg.text,
    thread_ts: msg.thread_ts || null,
    is_own_message: msg.is_own_message ? 1 : 0,
    needs_reply: msg.needs_reply ? 1 : 0,
  });
}

export function getChannelMessages(
  db: Database.Database,
  profileId: string,
  channelId: string,
  limit: number = 50
): StoredMessage[] {
  const stmt = db.prepare(`
    SELECT * FROM messages
    WHERE profile_id = ? AND channel_id = ?
    ORDER BY ts DESC
    LIMIT ?
  `);

  const rows = stmt.all(profileId, channelId, limit) as Record<
    string,
    unknown
  >[];
  return rows.map(rowToMessage).reverse(); // Return chronological order
}

export function getPendingReplies(
  db: Database.Database,
  profileId?: string,
  channelId?: string,
  limit: number = 20
): (StoredMessage & { channel_priority: string })[] {
  let query = `
    SELECT m.*, COALESCE(wc.priority, 'normal') as channel_priority
    FROM messages m
    LEFT JOIN watched_channels wc ON m.channel_id = wc.channel_id AND m.profile_id = wc.profile_id
    WHERE m.needs_reply = 1 AND m.replied = 0
  `;
  const params: unknown[] = [];

  if (profileId) {
    query += ` AND m.profile_id = ?`;
    params.push(profileId);
  }

  if (channelId) {
    query += ` AND m.channel_id = ?`;
    params.push(channelId);
  }

  // Sort by priority (high first), then by time (newest first)
  query += `
    ORDER BY
      CASE COALESCE(wc.priority, 'normal')
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
      END,
      m.ts DESC
    LIMIT ?
  `;
  params.push(limit);

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];
  return rows.map((row) => ({
    ...rowToMessage(row),
    channel_priority: row.channel_priority as string,
  }));
}

export function markAsReplied(
  db: Database.Database,
  profileId: string,
  channelId: string,
  ts: string
): void {
  const stmt = db.prepare(`
    UPDATE messages SET replied = 1
    WHERE profile_id = ? AND channel_id = ? AND ts = ?
  `);
  stmt.run(profileId, channelId, ts);
}

export function getOwnMessages(
  db: Database.Database,
  profileId: string,
  limit: number = 200
): StoredMessage[] {
  const stmt = db.prepare(`
    SELECT * FROM messages
    WHERE profile_id = ? AND is_own_message = 1
    ORDER BY ts DESC
    LIMIT ?
  `);

  const rows = stmt.all(profileId, limit) as Record<string, unknown>[];
  return rows.map(rowToMessage);
}

// Watched channels management
export function addWatchedChannel(
  db: Database.Database,
  profileId: string,
  channelId: string,
  channelName: string,
  priority: "high" | "normal" | "low" = "normal",
  description?: string
): void {
  const stmt = db.prepare(`
    INSERT INTO watched_channels (channel_id, profile_id, channel_name, priority, description)
    VALUES (@channel_id, @profile_id, @channel_name, @priority, @description)
    ON CONFLICT(channel_id, profile_id) DO UPDATE SET
      channel_name = @channel_name,
      priority = @priority,
      description = COALESCE(@description, description)
  `);

  stmt.run({
    channel_id: channelId,
    profile_id: profileId,
    channel_name: channelName,
    priority,
    description: description || null,
  });
}

export function removeWatchedChannel(
  db: Database.Database,
  profileId: string,
  channelId: string
): void {
  const stmt = db.prepare(`
    DELETE FROM watched_channels WHERE channel_id = ? AND profile_id = ?
  `);
  stmt.run(channelId, profileId);
}

export function getWatchedChannels(
  db: Database.Database,
  profileId: string
): WatchedChannel[] {
  const stmt = db.prepare(`
    SELECT * FROM watched_channels WHERE profile_id = ? ORDER BY priority, channel_name
  `);
  return stmt.all(profileId) as WatchedChannel[];
}


export function getAllWatchedChannelIds(
  db: Database.Database,
  profileId: string
): Set<string> {
  const stmt = db.prepare(`
    SELECT channel_id FROM watched_channels WHERE profile_id = ?
  `);
  const rows = stmt.all(profileId) as { channel_id: string }[];
  return new Set(rows.map((r) => r.channel_id));
}

// Check if user participated in a thread
export function hasUserParticipatedInThread(
  db: Database.Database,
  profileId: string,
  channelId: string,
  threadTs: string,
  userId: string
): boolean {
  const stmt = db.prepare(`
    SELECT 1 FROM messages
    WHERE profile_id = ? AND channel_id = ? AND thread_ts = ? AND user_id = ?
    LIMIT 1
  `);
  return stmt.get(profileId, channelId, threadTs, userId) !== undefined;
}

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: row.id as number,
    ts: row.ts as string,
    profile_id: row.profile_id as string,
    channel_id: row.channel_id as string,
    channel_name: row.channel_name as string | null,
    user_id: row.user_id as string,
    username: row.username as string | null,
    text: row.text as string,
    thread_ts: row.thread_ts as string | null,
    is_own_message: Boolean(row.is_own_message),
    needs_reply: Boolean(row.needs_reply),
    replied: Boolean(row.replied),
    created_at: row.created_at as string,
  };
}
