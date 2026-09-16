import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import {
  findSupportedChatModel,
  type SupportedChatModel,
  type SupportedChatModelId,
  type SupportedProvider,
} from "@nightcode/shared";

import type { ProviderOptions } from "@ai-sdk/provider-utils";

import type { LanguageModel } from "ai";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type GroqModelId = Extract<SupportedChatModel, { provider: "groq" }>["id"];

type GeminiModelId = Extract<SupportedChatModel, { provider: "gemini" }>["id"];

type OpenRouterModelId = Extract<
  SupportedChatModel,
  { provider: "openrouter" }
>["id"];

export type ResolvedModel = {
  model: LanguageModel;
  provider: SupportedProvider;
  modelId: SupportedChatModelId;
  providerOptions?: ProviderOptions;
};

const GOOGLE_PROVIDER_OPTIONS: Partial<Record<GeminiModelId, ProviderOptions>> =
  {
    "gemini-3.5-flash-lite": {
      google: {
        thinkingConfig: {
          thinkingBudget: 10000,
          includeThoughts: true,
        },
      },
    },
    "gemini-3.8-flash": {
      google: {
        thinkingConfig: {
          thinkingBudget: 15000,
          includeThoughts: true,
        },
      },
    },
  };

const GROQ_PROVIDER_OPTIONS: Partial<Record<GroqModelId, ProviderOptions>> = {
  "qwen/qwen3.6-27b": {
    groq: {
      reasoningFormat: "parsed",
      reasoningEffort: "default",
      serviceTier: "on_demand",
    },
  },
};

const OPENROUTER_PROVIDER_OPTIONS: Partial<
  Record<OpenRouterModelId, ProviderOptions>
> = {};

function assertUnsupportedProvider(provider: never): never {
  throw new Error(`Unsupported provider: ${provider}`);
}

function resolveGroqModel(modelId: GroqModelId): ResolvedModel {
  return {
    model: groq(modelId),
    provider: "groq",
    modelId,
    providerOptions: GROQ_PROVIDER_OPTIONS[modelId],
  };
}

function resolveGeminiModel(modelId: GeminiModelId): ResolvedModel {
  return {
    model: google(modelId),
    provider: "gemini",
    modelId,
    providerOptions: GOOGLE_PROVIDER_OPTIONS[modelId],
  };
}

function resolveOpenRouterModel(modelId: OpenRouterModelId): ResolvedModel {
  return {
    model: openrouter(modelId),
    provider: "openrouter",
    modelId,
    providerOptions: OPENROUTER_PROVIDER_OPTIONS[modelId],
  };
}

function resolveSupportedChatModel(model: SupportedChatModel): ResolvedModel {
  const provider = model.provider;

  switch (provider) {
    case "groq":
      return resolveGroqModel(model.id);
    case "gemini":
      return resolveGeminiModel(model.id);
    case "openrouter":
      return resolveOpenRouterModel(model.id);
    default:
      return assertUnsupportedProvider(provider);
  }
}

export function isSupportedChatModel(
  modelId: string,
): modelId is SupportedChatModelId {
  return findSupportedChatModel(modelId) != null;
}

export function resolveChatModel(modelId: string): ResolvedModel {
  const model = findSupportedChatModel(modelId);
  if (!model) {
    throw new Error(`Unsupported model : ${modelId}`);
  }
  return resolveSupportedChatModel(model);
}
