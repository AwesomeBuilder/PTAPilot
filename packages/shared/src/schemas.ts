import { z } from "zod";

export const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  email: z.string().email(),
});

export const memberRecipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const newsletterDeliveryMetaSchema = z.object({
  externalId: z.string().optional(),
  directUrl: z.string().url().optional(),
  lastSyncedAt: z.string().optional(),
});

export const newsletterItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
  priority: z.enum(["urgent", "time_sensitive", "evergreen"]),
  sourceBadges: z.array(z.string()),
  flyerRecommended: z.boolean().optional(),
  provenance: z
    .array(
      z.object({
        id: z.string(),
        source: z.enum([
          "gmail",
          "whatsapp",
          "imessage",
          "artifact",
          "calendar",
          "membership_toolkit",
        ]),
        label: z.string().min(1),
        ref: z.string().optional(),
      }),
    )
    .optional(),
});

export const newsletterSectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  kind: z.enum([
    "urgent_schoolwide",
    "events",
    "community",
    "teacher_note",
    "principal_note",
    "flyer",
  ]),
  items: z.array(newsletterItemSchema),
  locked: z.boolean().optional(),
  lockedReason: z.string().optional(),
});

export const newsletterDraftSchema = z.object({
  id: z.string(),
  audience: z.enum(["board", "teachers", "parents"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["draft", "published", "scheduled"]),
  sections: z.array(newsletterSectionSchema),
  scheduledFor: z.string().optional(),
  publishedAt: z.string().optional(),
  sourceNewsletterId: z.string().optional(),
  delivery: newsletterDeliveryMetaSchema.optional(),
});

export const approvalStepManualCompleteSchema = z.object({
  note: z.string().optional(),
  outputs: z.record(z.string(), z.string()).optional(),
});

export const inboxArtifactSchema = z.object({
  id: z.string(),
  type: z.enum(["previous_newsletter_link", "calendar_screenshot"]),
  label: z.string().min(1),
  createdAt: z.string(),
  source: z.enum(["manual", "live"]),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  originalUrl: z.string().url().optional(),
  storedPath: z.string().optional(),
  extractedText: z.string().optional(),
  note: z.string().optional(),
});

export const inboxArtifactUploadSchema = z.object({
  type: z.enum(["previous_newsletter_link", "calendar_screenshot"]),
  label: z.string().min(1).optional(),
  originalUrl: z.string().url().optional(),
  note: z.string().optional(),
});

export const schoolBreakSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
});

export const plannerTimelineEntrySchema = z.object({
  stage: z.enum([
    "monday_reminder",
    "collect_updates",
    "wednesday_draft",
    "thursday_teacher_release",
    "sunday_parent_schedule",
  ]),
  label: z.string(),
  targetTime: z.string(),
  status: z.enum(["done", "active", "upcoming"]),
});

export const setupUpdateSchema = z.object({
  auth0AccountEmail: z.string().email().or(z.literal("")).optional(),
  contacts: z.array(contactSchema).optional(),
  memberRecipients: z.array(memberRecipientSchema).optional(),
  schoolBreaks: z.array(schoolBreakSchema).optional(),
  integrations: z
    .object({
      auth0: z.any().optional(),
      gmail: z.any().optional(),
      membershipToolkit: z.any().optional(),
      mockMessages: z.any().optional(),
      flyer: z.any().optional(),
    })
    .optional(),
  planner: z
    .object({
      currentStage: z.enum([
        "monday_reminder",
        "collect_updates",
        "wednesday_draft",
        "thursday_teacher_release",
        "sunday_parent_schedule",
      ]),
      timeline: z.array(plannerTimelineEntrySchema),
    })
    .optional(),
});

export const addMockMessageSchema = z.object({
  source: z.enum(["whatsapp", "imessage"]),
  sender: z.string().min(1),
  body: z.string().min(1),
  imageUrl: z.string().url().optional(),
});

export const approvalEditSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});
