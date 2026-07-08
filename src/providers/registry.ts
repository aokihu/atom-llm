import type { FetchLike, LLMProvider } from "../types";
import { createDeepSeekProvider } from "./deepseek";
import { OpenAICompatibleProvider } from "./openai-compatible";

export type ProviderConfig = {
  id: string;
  type?: "openai-compatible";
  baseUrl?: string;
  chatPath?: string;
  fetch?: FetchLike;
};

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.id === "deepseek" && !config.baseUrl) {
    return createDeepSeekProvider(config.fetch);
  }

  if (!config.baseUrl) {
    throw new Error(`Provider "${config.id}" requires baseUrl`);
  }

  return new OpenAICompatibleProvider({
    id: config.id,
    baseUrl: config.baseUrl,
    ...(config.chatPath ? { chatPath: config.chatPath } : {}),
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });
}
