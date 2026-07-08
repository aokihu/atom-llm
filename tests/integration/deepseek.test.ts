import { describe, expect, test } from "bun:test";
import { createDeepSeekProvider } from "../../src/providers/deepseek";

const apiKey = process.env.DEEPSEEK_API_KEY;
const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
const integrationTest = apiKey ? test : test.skip;

describe("DeepSeek integration", () => {
  integrationTest("returns a non-empty chat response", async () => {
    const provider = createDeepSeekProvider();
    const result = await provider.chat({
      model,
      apiKey: apiKey as string,
      messages: [
        {
          role: "user",
          content: "Reply with exactly one short English sentence confirming that the transport works.",
        },
      ],
      maxOutputTokens: 64,
      temperature: 0,
    });

    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.finishReason).not.toBe("error");
  });
});
