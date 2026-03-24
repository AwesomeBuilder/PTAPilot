import { env, type AppEnv } from "../../config/env";

const requiredTokenVaultFields = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "AUTH0_APP_BASE_URL",
  "AUTH0_TOKEN_VAULT_CONNECTION",
] as const;

const requiredManagementFields = [
  "AUTH0_DOMAIN",
  "AUTH0_MANAGEMENT_CLIENT_ID",
  "AUTH0_MANAGEMENT_CLIENT_SECRET",
] as const;

type TokenVaultTokenset = {
  id: string;
  connection: string;
  scope?: string;
  issued_at?: number;
  expires_at?: number;
  last_used_at?: number;
};

type IdentityProviderIdentity = {
  connection?: string;
  provider?: string;
  access_token?: string;
  refresh_token?: string;
};

type ManagementUserProfile = {
  user_id: string;
  identities?: IdentityProviderIdentity[];
};

type GmailApiErrorPayload = {
  error?: {
    message?: string;
    status?: string;
  };
};

export type GmailAccessPath = "token_vault" | "identity_provider";

type GmailApiProbe = {
  ok: boolean;
  note: string;
};

export type GmailAccessTokenBundle = {
  accessPath: GmailAccessPath;
  accessToken: string;
  note: string;
};

function normalizeAuth0Domain(domain: string) {
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

function getConfiguredGmailScopes(runtimeEnv: AppEnv = env) {
  return runtimeEnv.AUTH0_GMAIL_SCOPES.split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function findGmailIdentity(
  identities: IdentityProviderIdentity[] | undefined,
  runtimeEnv: AppEnv = env,
) {
  return identities?.find(
    (identity) =>
      identity.connection === runtimeEnv.AUTH0_GMAIL_CONNECTION ||
      identity.provider === runtimeEnv.AUTH0_GMAIL_CONNECTION,
  );
}

function formatProbeFailureNote(
  status: number,
  payload: GmailApiErrorPayload | null,
) {
  const message = payload?.error?.message?.trim();

  if (status === 401) {
    return (
      "Auth0 exposed a Google identity token, but Gmail rejected it as expired or invalid. " +
      "Reconnect Gmail through Auth0 to mint a fresh Google access token for the demo."
    );
  }

  if (
    status === 403 &&
    message?.includes("Gmail API has not been used in project")
  ) {
    return (
      "Google accepted the delegated token, but the Gmail API is disabled on the " +
      "Google Cloud project backing this Auth0 Google connection. Enable " +
      "`gmail.googleapis.com`, wait for propagation, then reconnect Gmail."
    );
  }

  if (
    status === 403 &&
    message?.toLowerCase().includes("insufficient authentication scopes")
  ) {
    return (
      "Google accepted the delegated token, but it is missing one or more Gmail API scopes. " +
      "Reconnect Gmail and approve the requested Gmail scopes again."
    );
  }

  if (message) {
    return `Gmail API probe failed: ${message}`;
  }

  return `Gmail API probe failed with status ${status}.`;
}

async function probeGmailApiAccess(accessToken: string): Promise<GmailApiProbe> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.ok) {
    return {
      ok: true,
      note:
        "Google accepted the delegated token for live Gmail API access. PTA Pilot will execute live Gmail actions through the Auth0 identity-provider fallback path until a verified Token Vault exchange flow is added.",
    };
  }

  let payload: GmailApiErrorPayload | null = null;

  try {
    payload = (await response.json()) as GmailApiErrorPayload;
  } catch {
    payload = null;
  }

  return {
    ok: false,
    note: formatProbeFailureNote(response.status, payload),
  };
}

export function getTokenVaultStatus(runtimeEnv: AppEnv = env) {
  const missing = requiredTokenVaultFields.filter(
    (field) => !runtimeEnv[field],
  );

  return {
    configured: missing.length === 0,
    missing,
    provider: runtimeEnv.AUTH0_TOKEN_VAULT_PROVIDER,
    note:
      "PTA Pilot keeps Token Vault token exchange server-side. Long-lived Google refresh tokens are not stored in this app.",
  };
}

export function getManagementApiStatus(runtimeEnv: AppEnv = env) {
  const missing = requiredManagementFields.filter(
    (field) => !runtimeEnv[field],
  );

  return {
    configured: missing.length === 0,
    missing,
    note:
      "Management API access is used to inspect connected-account tokensets and, when needed, to fall back to Auth0 identity-provider token inspection for live Gmail actions.",
  };
}

async function getManagementApiAccessToken(runtimeEnv: AppEnv = env) {
  const managementStatus = getManagementApiStatus(runtimeEnv);

  if (!managementStatus.configured) {
    throw new Error(
      `Auth0 Management API is not configured. Missing: ${managementStatus.missing.join(", ")}`,
    );
  }

  const auth0Domain = normalizeAuth0Domain(runtimeEnv.AUTH0_DOMAIN!);
  const response = await fetch(`${auth0Domain}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: runtimeEnv.AUTH0_MANAGEMENT_CLIENT_ID,
      client_secret: runtimeEnv.AUTH0_MANAGEMENT_CLIENT_SECRET,
      audience: `${auth0Domain}/api/v2/`,
      scope: runtimeEnv.AUTH0_MANAGEMENT_API_SCOPE,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get Auth0 Management API token: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as { access_token?: string };

  if (!payload.access_token) {
    throw new Error("Auth0 Management API token response did not include access_token.");
  }

  return payload.access_token;
}

export async function listUserTokenSets(
  userId: string,
  runtimeEnv: AppEnv = env,
): Promise<TokenVaultTokenset[]> {
  const accessToken = await getManagementApiAccessToken(runtimeEnv);
  const auth0Domain = normalizeAuth0Domain(runtimeEnv.AUTH0_DOMAIN!);
  const response = await fetch(
    `${auth0Domain}/api/v2/users/${encodeURIComponent(userId)}/federated-connections-tokensets`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch user tokensets: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as TokenVaultTokenset[];
}

async function getManagementUserProfile(
  userId: string,
  runtimeEnv: AppEnv = env,
): Promise<ManagementUserProfile> {
  const accessToken = await getManagementApiAccessToken(runtimeEnv);
  const auth0Domain = normalizeAuth0Domain(runtimeEnv.AUTH0_DOMAIN!);
  const response = await fetch(
    `${auth0Domain}/api/v2/users/${encodeURIComponent(
      userId,
    )}?fields=user_id,identities&include_fields=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Auth0 user profile: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as ManagementUserProfile;
}

export async function getGmailIdentityAccessToken(
  userId: string,
  runtimeEnv: AppEnv = env,
): Promise<GmailAccessTokenBundle> {
  const profile = await getManagementUserProfile(userId, runtimeEnv);
  const gmailIdentity = findGmailIdentity(profile.identities, runtimeEnv);

  if (!gmailIdentity?.access_token) {
    throw new Error(
      "Auth0 found the Gmail identity, but did not expose a current Google access token on the user profile. Reconnect Gmail through Auth0 so PTA Pilot can use the documented identity-provider fallback path.",
    );
  }

  return {
    accessPath: "identity_provider",
    accessToken: gmailIdentity.access_token,
    note:
      "Using the Auth0 Management API identity-provider access token fallback because this repo does not yet have a verified Token Vault access-token exchange flow.",
  };
}

export async function getGmailTokenVaultStatus(
  userId: string | undefined,
  runtimeEnv: AppEnv = env,
) {
  const requiredScopes = getConfiguredGmailScopes(runtimeEnv);
  const managementStatus = getManagementApiStatus(runtimeEnv);
  const tokenVaultStatus = getTokenVaultStatus(runtimeEnv);

  if (!userId) {
    return {
      connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
      requiredScopes,
      grantedScopes: [] as string[],
      missingScopes: requiredScopes,
      connected: false,
      liveReady: false,
      tokensets: [] as TokenVaultTokenset[],
      managementApiConfigured: managementStatus.configured,
      tokenVaultConfigured: tokenVaultStatus.configured,
      actionPath: "unavailable" as const,
      note: "User must authenticate before Token Vault Gmail status can be resolved.",
    };
  }

  if (!managementStatus.configured) {
    return {
      connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
      requiredScopes,
      grantedScopes: [] as string[],
      missingScopes: requiredScopes,
      connected: false,
      liveReady: false,
      tokensets: [] as TokenVaultTokenset[],
      managementApiConfigured: false,
      tokenVaultConfigured: tokenVaultStatus.configured,
      actionPath: "unavailable" as const,
      note: "Management API credentials are required to inspect connected-account status for this user.",
    };
  }

  let gmailTokensets: TokenVaultTokenset[] = [];
  let grantedScopes: string[] = [];
  let missingScopes: string[] = [];
  let tokensetNote =
    "Token Vault tokensets could not be inspected in this tenant, so PTA Pilot will rely on the Auth0 identity-provider fallback when possible.";

  try {
    const tokensets = await listUserTokenSets(userId, runtimeEnv);
    gmailTokensets = tokensets.filter(
      (tokenset) => tokenset.connection === runtimeEnv.AUTH0_GMAIL_CONNECTION,
    );
    grantedScopes = Array.from(
      new Set(
        gmailTokensets
          .flatMap((tokenset) => tokenset.scope?.split(" ") ?? [])
          .map((scope) => scope.trim())
          .filter(Boolean),
      ),
    );
    missingScopes = requiredScopes.filter(
      (scope) => !grantedScopes.includes(scope),
    );
    tokensetNote =
      gmailTokensets.length > 0
        ? "Auth0 found a Gmail tokenset for this user, but PTA Pilot still needs a separate subject-token exchange flow before it can consume Token Vault directly."
        : "No Gmail tokenset was found for this user yet.";
  } catch (error) {
    if (error instanceof Error) {
      tokensetNote = `${tokensetNote} ${error.message}`;
    }
  }

  try {
    const identityToken = await getGmailIdentityAccessToken(userId, runtimeEnv);
    const probe = await probeGmailApiAccess(identityToken.accessToken);

    return {
      connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
      requiredScopes,
      grantedScopes,
      missingScopes,
      connected: true,
      liveReady: probe.ok,
      tokensets: gmailTokensets,
      managementApiConfigured: true,
      tokenVaultConfigured: tokenVaultStatus.configured,
      actionPath: identityToken.accessPath,
      note: `${tokensetNote} ${probe.note}`,
    };
  } catch (fallbackError) {
    return {
      connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
      requiredScopes,
      grantedScopes,
      missingScopes,
      connected: gmailTokensets.length > 0,
      liveReady: false,
      tokensets: gmailTokensets,
      managementApiConfigured: true,
      tokenVaultConfigured: tokenVaultStatus.configured,
      actionPath: "unavailable" as const,
      note:
        fallbackError instanceof Error
          ? `${tokensetNote} ${fallbackError.message}`
          : tokensetNote,
    };
  }
}

export async function exchangeConnectedAccountAccessToken() {
  throw new Error(
    "Token Vault access-token exchange is still scaffolded only. This repo has no verified Auth0 audience or subject-token flow configured, so live Gmail currently depends on the Auth0 identity-provider access-token fallback instead.",
  );
}
