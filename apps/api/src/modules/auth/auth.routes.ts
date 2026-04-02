import { Router, type Router as ExpressRouter } from "express";
import { getRequestContext } from "../../lib/request-context";
import {
  getGmailTokenVaultStatus,
  getManagementApiStatus,
  getTokenVaultStatus,
} from "./token-vault";

export function createAuthRouter(): ExpressRouter {
  const router = Router();

  router.get("/status", async (request, response, next) => {
    try {
      const requestContext = getRequestContext(request);

      response.set("Cache-Control", "no-store");
      response.json({
        tokenVault: getTokenVaultStatus(),
        managementApi: getManagementApiStatus(),
        gmail: await getGmailTokenVaultStatus(requestContext.userId, {
          auth0AccessToken: requestContext.auth0AccessToken,
          auth0AccessTokenError: requestContext.auth0AccessTokenError,
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
