export type LLMRole = "system" | "developer" | "user" | "assistant" | "tool";

export type LLMToolCall = {
  id: string;
  name: string;
  argumentsText: string;
  argumentsJson?: unknown;
};

export type LLMMessage =
  | { role: "system" | "developer" | "user"; content: string }
  | {
      role: "assistant";
      content?: string;
      reasoningContent?: string;
      toolCalls?: LLMToolCall[];
    }
  | {
      role: "tool";
      toolCallId: string;
      content: string;
    };

export type LLMTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LLMUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LLMFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "error"
  | "unknown";

export type LLMStreamEvent =
  | { type: "text-delta"; text: string; offset: number }
  | { type: "reasoning-delta"; text: string; offset: number }
  | { type: "tool-call-start"; toolCallId: string; name: string; index: number }
  | { type: "tool-call-delta"; toolCallId: string; index: number; argumentsDelta: string }
  | { type: "tool-call-complete"; toolCall: LLMToolCall; index: number }
  | { type: "finish"; reason: LLMFinishReason; usage?: LLMUsage }
  | { type: "error"; error: Error };

export type FetchLike = typeof fetch;

export type LLMChatRequest = {
  provider?: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
  toolChoice?: "auto" | "none" | "required";
  parallelToolCalls?: boolean;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
};

export type LLMChatResponse = {
  text: string;
  reasoningContent?: string;
  toolCalls: LLMToolCall[];
  finishReason: LLMFinishReason;
  usage?: LLMUsage;
  raw?: unknown;
};

export interface LLMProvider {
  readonly id: string;
  chat(request: LLMChatRequest): Promise<LLMChatResponse>;
  stream(request: LLMChatRequest): AsyncIterable<LLMStreamEvent>;
}
