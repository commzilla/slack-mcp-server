import type Database from "better-sqlite3";
import type { SlackClientManager } from "../slack/client.js";
import type { AppConfig } from "../config.js";
import { getProfile } from "../config.js";
import { getStyleProfile, saveStyleProfile, analyzeMessages, type StyleProfile } from "../db/style.js";
import { searchUserMessages } from "../slack/history.js";
import { getOwnMessages } from "../db/messages.js";

export async function getMyStyle(
  db: Database.Database,
  clientManager: SlackClientManager,
  config: AppConfig,
  profileId: string,
  refresh: boolean = false
): Promise<string> {
  const profile = getProfile(config, profileId);

  // Check cache first
  if (!refresh) {
    const cached = getStyleProfile(db, profileId);
    if (cached) {
      return formatStyleProfile(profileId, cached);
    }
  }

  console.error(
    `[style:${profileId}] Fetching messages for style analysis...`
  );

  // Try to get messages from SQLite first (faster, no API calls)
  let messageTexts: string[] = [];
  const ownMessages = getOwnMessages(db, profileId, 500);

  if (ownMessages.length >= 50) {
    messageTexts = ownMessages.map((m) => m.text);
    console.error(
      `[style:${profileId}] Using ${messageTexts.length} cached messages for analysis.`
    );
  } else {
    // Fallback to Slack search API
    try {
      const searchResults = await searchUserMessages(
        clientManager,
        profileId,
        profile.user_id,
        500
      );

      messageTexts = searchResults
        .map((m) => m.text)
        .filter((t): t is string => !!t && t.trim().length > 0);

      console.error(
        `[style:${profileId}] Fetched ${messageTexts.length} messages from Slack API.`
      );
    } catch (err) {
      console.error(
        `[style:${profileId}] Failed to fetch from API:`,
        err
      );
      return `Failed to analyze style for profile "${profileId}". Error: ${err instanceof Error ? err.message : "Unknown error"}. Try again later or add more watched channels so the daemon can collect messages.`;
    }
  }

  if (messageTexts.length < 10) {
    return `Not enough messages to analyze style for profile "${profileId}" (found ${messageTexts.length}). Need at least 10 messages. Try watching more channels or waiting for the daemon to collect messages.`;
  }

  // Analyze style
  const analysis = analyzeMessages(messageTexts);

  // Pick representative sample messages (diverse lengths and styles)
  const sampleMessages = selectRepresentativeSamples(messageTexts, 50);

  const styleProfile = {
    ...analysis,
    sample_messages: sampleMessages,
  };

  // Save to cache
  saveStyleProfile(db, profileId, styleProfile);

  console.error(
    `[style:${profileId}] Style profile saved (${messageTexts.length} messages analyzed).`
  );

  return formatStyleProfile(profileId, styleProfile);
}

function selectRepresentativeSamples(
  messages: string[],
  count: number
): string[] {
  if (messages.length <= count) return messages;

  // Sort by length and pick evenly distributed samples
  const sorted = [...messages].sort((a, b) => a.length - b.length);
  const step = sorted.length / count;
  const samples: string[] = [];

  for (let i = 0; i < count; i++) {
    const idx = Math.min(Math.floor(i * step), sorted.length - 1);
    samples.push(sorted[idx]);
  }

  return samples;
}

function formatStyleProfile(
  profileId: string,
  profile: StyleProfile | null
): string {
  if (!profile) return `No style profile found for "${profileId}".`;

  const p = profile;

  const lines = [
    `**Writing Style Profile for "${profileId}":**`,
    ``,
    `- **Average message length:** ${p.avg_message_length} characters`,
    `- **Typical response length:** ${p.typical_response_length}`,
    `- **Formality level:** ${p.formality_level}`,
    `- **Capitalization:** ${p.capitalization_style}`,
    `- **Emoji frequency:** ${Math.round(p.emoji_frequency * 100)}% of messages`,
    `- **Uses exclamation marks:** ${p.uses_exclamation ? "yes" : "rarely"}`,
    `- **Uses ellipsis:** ${p.uses_ellipsis ? "yes" : "rarely"}`,
  ];

  if (p.greeting_patterns.length > 0) {
    lines.push(`- **Greeting patterns:** ${p.greeting_patterns.join(", ")}`);
  }

  if (p.sign_off_patterns.length > 0) {
    lines.push(`- **Sign-off patterns:** ${p.sign_off_patterns.join(", ")}`);
  }

  if (p.common_phrases.length > 0) {
    lines.push(`- **Common phrases:** ${p.common_phrases.slice(0, 5).join(", ")}`);
  }

  if (p.sample_messages && p.sample_messages.length > 0) {
    lines.push(``, `**Sample messages (${p.sample_messages.length}):**`);
    const show = p.sample_messages.slice(0, 15);
    for (const s of show) {
      lines.push(`> ${s}`);
    }
    if (p.sample_messages.length > 15) {
      lines.push(`> ... and ${p.sample_messages.length - 15} more`);
    }
  }

  lines.push(
    ``,
    `**Instructions for matching this style:** When drafting messages for this profile, match the formality level (${p.formality_level}), typical length (${p.typical_response_length}), capitalization style (${p.capitalization_style}), and emoji usage (${Math.round(p.emoji_frequency * 100)}%). Use similar greetings and sign-offs when appropriate.`
  );

  return lines.join("\n");
}
