export type ParsedJsonArguments =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export function parseJsonArguments(input: string): ParsedJsonArguments {
  const text = input.trim();
  if (!text) return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
