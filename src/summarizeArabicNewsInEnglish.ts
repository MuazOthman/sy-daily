import { OpenAI } from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `You are a news editor fluent in English and Arabic. You'll be given Arabic news snippets from official sources posted in the last 24 hours, generate up to 12 concise bullet points in English, formatted in HTML for Telegram, that highlight the most important events, statements, or opinions. Follow these rules:
- Use a neutral tone.
- Each bullet must start with a • symbol.
- Use <b> tags to bold key names, entities, or actions.
- Do not include any Arabic text or translations.
- Do not add any introduction, explanation, or commentary—only output the bullet list.
- Do not return the response inside a code block.
- If a URL is provided, include it as a hyperlink using <a href="url">Source</a> at the end of the relevant bullet.
- Sort bullet points by importance, with the most important items first.
- Nation-wide events should be prioritized over local events. Also, events related to the president or foreign policy should be prioritized over other events.
`;

export async function summarizeArabicNewsInEnglish(
  news: string[],
  simulate = false
) {
  if (news.length === 0) {
    return null;
  }
  const inputText = news.join("\n=========================\n");
  if (simulate) {
    return "Simulated summary for \n\n" + inputText;
  }

  const chatCompletion = await openai.chat.completions.create({
    model: "gpt-4o", // or 'gpt-4', 'gpt-3.5-turbo'
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      { role: "user", content: inputText },
    ],
    temperature: 0.2,
  });

  const result = chatCompletion.choices[0]?.message?.content;
  return result;
}
