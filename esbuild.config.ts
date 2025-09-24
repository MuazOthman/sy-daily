import { buildSync } from "esbuild";
import fs from "fs";
import path from "path";

// invoke buildSync for each file in src/lambda
for (const file of fs.readdirSync("src/lambda")) {
  const functionName = path.parse(file).name;
  console.log(`Building ${file}`);
  buildSync({
    entryPoints: { [functionName]: `src/lambda/${file}` },
    bundle: true,
    minify: true,
    platform: "node",
    sourcemap: true,
    target: "node22",
    outdir: `lambda/${functionName}`,
    external: ["aws-sdk", "@aws-sdk/client-s3"],
    logOverride: {
      "require-resolve-not-external": "silent",
    },
    define: {
      "process.env.IS_LAMBDA": "true",
    },
  });
}

console.log("Copying assets...");
if (fs.existsSync("lambda/Collect")) {
  fs.copyFileSync("channels.json", "lambda/Collect/channels.json");
}

// copy xhr-sync-worker.js to lambda/Collect for JSDOM
if (fs.existsSync("lambda/Collect")) {
  fs.copyFileSync(
    "node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js",
    "lambda/Collect/xhr-sync-worker.js"
  );
}

// copy assets folder and its contents to lambda/PostToTelegram
// fs.cpSync("assets", "lambda/PostToTelegram/assets", { recursive: true });

console.log("Lambda build complete");
