import { createMiddleware } from "hono/factory";
import type { AuthenticatedEnv } from "./require-auth";
import { getAvailableCreditsBalance } from "../lib/polar";

const CREDITS_CACHE_TTL_MS = 45 * 1000; // 45 seconds TTL

type CachedCredits = {
  balance: number;
  expiresAt: number;
};

const creditsCache = new Map<string, CachedCredits>();

export function invalidateCreditsCache(userId: string) {
  creditsCache.delete(userId);
}

export function updateCachedCredits(userId: string, newBalance: number) {
  creditsCache.set(userId, {
    balance: newBalance,
    expiresAt: Date.now() + CREDITS_CACHE_TTL_MS,
  });
}

export const requireCreditsBalance = createMiddleware<AuthenticatedEnv>(
  async (c, next) => {
    try {
      const userId = c.get("userId");
      const now = Date.now();

      let creditsBalance: number;
      const cached = creditsCache.get(userId);

      if (cached && cached.expiresAt > now) {
        creditsBalance = cached.balance;
      } else {
        creditsBalance = await getAvailableCreditsBalance(userId);
        creditsCache.set(userId, {
          balance: creditsBalance,
          expiresAt: now + CREDITS_CACHE_TTL_MS,
        });

        // Prune stale cache entries if map grows large
        if (creditsCache.size > 2000) {
          for (const [key, value] of creditsCache.entries()) {
            if (value.expiresAt <= now) {
              creditsCache.delete(key);
            }
          }
        }
      }

      if (creditsBalance <= 0) {
        return c.json(
          { error: "No credits remaining. Run /upgrade to buy more credits." },
          402,
        );
      }
      await next();
    } catch (error) {
      console.error(error);
      return c.json(
        { error: "Unable to verify credits balance right now." },
        503,
      );
    }
  },
);
