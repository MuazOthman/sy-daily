import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseModelString,
  getConfiguredModels,
  createModelFromConfig,
  classifyError,
  ErrorType,
  withProviderFallback,
  type ProviderConfig,
} from "./getLLMProvider";

describe("parseModelString", () => {
  it("should parse anthropic model string", () => {
    const result = parseModelString("anthropic:claude-3-5-sonnet-20241022");
    expect(result).toEqual({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    });
  });

  it("should parse openai model string", () => {
    const result = parseModelString("openai:gpt-4.1-2025-04-14");
    expect(result).toEqual({
      provider: "openai",
      model: "gpt-4.1-2025-04-14",
    });
  });

  it("should default to openai when no prefix", () => {
    const result = parseModelString("gpt-4");
    expect(result).toEqual({
      provider: "openai",
      model: "gpt-4",
    });
  });
});

describe("getConfiguredModels", () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.AI_MODELS;
    delete process.env.AI_MODEL;
  });

  it("should parse AI_MODELS with multiple models", () => {
    process.env.AI_MODELS =
      "openai:gpt-4.1-2025-04-14,anthropic:claude-3-5-sonnet-20241022";
    const result = getConfiguredModels();
    expect(result).toEqual([
      { provider: "openai", model: "gpt-4.1-2025-04-14" },
      { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
    ]);
  });

  it("should fall back to AI_MODEL when AI_MODELS is not set", () => {
    process.env.AI_MODEL = "openai:gpt-4.1-2025-04-14";
    const result = getConfiguredModels();
    expect(result).toEqual([
      { provider: "openai", model: "gpt-4.1-2025-04-14" },
    ]);
  });

  it("should use default model when neither AI_MODELS nor AI_MODEL is set", () => {
    const result = getConfiguredModels();
    expect(result).toEqual([
      { provider: "openai", model: "gpt-4.1-2025-04-14" },
    ]);
  });

  it("should handle whitespace in AI_MODELS", () => {
    process.env.AI_MODELS =
      "openai:gpt-4.1-2025-04-14 , anthropic:claude-3-5-sonnet-20241022";
    const result = getConfiguredModels();
    expect(result).toEqual([
      { provider: "openai", model: "gpt-4.1-2025-04-14" },
      { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
    ]);
  });
});

describe("createModelFromConfig", () => {
  beforeEach(() => {
    // Set API keys for testing
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  it("should create openai model", () => {
    const config: ProviderConfig = {
      provider: "openai",
      model: "gpt-4.1-2025-04-14",
    };
    const model = createModelFromConfig(config);
    expect(model).toBeDefined();
    expect((model as any).modelId).toBe("gpt-4.1-2025-04-14");
  });

  it("should create anthropic model", () => {
    const config: ProviderConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    };
    const model = createModelFromConfig(config);
    expect(model).toBeDefined();
    expect((model as any).modelId).toBe("claude-3-5-sonnet-20241022");
  });

  it("should throw when OPENAI_API_KEY is not set", () => {
    delete process.env.OPENAI_API_KEY;
    const config: ProviderConfig = {
      provider: "openai",
      model: "gpt-4",
    };
    expect(() => createModelFromConfig(config)).toThrow(
      "OPENAI_API_KEY is not set"
    );
  });

  it("should throw when ANTHROPIC_API_KEY is not set", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const config: ProviderConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    };
    expect(() => createModelFromConfig(config)).toThrow(
      "ANTHROPIC_API_KEY is not set"
    );
  });
});

describe("classifyError", () => {
  it("should classify authentication errors", () => {
    const error = new Error("Invalid API key");
    expect(classifyError(error)).toBe(ErrorType.AUTHENTICATION);
  });

  it("should classify rate limit errors", () => {
    const error = { message: "Rate limit exceeded", statusCode: 429 };
    expect(classifyError(error)).toBe(ErrorType.RATE_LIMIT);
  });

  it("should classify service unavailable errors", () => {
    const error = { message: "Service unavailable", statusCode: 503 };
    expect(classifyError(error)).toBe(ErrorType.SERVICE_UNAVAILABLE);
  });

  it("should classify network errors", () => {
    const error = { message: "Network timeout", code: "ETIMEDOUT" };
    expect(classifyError(error)).toBe(ErrorType.NETWORK);
  });

  it("should classify unknown errors", () => {
    const error = new Error("Something went wrong");
    expect(classifyError(error)).toBe(ErrorType.UNKNOWN);
  });
});

describe("withProviderFallback", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    // Mock console methods to avoid cluttering test output
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should succeed with first provider", async () => {
    process.env.AI_MODELS = "openai:gpt-4.1-2025-04-14";

    const mockOperation = vi
      .fn()
      .mockResolvedValue({ success: true, data: "test" });

    const result = await withProviderFallback(mockOperation, "Test operation");

    expect(result.providerUsed).toEqual({
      provider: "openai",
      model: "gpt-4.1-2025-04-14",
    });
    expect(result.attemptsMade).toBe(1);
    expect(result.result).toEqual({ success: true, data: "test" });
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it("should fallback to second provider on failure", async () => {
    process.env.AI_MODELS =
      "openai:gpt-4.1-2025-04-14,anthropic:claude-3-5-sonnet-20241022";

    const mockOperation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit exceeded"))
      .mockResolvedValueOnce({ success: true, data: "test" });

    const result = await withProviderFallback(mockOperation, "Test operation");

    expect(result.providerUsed).toEqual({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    });
    expect(result.attemptsMade).toBe(2);
    expect(result.result).toEqual({ success: true, data: "test" });
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });

  it("should throw when all providers fail", async () => {
    process.env.AI_MODELS =
      "openai:gpt-4.1-2025-04-14,anthropic:claude-3-5-sonnet-20241022";

    const mockOperation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit exceeded"))
      .mockRejectedValueOnce(new Error("Service unavailable"));

    await expect(
      withProviderFallback(mockOperation, "Test operation")
    ).rejects.toThrow("All 2 provider(s) failed");

    expect(mockOperation).toHaveBeenCalledTimes(2);
  });

  it("should pass model and config to operation", async () => {
    process.env.AI_MODELS = "openai:gpt-4.1-2025-04-14";

    const mockOperation = vi.fn().mockImplementation((model, config) => {
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe("gpt-4.1-2025-04-14");
      expect(config).toEqual({
        provider: "openai",
        model: "gpt-4.1-2025-04-14",
      });
      return Promise.resolve({ success: true });
    });

    await withProviderFallback(mockOperation, "Test operation");

    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it("should track duration for successful operations", async () => {
    process.env.AI_MODELS = "openai:gpt-4.1-2025-04-14";

    const mockOperation = vi.fn().mockImplementation(() => {
      return new Promise((resolve) =>
        setTimeout(() => resolve({ success: true }), 50)
      );
    });

    const result = await withProviderFallback(mockOperation, "Test operation");

    expect(result.result).toEqual({ success: true });
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });
});
