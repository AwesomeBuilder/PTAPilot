import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  ApprovalAction,
  DemoState,
  ExtractedContentItem,
  MessageSource,
} from "@pta-pilot/shared";
import { env } from "../../config/env";
import { decideIfFlyerNeeded } from "../flyer/flyer.service";

function inferPriority(text: string): ExtractedContentItem["priority"] {
  if (/urgent|attendance|today|tomorrow|deadline|volunteer|reminder/i.test(text)) {
    return "urgent";
  }
  if (/thursday|friday|week|night|fair|event|lunch|schedule/i.test(text)) {
    return "time_sensitive";
  }

  return "evergreen";
}

function inferPlacement(priority: ExtractedContentItem["priority"]) {
  if (priority === "urgent") {
    return "Urgent schoolwide items";
  }

  if (priority === "time_sensitive") {
    return "Events and reminders";
  }

  return "Community and evergreen";
}

function titleFromText(text: string) {
  return text.split(/[.!?]/)[0]?.slice(0, 72) ?? "PTA update";
}

export class GeminiService {
  private readonly liveEnabled = Boolean(env.GOOGLE_CLOUD_PROJECT);

  private async loadPromptTemplate(fileName: string) {
    const filePath = fileURLToPath(new URL(`./prompts/${fileName}`, import.meta.url));
    return readFile(filePath, "utf-8");
  }

  async extractStructuredContent(state: DemoState): Promise<ExtractedContentItem[]> {
    if (!this.liveEnabled) {
      return this.heuristicExtract(state);
    }

    try {
      const prompt = await this.loadPromptTemplate("extract-content.md");
      const inboxPayload = JSON.stringify({
        gmailThreads: state.inbox.gmailThreads,
        mockMessages: state.inbox.mockMessages,
      });
      const { GoogleGenAI } = await import("@google/genai");
      const client: any = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_CLOUD_PROJECT,
        location: env.GOOGLE_CLOUD_LOCATION,
      });
      const response: any = await client.models.generateContent({
        model: env.VERTEX_MODEL,
        contents: `${prompt}\n\nInbox payload:\n${inboxPayload}`,
        config: {
          responseMimeType: "application/json",
        },
      });
      const parsed = JSON.parse(response.text);
      return parsed.items as ExtractedContentItem[];
    } catch {
      return this.heuristicExtract(state);
    }
  }

  async draftAction(action: ApprovalAction, state: DemoState): Promise<ApprovalAction> {
    if (!this.liveEnabled) {
      return action;
    }

    try {
      const templateMap: Record<ApprovalAction["type"], string> = {
        send_reminder_email: "draft-reminder-email.md",
        send_board_draft_email: "draft-board-review-email.md",
        publish_teacher_version: "draft-teacher-release-email.md",
        schedule_parent_version: "draft-teacher-release-email.md",
      };

      const prompt = await this.loadPromptTemplate(templateMap[action.type]);
      const { GoogleGenAI } = await import("@google/genai");
      const client: any = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_CLOUD_PROJECT,
        location: env.GOOGLE_CLOUD_LOCATION,
      });
      const response: any = await client.models.generateContent({
        model: env.VERTEX_MODEL,
        contents: `${prompt}\n\nCurrent state:\n${JSON.stringify(state)}`,
        config: {
          responseMimeType: "application/json",
        },
      });
      const parsed = JSON.parse(response.text);

      return {
        ...action,
        subject: parsed.subject ?? action.subject,
        body: parsed.body ?? action.body,
      };
    } catch {
      return action;
    }
  }

  private heuristicExtract(state: DemoState): ExtractedContentItem[] {
    const emailItems = state.inbox.gmailThreads.flatMap((thread) =>
      thread.messages.slice(1).map((message) => {
        const priority = inferPriority(message.body);
        return {
          id: `extract-${message.id}`,
          title: titleFromText(message.body),
          summary: message.body,
          source: "gmail" as MessageSource,
          sourceRef: message.id,
          priority,
          recommendedPlacement: inferPlacement(priority),
          recommendedAsFlyer: decideIfFlyerNeeded({
            id: message.id,
            title: titleFromText(message.body),
            summary: message.body,
            source: "gmail",
            sourceRef: message.id,
            priority,
            recommendedPlacement: inferPlacement(priority),
            recommendedAsFlyer: false,
          }),
        };
      }),
    );

    const mockItems = state.inbox.mockMessages.map((message) => {
      const priority = inferPriority(message.body);
      return {
        id: `extract-${message.id}`,
        title: titleFromText(message.body),
        summary: message.body,
        source: message.source,
        sourceRef: message.id,
        priority,
        recommendedPlacement: inferPlacement(priority),
        recommendedAsFlyer: decideIfFlyerNeeded({
          id: message.id,
          title: titleFromText(message.body),
          summary: message.body,
          source: message.source,
          sourceRef: message.id,
          priority,
          recommendedPlacement: inferPlacement(priority),
          recommendedAsFlyer: false,
        }),
      };
    });

    return [...emailItems, ...mockItems];
  }
}
