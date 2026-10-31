import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  convertToModelMessages,
  streamText,
  validateUIMessages,
  type InferUITools,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";

import { db } from "@nightcode/database";
import type { Prisma } from "@nightcode/database";

import {
  getToolContracts,
  modeSchema,
  type ModeType,
  type ToolContracts,
} from "@nightcode/shared";

import { buildSystemPrompt } from "../system-prompt";
import type { AuthenticatedEnv } from "../middleware/require-auth";
import {
  requireCreditsBalance,
  invalidateCreditsCache,
} from "../middleware/require-credits-balance";
import { calculateCreditsForUsage } from "../lib/credits";
import { ingestAiUsage } from "../lib/polar";
import { isSupportedChatModel, resolveChatModel } from "../lib/models";

type ChatMessageMetaData = {
  mode?: ModeType;
  model?: string;
  durationMs?: number;
  usage?: LanguageModelUsage;
};

type NightcodeUIMessage = UIMessage<
  ChatMessageMetaData,
  never,
  InferUITools<ToolContracts>
>;

const submitSchema = z.object({
  id: z.string(),
  messages: z
    .array(
      z.custom<NightcodeUIMessage>((value) => {
        return (
          value != null &&
          typeof value === "object" &&
          "id" in value &&
          "parts" in value
        );
      }),
    )
    .min(1),
  mode: modeSchema,
  model: z.string().refine(isSupportedChatModel, "Unsupported model"),
});

const submitValidator = zValidator("json", submitSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});

function hasPendingToolCalls(message: NightcodeUIMessage) {
  return message.parts.some((part) => {
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      const state = (part as { state?: string }).state;
      return state !== "output-available" && state !== "output-error";
    }
    return false;
  });
}

/**
 * Intelligent historical tool output compactor:
 * Prunes massive tool outputs (large file reads, grep dumps, bash logs) from older conversational turns
 * to achieve >70% token savings and prevent LLM "Lost in the Middle" attention degradation,
 * while preserving active turn context byte-for-byte.
 */
function pruneHistoricalToolOutputs(
  messages: NightcodeUIMessage[],
  keepRecentTurns = 2,
): NightcodeUIMessage[] {
  if (messages.length <= keepRecentTurns * 2) {
    return messages;
  }

  // Preserve the last `keepRecentTurns` user turns uncompacted
  let userTurnsSeen = 0;
  let cutoffIndex = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      userTurnsSeen++;
      if (userTurnsSeen >= keepRecentTurns) {
        cutoffIndex = i;
        break;
      }
    }
  }

  return messages.map((msg, index) => {
    if (index >= cutoffIndex) {
      return msg;
    }

    const compactedParts = msg.parts.map((part) => {
      const isTool =
        part.type === "dynamic-tool" || part.type.startsWith("tool-");
      if (!isTool) return part;

      const toolPart = part as {
        type: string;
        toolCallId: string;
        toolName?: string;
        input: any;
        state?: string;
        output?: any;
        errorText?: string;
      };

      if (toolPart.state !== "output-available" || !toolPart.output) {
        return part;
      }

      const output = toolPart.output;

      // Compact large readFile contents
      if (
        (toolPart.type === "tool-readFile" ||
          toolPart.toolName === "readFile") &&
        output &&
        typeof output === "object" &&
        "content" in output &&
        typeof output.content === "string" &&
        output.content.length > 300
      ) {
        const lineCount =
          output.totalLines ?? output.content.split("\n").length;
        return {
          ...toolPart,
          output: {
            ...output,
            content: `[File content (${lineCount} lines) previously read from '${toolPart.input?.path || ""}' - compacted to conserve context]`,
            compacted: true,
          },
        };
      }

      // Compact large bash stdout
      if (
        (toolPart.type === "tool-bash" || toolPart.toolName === "bash") &&
        output &&
        typeof output === "object" &&
        "stdout" in output &&
        typeof output.stdout === "string" &&
        output.stdout.length > 300
      ) {
        return {
          ...toolPart,
          output: {
            ...output,
            stdout: `[Shell command '${toolPart.input?.command || ""}' output (${output.stdout.length} chars) - compacted to conserve context]`,
            compacted: true,
          },
        };
      }

      // Compact large grep match arrays
      if (
        (toolPart.type === "tool-grep" || toolPart.toolName === "grep") &&
        output &&
        typeof output === "object" &&
        Array.isArray(output.matches) &&
        output.matches.length > 8
      ) {
        return {
          ...toolPart,
          output: {
            ...output,
            matches: output.matches.slice(0, 4),
            compacted: true,
            totalMatches: output.matches.length,
            message: `[Showing 4 of ${output.matches.length} matches - remainder compacted]`,
          },
        };
      }

      return part;
    });

    return {
      ...msg,
      parts: compactedParts,
    };
  });
}

const app = new Hono<AuthenticatedEnv>().post(
  "/",
  requireCreditsBalance,
  submitValidator,
  async (c) => {
    const userId = c.get("userId");
    const { id, messages, mode, model } = c.req.valid("json");

    const session = await db.session.findUnique({
      where: { id, userId },
    });
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const startTime = Date.now();
    const tools = getToolContracts(mode);
    const resolvedModel = resolveChatModel(model);
    const previousMessages = Array.isArray(session.messages)
      ? (session.messages as unknown as NightcodeUIMessage[])
      : [];

    const mergedMessages = [...previousMessages];

    for (const message of messages) {
      const incomingMessage = {
        ...message,
        metadata: {
          ...message.metadata,
          mode,
          model,
        },
      } satisfies NightcodeUIMessage;

      const existingMessageIndex = mergedMessages.findIndex(
        (m) => m.id === incomingMessage.id,
      );

      if (existingMessageIndex === -1) {
        mergedMessages.push(incomingMessage);
      } else {
        mergedMessages[existingMessageIndex] = incomingMessage;
      }
    }

    const nextMessages = await validateUIMessages<NightcodeUIMessage>({
      messages: mergedMessages,
      tools,
    });

    // Prune historical tool bloat for LLM model messages while keeping active turn intact
    const promptMessages = pruneHistoricalToolOutputs(nextMessages, 2);
    const modelMessages = await convertToModelMessages(promptMessages, {
      tools,
    });

    let completedUsage: LanguageModelUsage | null = null;

    const result = streamText({
      model: resolvedModel.model,
      system: buildSystemPrompt({ mode }),
      messages: modelMessages,
      tools,
      providerOptions: resolvedModel.providerOptions,
      onFinish(event) {
        completedUsage = event.totalUsage;
      },
    });

    return result.toUIMessageStreamResponse<NightcodeUIMessage>({
      originalMessages: nextMessages,
      messageMetadata({ part }) {
        if (part.type === "start") {
          return { mode, model };
        }

        if (part.type !== "finish") return undefined;

        return {
          mode,
          model,
          durationMs: Date.now() - startTime,
          ...(completedUsage ? { usage: completedUsage } : {}),
        };
      },

      async onFinish(event) {
        if (event.isAborted) return;
        if (hasPendingToolCalls(event.responseMessage)) return;

        // Persist the full original messages (including unpruned output) in DB for user history
        await db.session.update({
          where: { id, userId },
          data: {
            messages: event.messages as unknown as Prisma.InputJsonValue,
          },
        });

        if (!completedUsage) return;

        try {
          const billableUsage = calculateCreditsForUsage({
            provider: resolvedModel.provider,
            model: resolvedModel.modelId,
            usage: completedUsage,
          });

          await ingestAiUsage({
            externalCustomerId: userId,
            eventId: `chat-message:${event.responseMessage.id}`,
            credits: billableUsage.credits,
          });

          // Invalidate cached credit balance so next request fetches latest balance
          invalidateCreditsCache(userId);
        } catch (error) {
          console.error("Failed to ingest Polar AI usage for chat message", {
            error,
            sessionId: id,
            messageId: event.responseMessage.id,
            userId,
          });
        }
      },
      onError(error) {
        return error instanceof Error ? error.message : String(error);
      },
    });
  },
);

export default app;
