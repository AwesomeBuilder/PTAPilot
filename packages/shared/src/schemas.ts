import { z } from "zod";

export const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  email: z.string().email(),
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
