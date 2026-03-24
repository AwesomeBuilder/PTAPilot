import type { DemoState, GmailMessage, GmailThread } from "@pta-pilot/shared";
import { env } from "../../../config/env";

export interface GmailAdapter {
  listRecentThreads(state: DemoState): Promise<GmailThread[]>;
  fetchRepliesFromReminderThread(state: DemoState): Promise<GmailMessage[]>;
  createDraft(input: { to: string[]; subject: string; body: string }): Promise<void>;
  sendEmail(input: { to: string[]; subject: string; body: string }): Promise<void>;
  scheduleSend(input: {
    to: string[];
    subject: string;
    body: string;
    scheduledFor: string;
  }): Promise<void>;
}

class MockGmailAdapter implements GmailAdapter {
  async listRecentThreads(state: DemoState): Promise<GmailThread[]> {
    return structuredClone(state.inbox.gmailThreads);
  }

  async fetchRepliesFromReminderThread(state: DemoState): Promise<GmailMessage[]> {
    const thread = state.inbox.gmailThreads[0];
    return thread?.messages.slice(1) ?? [];
  }

  async createDraft(): Promise<void> {}

  async sendEmail(): Promise<void> {}

  async scheduleSend(): Promise<void> {}
}

class Auth0TokenVaultGmailAdapter implements GmailAdapter {
  private readonly configReady =
    Boolean(env.AUTH0_DOMAIN) &&
    Boolean(env.AUTH0_CLIENT_ID) &&
    Boolean(env.AUTH0_CLIENT_SECRET) &&
    Boolean(env.AUTH0_TOKEN_VAULT_CONNECTION);

  async listRecentThreads(_state: DemoState): Promise<GmailThread[]> {
    if (!this.configReady) {
      return [];
    }

    return [];
  }

  async fetchRepliesFromReminderThread(_state: DemoState): Promise<GmailMessage[]> {
    if (!this.configReady) {
      return [];
    }

    return [];
  }

  async createDraft(): Promise<void> {
    if (!this.configReady) {
      throw new Error("Auth0 Token Vault Gmail adapter is not configured.");
    }
  }

  async sendEmail(): Promise<void> {
    if (!this.configReady) {
      throw new Error("Auth0 Token Vault Gmail adapter is not configured.");
    }
  }

  async scheduleSend(): Promise<void> {
    throw new Error(
      "Gmail scheduling is emulated in PTA Pilot. The Gmail API supports drafts and sends, but the app should handle future delivery timing itself.",
    );
  }
}

export function createGmailAdapter(mode: "mock" | "live") {
  return mode === "live" ? new Auth0TokenVaultGmailAdapter() : new MockGmailAdapter();
}
