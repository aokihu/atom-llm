import { describe, expect, test } from "bun:test";
import { parseSSEStream } from "../src/transport/sse-parser";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("parseSSEStream", () => {
  test("parses a single json event", async () => {
    const events = [];
    for await (const event of parseSSEStream(streamFromChunks([
      'data: {"hello":"world"}\n\n',
    ]))) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "json", data: { hello: "world" } }]);
  });

  test("parses json split across chunks", async () => {
    const events = [];
    for await (const event of parseSSEStream(streamFromChunks([
      'data: {"hel',
      'lo":"world"}\n\n',
    ]))) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "json", data: { hello: "world" } }]);
  });

  test("parses multiple events in one chunk", async () => {
    const events = [];
    for await (const event of parseSSEStream(streamFromChunks([
      'data: {"a":1}\n\ndata: {"b":2}\n\n',
    ]))) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "json", data: { a: 1 } },
      { type: "json", data: { b: 2 } },
    ]);
  });

  test("parses done marker", async () => {
    const events = [];
    for await (const event of parseSSEStream(streamFromChunks([
      "data: [DONE]\n\n",
    ]))) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "done" }]);
  });

  test("returns error event for malformed json", async () => {
    const events = [];
    for await (const event of parseSSEStream(streamFromChunks([
      "data: {bad}\n\n",
    ]))) {
      events.push(event);
    }

    expect(events[0]?.type).toBe("error");
  });
});
