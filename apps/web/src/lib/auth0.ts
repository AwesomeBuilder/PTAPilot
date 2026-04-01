import { Auth0Client } from "@auth0/nextjs-auth0/server";

const requiredAuth0Env = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "APP_BASE_URL",
] as const;

export const isAuthEnabled = requiredAuth0Env.every(
  (envKey) => Boolean(process.env[envKey]),
);

export const isTokenVaultConfigured =
  isAuthEnabled && Boolean(process.env.AUTH0_TOKEN_VAULT_CONNECTION);

function mergeAuthScopes(scope: string | undefined) {
  const defaults = ["openid", "profile", "email", "offline_access"];

  return Array.from(
    new Set(
      [
        ...defaults,
        ...(scope ?? "")
          .split(/[,\s]+/)
          .map((token) => token.trim())
          .filter(Boolean),
      ],
    ),
  ).join(" ");
}

const authorizationParameters = {
  ...(process.env.AUTH0_AUDIENCE
    ? { audience: process.env.AUTH0_AUDIENCE }
    : {}),
  scope: mergeAuthScopes(process.env.AUTH0_SCOPE),
};

const gmailConnection =
  process.env.AUTH0_GMAIL_CONNECTION ??
  process.env.AUTH0_TOKEN_VAULT_CONNECTION ??
  "google-oauth2";

const gmailScopes = (
  process.env.AUTH0_GMAIL_SCOPES ??
  "https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.compose,https://www.googleapis.com/auth/gmail.send"
)
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

export const gmailConnectUrl = `/auth/login?${new URLSearchParams({
  connection: gmailConnection,
  access_type: "offline",
  prompt: "consent",
  connection_scope: gmailScopes.join(","),
  returnTo: "/",
}).toString()}`;

export const auth0 = isAuthEnabled
  ? new Auth0Client({
      authorizationParameters,
    })
  : null;
