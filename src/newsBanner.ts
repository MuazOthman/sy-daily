// svg-compositor.ts
// npm i sharp
import sharp from "sharp";

/** ---- Inputs & Types ----------------------------------------------------- */
type ImageInput =
  | { data: Buffer; mime: "image/png" | "image/jpeg" }
  | { dataUrl: string };

export type SvgElement = RectElement | ImageElement | TextElement;

export interface RectElement {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
  fill?: string; // e.g. "rgba(0,0,0,0.55)"
  opacity?: number; // 0..1
}

export interface ImageElement {
  type: "image";
  source: ImageInput;
  x: number;
  y: number;
  width: number;
  height: number;
  preserve?: "slice" | "meet" | "none"; // cover/contain/none; default "slice"
  opacity?: number; // 0..1
  /** Optional rounded corners via clip-path */
  cornerRadiusPx?: number;
}

export interface TextElement {
  type: "text";
  text: string;
  x: number; // anchor point X
  y: number; // baseline Y of the first line
  maxWidth: number; // wrap width in px
  fontSize?: number; // default 64
  lineHeight?: number; // multiplier, default 1.4
  maxLines?: number; // optional clamp with ellipsis
  approxCharWidthFactor?: number; // default 0.58 (Arabic-friendly heuristic)
  fontFamily?: string; // default Arabic-friendly stack
  fill?: string; // default "#fff"
  opacity?: number; // 0..1
  anchor?: "start" | "middle" | "end"; // horizontal anchor; default "middle"
  direction?: "rtl" | "ltr"; // default "rtl" for Arabic
  bidiOverride?: boolean; // default true for Arabic
  lang?: string; // default "ar"
}

export interface EmbeddedFont {
  dataUrl: string; // data:font/ttf;base64,....
  family: string; // e.g. "Noto Naskh Arabic"
}

export interface GenerateSvgOptions {
  /** Aspect ratio as number (W/H) or "W:H" string (e.g. "16:9") */
  aspectRatio: number | string;
  /** Canvas width (px). Height is derived from aspect ratio. */
  width?: number;
  /** Optional convenience: draw a base background first */
  baseBackground?: ImageInput;

  /** Ordered draw list; later items appear on top */
  elements: SvgElement[];

  /** Default styles */
  defaults?: {
    fontFamily?: string; // fallback stack for text
    textColor?: string; // default "#fff"
  };

  /** Optional embedded fonts injected via @font-face */
  embeddedFonts?: EmbeddedFont[];
}

/** ---- Utilities ---------------------------------------------------------- */
function bufferToDataUrl(
  buf: Buffer,
  mime: "image/png" | "image/jpeg" | "font/ttf"
): string {
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

function parseAspectRatio(ratio: number | string): number {
  if (typeof ratio === "number" && isFinite(ratio) && ratio > 0) return ratio;
  const m = String(ratio)
    .trim()
    .match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!m) throw new Error(`Invalid aspectRatio: ${ratio}`);
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!isFinite(w) || !isFinite(h) || h <= 0)
    throw new Error(`Invalid aspectRatio: ${ratio}`);
  return w / h;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function chunkString(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/**
 * Lightweight word-wrap (Arabic-friendly).
 * - Uses heuristic avg char width (no font rasterizer needed).
 * - Respects explicit '\n'.
 * - Optional clamping with ellipsis.
 */
function wrapText(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  approxCharWidthFactor = 0.58,
  maxLines?: number
): { lines: string[]; truncated: boolean } {
  const tokens: (string | { br: true })[] = [];
  text.split(/\n/).forEach((seg, i, arr) => {
    seg
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => tokens.push(w));
    if (i < arr.length - 1) tokens.push({ br: true });
  });

  const maxCharsPerLine = Math.max(
    1,
    Math.floor(maxWidthPx / (fontSize * approxCharWidthFactor))
  );
  const lines: string[] = [];
  let current: string[] = [];
  let truncated = false;

  const flush = () => {
    if (current.length) {
      lines.push(current.join(" "));
      current = [];
    }
  };
  const pushLine = (ln: string) => lines.push(ln);

  for (const t of tokens) {
    if (typeof t !== "string") {
      flush();
      if (maxLines && lines.length >= maxLines) {
        truncated = true;
        break;
      }
      continue;
    }
    const next = current.length ? current.join(" ") + " " + t : t;
    if (next.length <= maxCharsPerLine) {
      current.push(t);
    } else {
      if (!current.length && t.length > maxCharsPerLine) {
        const chunks = chunkString(t, maxCharsPerLine);
        pushLine(chunks.shift()!);
        for (const c of chunks) {
          if (maxLines && lines.length >= maxLines) {
            truncated = true;
            break;
          }
          pushLine(c);
        }
      } else {
        flush();
        current.push(t);
      }
    }
    if (maxLines && lines.length + (current.length ? 1 : 0) > maxLines) {
      truncated = true;
      break;
    }
  }
  flush();

  if (maxLines && lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }
  if (truncated && lines.length) {
    const last = lines[lines.length - 1].replace(/\s+$/g, "");
    lines[lines.length - 1] = (last.length > 1 ? last.slice(0, -1) : "") + "…";
  }
  return { lines, truncated };
}

/** ---- SVG Generation ----------------------------------------------------- */
export function generateSvg(opts: GenerateSvgOptions): string {
  const {
    aspectRatio,
    width = 1200,
    baseBackground,
    elements,
    defaults,
    embeddedFonts = [],
  } = opts;

  const ratio = parseAspectRatio(aspectRatio);
  const height = Math.round(width / ratio);

  // Default text styling
  const defaultFont =
    defaults?.fontFamily ??
    "Noto Naskh Arabic, Amiri, 'Scheherazade New', serif";
  const defaultTextColor = defaults?.textColor ?? "#ffffff";

  // Fonts via @font-face
  const fontFaces = embeddedFonts
    .map(
      (f, i) => `
@font-face {
  font-family: '${f.family}';
  src: url('${f.dataUrl}') format('truetype');
  font-weight: normal;
  font-style: normal;
}`
    )
    .join("\n");

  // (Optional) base background as first layer
  let baseBgMarkup = "";
  if (baseBackground) {
    const bgHref =
      "dataUrl" in baseBackground
        ? baseBackground.dataUrl
        : bufferToDataUrl(baseBackground.data, (baseBackground as any).mime);
    baseBgMarkup = `
  <image x="0" y="0" width="${width}" height="${height}"
         xlink:href="${bgHref}"
         preserveAspectRatio="xMidYMid slice" />`;
  }

  // Render each element in order
  const layerMarkup: string[] = [];
  let clipIdCounter = 0;

  for (const el of elements) {
    if (el.type === "rect") {
      const r = el as RectElement;
      layerMarkup.push(`
  <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"
        ${r.rx ? `rx="${r.rx}" ry="${r.ry ?? r.rx}"` : ""}
        fill="${r.fill ?? "transparent"}"
        ${r.opacity != null ? `opacity="${r.opacity}"` : ""} />`);
    } else if (el.type === "image") {
      const im = el as ImageElement;
      const href =
        "dataUrl" in im.source
          ? im.source.dataUrl
          : bufferToDataUrl((im.source as any).data, (im.source as any).mime);
      const preserve =
        im.preserve === "none"
          ? "none"
          : im.preserve === "meet"
          ? "xMidYMid meet"
          : "xMidYMid slice"; // default 'cover'

      if (im.cornerRadiusPx && im.cornerRadiusPx > 0) {
        const id = `clip_${++clipIdCounter}`;
        layerMarkup.push(`
  <defs>
    <clipPath id="${id}">
      <rect x="${im.x}" y="${im.y}" width="${im.width}" height="${im.height}"
            rx="${im.cornerRadiusPx}" ry="${im.cornerRadiusPx}"/>
    </clipPath>
  </defs>
  <image x="${im.x}" y="${im.y}" width="${im.width}" height="${im.height}"
         xlink:href="${href}"
         preserveAspectRatio="${preserve}"
         ${im.opacity != null ? `opacity="${im.opacity}"` : ""}
         clip-path="url(#${id})" />`);
      } else {
        layerMarkup.push(`
  <image x="${im.x}" y="${im.y}" width="${im.width}" height="${im.height}"
         xlink:href="${href}"
         preserveAspectRatio="${preserve}"
         ${im.opacity != null ? `opacity="${im.opacity}"` : ""} />`);
      }
    } else if (el.type === "text") {
      const t = el as TextElement;
      const fontSize = t.fontSize ?? 64;
      const lineHeight = t.lineHeight ?? 1.4;
      const approx = t.approxCharWidthFactor ?? 0.58;
      const dir = t.direction ?? "rtl";
      const bidi = t.bidiOverride ?? true;
      const fill = t.fill ?? defaultTextColor;
      const anchor = t.anchor ?? "middle";
      const lang = t.lang ?? "ar";

      const { lines } = wrapText(
        t.text,
        t.maxWidth,
        fontSize,
        approx,
        t.maxLines
      );

      const linePx = Math.round(fontSize * lineHeight);
      const tspans = lines
        .map((ln, idx) => {
          const dy = idx === 0 ? 0 : linePx;
          return `<tspan x="${t.x}" dy="${dy}" ${
            dir ? `direction="${dir}"` : ""
          } ${bidi ? `unicode-bidi="bidi-override"` : ""}>${escapeXml(
            ln
          )}</tspan>`;
        })
        .join("\n        ");

      layerMarkup.push(`
  <text x="${t.x}" y="${t.y}"
        ${dir ? `direction="${dir}"` : ""}
        ${bidi ? `unicode-bidi="bidi-override"` : ""}
        xml:lang="${lang}"
        fill="${fill}"
        ${t.opacity != null ? `opacity="${t.opacity}"` : ""}
        font-size="${fontSize}px"
        font-family="${t.fontFamily ?? defaultFont}"
        dominant-baseline="middle"
        text-anchor="${anchor}">
        ${tspans}
  </text>`);
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${width}" height="${height}"
  viewBox="0 0 ${width} ${height}"
  role="img" aria-label="Composited poster">
  <defs>
    <style>
      ${fontFaces}
    </style>
  </defs>
  ${baseBgMarkup}
  ${layerMarkup.join("\n")}
</svg>`;
  return svg;
}

/** ---- SVG → JPG ---------------------------------------------------------- */
export async function convertSvgToJpg(
  svg: string,
  quality = 85
): Promise<Buffer> {
  return await sharp(Buffer.from(svg))
    .jpeg({ quality, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ContentLanguage } from "./types";
import { Strings } from "./formatting/strings";

export async function generateNewsBanner(
  label: string,
  date: string,
  language: ContentLanguage
) {
  const bgFilePath = path.resolve(
    process.cwd(),
    "assets",
    "label-bgs",
    `${label}.png`
  );
  const bg = existsSync(bgFilePath) ? readFileSync(bgFilePath) : null;
  const logo = readFileSync(
    path.resolve(process.cwd(), "assets", `logo-${language}.png`)
  );
  const sticker = readFileSync(
    path.resolve(process.cwd(), "assets", "telegram-logo.png")
  );

  const aspectRatio = 64 / 27;
  const width = 960;
  const height = width / aspectRatio;

  const svg = generateSvg({
    aspectRatio: "64:27",
    width: 960,
    baseBackground: bg ? { data: bg, mime: "image/png" } : undefined,
    defaults: {
      fontFamily: "Verdana, Arial, Helvetica, sans-serif",
    },
    embeddedFonts: [
      {
        dataUrl: bufferToDataUrl(
          readFileSync(
            path.resolve(
              process.cwd(),
              "assets",
              "fonts",
              "NotoNaskhArabic-Regular.ttf"
            )
          ),
          "font/ttf"
        ),
        family: "NotoNaskhArabic",
      },
      // {
      //   // Amiri
      //   dataUrl: bufferToDataUrl(
      //     readFileSync(
      //       path.resolve(process.cwd(), "assets", "fonts", "Amiri-Regular.ttf")
      //     ),
      //     "font/ttf"
      //   ),
      //   family: "Amiri",
      // },
      // {
      //   // Scheherazade New
      //   dataUrl: bufferToDataUrl(
      //     readFileSync(
      //       path.resolve(
      //         process.cwd(),
      //         "assets",
      //         "fonts",
      //         "ScheherazadeNew-Regular.ttf"
      //       )
      //     ),
      //     "font/ttf"
      //   ),
      //   family: "Scheherazade New",
      // },
    ],
    elements: [
      // Full-canvas light overlay
      {
        type: "rect",
        x: 0,
        y: 0,
        width,
        height,
        fill: "rgba(255,255,255,0.50)",
      },

      // Multiline Arabic headline (centered)
      {
        type: "text",
        text: Strings[language].DailyBriefingForDay,
        x: width / 2,
        y: height / 2 - 120,
        maxWidth: 2000,
        fontSize: language === "arabic" ? 60 : 60,
        lineHeight: 1.35,
        maxLines: 5,
        anchor: "middle", // center around x
        direction: language === "arabic" ? "rtl" : "ltr",
        fontFamily: language === "arabic" ? "NotoNaskhArabic" : undefined,
        bidiOverride: language === "arabic",
        fill: "#000000",
        // fontFamily: "Tahoma",
      },

      {
        type: "text",
        text: date,
        x: width / 2,
        y: height / 2,
        maxWidth: 2000,
        fontSize: 72,
        lineHeight: 1.35,
        maxLines: 5,
        anchor: "middle", // center around x
        direction: "ltr",
        bidiOverride: false,
        fill: "#000000",
      },

      // Bottom-right logo
      {
        type: "image",
        source: { data: logo, mime: "image/png" },
        width: 200,
        height: 200,
        x: width - 24 - 200,
        y: height - 24 - 200,
        preserve: "meet",
        cornerRadiusPx: 20,
      },

      // Another sticker above the logo
      {
        type: "image",
        source: { data: sticker, mime: "image/png" },
        width: 64,
        height: 64,
        x: 24,
        y: height - 24 - 64,
        preserve: "meet",
        opacity: 0.95,
      },

      {
        type: "text",
        text: `https://t.me/SyriaDaily${language === "arabic" ? "AR" : "EN"}`,
        x: 100,
        y: height - 24 - 30,
        maxWidth: 2000,
        fontSize: 30,
        lineHeight: 1.35,
        maxLines: 5,
        anchor: "start", // center around x
        direction: "ltr",
        bidiOverride: false,
        fill: "#000000",
      },
    ],
  });

  const jpg = await convertSvgToJpg(svg, 90);
  return jpg;
}
