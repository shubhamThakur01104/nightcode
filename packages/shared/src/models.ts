export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type SupportedProvider = "groq" | "gemini" | "openrouter";

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  pricing: ModelPricing;
};

export const SUPPORTED_CHAT_MODELS = [

  {
    id: "qwen/qwen3.6-27b",
    provider: "groq",
    pricing: {
      inputUsdPerMillionTokens: 0.59,
      outputUsdPerMillionTokens: 0.79,
    },
  },
  {
    id: "llama-3.1-8b-instant",
    provider: "groq",
    pricing: {
      inputUsdPerMillionTokens: 0.05,
      outputUsdPerMillionTokens: 0.08,
    },
  },

  // ✨ Gemini Models (Google AI Studio)
  {
    id: "gemini-3.8-flash",
    provider: "gemini",
    pricing: {
      inputUsdPerMillionTokens: 0.075,
      outputUsdPerMillionTokens: 0.3,
    },
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    pricing: {
      inputUsdPerMillionTokens: 1.25,
      outputUsdPerMillionTokens: 5.0,
    },
  },

  // 🌐 OpenRouter Models (Aggregator / Free tiers)
  {
    id: "deepseek/deepseek-chat",
    provider: "openrouter",
    pricing: {
      inputUsdPerMillionTokens: 0.14,
      outputUsdPerMillionTokens: 0.28,
    },
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct:free",
    provider: "openrouter",
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
    },
  },
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];

export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "gemini-3.5-flash-lite";
