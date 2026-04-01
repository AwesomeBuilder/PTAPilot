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

const TOKEN_VAULT_GRANT_TYPE =
  "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token";
const TOKEN_VAULT_REQUESTED_TOKEN_TYPE =
  "http://auth0.com/oauth/token-type/federated-connection-access-token";
const TOKEN_VAULT_SUBJECT_TOKEN_TYPE_ACCESS_TOKEN =
  "urn:ietf:params:oauth:token-type:access_token";

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
export type TokenVaultSubjectTokenType =
  typeof TOKEN_VAULT_SUBJECT_TOKEN_TYPE_ACCESS_TOKEN;

type GmailApiProbe = {
  ok: boolean;
  note: string;
};

export type GmailAccessTokenBundle = {
  accessPath: GmailAccessPath;
  accessToken: string;
  note: string;
};

const missingIdentityAccessTokenBaseNote =
  "Auth0 found the Gmail identity, but did not expose a current Google access token on the user profile.";

function normalizeAuth0Domain(domain: string) {
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

function getTokenVaultConnection(runtimeEnv: AppEnv = env) {
  return (
    runtimeEnv.AUTH0_TOKEN_VAULT_CONNECTION ?? runtimeEnv.AUTH0_GMAIL_CONNECTION
  );
}

function formatMissingIdentityAccessTokenNote(
  hasConnectedGmailTokenset = false,
) {
  if (hasConnectedGmailTokenset) {
    return (
      "Auth0 found the Gmail connection for this user, but the current demo fallback could not " +
      "read a fresh Google access token from the Auth0 user profile. Reconnect Gmail once to " +
      "refresh it; if this keeps happening, this tenant is not exposing identity-provider " +
      "tokens and PTA Pilot needs a real Token Vault exchange flow."
    );
  }

  return (
    `${missingIdentityAccessTokenBaseNote} ` +
    "Reconnect Gmail through Auth0 to mint a fresh Google access token for the demo."
  );
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
        "Google accepted the delegated token for live Gmail API access.",
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
    throw new Error(formatMissingIdentityAccessTokenNote());
  }

  return {
    accessPath: "identity_provider",
    accessToken: gmailIdentity.access_token,
    note:
      "Using the Auth0 Management API identity-provider access token fallback because the Token Vault exchange path was unavailable for this request.",
  };
}

type TokenVaultExchangePayload = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function formatTokenVaultExchangeError(
  status: number,
  payload: TokenVaultExchangePayload | null,
) {
  const details = payload?.error_description?.trim() ?? payload?.error?.trim();

  if (details) {
    return `Auth0 Token Vault exchange failed: ${details}`;
  }

  return `Auth0 Token Vault exchange failed with status ${status}.`;
}

function getTokenVaultExchangeMissingFields(runtimeEnv: AppEnv = env) {
  return [
    !runtimeEnv.AUTH0_DOMAIN ? "AUTH0_DOMAIN" : null,
    !runtimeEnv.AUTH0_CLIENT_ID ? "AUTH0_CLIENT_ID" : null,
    !runtimeEnv.AUTH0_CLIENT_SECRET ? "AUTH0_CLIENT_SECRET" : null,
    !getTokenVaultConnection(runtimeEnv)
      ? "AUTH0_TOKEN_VAULT_CONNECTION or AUTH0_GMAIL_CONNECTION"
      : null,
  ].filter((field): field is string => Boolean(field));
}

export async function exchangeConnectedAccountAccessToken(
  subjectToken: string,
  runtimeEnv: AppEnv = env,
): Promise<GmailAccessTokenBundle> {
  const missing = getTokenVaultExchangeMissingFields(runtimeEnv);

  if (missing.length > 0) {
    throw new Error(
      `Auth0 Token Vault exchange is not configured. Missing: ${missing.join(", ")}`,
    );
  }

  if (!subjectToken.trim()) {
    throw new Error(
      "Auth0 Token Vault exchange requires the current Auth0 access token from the logged-in web session.",
    );
  }

  const auth0Domain = normalizeAuth0Domain(runtimeEnv.AUTH0_DOMAIN!);
  const response = await fetch(`${auth0Domain}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: TOKEN_VAULT_GRANT_TYPE,
      client_id: runtimeEnv.AUTH0_CLIENT_ID!,
      client_secret: runtimeEnv.AUTH0_CLIENT_SECRET!,
      connection: getTokenVaultConnection(runtimeEnv)!,
      subject_token_type: TOKEN_VAULT_SUBJECT_TOKEN_TYPE_ACCESS_TOKEN,
      subject_token: subjectToken,
      requested_token_type: TOKEN_VAULT_REQUESTED_TOKEN_TYPE,
    }),
  });

  let payload: TokenVaultExchangePayload | null = null;

  try {
    payload = (await response.json()) as TokenVaultExchangePayload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(formatTokenVaultExchangeError(response.status, payload));
  }

  if (!payload?.access_token) {
    throw new Error(
      "Auth0 Token Vault exchange completed without returning a connected-account access token.",
    );
  }

  return {
    accessPath: "token_vault",
    accessToken: payload.access_token,
    note:
      "Using the Auth0 Token Vault server-side exchange path for delegated Gmail access.",
  };
}

export async function getGmailTokenVaultStatus(
  userId: string | undefined,
  options: {
    runtimeEnv?: AppEnv;
    auth0AccessToken?: string;
    auth0AccessTokenError?: string;
  } = {},
) {
  const runtimeEnv = options.runtimeEnv ?? env;
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

  let gmailTokensets: TokenVaultTokenset[] = [];
  let grantedScopes: string[] = [];
  let missingScopes: string[] = [];
  let tokensetNote =
    "Token Vault tokensets could not be inspected in this tenant, so PTA Pilot will rely on the Auth0 identity-provider fallback when possible.";
  let tokenVaultExchangeNote = options.auth0AccessTokenError
    ? `The authenticated web session could not supply an Auth0 subject token for Token Vault exchange. ${options.auth0AccessTokenError}`
    : "";

  try {
    if (managementStatus.configured) {
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
          ? "Auth0 found a Gmail tokenset for this user and PTA Pilot can exchange the authenticated session for delegated Gmail access."
          : "No Gmail tokenset was found for this user yet.";
    } else {
      tokensetNote =
        "Management API credentials are not configured, so Token Vault tokensets could not be inspected for this user.";
      missingScopes = requiredScopes;
    }
  } catch (error) {
    if (error instanceof Error) {
      tokensetNote = `${tokensetNote} ${error.message}`;
    }
  }

  if (options.auth0AccessToken) {
    try {
      const tokenVaultToken = await exchangeConnectedAccountAccessToken(
        options.auth0AccessToken,
        runtimeEnv,
      );
      const probe = await probeGmailApiAccess(tokenVaultToken.accessToken);

      return {
        connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
        requiredScopes,
        grantedScopes,
        missingScopes,
        connected: true,
        liveReady: probe.ok,
        tokensets: gmailTokensets,
        managementApiConfigured: managementStatus.configured,
        tokenVaultConfigured: tokenVaultStatus.configured,
        actionPath: tokenVaultToken.accessPath,
        note: [tokensetNote, probe.note].filter(Boolean).join(" "),
      };
    } catch (error) {
      tokenVaultExchangeNote =
        error instanceof Error ? error.message : "Auth0 Token Vault exchange failed.";
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
      managementApiConfigured: managementStatus.configured,
      tokenVaultConfigured: tokenVaultStatus.configured,
      actionPath: identityToken.accessPath,
      note: [tokensetNote, tokenVaultExchangeNote, probe.note]
        .filter(Boolean)
        .join(" "),
    };
  } catch (fallbackError) {
    const fallbackNote =
      fallbackError instanceof Error &&
      fallbackError.message.startsWith(missingIdentityAccessTokenBaseNote) &&
      gmailTokensets.length > 0
        ? formatMissingIdentityAccessTokenNote(true)
        : fallbackError instanceof Error
          ? fallbackError.message
          : tokensetNote;

    return {
      connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
      requiredScopes,
      grantedScopes,
      missingScopes,
      connected: gmailTokensets.length > 0,
      liveReady: false,
      tokensets: gmailTokensets,
      managementApiConfigured: managementStatus.configured,
      tokenVaultConfigured: tokenVaultStatus.configured,
      actionPath: "unavailable" as const,
      note: [tokensetNote, tokenVaultExchangeNote, fallbackNote]
        .filter(Boolean)
        .join(" "),
    };
  }
}
