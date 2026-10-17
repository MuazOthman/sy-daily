import { openai, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, GenerateObjectResult } from "ai";
import { ZodObject } from "zod";

const DEFAULT_MODEL = "openai:gpt-6-luna";

function getModelName(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

// Max output tokens (reasoning tokens included) for the configured model.
// gpt-6-luna allows 128k; 32k stays within the limit of older models such as gpt-4.1.
export function getMaxOutputTokens(): number {
  const model = getModelName().replace(/^openai:/, "");
  return model === "gpt-6-luna" ? 128000 : 32768;
}

export function getLLMProvider() {
  const modelName = getModelName();

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
    // Defaults below; options passed by the caller take precedence.
    providerOptions: {
      ...input.providerOptions,
      openai: {
        store: true,
        reasoningEffort: "low",
        ...input.providerOptions?.openai,
      } satisfies OpenAIResponsesProviderOptions,
    },
  });
  currentUsage.inputTokens += result.usage.inputTokens ?? 0;
  currentUsage.outputTokens += result.usage.outputTokens ?? 0;
  currentUsage.totalTokens += result.usage.totalTokens ?? 0;
  return result;
}
