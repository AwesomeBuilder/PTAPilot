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

export const setupUpdateSchema = z.object({
  auth0AccountEmail: z.string().email().optional(),
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
