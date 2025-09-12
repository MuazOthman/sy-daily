// generate banners for all labels available in assets/label-bgs

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateNewsBanner, addDateToBanner } from "./newsBanner";
import { ContentLanguage } from "../types";

const labels = readdirSync(resolve(process.cwd(), "assets", "label-bgs"))
  .filter((label) => label.endsWith(".png"))
  .map((label) => label.replace(".png", ""));

function ensureDirSync(arg0: string) {
  if (!existsSync(arg0)) {
    mkdirSync(arg0, { recursive: true });
  }
}

async function generateBanners() {
  const languages = ["arabic", "english"] as ContentLanguage[];
  for (const language of languages) {
    ensureDirSync(resolve(process.cwd(), "composedBanners", language));
    ensureDirSync(resolve(process.cwd(), "demo", language));
    for (const label of labels) {
      const banner = await generateNewsBanner(label, "", language);
      writeFileSync(
        resolve(process.cwd(), "composedBanners", language, `${label}.jpg`),
        banner
      );
      const banner2 = await addDateToBanner(banner, "2025-01-01");
      writeFileSync(
        resolve(process.cwd(), "demo", language, `${label}.jpg`),
        banner2
      );
    }
  }
}

generateBanners().catch(console.error);
