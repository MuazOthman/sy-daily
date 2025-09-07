import { buildSync } from "esbuild";

buildSync({
  entryPoints: { index: "src/lambda.ts" },
  bundle: true,
  minify: true,
  platform: "node",
  sourcemap: true,
  target: "node22",
  outdir: "lambda",
  external: ["aws-sdk", "./xhr-sync-worker.js"],
  define: {
    "process.env.IS_LAMBDA": "true",
  },
});

// copy channels.json to lambda
import fs from "fs";
fs.copyFileSync("channels.json", "lambda/channels.json");

console.log("Lambda build complete");
