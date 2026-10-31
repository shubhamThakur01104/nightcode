import { Hono } from "hono";

import { zValidator } from "@hono/zod-validator";
import * as Sentry from "@sentry/hono/bun";
import { z } from "zod";
import { db } from "@nightcode/database";

import type { AuthenticatedEnv } from "../middleware/require-auth";
import { requireCreditsBalance } from "../middleware/require-credits-balance";

const createSessionSchema = z.object({
  title: z.string(),
});

const createSessionValidator = zValidator(
  "json",
  createSessionSchema,
  (result, c) => {
    if (!result.success) {
      Sentry.logger.warn("Session creation validation failed", {
        path: c.req.path,
        issues: result.error.issues.length,
      });
      return c.json({ error: "Invalid request body" }, 400);
    }
  },
);

const app = new Hono<AuthenticatedEnv>()
  .get("/", async (c) => {
    const userId = c.get("userId");
    const sessions = await db.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });

    Sentry.logger.info("Listed sessions", {
      count: sessions.length,
    });

    return c.json(sessions);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const limitParam = c.req.query("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const session = await db.session.findUnique({
      where: { id, userId },
    });

    if (!session) {
      Sentry.logger.warn("Session not found", {
        sessionId: id,
        userId: userId,
      });

      return c.json({ error: "Session not found" }, 404);
    }

    Sentry.logger.info("Loaded session", {
      sessionId: session.id,
    });

    // Support windowed/limited message loading to reduce payload size on initial CLI screen render
    if (limit && Array.isArray(session.messages) && session.messages.length > limit) {
      const allMessages = session.messages as unknown as unknown[];
      return c.json({
        ...session,
        messages: allMessages.slice(-limit),
        totalMessages: allMessages.length,
        hasMoreMessages: true,
      });
    }

    return c.json(session);
  })
  .get("/:id/messages", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const limit = Math.max(1, Math.min(100, parseInt(c.req.query("limit") || "30", 10)));
    const beforeParam = c.req.query("before");
    const before = beforeParam ? parseInt(beforeParam, 10) : undefined;

    const session = await db.session.findUnique({
      where: { id, userId },
      select: { messages: true },
    });

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const messages = Array.isArray(session.messages)
      ? (session.messages as unknown as unknown[])
      : [];

    const endIndex = before !== undefined ? Math.max(0, Math.min(before, messages.length)) : messages.length;
    const startIndex = Math.max(0, endIndex - limit);
    const sliced = messages.slice(startIndex, endIndex);

    return c.json({
      messages: sliced,
      startIndex,
      endIndex,
      totalCount: messages.length,
      hasMore: startIndex > 0,
    });
  })
  .post("/", requireCreditsBalance, createSessionValidator, async (c) => {
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const session = await db.session.create({
      data: {
        ...data,
        userId,
      },
    });

    Sentry.logger.info("Created session", {
      sessionId: session.id,
      title: session.title,
    });

    return c.json(session, 201);
  });

export default app;
