import { buildSync } from "esbuild";

buildSync({
  entryPoints: { index: "src/lambda.ts" },
  bundle: true,
  minify: true,
  platform: "node",
  sourcemap: true,
  target: "node22",
  outdir: "lambda",
  external: ["aws-sdk", "chrome-aws-lambda", "puppeteer-core"],
  define: {
    "process.env.IS_LAMBDA": "true",
  },
});

console.log("Lambda build complete");
