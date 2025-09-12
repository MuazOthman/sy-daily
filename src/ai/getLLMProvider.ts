import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

export function getLLMProvider() {
  const modelName = process.env.AI_MODEL || "openai:gpt-4.1-2025-04-14";

  if (modelName.startsWith("anthropic:")) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    const model = modelName.replace("anthropic:", "");
    return anthropic(model);
  } else if (modelName.startsWith("openai:")) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    const model = modelName.replace("openai:", "");
    return openai(model);
  } else {
    // Fallback: assume it's an OpenAI model if no prefix
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    return openai(modelName);
  }
}
