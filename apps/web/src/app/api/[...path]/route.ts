import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

const apiBaseUrl = process.env.PTA_API_BASE_URL ?? "http://localhost:8081";

export const dynamic = "force-dynamic";

function buildTargetUrl(request: NextRequest, path: string[]) {
  const target = new URL(`/api/${path.join("/")}`, apiBaseUrl);
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);

  // The backend now trusts server-injected auth headers instead of client-supplied user IDs.
  searchParams.delete("userId");
  target.search = searchParams.toString();

  return target;
}

function buildForwardHeaders(request: NextRequest) {
  const headers = new Headers();
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");

  if (accept) {
    headers.set("accept", accept);
  }

  if (contentType) {
    headers.set("content-type", contentType);
  }

  return headers;
}

function copyAuthCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const targetUrl = buildTargetUrl(request, path);
  const headers = buildForwardHeaders(request);
  const authResponse = NextResponse.next();

  if (auth0) {
    const session = await auth0.getSession();

    if (session?.user.sub) {
      headers.set("x-pta-auth0-user-id", session.user.sub);
    }

    if (session) {
      try {
        const { token } = await auth0.getAccessToken(request, authResponse);
        headers.set("x-pta-auth0-access-token", token);
      } catch (error) {
        headers.set(
          "x-pta-auth0-access-token-error",
          error instanceof Error
            ? error.message
            : "Unable to retrieve the Auth0 session access token.",
        );
      }
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });

    copyAuthCookies(authResponse, response);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the PTA Pilot API.",
      },
      { status: 502 },
    );

    copyAuthCookies(authResponse, response);
    return response;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}
