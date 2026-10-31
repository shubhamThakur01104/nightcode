import { createMiddleware } from "hono/factory";
import { authenticateOAuthRequest } from "../lib/auth";

export type AuthenticatedEnv = {
  Variables: {
    userId: string;
  };
};

// In-memory token cache to eliminate 200-500ms Clerk network latency on repetitive requests
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CachedAuth = {
  userId: string;
  expiresAt: number;
};

const tokenCache = new Map<string, CachedAuth>();

export function invalidateAuthCache(token?: string) {
  if (token) {
    tokenCache.delete(token);
  } else {
    tokenCache.clear();
  }
}

export const requireAuth = createMiddleware<AuthenticatedEnv>(
  async (c, next) => {
    try {
      const authHeader = c.req.header("authorization") || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";

      const now = Date.now();

      // Check cache first
      if (token) {
        const cached = tokenCache.get(token);
        if (cached && cached.expiresAt > now) {
          c.set("userId", cached.userId);
          return await next();
        }
      }

      const auth = await authenticateOAuthRequest(c.req.raw);
      if (!auth) {
        return c.json({ error: "Unauthorized. Run /login to continue" }, 401);
      }

      // Populate cache
      if (token) {
        tokenCache.set(token, {
          userId: auth.userId,
          expiresAt: now + AUTH_CACHE_TTL_MS,
        });

        // Prune stale cache entries if map grows large
        if (tokenCache.size > 2000) {
          for (const [key, value] of tokenCache.entries()) {
            if (value.expiresAt <= now) {
              tokenCache.delete(key);
            }
          }
        }
      }

      c.set("userId", auth.userId);
      await next();
    } catch (error) {
      return c.json({ error: "Unauthorized. Run /login to continue" }, 401);
    }
  },
);
