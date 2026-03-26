import { Router, type Router as ExpressRouter } from "express";
import {
  getGmailTokenVaultStatus,
  getManagementApiStatus,
  getTokenVaultStatus,
} from "./token-vault";

export function createAuthRouter(): ExpressRouter {
  const router = Router();

  router.get("/status", async (request, response, next) => {
    try {
      const userId =
        typeof request.query.userId === "string" ? request.query.userId : undefined;

      response.set("Cache-Control", "no-store");
      response.json({
        tokenVault: getTokenVaultStatus(),
        managementApi: getManagementApiStatus(),
        gmail: await getGmailTokenVaultStatus(userId),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
