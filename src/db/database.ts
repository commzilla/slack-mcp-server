import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { AppConfig, SlackProfile } from "../config.js";

let db: Database.Database | null = null;

export function getDb(config: AppConfig): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true });
  }

  const dbPath = join(config.dataDir, "slack.db");
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read/write performance
  // (daemon writes, MCP server reads)
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initializeTables(db);

  return db;
}

function initializeTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_primary BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS watched_channels (
      channel_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('high', 'normal', 'low')),
      description TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (channel_id, profile_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      user_id TEXT NOT NULL,
      username TEXT,
      text TEXT NOT NULL,
      thread_ts TEXT,
      is_own_message BOOLEAN DEFAULT 0,
      needs_reply BOOLEAN DEFAULT 0,
      replied BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ts, profile_id, channel_id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_profile ON messages(profile_id);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(profile_id, channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_needs_reply ON messages(profile_id, needs_reply, replied);
    CREATE INDEX IF NOT EXISTS idx_messages_own ON messages(profile_id, is_own_message);
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);

    CREATE TABLE IF NOT EXISTS style_profiles (
      profile_id TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      sample_messages TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );
  `);
}

export function syncProfiles(
  db: Database.Database,
  profiles: SlackProfile[]
): void {
  const upsert = db.prepare(`
    INSERT INTO profiles (id, display_name, user_id, is_primary)
    VALUES (@id, @display_name, @user_id, @is_primary)
    ON CONFLICT(id) DO UPDATE SET
      display_name = @display_name,
      user_id = @user_id,
      is_primary = @is_primary
  `);

  const transaction = db.transaction(() => {
    for (const profile of profiles) {
      upsert.run({
        id: profile.id,
        display_name: profile.display_name,
        user_id: profile.user_id,
        is_primary: profile.is_primary ? 1 : 0,
      });
    }
  });

  transaction();
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
