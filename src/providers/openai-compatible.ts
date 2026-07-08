import type {
  FetchLike,
  LLMChatRequest,
  LLMChatResponse,
  LLMFinishReason,
  LLMMessage,
  LLMProvider,
  LLMStreamEvent,
  LLMTool,
  LLMToolCall,
  LLMUsage,
} from "../types";
import { LLMHTTPError, LLMProtocolError } from "../transport/errors";
import { parseSSEStream } from "../transport/sse-parser";
import { parseJsonArguments } from "../tools/json-args";

export type OpenAICompatibleProviderOptions = {
  id: string;
  baseUrl: string;
  chatPath?: string;
  fetch?: FetchLike;
};

type PendingToolCall = {
  id: string;
  name: string;
  argumentsText: string;
  started: boolean;
};

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  readonly #baseUrl: string;
  readonly #chatPath: string;
  readonly #fetch: FetchLike;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#chatPath = options.chatPath ?? "/chat/completions";
    this.#fetch = options.fetch ?? fetch;
  }

  async chat(request: LLMChatRequest): Promise<LLMChatResponse> {
    const res = await this.#post(request, false);
    const json = await res.json();
    return normalizeChatResponse(json);
  }

  async *stream(request: LLMChatRequest): AsyncIterable<LLMStreamEvent> {
    const res = await this.#post(request, true);
    if (!res.body) throw new LLMProtocolError("Streaming response has no body");

    let textOffset = 0;
    let reasoningOffset = 0;
    let usage: LLMUsage | undefined;
    let lastFinishReason: LLMFinishReason = "unknown";
    const pending = new Map<number, PendingToolCall>();

    for await (const event of parseSSEStream(res.body)) {
      if (event.type === "done") {
        if (pending.size > 0) {
          for (const [index, item] of pending) {
            yield { type: "tool-call-complete", toolCall: toToolCall(item), index };
          }
          pending.clear();
        }
        yield { type: "finish", reason: lastFinishReason, ...(usage ? { usage } : {}) };
        return;
      }

      if (event.type === "error") {
        yield { type: "error", error: event.error };
        continue;
      }

      const chunk = event.data as any;
      if (chunk?.usage) usage = normalizeUsage(chunk.usage);

      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta ?? {};
      const text = normalizeContent(delta.content);
      if (text) {
        yield { type: "text-delta", text, offset: textOffset };
        textOffset += text.length;
      }

      const reasoning = normalizeContent(delta.reasoning_content ?? delta.reasoning ?? delta.reasoningContent);
      if (reasoning) {
        yield { type: "reasoning-delta", text: reasoning, offset: reasoningOffset };
        reasoningOffset += reasoning.length;
      }

      const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const rawCall of toolCalls) {
        const index = Number(rawCall.index ?? 0);
        const fn = rawCall.function ?? {};
        const existing = pending.get(index) ?? {
          id: "",
          name: "",
          argumentsText: "",
          started: false,
        };

        if (rawCall.id) existing.id = String(rawCall.id);
        if (fn.name) existing.name = String(fn.name);
        if (fn.arguments) existing.argumentsText += String(fn.arguments);

        pending.set(index, existing);

        if (!existing.started && existing.id && existing.name) {
          existing.started = true;
          yield { type: "tool-call-start", toolCallId: existing.id, name: existing.name, index };
        }

        if (fn.arguments) {
          yield {
            type: "tool-call-delta",
            toolCallId: existing.id,
            index,
            argumentsDelta: String(fn.arguments),
          };
        }
      }

      if (choice.finish_reason) {
        lastFinishReason = normalizeFinishReason(choice.finish_reason);
        if (lastFinishReason === "tool_calls" && pending.size > 0) {
          for (const [index, item] of pending) {
            yield { type: "tool-call-complete", toolCall: toToolCall(item), index };
          }
          pending.clear();
        }
      }
    }
  }

  async #post(request: LLMChatRequest, stream: boolean): Promise<Response> {
    const body = toOpenAIRequestBody(request, stream);
    const res = await this.#fetch(`${request.baseUrl?.replace(/\/$/, "") ?? this.#baseUrl}${this.#chatPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.abortSignal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMHTTPError(res.status, text);
    }

    return res;
  }
}

export function toOpenAIRequestBody(request: LLMChatRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...(request.providerOptions ?? {}),
    model: request.model,
    messages: request.messages.map(toOpenAIMessage),
    stream,
  };

  if (request.tools?.length) body.tools = request.tools.map(toOpenAITool);
  if (request.toolChoice) body.tool_choice = request.toolChoice;
  if (typeof request.parallelToolCalls === "boolean") body.parallel_tool_calls = request.parallelToolCalls;
  if (typeof request.temperature === "number") body.temperature = request.temperature;
  if (typeof request.maxOutputTokens === "number") body.max_tokens = request.maxOutputTokens;
  if (stream) body.stream_options = { include_usage: true };

  return body;
}

function toOpenAIMessage(message: LLMMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === "assistant") {
    const result: Record<string, unknown> = {
      role: "assistant",
      content: message.content ?? null,
    };

    if (message.toolCalls?.length) {
      result.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.argumentsText,
        },
      }));
    }

    return result;
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function toOpenAITool(tool: LLMTool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function normalizeChatResponse(raw: any): LLMChatResponse {
  const choice = raw?.choices?.[0];
  if (!choice) throw new LLMProtocolError("Chat response has no choices", raw);

  const message = choice.message ?? {};
  const response: LLMChatResponse = {
    text: normalizeContent(message.content),
    toolCalls: normalizeToolCalls(message.tool_calls),
    finishReason: normalizeFinishReason(choice.finish_reason),
    raw,
  };

  const reasoningContent = normalizeOptionalContent(message.reasoning_content ?? message.reasoning ?? message.reasoningContent);
  if (reasoningContent) response.reasoningContent = reasoningContent;

  const usage = normalizeUsage(raw?.usage);
  if (usage) response.usage = usage;

  return response;
}

function normalizeToolCalls(raw: unknown): LLMToolCall[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const fn = item?.function ?? {};
    const argumentsText = String(fn.arguments ?? "");
    const parsed = parseJsonArguments(argumentsText);
    return {
      id: String(item?.id ?? `tool_call_${index}`),
      name: String(fn.name ?? ""),
      argumentsText,
      ...(parsed.ok ? { argumentsJson: parsed.value } : {}),
    };
  });
}

function toToolCall(item: PendingToolCall): LLMToolCall {
  const parsed = parseJsonArguments(item.argumentsText);
  return {
    id: item.id,
    name: item.name,
    argumentsText: item.argumentsText,
    ...(parsed.ok ? { argumentsJson: parsed.value } : {}),
  };
}

function normalizeUsage(raw: any): LLMUsage | undefined {
  if (!raw) return undefined;

  const usage: LLMUsage = {};
  const promptTokens = raw.prompt_tokens ?? raw.promptTokens;
  const completionTokens = raw.completion_tokens ?? raw.completionTokens;
  const totalTokens = raw.total_tokens ?? raw.totalTokens;

  if (typeof promptTokens === "number") usage.promptTokens = promptTokens;
  if (typeof completionTokens === "number") usage.completionTokens = completionTokens;
  if (typeof totalTokens === "number") usage.totalTokens = totalTokens;

  return Object.keys(usage).length > 0 ? usage : undefined;
}

function normalizeFinishReason(raw: unknown): LLMFinishReason {
  switch (raw) {
    case "stop": return "stop";
    case "length": return "length";
    case "tool_calls": return "tool_calls";
    case "content_filter": return "content_filter";
    case "error": return "error";
    default: return "unknown";
  }
}

function normalizeOptionalContent(value: unknown): string | undefined {
  const text = normalizeContent(value);
  return text || undefined;
}

function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => typeof part === "string" ? part : part?.text ?? "")
      .join("");
  }
  return "";
}
