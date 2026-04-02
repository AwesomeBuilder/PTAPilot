import type { DemoState, GmailMessage, GmailThread } from "@pta-pilot/shared";
import { env } from "../../../config/env";
import {
  exchangeConnectedAccountAccessToken,
  getGmailIdentityAccessToken,
  type GmailAccessPath,
} from "../../auth/token-vault";

type GmailApiMessagePart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  headers?: Array<{
    name?: string;
    value?: string;
  }>;
  parts?: GmailApiMessagePart[];
};

type GmailApiMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailApiMessagePart;
  snippet?: string;
};

type GmailApiThread = {
  id?: string;
  messages?: GmailApiMessage[];
};

type GmailApiDraft = {
  id?: string;
  message?: {
    id?: string;
    threadId?: string;
  };
};

type GmailSendResponse = {
  id?: string;
  threadId?: string;
};

type GmailAdapterContext = {
  userId?: string;
  auth0AccessToken?: string;
};

type DraftInput = {
  to: string[];
  subject: string;
  body: string;
  draftId?: string;
};

type DraftResult = {
  deliveryPath: GmailAccessPath | "mock";
  draftId: string;
  draftMessageId?: string;
  threadId?: string;
};

type SendInput = {
  to: string[];
  subject: string;
  body: string;
  draftId?: string;
};

type SendResult = {
  deliveryPath: GmailAccessPath | "mock";
  messageId?: string;
  threadId?: string;
};

type ScheduleInput = {
  to: string[];
  subject: string;
  body: string;
  scheduledFor: string;
};

type GmailApiErrorPayload = {
  error?: {
    message?: string;
  };
};

class GmailApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: GmailApiErrorPayload | null,
  ) {
    super(formatGmailApiError(status, payload));
    this.name = "GmailApiRequestError";
  }
}

export interface GmailAdapter {
  listRecentThreads(
    state: DemoState,
    context?: GmailAdapterContext,
  ): Promise<GmailThread[]>;
  fetchRepliesFromReminderThread(
    state: DemoState,
    context?: GmailAdapterContext,
  ): Promise<GmailMessage[]>;
  createDraft(
    input: DraftInput,
    context?: GmailAdapterContext,
  ): Promise<DraftResult>;
  sendEmail(input: SendInput, context?: GmailAdapterContext): Promise<SendResult>;
  scheduleSend(
    input: ScheduleInput,
    context?: GmailAdapterContext,
  ): Promise<void>;
}

function decodeBase64Url(value: string | undefined) {
  if (!value) {
    return "";
  }

  return Buffer.from(value, "base64url").toString("utf8");
}

function getHeaderValue(message: GmailApiMessage, name: string) {
  return message.payload?.headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function parseSender(fromHeader: string | undefined) {
  const fallback = {
    sender: "Unknown sender",
    senderEmail: "unknown@example.com",
  };

  if (!fromHeader) {
    return fallback;
  }

  const match = fromHeader.match(/^(?<name>.*?)(?:\s*<(?<email>[^>]+)>)?$/);

  if (!match?.groups) {
    return {
      sender: fromHeader,
      senderEmail: fromHeader,
    };
  }

  const email = match.groups.email?.trim();
  const sender = match.groups.name?.replace(/^"|"$/g, "").trim();

  if (!email) {
    return {
      sender: sender || fromHeader,
      senderEmail: fromHeader,
    };
  }

  return {
    sender: sender || email,
    senderEmail: email,
  };
}

function extractPlainText(part: GmailApiMessagePart | undefined): string {
  if (!part) {
    return "";
  }

  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }

  for (const child of part.parts ?? []) {
    const text = extractPlainText(child);
    if (text) {
      return text;
    }
  }

  if (part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }

  return "";
}

function mapThread(thread: GmailApiThread): GmailThread {
  const messages = (thread.messages ?? []).map((message) => {
    const fromHeader = getHeaderValue(message, "From");
    const sender = parseSender(fromHeader);

    return {
      id: message.id ?? `gmail-message-${crypto.randomUUID()}`,
      sender: sender.sender,
      senderEmail: sender.senderEmail,
      sentAt: message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : new Date().toISOString(),
      body: extractPlainText(message.payload) || message.snippet || "",
    } satisfies GmailMessage;
  });

  return {
    id: thread.id ?? `gmail-thread-${crypto.randomUUID()}`,
    subject: getHeaderValue(thread.messages?.[0] ?? {}, "Subject") ?? "Untitled thread",
    lastUpdatedAt:
      messages.at(-1)?.sentAt ?? new Date().toISOString(),
    messages,
  } satisfies GmailThread;
}

function normalizeSubject(value: string) {
  return value.replace(/^re:\s*/i, "").trim().toLowerCase();
}

function buildRawMessage(input: { to: string[]; subject: string; body: string }) {
  const normalizedBody = input.body.replace(/\r?\n/g, "\r\n");
  const raw = [
    `To: ${input.to.join(", ")}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    `Subject: ${input.subject}`,
    "",
    normalizedBody,
  ].join("\r\n");

  return Buffer.from(raw).toString("base64url");
}

function formatGmailApiError(status: number, payload: GmailApiErrorPayload | null) {
  const message = payload?.error?.message?.trim();

  if (
    status === 403 &&
    message?.includes("Gmail API has not been used in project")
  ) {
    return (
      "Google accepted the delegated token, but the Gmail API is disabled for the " +
      "Google Cloud project behind this Auth0 Google connection. Enable " +
      "`gmail.googleapis.com`, wait for propagation, then reconnect Gmail."
    );
  }

  if (
    status === 403 &&
    message?.toLowerCase().includes("insufficient authentication scopes")
  ) {
    return (
      "Google rejected the delegated token because the connected account is missing one " +
      "or more Gmail API scopes. Reconnect Gmail and approve the requested Gmail scopes again."
    );
  }

  if (status === 401) {
    return (
      "The delegated Google access token is no longer valid for live Gmail actions. " +
      "Reconnect Gmail through Auth0 to mint a fresh token for the demo."
    );
  }

  if (message) {
    return `Gmail API request failed: ${message}`;
  }

  return `Gmail API request failed with status ${status}.`;
}

function isMissingGmailDraft(error: unknown) {
  return (
    error instanceof GmailApiRequestError &&
    error.status === 404 &&
    error.payload?.error?.message?.trim() === "Requested entity was not found."
  );
}

class MockGmailAdapter implements GmailAdapter {
  async listRecentThreads(state: DemoState): Promise<GmailThread[]> {
    return structuredClone(state.inbox.gmailThreads);
  }

  async fetchRepliesFromReminderThread(state: DemoState): Promise<GmailMessage[]> {
    const thread = state.inbox.gmailThreads[0];
    return thread?.messages.slice(1) ?? [];
  }

  async createDraft(): Promise<DraftResult> {
    return {
      deliveryPath: "mock",
      draftId: `mock-draft-${crypto.randomUUID()}`,
    };
  }

  async sendEmail(): Promise<SendResult> {
    return {
      deliveryPath: "mock",
      messageId: `mock-message-${crypto.randomUUID()}`,
    };
  }

  async scheduleSend(): Promise<void> {}
}

class LiveGmailAdapter implements GmailAdapter {
  private readonly fallbackConfigReady =
    Boolean(env.AUTH0_DOMAIN) &&
    Boolean(env.AUTH0_MANAGEMENT_CLIENT_ID) &&
    Boolean(env.AUTH0_MANAGEMENT_CLIENT_SECRET) &&
    Boolean(env.AUTH0_GMAIL_CONNECTION);

  private async getAccessToken(context?: GmailAdapterContext) {
    if (context?.auth0AccessToken) {
      try {
        return await exchangeConnectedAccountAccessToken(context.auth0AccessToken);
      } catch (error) {
        if (!this.fallbackConfigReady || !context.userId) {
          throw error;
        }

        const fallbackToken = await getGmailIdentityAccessToken(context.userId);
        return {
          ...fallbackToken,
          note: `${error instanceof Error ? error.message : "Auth0 Token Vault exchange failed."} Falling back to the Auth0 identity-provider token path for this request.`,
        };
      }
    }

    if (!this.fallbackConfigReady) {
      throw new Error("Auth0 Management API Gmail fallback is not configured.");
    }

    if (!context?.userId) {
      throw new Error("A logged-in Auth0 user is required for live Gmail actions.");
    }

    return getGmailIdentityAccessToken(context.userId);
  }

  private async gmailRequest<T>(
    path: string,
    init: RequestInit,
    context?: GmailAdapterContext,
  ): Promise<{ data: T; deliveryPath: GmailAccessPath }> {
    const { accessToken, accessPath } = await this.getAccessToken(context);
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      let payload: GmailApiErrorPayload | null = null;

      try {
        payload = (await response.json()) as GmailApiErrorPayload;
      } catch {
        payload = null;
      }

      throw new GmailApiRequestError(response.status, payload);
    }

    return {
      data: (await response.json()) as T,
      deliveryPath: accessPath,
    };
  }

  async listRecentThreads(
    state: DemoState,
    context?: GmailAdapterContext,
  ): Promise<GmailThread[]> {
    if ((!this.fallbackConfigReady && !context?.auth0AccessToken) || !context?.userId) {
      return structuredClone(state.inbox.gmailThreads);
    }

    const { data: listResponse } = await this.gmailRequest<{
      threads?: Array<{ id?: string }>;
    }>(
      "/threads?maxResults=6",
      {
        method: "GET",
      },
      context,
    );

    if (!listResponse.threads?.length) {
      return [];
    }

    const threads = await Promise.all(
      listResponse.threads.map(async (thread) => {
        const { data } = await this.gmailRequest<GmailApiThread>(
          `/threads/${thread.id}?format=full`,
          {
            method: "GET",
          },
          context,
        );

        return mapThread(data);
      }),
    );

    return threads;
  }

  async fetchRepliesFromReminderThread(
    state: DemoState,
    context?: GmailAdapterContext,
  ): Promise<GmailMessage[]> {
    const threads = await this.listRecentThreads(state, context);
    const reminderSubject = state.inbox.gmailThreads[0]?.subject;
    const reminderThread =
      threads.find(
        (thread) =>
          reminderSubject &&
          normalizeSubject(thread.subject) === normalizeSubject(reminderSubject),
      ) ??
      threads.find(
        (thread) =>
          /pta/i.test(thread.subject) &&
          /(week|newsletter|reminder)/i.test(thread.subject),
      ) ??
      threads[0];

    return reminderThread?.messages.slice(1) ?? [];
  }

  async createDraft(
    input: DraftInput,
    context?: GmailAdapterContext,
  ): Promise<DraftResult> {
    const payload = {
      message: {
        raw: buildRawMessage(input),
      },
    };

    let result: { data: GmailApiDraft; deliveryPath: GmailAccessPath };

    if (input.draftId) {
      try {
        result = await this.gmailRequest<GmailApiDraft>(
          `/drafts/${input.draftId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              id: input.draftId,
              ...payload,
            }),
          },
          context,
        );
      } catch (error) {
        if (!isMissingGmailDraft(error)) {
          throw error;
        }

        result = await this.gmailRequest<GmailApiDraft>(
          "/drafts",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          context,
        );
      }
    } else {
      result = await this.gmailRequest<GmailApiDraft>(
        "/drafts",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        context,
      );
    }

    const { data, deliveryPath } = result;

    if (!data.id) {
      throw new Error("Gmail draft creation did not return a draft id.");
    }

    return {
      deliveryPath,
      draftId: data.id,
      draftMessageId: data.message?.id,
      threadId: data.message?.threadId,
    };
  }

  async sendEmail(input: SendInput, context?: GmailAdapterContext): Promise<SendResult> {
    let result: { data: GmailSendResponse; deliveryPath: GmailAccessPath };

    if (input.draftId) {
      try {
        result = await this.gmailRequest<GmailSendResponse>(
          "/drafts/send",
          {
            method: "POST",
            body: JSON.stringify({
              id: input.draftId,
            }),
          },
          context,
        );
      } catch (error) {
        if (!isMissingGmailDraft(error)) {
          throw error;
        }

        result = await this.gmailRequest<GmailSendResponse>(
          "/messages/send",
          {
            method: "POST",
            body: JSON.stringify({
              raw: buildRawMessage(input),
            }),
          },
          context,
        );
      }
    } else {
      result = await this.gmailRequest<GmailSendResponse>(
        "/messages/send",
        {
          method: "POST",
          body: JSON.stringify({
            raw: buildRawMessage(input),
          }),
        },
        context,
      );
    }

    const { data, deliveryPath } = result;

    return {
      deliveryPath,
      messageId: data.id,
      threadId: data.threadId,
    };
  }

  async scheduleSend(_input: ScheduleInput): Promise<void> {
    throw new Error(
      "Gmail scheduling is emulated in PTA Pilot. The Gmail API supports drafts and sends, but the app should handle future delivery timing itself.",
    );
  }
}

export function createGmailAdapter(mode: "mock" | "live") {
  return mode === "live"
    ? new LiveGmailAdapter()
    : new MockGmailAdapter();
}
