// generate banners for all labels available in assets/label-bgs

import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateNewsBanner } from "./newsBanner";
import { ContentLanguage } from "./types";

const labels = readdirSync(resolve(process.cwd(), "assets", "label-bgs")).map(
  (label) => label.replace(".png", "")
);

async function generateBanners() {
  const languages = ["arabic", "english"] as ContentLanguage[];
  for (const label of labels) {
    for (const language of languages) {
      const banner = await generateNewsBanner(label, "2025-01-01", language);
      writeFileSync(
        resolve(process.cwd(), "demo", `${label}-${language}.png`),
        banner
      );
    }
  }
}

generateBanners().catch(console.error);
