export type SSEEvent =
  | { type: "json"; data: unknown }
  | { type: "done" }
  | { type: "error"; error: Error; raw: string };

export async function* parseSSEStream(body: ReadableStream<Uint8Array>): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      yield* drainEvents(buffer, (next) => { buffer = next; });
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      yield* parseBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

function* drainEvents(buffer: string, setBuffer: (value: string) => void): Iterable<SSEEvent> {
  while (true) {
    const normalized = buffer.replace(/\r\n/g, "\n");
    const boundary = normalized.indexOf("\n\n");
    if (boundary < 0) {
      setBuffer(normalized);
      return;
    }

    const rawBlock = normalized.slice(0, boundary);
    buffer = normalized.slice(boundary + 2);
    yield* parseBlock(rawBlock);
  }
}

function* parseBlock(rawBlock: string): Iterable<SSEEvent> {
  const dataLines: string[] = [];

  for (const line of rawBlock.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith(":")) continue;
    if (trimmed.startsWith("data:")) {
      dataLines.push(trimmed.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return;

  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    yield { type: "done" };
    return;
  }

  try {
    yield { type: "json", data: JSON.parse(data) };
  } catch (error) {
    yield {
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
      raw: data,
    };
  }
}
