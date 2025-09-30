import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { recordProviderMetrics } from "./metrics";

export interface ProviderConfig {
  provider: "openai" | "anthropic";
  model: string;
}

/**
 * Parse a model string (e.g., "openai:gpt-4.1-2025-04-14") into a ProviderConfig
 */
export function parseModelString(modelString: string): ProviderConfig {
  if (modelString.startsWith("anthropic:")) {
    return {
      provider: "anthropic",
      model: modelString.replace("anthropic:", ""),
    };
  } else if (modelString.startsWith("openai:")) {
    return {
      provider: "openai",
      model: modelString.replace("openai:", ""),
    };
  } else {
    // Fallback: assume it's an OpenAI model if no prefix
    return {
      provider: "openai",
      model: modelString,
    };
  }
}

/**
 * Get all configured AI models in priority order
 * Supports both AI_MODELS (comma-separated) and AI_MODEL (single model) for backward compatibility
 */
export function getConfiguredModels(): ProviderConfig[] {
  // Check for new AI_MODELS variable first (comma-separated)
  const modelsEnv = process.env.AI_MODELS;
  if (modelsEnv) {
    const modelStrings = modelsEnv.split(",").map((s) => s.trim());
    return modelStrings.map(parseModelString);
  }

  // Fall back to AI_MODEL for backward compatibility
  const modelEnv = process.env.AI_MODEL || "openai:gpt-4.1-2025-04-14";
  return [parseModelString(modelEnv)];
}

/**
 * Create a language model instance from a provider config
 */
export function createModelFromConfig(
  config: ProviderConfig
): LanguageModel {
  if (config.provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    return anthropic(config.model);
  } else if (config.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    return openai(config.model);
  } else {
    throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Legacy function that returns the first configured model
 * Maintained for backward compatibility
 */
export function getLLMProvider(): LanguageModel {
  const configs = getConfiguredModels();
  return createModelFromConfig(configs[0]);
}

/**
 * Error classification for AI provider failures
 */
export enum ErrorType {
  NETWORK = "network",
  RATE_LIMIT = "rate_limit",
  AUTHENTICATION = "authentication",
  SERVICE_UNAVAILABLE = "service_unavailable",
  UNKNOWN = "unknown",
}

/**
 * Classify an error to determine retry strategy
 */
export function classifyError(error: any): ErrorType {
  const errorMessage = error?.message?.toLowerCase() || "";
  const errorCode = error?.code?.toLowerCase() || "";
  const statusCode = error?.statusCode || error?.status;

  // Authentication errors
  if (
    errorMessage.includes("api key") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("unauthorized") ||
    statusCode === 401
  ) {
    return ErrorType.AUTHENTICATION;
  }

  // Rate limiting
  if (
    errorMessage.includes("rate limit") ||
    errorMessage.includes("too many requests") ||
    statusCode === 429
  ) {
    return ErrorType.RATE_LIMIT;
  }

  // Service unavailable
  if (
    errorMessage.includes("service unavailable") ||
    errorMessage.includes("503") ||
    statusCode === 503 ||
    statusCode === 502 ||
    statusCode === 504
  ) {
    return ErrorType.SERVICE_UNAVAILABLE;
  }

  // Network errors
  if (
    errorMessage.includes("network") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("econnrefused") ||
    errorCode.includes("network")
  ) {
    return ErrorType.NETWORK;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Wrapper function that executes an AI operation with automatic fallback to alternative providers
 * @param operation - The AI operation to execute (e.g., generateObject, generateText)
 * @param operationName - Name of the operation for logging purposes
 * @returns The result of the operation along with metadata about which provider was used
 */
export async function withProviderFallback<T>(
  operation: (model: LanguageModel, config: ProviderConfig) => Promise<T>,
  operationName: string = "AI operation"
): Promise<{ result: T; providerUsed: ProviderConfig; attemptsMade: number }> {
  const configs = getConfiguredModels();
  const errors: Array<{ config: ProviderConfig; error: any; errorType: ErrorType }> = [];
  const operationStart = Date.now();

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const isLastProvider = i === configs.length - 1;

    try {
      console.log(
        `🔄 [${operationName}] Attempting with ${config.provider}:${config.model} (provider ${i + 1}/${configs.length})`
      );

      const model = createModelFromConfig(config);
      const result = await operation(model, config);
      const durationMs = Date.now() - operationStart;

      console.log(
        `✅ [${operationName}] Success with ${config.provider}:${config.model} after ${i + 1} attempt(s)`
      );

      // Record success metrics
      recordProviderMetrics({
        providerUsed: config,
        attemptsMade: i + 1,
        operationName,
        success: true,
        durationMs,
      });

      return {
        result,
        providerUsed: config,
        attemptsMade: i + 1,
      };
    } catch (error) {
      const errorType = classifyError(error);
      errors.push({ config, error, errorType });

      console.error(
        `❌ [${operationName}] Failed with ${config.provider}:${config.model} (${errorType}):`,
        error instanceof Error ? error.message : error
      );

      // If this is the last provider, record failure and throw with all error details
      if (isLastProvider) {
        const durationMs = Date.now() - operationStart;

        // Record failure metrics for the last provider tried
        recordProviderMetrics({
          providerUsed: config,
          attemptsMade: i + 1,
          operationName,
          success: false,
          durationMs,
        });

        const errorSummary = errors
          .map(
            (e) =>
              `${e.config.provider}:${e.config.model} (${e.errorType})`
          )
          .join(", ");
        throw new Error(
          `[${operationName}] All ${configs.length} provider(s) failed. Errors: ${errorSummary}`
        );
      }

      // Determine whether to retry with same provider or move to next
      if (errorType === ErrorType.NETWORK) {
        // For network errors, add a small delay before trying next provider
        console.log(`⏳ [${operationName}] Network error, waiting 2s before next provider...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else if (errorType === ErrorType.RATE_LIMIT) {
        // For rate limiting, immediately try next provider
        console.log(`⏭️  [${operationName}] Rate limited, trying next provider immediately...`);
      } else if (errorType === ErrorType.AUTHENTICATION) {
        // For auth errors, skip to next provider immediately
        console.log(`⏭️  [${operationName}] Authentication failed, trying next provider...`);
      } else if (errorType === ErrorType.SERVICE_UNAVAILABLE) {
        // For service unavailable, try next provider
        console.log(`⏭️  [${operationName}] Service unavailable, trying next provider...`);
      } else {
        // For unknown errors, add a small delay
        console.log(`⏳ [${operationName}] Unknown error, waiting 1s before next provider...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error(`[${operationName}] Unexpected error: no providers available`);
}
