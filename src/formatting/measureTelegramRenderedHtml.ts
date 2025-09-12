function safeFromCodePoint(cp: number): string {
  try {
    // Clamp invalid ranges to a replacement char
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "�";
    return String.fromCodePoint(cp);
  } catch {
    return "�";
  }
}

/**
 * Minimal HTML entity decoder:
 * - Named basics: &amp; &lt; &gt; &quot; &apos; &nbsp;
 * - Numeric decimal: &#169;
 * - Numeric hex: &#x1F4A1;
 */
function decodeEntities(input: string): string {
  return (
    input
      // Numeric (decimal)
      .replace(/&#(\d+);/g, (_, dec: string) =>
        safeFromCodePoint(parseInt(dec, 10))
      )
      // Numeric (hex)
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
        safeFromCodePoint(parseInt(hex, 16))
      )
      // Common named entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  ); // not strictly HTML4, but often used
}

/**
 * Estimate the rendered Telegram text and its length (UTF-16 code units).
 * Assumptions:
 * - Telegram counts the *plain text* after parsing HTML entities/tags.
 * - Tags themselves don't count; line breaks from <br>, </p>, </div>, <li> do.
 * - Length is measured in UTF-16 code units (i.e., JS `string.length`).
 */
export function measureTelegramRenderedHtml(html: string): {
  text: string;
  length: number;
} {
  // Normalize line-break-ish tags to newlines (Telegram preserves \n)
  let s = html
    // block-ish closers → newline
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote)>/gi, "\n")
    // <br> variants → newline
    .replace(/<br\s*\/?>/gi, "\n")
    // Leading bullets for <li> (Telegram shows inner text only; adding a bullet is optional)
    .replace(/<li[^>]*>/gi, "• ");

  // Strip all remaining tags (keep inner text)
  s = s.replace(/<[^>]+>/g, "");

  // Decode a minimal but practical subset of HTML entities (including numeric)
  s = decodeEntities(s);

  // Collapse excessive consecutive newlines (optional; comment out if you *want* to keep them)
  s = s.replace(/\n{3,}/g, "\n\n");

  // Telegram measures in UTF-16 code units — same as JS string.length
  return { text: s, length: s.length };
}
