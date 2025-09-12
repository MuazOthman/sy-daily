// generate banners for all labels available in assets/label-bgs

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateNewsBanner } from "./newsBanner";
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
    for (const label of labels) {
      const banner = await generateNewsBanner(label, "", language);
      writeFileSync(
        resolve(process.cwd(), "composedBanners", language, `${label}.jpg`),
        banner
      );
    }
  }
}

generateBanners().catch(console.error);
