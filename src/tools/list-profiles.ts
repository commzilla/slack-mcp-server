import type { AppConfig } from "../config.js";

export function listProfiles(config: AppConfig): string {
  const profiles = config.profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    is_primary: p.is_primary,
    user_id: p.user_id,
  }));

  const lines = profiles.map((p) => {
    const primary = p.is_primary ? " (Primary)" : "";
    return `- **${p.id}**${primary}: ${p.display_name} [${p.user_id}]`;
  });

  return `**Configured Profiles (${profiles.length}):**\n${lines.join("\n")}`;
}
