# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to bundled Lambda function using esbuild
- **Local development**: `ts-node src/local.ts` - Run the news collection and summarization locally
- **Create Chromium layer**: `npm run create-layer` - Packages Chromium for AWS Lambda deployment
- **Deploy preparation**: `npm run predeploy` - Runs build and creates layer before deployment
- **Deploy**: `npm run deploy` - Deploys to AWS using SAM with environment variables from .env
- **Register Telegram webhook**: `npm run register-webhook` - Sets up Telegram bot webhook

### AWS SAM Local Development

- **SAM build**: `npm run sam:build` - Build SAM application for local testing
- **SAM local API**: `npm run sam:local` - Start local Lambda environment
- **SAM invoke**: `npm run sam:invoke` - Invoke Lambda function locally
- **SAM invoke with event**: `npm run sam:invoke:event` - Invoke with scheduled event
- **SAM dev workflow**: `npm run sam:dev` - Build TypeScript, build SAM, and start local environment

## Architecture Overview

This is a Telegram bot that collects Syrian news from SANA (Syrian Arab News Agency) and posts daily summaries. The system operates on two deployment models:

### AWS Lambda Deployment (Production)
- **Entry point**: `src/lambda.ts` - AWS Lambda handler for scheduled execution
- **Schedule**: Runs daily at 21:10 UTC via CloudWatch Events
- **Dependencies**: Uses AWS Lambda layer with Chromium binaries for web scraping

### Local Development
- **Entry point**: `src/local.ts` - Direct execution for testing
- **Environment**: Uses dotenv for local environment variables

### Core Components

**Data Flow**:
1. `executeForLast24Hours()` - Main orchestrator function
2. `getSANAPostsInLast24Hours()` - Fetches recent posts from SANA Telegram channel
3. `processSANATelegramPost()` - Processes individual posts and extracts content
4. `summarizeArabicNewsInEnglish()` - Uses OpenAI to create English summaries from Arabic content
5. `postSummary()` - Posts formatted summary to target Telegram channel

**Key Modules**:
- `bot.ts` - Grammy-based Telegram bot configuration and posting functionality
- `browser.ts` - Puppeteer browser automation for web scraping
- `dateUtils.ts` - Damascus timezone handling for 24-hour windows
- `constants.ts` - Channel IDs and configuration constants

### Environment Requirements

The application requires these environment variables:
- `TELEGRAM_BOT_TOKEN` - Bot authentication token
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` - Telegram API credentials
- `SESSION_STRING` - Telegram user session for channel access
- `OPENAI_API_KEY` - OpenAI API for summarization

### Build System

- **TypeScript compilation**: Uses esbuild for fast bundling and minification
- **Target**: Node.js 22.x runtime
- **Output**: `lambda/index.js` for AWS deployment
- **External dependencies**: AWS SDK, chrome-aws-lambda, and puppeteer-core are externalized

### AWS Infrastructure

Defined in `template.yml` (SAM template):
- Lambda function with 5-minute timeout and 2GB memory
- Chromium layer for browser functionality
- Scheduled execution via CloudWatch Events
- Parameter-based environment variable injection