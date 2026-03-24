import "dotenv/config";

import { fileURLToPath } from "node:url";
import { z } from "zod";

const defaultStatePath = fileURLToPath(
  new URL("../../data/runtime-state.json", import.meta.url),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  APP_BASE_URL: z.string().default("http://localhost:8080"),
  AUTH0_DOMAIN: z.string().optional(),
  AUTH0_CLIENT_ID: z.string().optional(),
  AUTH0_CLIENT_SECRET: z.string().optional(),
  AUTH0_AUDIENCE: z.string().optional(),
  AUTH0_APP_BASE_URL: z.string().optional(),
  AUTH0_SECRET: z.string().optional(),
  AUTH0_MANAGEMENT_CLIENT_ID: z.string().optional(),
  AUTH0_MANAGEMENT_CLIENT_SECRET: z.string().optional(),
  AUTH0_MANAGEMENT_API_SCOPE: z
    .string()
    .default("read:users read:user_idp_tokens"),
  AUTH0_TOKEN_VAULT_CONNECTION: z.string().optional(),
  AUTH0_TOKEN_VAULT_PROVIDER: z.string().default("google-oauth2"),
  AUTH0_TOKEN_VAULT_ACCOUNT_ID: z.string().optional(),
  AUTH0_GMAIL_CONNECTION: z.string().default("google-oauth2"),
  AUTH0_GMAIL_SCOPES: z
    .string()
    .default(
      "https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.compose,https://www.googleapis.com/auth/gmail.send",
    ),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default("us-central1"),
  VERTEX_MODEL: z.string().default("gemini-3.1-pro-preview"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  MEMBERSHIP_TOOLKIT_MODE: z.enum(["mock", "manual", "live"]).default("mock"),
  FLYER_MODE: z.enum(["mock", "live"]).default("mock"),
  DEMO_RUNTIME_STATE_PATH: z.string().default(defaultStatePath),
});

export const env = envSchema.parse(process.env);

export type AppEnv = typeof env;
