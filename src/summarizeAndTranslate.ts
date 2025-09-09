import { OpenAI } from "openai";
import { NewItemLabels, NewsResponse, NewsResponseSchema } from "./types";
import { zodResponseFormat } from "openai/helpers/zod";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `You are a news editor fluent in English and Arabic. You'll be given Arabic news snippets from official sources posted in the last 24 hours. Your task is to create a complete comprehensive list of news items but with duplicates removed. Follow these rules:

1. Deduplicate similar stories - if multiple posts cover the same event, combine them into one news item.
2. Include all deduplicated news items in the response, do not filter them out or limit the number of news items.
3. Events related to the president or foreign policy should have higher importance scores.
4. Use neutral tone in summaries.
5. When editing the summary in Arabic, use verb-subject-object structure. DON'T USE subject-verb-object structure.
6. Make sure to not include duplicate news items.`;

export async function summarizeAndTranslate(
  news: string[],
  simulate = false
): Promise<NewsResponse | null> {
  if (news.length === 0) {
    return null;
  }
  const inputText = news.join("\n=========================\n");
  if (simulate) {
    const mockResponse = {
      newsItems: [
        {
          summaryArabic: "خبر تجريبي للاختبار",
          summaryEnglish: "Simulated news item for testing",
          labels: ["other" as const],
          importanceScore: 50,
          source: "https://example.com",
        },
      ],
    };
    // Validate the mock response with Zod
    return NewsResponseSchema.parse(mockResponse);
  }

  try {
    console.log("🔍 Summarizing and translating news items");
    const start = Date.now();
    const chatCompletion = await openai.chat.completions.create({
      // model: "gpt-5-2025-08-07",
      // model: "gpt-5-mini-2025-08-07",
      model: "gpt-4.1-2025-04-14",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        { role: "user", content: inputText },
      ],
      response_format: zodResponseFormat(NewsResponseSchema, "news_response"),
      max_completion_tokens: 20000,
      // reasoning_effort: "minimal",
    });
    const end = Date.now();
    console.log(`🔍 Summarized and translated news items in ${end - start}ms`);
    console.log(
      `Model used: ${chatCompletion.model}. Input tokens: ${chatCompletion.usage?.prompt_tokens}. Output tokens: ${chatCompletion.usage?.completion_tokens}. Total tokens: ${chatCompletion.usage?.total_tokens}.`
    );
    const result = chatCompletion.choices[0]?.message?.content;
    if (!result) {
      return null;
    }

    // Parse and validate the response using Zod
    const parsedResult = NewsResponseSchema.parse(JSON.parse(result));
    return parsedResult;
  } catch (error) {
    console.error("Failed to get or validate LLM response:", error);
    return null;
  }
}
