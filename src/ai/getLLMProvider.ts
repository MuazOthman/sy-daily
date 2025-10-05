import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, GenerateObjectResult } from "ai";
import { ZodObject } from "zod";

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

type CallLLMInput = Omit<Parameters<typeof generateObject>[0], "model"> & {
  schema: ZodObject<any, any, any, any, any>;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

const currentUsage: LLMUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export function getCurrentUsage(): LLMUsage {
  return { ...currentUsage };
}

export function resetCurrentUsage(): void {
  currentUsage.inputTokens = 0;
  currentUsage.outputTokens = 0;
  currentUsage.totalTokens = 0;
}

export async function callLLM<Schema>(
  input: CallLLMInput
): Promise<GenerateObjectResult<Schema>> {
  const model = getLLMProvider();
  const result: GenerateObjectResult<Schema> = await (generateObject as any)({
    ...input,
    model,
  });
  currentUsage.inputTokens += result.usage.inputTokens ?? 0;
  currentUsage.outputTokens += result.usage.outputTokens ?? 0;
  currentUsage.totalTokens += result.usage.totalTokens ?? 0;
  return result;
}
