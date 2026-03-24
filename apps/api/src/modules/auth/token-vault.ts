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

function normalizeAuth0Domain(domain: string) {
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

function getConfiguredGmailScopes(runtimeEnv: AppEnv = env) {
  return runtimeEnv.AUTH0_GMAIL_SCOPES.split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
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
      "Management API access is used here only to inspect user tokensets and verify Token Vault connection status.",
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
      note: "Management API credentials are required to inspect tokensets for this user.",
    };
  }

  try {
    const tokensets = await listUserTokenSets(userId, runtimeEnv);
    const gmailTokensets = tokensets.filter(
      (tokenset) => tokenset.connection === runtimeEnv.AUTH0_GMAIL_CONNECTION,
    );
    const grantedScopes = Array.from(
      new Set(
        gmailTokensets
          .flatMap((tokenset) => tokenset.scope?.split(" ") ?? [])
          .map((scope) => scope.trim())
          .filter(Boolean),
      ),
    );
    const missingScopes = requiredScopes.filter(
      (scope) => !grantedScopes.includes(scope),
    );

    return {
      connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
      requiredScopes,
      grantedScopes,
      missingScopes,
      connected: gmailTokensets.length > 0,
      liveReady:
        tokenVaultStatus.configured &&
        gmailTokensets.length > 0 &&
        missingScopes.length === 0,
      tokensets: gmailTokensets,
      managementApiConfigured: true,
      tokenVaultConfigured: tokenVaultStatus.configured,
      note:
        gmailTokensets.length > 0
          ? "Auth0 found at least one Gmail-related tokenset for this user."
          : "No Gmail tokenset was found for this user yet.",
    };
  } catch (error) {
    try {
      const profile = await getManagementUserProfile(userId, runtimeEnv);
      const gmailIdentity = profile.identities?.find(
        (identity) =>
          identity.connection === runtimeEnv.AUTH0_GMAIL_CONNECTION ||
          identity.provider === runtimeEnv.AUTH0_GMAIL_CONNECTION,
      );

      const connected = Boolean(gmailIdentity?.access_token || gmailIdentity?.refresh_token);

      return {
        connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
        requiredScopes,
        grantedScopes: [] as string[],
        missingScopes: [] as string[],
        connected,
        liveReady: connected,
        tokensets: [] as TokenVaultTokenset[],
        managementApiConfigured: true,
        tokenVaultConfigured: tokenVaultStatus.configured,
        note: connected
          ? "Fell back to Auth0 identity-provider token inspection. Gmail appears connected, but scope-level Token Vault verification is not available in this tenant."
          : error instanceof Error
            ? `${error.message} Also could not find a Gmail identity token on the Auth0 user profile.`
            : "Unable to inspect Token Vault tokensets or identity-provider tokens.",
      };
    } catch (fallbackError) {
      return {
        connection: runtimeEnv.AUTH0_GMAIL_CONNECTION,
        requiredScopes,
        grantedScopes: [] as string[],
        missingScopes: requiredScopes,
        connected: false,
        liveReady: false,
        tokensets: [] as TokenVaultTokenset[],
        managementApiConfigured: true,
        tokenVaultConfigured: tokenVaultStatus.configured,
        note:
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unable to inspect tokensets.",
      };
    }
  }
}

export async function exchangeConnectedAccountAccessToken() {
  throw new Error(
    "Token Vault exchange is scaffolded but not fully implemented yet. Wire this helper to the Auth0 My Account connected-accounts token exchange flow before enabling live Gmail actions.",
  );
}
