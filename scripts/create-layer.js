// scripts/create-layer.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Constants
const LAYER_DIR = path.join(__dirname, "../layers/chromium");
const NODEJS_DIR = path.join(LAYER_DIR, "nodejs");
const NODE_MODULES_DIR = path.join(NODEJS_DIR, "node_modules");

// Create directories if they don't exist
console.log("Creating layer directories...");
if (!fs.existsSync(LAYER_DIR)) {
  fs.mkdirSync(LAYER_DIR, { recursive: true });
}
if (!fs.existsSync(NODEJS_DIR)) {
  fs.mkdirSync(NODEJS_DIR, { recursive: true });
}

// Create package.json for the layer
console.log("Creating package.json for the layer...");
const packageJson = {
  name: "chromium-lambda-layer",
  version: "1.0.0",
  description: "Chromium binaries for AWS Lambda",
  dependencies: {
    "chrome-aws-lambda": "10.1.0",
    "puppeteer-core": "10.1.0",
  },
};

fs.writeFileSync(
  path.join(NODEJS_DIR, "package.json"),
  JSON.stringify(packageJson, null, 2)
);

// Install dependencies
console.log("Installing dependencies for the layer...");
execSync("yarn install", {
  cwd: NODEJS_DIR,
  stdio: "inherit",
});

// Clean up unnecessary files to reduce layer size
console.log("Cleaning up unnecessary files...");
const chromiumPath = path.join(NODE_MODULES_DIR, "chrome-aws-lambda");
if (fs.existsSync(chromiumPath)) {
  // Remove docs, tests, etc. to reduce size
  ["docs", "test", ".github"].forEach((dir) => {
    const dirPath = path.join(chromiumPath, dir);
    if (fs.existsSync(dirPath)) {
      console.log(`Removing ${dir} directory...`);
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  });
}

console.log("Layer creation complete!");
console.log(`Layer directory: ${LAYER_DIR}`);
