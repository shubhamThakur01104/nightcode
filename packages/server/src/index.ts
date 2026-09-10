import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import chat from "./routes/chat";
import * as Sentry from "@sentry/hono/bun";
import auth from "./routes/auth";
import { sentry } from "@sentry/hono/bun";

import sessions from "./routes/sessions";
import { requireAuth } from "./middleware/require-auth";

const app = new Hono();

app.use(
  sentry(app, {
    dsn: "https://72a8408b8994e8059d7b6ffb7fe1c0d4@o4511212814401536.ingest.de.sentry.io/4512045918847056",
    tracesSampleRate: 1.0,
    enableLogs: true,
    dataCollection: {
      // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
      // https://docs.sentry.io/platforms/javascript/guides/hono/configuration/options/#dataCollection
      // userInfo: false,
      // httpBodies: [],
    },
  }),
);

app.get("/debug-sentry", () => {
  // Send a log before throwing the error
  Sentry.logger.info("User triggered test error", {
    action: "test_error_endpoint",
  });
  // Send a test metric before throwing the error
  Sentry.metrics.count("test_counter", 1);
  throw new Error("My first Sentry error!");
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    Sentry.logger.warn("Handled HTTP error", {
      status: error.status,
      message: error.message || "Request Failed",
      path: c.req.path,
      method: c.req.method,
    });
    return c.json(
      {
        error: error.message || "Request failed",
      },
      error.status,
    );
  }
  Sentry.logger.error("Unhandled server error", {
    path: c.req.path,
    method: c.req.method,
    message: error instanceof Error ? error.message : "Unknown Error",
  });

  return c.json({ error: "Internal server error" }, 500);
});

app.use("/sessions/*", requireAuth);
app.use("/chat/*", requireAuth);

const routes = app
  .route("/auth", auth)
  .route("/sessions", sessions)
  .route("/chat", chat);

export type AppType = typeof routes;
// idleTimeout must be high, otherwise LLM tool calls might not complete
export default {
  port: Number(process.env.PORT) || 3000,
  hostname: "0.0.0.0",
  fetch: app.fetch,
  idleTimeout: 255,
};
