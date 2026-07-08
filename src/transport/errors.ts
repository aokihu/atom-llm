export class LLMError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMError";
  }
}

export class LLMHTTPError extends LLMError {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`LLM HTTP request failed with status ${status}`);
    this.name = "LLMHTTPError";
    this.status = status;
    this.body = body;
  }
}

export class LLMProtocolError extends LLMError {
  readonly raw?: unknown;

  constructor(message: string, raw?: unknown) {
    super(message);
    this.name = "LLMProtocolError";
    this.raw = raw;
  }
}
