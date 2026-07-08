import type { FetchLike } from "../types";
import { OpenAICompatibleProvider } from "./openai-compatible";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_CHAT_PATH = "/chat/completions";

export function createDeepSeekProvider(fetchImpl?: FetchLike): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    id: "deepseek",
    baseUrl: DEEPSEEK_BASE_URL,
    chatPath: DEEPSEEK_CHAT_PATH,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}
