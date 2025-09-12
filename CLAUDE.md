# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to bundled Lambda functions using esbuild
- **Local development**: `npm start` or `ts-node src/local/index.ts` - Run the news collection and summarization locally
- **Development server**: `npm run telegram:serve` - Start Telegram development server
- **Deploy preparation**: `npm run predeploy` - Runs build before deployment
- **Deploy**: `npm run deploy` - Deploys to AWS using SAM with environment variables from .env
- **Register Telegram webhook**: `npm run telegram:register-webhook` - Sets up Telegram bot webhook
- **Testing**: `npm test` - Run tests with Vitest
- **Testing with UI**: `npm run test:ui` - Run tests with Vitest UI
- **Run tests once**: `npm run test:run` - Run tests in CI mode
- **Banner composition**: `npm run banners:compose` - Generate banner images from source assets
- **Update banners**: `npm run banners:update` - Recreate all composed banner variants and upload to S3

### AWS SAM Local Development

- **SAM build**: `npm run sam:build` - Build SAM application for local testing
- **SAM local API**: `npm run sam:local` - Start local Lambda environment
- **SAM invoke collect**: `npm run sam:invoke:collect` - Invoke CollectAndSummarize function locally
- **SAM invoke collect with event**: `npm run sam:invoke:collect:event` - Invoke with scheduled event
- **SAM invoke post English**: `npm run sam:invoke:post:english` - Invoke PostToTelegramEnglish function with S3 event
- **SAM invoke post Arabic**: `npm run sam:invoke:post:arabic` - Invoke PostToTelegramArabic function with S3 event
- **SAM dev workflow**: `npm run sam:dev` - Build TypeScript, build SAM, and start local environment

## Architecture Overview

This is a Telegram bot that collects Syrian news from 30+ configured Telegram channels (government and official sources defined in `channels.json`) and posts daily summaries in both English and Arabic with generated banner images. The system uses a split Lambda architecture with EventBridge for reliable message processing.

### AWS Lambda Deployment (Production) - Split Architecture

- **CollectAndSummarizeFunction**: `src/lambda/CollectAndSummarize.ts` - Collects and processes news, uploads to S3
  - **Schedule**: Runs daily at 21:10 UTC via CloudWatch Events
  - **Timeout**: 10 minutes for web scraping and AI processing
  - **Memory**: 1GB for intensive processing
- **PostToTelegramEnglishFunction**: `src/lambda/PostToTelegram.ts` - Posts English formatted news to Telegram with banner
  - **Trigger**: EventBridge events from S3 ObjectCreated (via EventBridge configuration)
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Architecture**: ARM64 with font rendering layers
  - **Environment**: `CONTENT_LANGUAGE=english`, `TELEGRAM_CHANNEL_ID={EnglishChannelId}`, `FONTCONFIG_PATH=/opt/etc/fonts`
- **PostToTelegramArabicFunction**: `src/lambda/PostToTelegram.ts` - Posts Arabic formatted news to Telegram with banner
  - **Trigger**: EventBridge events from S3 ObjectCreated (same trigger as English)
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Architecture**: ARM64 with font rendering layers
  - **Environment**: `CONTENT_LANGUAGE=arabic`, `TELEGRAM_CHANNEL_ID={ArabicChannelId}`, `FONTCONFIG_PATH=/opt/etc/fonts`
- **S3 Bucket**: Intermediary storage for news data between functions
  - **Key Format**: `news-data/{YYYY-MM-DD}.json`
  - **Lifecycle**: 30-day retention policy

### Local Development

- **Entry point**: `src/local/index.ts` - Direct execution for testing both languages
- **Environment**: Uses dotenv for local environment variables
- **Caching**: Uses `cache/cachedData.json` for local development to avoid re-fetching
- **Channel Configuration**: Loads channel list from `channels.json` (30+ channels)

### Core Components

**Data Flow (Split Architecture)**:

**CollectAndSummarizeFunction**:

1. `collectAndSummarize()` - Main function in `src/news-collection/collectAndSummarize.ts`
   - `getPostsInLast24Hours()` - Fetches recent posts from multiple configured Telegram channels (loaded from `channels.json`)
   - `processTelegramPost()` - Processes individual posts and extracts content from all channel types
   - `summarizeAndTranslate()` - Uses OpenAI to create English summaries and translations from Arabic content
2. Upload processed data to S3 bucket with date-based key

**PostToTelegramEnglishFunction & PostToTelegramArabicFunction** (both triggered by same EventBridge event): 3. Download processed news data from S3 4. `prioritizeAndFormat()` - Prioritizes news items and formats them for Telegram

- `prioritizeNews()` - Prioritizes news items based on importance and relevance
- `formatNewsItemsForTelegram()` - Formats news items into structured Telegram messages (language determined by `CONTENT_LANGUAGE` env var)

5. `generateNewsBanner()` - Creates banner image based on most frequent news label
6. `TelegramUser.sendPhotoToChannel()` - Posts banner image with formatted summary to target Telegram channel

**Local Development Flow**:

- `src/local/index.ts` - Main orchestrator function that posts to both English and Arabic channels for local testing

**Key Modules**:

- `src/telegram/bot.ts` - Grammy-based Telegram bot configuration and posting functionality
- `src/telegram/user.ts` - Telegram user client for channel posting with image support
- `src/news-collection/browser.ts` - Axios and JSDOM-based HTML fetching and parsing for web scraping
- `src/news-collection/telegram/getPostsInLast24Hours.ts` - Multi-channel post fetching with dynamic channel configuration
- `src/utils/dateUtils.ts` - Damascus timezone handling for 24-hour windows
- `src/formatting/strings.ts` - String constants and message templates
- `src/types.ts` - TypeScript type definitions including channel configuration
- `src/prioritizeNews.ts` - News prioritization logic with label weighting
- `src/prioritizeAndFormat.ts` - Combined prioritization and formatting logic
- `src/formatting/telegramNewsFormatter.ts` - Telegram message formatting
- `src/ai/summarizeAndTranslate.ts` - OpenAI-powered summarization and translation
- `src/banner/newsBanner.ts` - Advanced SVG-based banner image generation system
- `src/banner/composeBanners.ts` - Banner composition utility for pre-generating variants
- `src/banner/bannersDemo.ts` - Banner generation demonstration and testing utility
- `src/ai/getLLMProvider.ts` - Multi-provider AI system supporting OpenAI and Anthropic
- `src/mostFrequentLabel.ts` - Determines most frequent news category for banners
- `channels.json` - Configuration file defining 30+ Telegram channels to monitor

### Environment Requirements

The application requires these environment variables:

- `TELEGRAM_BOT_TOKEN` - Bot authentication token
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` - Telegram API credentials
- `SESSION_STRING` - Telegram user session for channel access
- `OPENAI_API_KEY` - OpenAI API for summarization (optional if using Anthropic)
- `ANTHROPIC_API_KEY` - Anthropic API for summarization (optional if using OpenAI)
- `AI_MODEL` - AI model specification with provider prefix (e.g., "openai:gpt-4.1-2025-04-14", "anthropic:claude-3-5-sonnet-20241022")
- `TELEGRAM_CHANNEL_ID_ENGLISH` - Telegram channel ID for English posts
- `TELEGRAM_CHANNEL_ID_ARABIC` - Telegram channel ID for Arabic posts

### Build System

- **TypeScript compilation**: Uses esbuild for fast bundling and minification
- **Target**: Node.js 22.x runtime
- **Output**: `lambda/CollectAndSummarize/` and `lambda/PostToTelegram/` for AWS deployment
- **External dependencies**: AWS SDK and S3 Client are externalized
- **Banner Assets**: Pre-composed banner images for 19 news categories in both English and Arabic
- **Font Support**: Integrated Arabic font support (Noto Nasklh Arabic) for banner generation

### AWS Infrastructure

Defined in `template.yml` (SAM template):

- **Multiple Lambda functions with split architecture**:
  - CollectAndSummarize: 10-minute timeout, 1GB memory, x86_64 architecture
  - PostToTelegramEnglish/Arabic: 1-minute timeout, 512MB memory, ARM64 architecture
- **EventBridge integration** for S3 ObjectCreated events triggering both language functions
- **Font rendering layers** for ARM64 functions (amazon_linux_fonts, stix-fonts)
- **Scheduled execution** via CloudWatch Events (21:10 UTC daily = 00:10 Damascus time)
- **Multi-provider AI support** with configurable model parameters (OpenAI/Anthropic)
- **Parameter-based configuration** with environment variable injection and language-specific configurations
