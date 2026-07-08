# Atom LLM

A small OpenAI-compatible LLM runtime for Atom Neo.

## Goals

- Provide a minimal provider abstraction for OpenAI-compatible chat APIs.
- Normalize non-streaming and streaming model responses.
- Keep tool-call execution outside provider adapters.
- Support DeepSeek and other OpenAI-compatible providers through configuration.

## Current scope

This repository starts with the lowest-risk foundation:

1. Shared LLM types.
2. OpenAI-compatible non-streaming chat support.
3. SSE parser for streaming responses.
4. Basic response normalization tests.

Tool execution and the full tool loop will be added after the transport layer is stable.

## Scripts

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Design boundary

Provider adapters only handle protocol conversion and event normalization. Tool permission, approval, audit logging, and execution loops should live above the provider layer.
