import OpenAI from "openai";

/**
 * Generates an embedding vector for the given text using the configured AI provider.
 * Supports both Arabic and English text.
 *
 * @param text - The text to generate an embedding for
 * @returns A promise that resolves to the embedding vector (array of numbers)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  // Only OpenAI is supported for now
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}
