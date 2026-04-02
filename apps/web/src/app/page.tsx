import { DashboardShell } from "@/components/dashboard-shell";
import {
  auth0,
  gmailConnectUrl,
  isAuthEnabled,
  isTokenVaultConfigured,
} from "@/lib/auth0";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = auth0 ? await auth0.getSession() : null;

  return (
    <DashboardShell
      authEnabled={isAuthEnabled}
      gmailConnectUrl={gmailConnectUrl}
      tokenVaultConfigured={isTokenVaultConfigured}
      user={
        session?.user
          ? {
              sub: session.user.sub,
              name: session.user.name,
              email: session.user.email,
              picture: session.user.picture,
            }
          : null
      }
    />
  );
}
