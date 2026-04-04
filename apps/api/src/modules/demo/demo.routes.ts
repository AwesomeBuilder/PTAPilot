import {
  Router,
  type NextFunction,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from "express";
import {
  addMockMessageSchema,
  approvalStepManualCompleteSchema,
  approvalEditSchema,
  inboxArtifactUploadSchema,
  newsletterDraftSchema,
  setupUpdateSchema,
} from "@pta-pilot/shared";
import multer from "multer";
import { getRequestContext } from "../../lib/request-context";
import type { DemoService } from "./demo.service";

export function createDemoRouter(service: DemoService): ExpressRouter {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  router.get("/bootstrap", async (request, response, next) => {
    try {
      response.json(await service.getState(getRequestContext(request)));
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

  router.post(
    "/inbox/artifacts",
    upload.single("file"),
    async (request, response, next) => {
      try {
        const payload = inboxArtifactUploadSchema.parse(request.body);
        response.json(
          await service.addInboxArtifact(payload, request.file),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/inbox/ingest", async (_request, response, next) => {
    try {
      response.json(await service.ingestUpdates(getRequestContext(_request)));
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

  router.post("/reset", async (request, response, next) => {
    try {
      response.json(await service.resetWorkflowForTesting(getRequestContext(request)));
    } catch (error) {
      next(error);
    }
  });

  const saveNewsletterHandler = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const payload = newsletterDraftSchema.parse(request.body);
      response.json(
        await service.updateNewsletterDraft(
          request.params.audience as "board" | "teachers" | "parents",
          payload,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  router.put("/newsletter/:audience", saveNewsletterHandler);
  router.post("/newsletter/:audience", saveNewsletterHandler);

  router.post("/actions/:actionId/edit", async (request, response, next) => {
    try {
      const payload = approvalEditSchema.parse(request.body);
      response.json(
        await service.editApproval(
          request.params.actionId,
          payload,
          getRequestContext(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/:actionId/approve", async (request, response, next) => {
    try {
      response.json(await service.approveAction(request.params.actionId, getRequestContext(request)));
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

  router.post("/actions/:actionId/retry", async (request, response, next) => {
    try {
      response.json(
        await service.retryAction(
          request.params.actionId,
          getRequestContext(request),
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/actions/:actionId/steps/:stepId/manual-complete",
    async (request, response, next) => {
      try {
        const payload = approvalStepManualCompleteSchema.parse(request.body);
        response.json(
          await service.completeManualStep(
            request.params.actionId,
            request.params.stepId,
            payload,
            getRequestContext(request),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
