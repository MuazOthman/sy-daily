import { Browser } from "puppeteer-core";

// Check if we're in Lambda environment
const isLambda =
  process.env.IS_LAMBDA === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// Function that works in both local dev and Lambda environments
export async function getBrowser(): Promise<Browser> {
  if (isLambda) {
    try {
      // Lambda environment: use chrome-aws-lambda
      // This will be available through the Lambda Layer
      const chromium = require("chrome-aws-lambda");
      return chromium.puppeteer.launch({
        args: [
          ...chromium.args,
          "--disable-gpu",
          "--single-process",
          "--no-zygote",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: chromium.headless || true,
        ignoreHTTPSErrors: true,
      });
    } catch (error) {
      console.error("Error launching chrome-aws-lambda:", error);
      throw error;
    }
  } else {
    try {
      // Local environment: use regular puppeteer
      // Using require for CommonJS compatibility
      const puppeteer = require("puppeteer");
      return puppeteer.launch({
        args: ["--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox"],
        headless: "new", // Use new headless mode for recent Puppeteer versions
        defaultViewport: { width: 1280, height: 720 },
      });
    } catch (error) {
      console.error("Error launching puppeteer:", error);
      throw error;
    }
  }
}
