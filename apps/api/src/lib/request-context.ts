import type { Request } from "express";

export type RequestContext = {
  userId?: string;
  auth0AccessToken?: string;
  auth0AccessTokenError?: string;
};

function readHeader(request: Request, name: string) {
  const value = request.header(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function getRequestContext(request: Request): RequestContext {
  const queryUserId =
    typeof request.query.userId === "string" ? request.query.userId : undefined;

  return {
    userId: readHeader(request, "x-pta-auth0-user-id") ?? queryUserId,
    auth0AccessToken: readHeader(request, "x-pta-auth0-access-token"),
    auth0AccessTokenError: readHeader(
      request,
      "x-pta-auth0-access-token-error",
    ),
  };
}
