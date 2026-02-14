import { WebClient, LogLevel } from "@slack/web-api";
import type { SlackProfile } from "../config.js";

export interface ProfileClients {
  userClient: WebClient; // xoxp- token: acts as the user
  botClient: WebClient; // xoxb- token: bot identity
  profile: SlackProfile;
}

export class SlackClientManager {
  private clients: Map<string, ProfileClients> = new Map();
  private primaryProfileId: string = "";

  constructor(profiles: SlackProfile[]) {
    for (const profile of profiles) {
      const userClient = new WebClient(profile.user_token, {
        logLevel: LogLevel.WARN,
      });
      const botClient = new WebClient(profile.bot_token, {
        logLevel: LogLevel.WARN,
      });

      this.clients.set(profile.id, { userClient, botClient, profile });

      if (profile.is_primary) {
        this.primaryProfileId = profile.id;
      }
    }

    if (!this.primaryProfileId) {
      this.primaryProfileId = profiles[0].id;
    }
  }

  getClients(profileId?: string): ProfileClients {
    const id = profileId || this.primaryProfileId;
    const clients = this.clients.get(id);

    if (!clients) {
      const available = [...this.clients.keys()].join(", ");
      throw new Error(
        `Profile "${id}" not found. Available: ${available}`
      );
    }

    return clients;
  }

  getDefaultClients(): ProfileClients {
    return this.getClients(this.primaryProfileId);
  }

  getPrimaryProfileId(): string {
    return this.primaryProfileId;
  }

  getAllProfileIds(): string[] {
    return [...this.clients.keys()];
  }

  async validateAllTokens(): Promise<
    Map<string, { ok: boolean; user?: string; error?: string }>
  > {
    const results = new Map<
      string,
      { ok: boolean; user?: string; error?: string }
    >();

    for (const [profileId, { userClient, profile }] of this.clients) {
      try {
        const auth = await userClient.auth.test();
        results.set(profileId, {
          ok: true,
          user: auth.user as string,
        });
        console.error(
          `[slack] Profile "${profileId}" authenticated as ${auth.user} (${profile.display_name})`
        );
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        results.set(profileId, { ok: false, error: msg });
        console.error(
          `[slack] Profile "${profileId}" auth FAILED: ${msg}`
        );
      }
    }

    return results;
  }
}
