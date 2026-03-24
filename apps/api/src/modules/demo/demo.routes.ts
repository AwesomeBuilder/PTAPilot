import { Router, type Request, type Router as ExpressRouter } from "express";
import {
  addMockMessageSchema,
  approvalEditSchema,
  setupUpdateSchema,
} from "@pta-pilot/shared";
import type { DemoService } from "./demo.service";

function getUserId(request: Request) {
  return typeof request.query.userId === "string" ? request.query.userId : undefined;
}

export function createDemoRouter(service: DemoService): ExpressRouter {
  const router = Router();

  router.get("/bootstrap", async (request, response, next) => {
    try {
      response.json(await service.getState(getUserId(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/architecture", async (_request, response, next) => {
    try {
      response.json(await service.getArchitectureSnapshot());
    } catch (error) {
      next(error);
    }
  });

  router.post("/setup", async (request, response, next) => {
    try {
      const payload = setupUpdateSchema.parse(request.body);
      response.json(await service.updateSetup(payload));
    } catch (error) {
      next(error);
    }
  });

  router.post("/inbox/mock-messages", async (request, response, next) => {
    try {
      const payload = addMockMessageSchema.parse(request.body);
      response.json(await service.addMockMessage(payload));
    } catch (error) {
      next(error);
    }
  });

  router.post("/inbox/ingest", async (_request, response, next) => {
    try {
      response.json(await service.ingestUpdates(getUserId(_request)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/newsletter/duplicate-last", async (_request, response, next) => {
    try {
      response.json(await service.duplicateLastNewsletter());
    } catch (error) {
      next(error);
    }
  });

  router.post("/newsletter/:audience", async (request, response, next) => {
    try {
      response.json(
        await service.updateNewsletterDraft(
          request.params.audience as "board" | "teachers" | "parents",
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/:actionId/edit", async (request, response, next) => {
    try {
      const payload = approvalEditSchema.parse(request.body);
      response.json(
        await service.editApproval(
          request.params.actionId,
          payload,
          getUserId(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/:actionId/approve", async (request, response, next) => {
    try {
      response.json(
        await service.approveAction(request.params.actionId, getUserId(request)),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/:actionId/reject", async (request, response, next) => {
    try {
      response.json(await service.rejectAction(request.params.actionId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
