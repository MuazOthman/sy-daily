import { buildSync } from "esbuild";

buildSync({
  entryPoints: { index: "src/lambda.ts" },
  bundle: true,
  minify: true,
  platform: "node",
  sourcemap: true,
  target: "node22",
  outdir: "lambda",
  external: ["aws-sdk"],
  logOverride: {
    "require-resolve-not-external": "silent",
  },
  define: {
    "process.env.IS_LAMBDA": "true",
  },
});

// copy channels.json to lambda
import fs from "fs";
fs.copyFileSync("channels.json", "lambda/channels.json");

// copy xhr-sync-worker.js to lambda for JSDOM
fs.copyFileSync("node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js", "lambda/xhr-sync-worker.js");

console.log("Lambda build complete");
