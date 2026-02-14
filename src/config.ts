import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SlackProfile {
  id: string;
  display_name: string;
  user_token: string; // xoxp-...
  bot_token: string; // xoxb-...
  app_token: string; // xapp-...
  user_id: string; // Slack user ID (U...)
  is_primary: boolean;
}

export interface AppConfig {
  profiles: SlackProfile[];
  dataDir: string;
}

function findProfilesJson(): string {
  // Look for profiles.json in multiple locations
  const candidates = [
    join(__dirname, "..", "profiles.json"),
    join(__dirname, "..", "..", "profiles.json"),
    join(process.env.HOME || "/root", "slack-mcp-server", "profiles.json"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `profiles.json not found. Searched:\n${candidates.join("\n")}\n\nCreate profiles.json with your Slack profiles. See profiles.example.json for the format.`
  );
}

function validateProfile(profile: unknown, index: number): SlackProfile {
  const p = profile as Record<string, unknown>;
  const required = [
    "id",
    "display_name",
    "user_token",
    "bot_token",
    "app_token",
    "user_id",
  ];

  for (const field of required) {
    if (!p[field] || typeof p[field] !== "string") {
      throw new Error(
        `Profile at index ${index} is missing required field "${field}" or it's not a string.`
      );
    }
  }

  if (
    typeof p.user_token === "string" &&
    !p.user_token.startsWith("xoxp-")
  ) {
    throw new Error(
      `Profile "${p.id}": user_token must start with "xoxp-". Got "${(p.user_token as string).substring(0, 5)}..."`
    );
  }

  if (typeof p.bot_token === "string" && !p.bot_token.startsWith("xoxb-")) {
    throw new Error(
      `Profile "${p.id}": bot_token must start with "xoxb-". Got "${(p.bot_token as string).substring(0, 5)}..."`
    );
  }

  if (typeof p.app_token === "string" && !p.app_token.startsWith("xapp-")) {
    throw new Error(
      `Profile "${p.id}": app_token must start with "xapp-". Got "${(p.app_token as string).substring(0, 5)}..."`
    );
  }

  return {
    id: p.id as string,
    display_name: p.display_name as string,
    user_token: p.user_token as string,
    bot_token: p.bot_token as string,
    app_token: p.app_token as string,
    user_id: p.user_id as string,
    is_primary: p.is_primary === true,
  };
}

export function loadConfig(): AppConfig {
  const profilesPath = findProfilesJson();
  const raw = readFileSync(profilesPath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse profiles.json: invalid JSON`);
  }

  const data = parsed as Record<string, unknown>;
  if (!Array.isArray(data.profiles) || data.profiles.length === 0) {
    throw new Error(
      `profiles.json must contain a "profiles" array with at least one profile.`
    );
  }

  const profiles = data.profiles.map((p: unknown, i: number) =>
    validateProfile(p, i)
  );

  // Ensure exactly one primary
  const primaries = profiles.filter((p) => p.is_primary);
  if (primaries.length === 0) {
    // Default: first profile is primary
    profiles[0].is_primary = true;
    console.error(
      `[config] No primary profile set. Defaulting to "${profiles[0].id}".`
    );
  } else if (primaries.length > 1) {
    throw new Error(
      `Multiple profiles are marked as primary: ${primaries.map((p) => p.id).join(", ")}. Only one can be primary.`
    );
  }

  const projectRoot = dirname(profilesPath);
  const dataDir = join(projectRoot, "data");

  return { profiles, dataDir };
}

export function getPrimaryProfile(config: AppConfig): SlackProfile {
  const primary = config.profiles.find((p) => p.is_primary);
  if (!primary) {
    throw new Error(
      "No primary profile configured. Set is_primary: true on one profile in profiles.json."
    );
  }
  return primary;
}

export function getProfile(
  config: AppConfig,
  profileId?: string
): SlackProfile {
  if (!profileId) {
    return getPrimaryProfile(config);
  }

  const profile = config.profiles.find((p) => p.id === profileId);
  if (!profile) {
    const available = config.profiles.map((p) => p.id).join(", ");
    throw new Error(
      `Profile "${profileId}" not found. Available profiles: ${available}`
    );
  }

  return profile;
}
