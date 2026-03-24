import cors from "cors";
import express, { type Express, type NextFunction } from "express";
import { env } from "./config/env";
import { RuntimeStore } from "./lib/runtime-store";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { createDemoRouter } from "./modules/demo/demo.routes";
import { DemoService } from "./modules/demo/demo.service";

export function createApp(): Express {
  const app = express();
  const runtimeStore = new RuntimeStore(env.DEMO_RUNTIME_STATE_PATH);
  const demoService = new DemoService(runtimeStore);

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((item) => item.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "pta-pilot-api",
      time: new Date().toISOString(),
    });
  });

  app.use("/api/auth", createAuthRouter());
  app.use("/api", createDemoRouter(demoService));

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: NextFunction,
    ) => {
      const message =
        error instanceof Error ? error.message : "Unknown server error";
      response.status(500).json({ error: message });
    },
  );

  return app;
}
