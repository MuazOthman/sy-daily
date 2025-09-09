# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to bundled Lambda function using esbuild
- **Local development**: `npm start` or `ts-node src/local/index.ts` - Run the news collection and summarization locally
- **Development server**: `npm run telegram:serve` - Start Telegram development server - Used to interact with Telegram via the bot and the webhook in local development
- **Deploy preparation**: `npm run predeploy` - Runs build before deployment
- **Deploy**: `npm run deploy` - Deploys to AWS using SAM with environment variables from .env
- **Register Telegram webhook**: `npm run telegram:register-webhook` - Sets up Telegram bot webhook
- **Testing**: `npm test` - Run tests with Vitest
- **Testing with UI**: `npm run test:ui` - Run tests with Vitest UI
- **Run tests once**: `npm run test:run` - Run tests in CI mode

### AWS SAM Local Development

- **SAM build**: `npm run sam:build` - Build SAM application for local testing
- **SAM local API**: `npm run sam:local` - Start local Lambda environment
- **SAM invoke collect**: `npm run sam:invoke:collect` - Invoke CollectAndSummarize function locally
- **SAM invoke collect with event**: `npm run sam:invoke:collect:event` - Invoke with scheduled event
- **SAM invoke post English**: `npm run sam:invoke:post:english` - Invoke PostToTelegramEnglish function with S3 event
- **SAM invoke post Arabic**: `npm run sam:invoke:post:arabic` - Invoke PostToTelegramArabic function with S3 event
- **SAM dev workflow**: `npm run sam:dev` - Build TypeScript, build SAM, and start local environment

## Architecture Overview

This is a Telegram bot that collects Syrian news from multiple configured Telegram channels and posts daily summaries. The system operates on two deployment models and uses a split Lambda architecture for better reliability and scalability.

### AWS Lambda Deployment (Production) - Split Architecture

- **CollectAndSummarizeFunction**: `src/lambda/CollectAndSummarize.ts` - Collects and processes news, uploads to S3
  - **Schedule**: Runs daily at 21:10 UTC via CloudWatch Events
  - **Timeout**: 10 minutes for web scraping and AI processing
  - **Memory**: 1GB for intensive processing
- **PostToTelegramEnglishFunction**: `src/lambda/PostToTelegram.ts` - Posts English formatted news to Telegram
  - **Trigger**: S3 ObjectCreated events from news data uploads
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Environment**: `CONTENT_LANGUAGE=english`, `TELEGRAM_CHANNEL_ID={EnglishChannelId}`
- **PostToTelegramArabicFunction**: `src/lambda/PostToTelegram.ts` - Posts Arabic formatted news to Telegram
  - **Trigger**: S3 ObjectCreated events from news data uploads (same trigger as English)
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Environment**: `CONTENT_LANGUAGE=arabic`, `TELEGRAM_CHANNEL_ID={ArabicChannelId}`
- **S3 Bucket**: Intermediary storage for news data between functions
  - **Key Format**: `news-data/{YYYY-MM-DD}.json`
  - **Lifecycle**: 30-day retention policy

### Local Development

- **Entry point**: `src/local/index.ts` - Direct execution for testing
- **Environment**: Uses dotenv for local environment variables

### Core Components

**Data Flow (Split Architecture)**:

**CollectAndSummarizeFunction**:

1. `collectAndSummarize()` - Main function in `src/news-collection/collectAndSummarize.ts`
   - `getPostsInLast24Hours()` - Fetches recent posts from multiple configured Telegram channels
   - `processSANATelegramPost()` - Processes individual posts and extracts content
   - `summarizeAndTranslate()` - Uses OpenAI to create English summaries and translations from Arabic content
2. Upload processed data to S3 bucket with date-based key

**PostToTelegramEnglishFunction & PostToTelegramArabicFunction** (both triggered by same S3 event):
3. Download processed news data from S3
4. `prioritizeAndFormat()` - Prioritizes news items and formats them for Telegram
   - `prioritizeNews()` - Prioritizes news items based on importance and relevance
   - `formatNewsItemsForTelegram()` - Formats news items into structured Telegram messages (language determined by `CONTENT_LANGUAGE` env var)
5. `postSummary()` - Posts formatted summary to target Telegram channel in respective language

**Local Development Flow**:

- `src/local/index.ts` - Main orchestrator function that combines all steps for local testing

**Key Modules**:

- `src/telegram/bot.ts` - Grammy-based Telegram bot configuration and posting functionality
- `src/news-collection/browser.ts` - Axios and JSDOM-based HTML fetching and parsing for web scraping
- `src/utils/dateUtils.ts` - Damascus timezone handling for 24-hour windows
- `src/formatting/strings.ts` - String constants and message templates
- `src/types.ts` - TypeScript type definitions
- `src/prioritizeNews.ts` - News prioritization logic
- `src/prioritizeAndFormat.ts` - Combined prioritization and formatting logic
- `src/formatting/telegramNewsFormatter.ts` - Telegram message formatting
- `src/ai/summarizeAndTranslate.ts` - OpenAI-powered summarization and translation

### Environment Requirements

The application requires these environment variables:

- `TELEGRAM_BOT_TOKEN` - Bot authentication token
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` - Telegram API credentials
- `SESSION_STRING` - Telegram user session for channel access
- `OPENAI_API_KEY` - OpenAI API for summarization
- `TELEGRAM_CHANNEL_ID_ENGLISH` - Telegram channel ID for English posts
- `TELEGRAM_CHANNEL_ID_ARABIC` - Telegram channel ID for Arabic posts

### Build System

- **TypeScript compilation**: Uses esbuild for fast bundling and minification
- **Target**: Node.js 22.x runtime
- **Output**: `lambda/CollectAndSummarize/` and `lambda/PostToTelegram/` for AWS deployment
- **External dependencies**: AWS SDK and S3 Client are externalized

### AWS Infrastructure

Defined in `template.yml` (SAM template):

- Multiple Lambda functions with split architecture:
  - CollectAndSummarize: 10-minute timeout and 1GB memory
  - PostToTelegram: 1-minute timeout and 512MB memory
- Scheduled execution via CloudWatch Events
- Parameter-based environment variable injection
