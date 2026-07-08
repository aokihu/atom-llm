import { describe, expect, test } from "bun:test";
import { OpenAICompatibleProvider } from "../src/providers/openai-compatible";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenAICompatibleProvider", () => {
  test("normalizes a text response", async () => {
    const calls: RequestInit[] = [];
    const provider = new OpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://example.test/v1",
      fetch: async (_url, init) => {
        calls.push(init ?? {});
        return jsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "hello" },
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
          },
        });
      },
    });

    const result = await provider.chat({
      model: "model-a",
      apiKey: "test-key",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("hello");
    expect(result.finishReason).toBe("stop");
    expect(result.usage?.totalTokens).toBe(3);
    expect(calls.length).toBe(1);
  });

  test("normalizes tool calls", async () => {
    const provider = new OpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://example.test/v1",
      fetch: async () => jsonResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "read",
                    arguments: '{"filepath":"README.md"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const result = await provider.chat({
      model: "model-a",
      apiKey: "test-key",
      messages: [{ role: "user", content: "read file" }],
    });

    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls[0]).toMatchObject({
      id: "call_1",
      name: "read",
      argumentsJson: { filepath: "README.md" },
    });
  });

  test("sends tools in OpenAI-compatible format", async () => {
    let body: any;
    const provider = new OpenAICompatibleProvider({
      id: "test",
      baseUrl: "https://example.test/v1",
      fetch: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "ok" },
            },
          ],
        });
      },
    });

    await provider.chat({
      model: "model-a",
      apiKey: "test-key",
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "read",
          description: "Read file",
          parameters: {
            type: "object",
            properties: { filepath: { type: "string" } },
            required: ["filepath"],
          },
        },
      ],
    });

    expect(body.tools[0]).toMatchObject({
      type: "function",
      function: {
        name: "read",
        description: "Read file",
      },
    });
  });
});
