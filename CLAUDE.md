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

This is a Telegram bot that collects Syrian news from 30+ configured Telegram channels (government and official sources defined in `channels.json`) and posts daily summaries in both English and Arabic with generated banner images. The system uses a modular 4-stage Lambda pipeline architecture with EventBridge for reliable message processing and S3 for stage outputs.

### AWS Lambda Deployment (Production) - Modular Pipeline Architecture

The system uses a 4-stage pipeline with separate Lambda functions connected via S3 and EventBridge:

- **CollectFunction**: `src/lambda/Collect.ts` - Collects raw news posts from Telegram channels
  - **Schedule**: Runs daily at 21:10 UTC via CloudWatch Events (00:10 Damascus time)
  - **Timeout**: 10 minutes for web scraping
  - **Memory**: 1GB for intensive processing
  - **Architecture**: x86_64
  - **Output**: Uploads collected data to S3 at `collected-news/{YYYY-MM-DD}.json`
  - **Core function**: `src/news-collection/collect.ts` - Fetches and processes posts from configured channels

- **SummarizeFunction**: `src/lambda/Summarize.ts` - AI-powered summarization and translation
  - **Trigger**: EventBridge events from S3 ObjectCreated (`collected-news/` prefix)
  - **Timeout**: 10 minutes for AI processing
  - **Memory**: 1GB for AI operations
  - **Output**: Uploads summarized data to S3 at `summarized-news/{YYYY-MM-DD}.json`
  - **Core function**: `src/ai/summarize.ts` - Batch summarization with parallel processing (up to 30 batches)

- **DeduplicateFunction**: `src/lambda/Deduplicate.ts` - AI-powered deduplication and prioritization
  - **Trigger**: EventBridge events from S3 ObjectCreated (`summarized-news/` prefix)
  - **Timeout**: 10 minutes for AI processing
  - **Memory**: 1GB for AI operations
  - **Output**: Uploads deduplicated data to S3 at `deduplicated-news/{YYYY-MM-DD}.json`
  - **Core function**: `src/ai/deduplicate.ts` - Merges duplicate stories and preserves all sources

- **PostToTelegramEnglishFunction**: `src/lambda/PostToTelegram.ts` - Posts English formatted news with banner
  - **Trigger**: EventBridge events from S3 ObjectCreated (`deduplicated-news/` prefix)
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Architecture**: ARM64 with font rendering layers
  - **Environment**: `CONTENT_LANGUAGE=english`, `TELEGRAM_CHANNEL_ID={EnglishChannelId}`, `FONTCONFIG_PATH=/opt/etc/fonts`

- **PostToTelegramArabicFunction**: `src/lambda/PostToTelegram.ts` - Posts Arabic formatted news with banner
  - **Trigger**: EventBridge events from S3 ObjectCreated (`deduplicated-news/` prefix, same as English)
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Architecture**: ARM64 with font rendering layers
  - **Environment**: `CONTENT_LANGUAGE=arabic`, `TELEGRAM_CHANNEL_ID={ArabicChannelId}`, `FONTCONFIG_PATH=/opt/etc/fonts`

- **S3 Bucket**: Intermediary storage for news data at each pipeline stage
  - **Stage 1 Output**: `collected-news/{YYYY-MM-DD}.json` - Raw collected posts
  - **Stage 2 Output**: `summarized-news/{YYYY-MM-DD}.json` - Summarized and translated items
  - **Stage 3 Output**: `deduplicated-news/{YYYY-MM-DD}.json` - Deduplicated and prioritized items
  - **Banners**: `composedBanners/{language}/{label}.jpg` - Pre-composed banner images

### Local Development

- **Entry point**: `src/local/index.ts` - Direct execution for testing both languages
- **Environment**: Uses dotenv for local environment variables
- **Caching**: Uses `cache/cachedData.json` for local development to avoid re-fetching
- **Channel Configuration**: Loads channel list from `channels.json` (30+ channels)

### Core Components

**Data Flow (4-Stage Pipeline)**:

**Stage 1: Collection** (`CollectFunction`):
1. `collect()` - Main function in `src/news-collection/collect.ts`
   - `getPostsInLast24Hours()` - Fetches recent posts from multiple configured Telegram channels (loaded from `channels.json`)
   - `processTelegramPost()` - Processes individual posts and extracts content from all channel types
2. Upload raw collected posts to S3 at `collected-news/{date}.json`

**Stage 2: Summarization** (`SummarizeFunction`):
3. Triggered by S3 ObjectCreated event from Stage 1
4. Download collected posts from S3
5. `summarize()` - Batch AI summarization in `src/ai/summarize.ts`
   - Processes up to 30 batches in parallel
   - Each batch contains up to 20 news items
   - Uses AI to create English summaries and translations from Arabic content
6. Upload summarized data to S3 at `summarized-news/{date}.json`

**Stage 3: Deduplication** (`DeduplicateFunction`):
7. Triggered by S3 ObjectCreated event from Stage 2
8. Download summarized news from S3
9. `prioritizeNews()` - Initial prioritization and filtering to top 100 items
10. `deduplicate()` - AI-powered deduplication in `src/ai/deduplicate.ts`
    - Merges similar stories
    - Preserves all unique sources and labels
    - Creates comprehensive summaries
11. Upload deduplicated data to S3 at `deduplicated-news/{date}.json`

**Stage 4: Posting** (`PostToTelegramEnglishFunction` & `PostToTelegramArabicFunction`):
12. Both triggered by same S3 ObjectCreated event from Stage 3
13. Download deduplicated news from S3
14. `prioritizeAndFormat()` - Final prioritization and formatting in `src/prioritizeAndFormat.ts`
    - `prioritizeNews()` - Prioritizes news items based on importance and relevance
    - `formatNewsItemsForTelegram()` - Formats news items into structured Telegram messages (language determined by `CONTENT_LANGUAGE` env var)
15. `getMostFrequentLabel()` - Determines banner category from news labels
16. Fetch pre-composed banner from S3 (`composedBanners/{language}/{label}.jpg`)
17. `addDateToBanner()` - Adds date overlay to banner image
18. `TelegramUser.sendPhotoToChannel()` - Posts banner image with formatted summary to target Telegram channel

**Local Development Flow**:
- `src/local/index.ts` - Executes full pipeline locally for testing both English and Arabic output

**Key Modules**:

**Lambda Entry Points**:
- `src/lambda/Collect.ts` - Stage 1: Collection Lambda handler
- `src/lambda/Summarize.ts` - Stage 2: Summarization Lambda handler
- `src/lambda/Deduplicate.ts` - Stage 3: Deduplication Lambda handler
- `src/lambda/PostToTelegram.ts` - Stage 4: Posting Lambda handler (shared by English/Arabic)

**Core Processing**:
- `src/news-collection/collect.ts` - Main collection logic for raw posts
- `src/news-collection/telegram/getPostsInLast24Hours.ts` - Multi-channel post fetching with dynamic channel configuration
- `src/news-collection/processSANATelegramPost.ts` - Processes individual posts and extracts content
- `src/ai/summarize.ts` - AI-powered batch summarization and translation (parallel processing)
- `src/ai/deduplicate.ts` - AI-powered deduplication with story merging
- `src/prioritizeNews.ts` - News prioritization logic with label weighting
- `src/prioritizeAndFormat.ts` - Combined prioritization and formatting logic
- `src/formatting/telegramNewsFormatter.ts` - Telegram message formatting
- `src/formatting/index.ts` - Formatting utilities and HTML rendering measurement

**Telegram Integration**:
- `src/telegram/bot.ts` - Grammy-based Telegram bot configuration
- `src/telegram/user.ts` - Telegram user client for channel posting with image support

**AI & Content Processing**:
- `src/ai/getLLMProvider.ts` - Multi-provider AI system supporting OpenAI and Anthropic
- `src/ai/customTerms.ts` - Custom terminology for translation consistency

**Banner Generation**:
- `src/banner/newsBanner.ts` - Advanced SVG-based banner image generation system with date overlay
- `src/banner/composeBanners.ts` - Banner composition utility for pre-generating variants
- `src/banner/bannersDemo.ts` - Banner generation demonstration and testing utility
- `src/mostFrequentLabel.ts` - Determines most frequent news category for banners

**Utilities**:
- `src/news-collection/browser.ts` - Axios and JSDOM-based HTML fetching and parsing for web scraping
- `src/news-collection/extractSANAArticleContent.ts` - Extracts article content from SANA website
- `src/utils/dateUtils.ts` - Damascus timezone handling for 24-hour windows
- `src/formatting/strings.ts` - String constants and message templates
- `src/types.ts` - TypeScript type definitions including channel configuration and schemas

**Configuration**:
- `channels.json` - Configuration file defining 30+ Telegram channels to monitor
- `esbuild.config.ts` - Build configuration for bundling Lambda functions

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

- **TypeScript compilation**: Uses esbuild for fast bundling and minification (configured in `esbuild.config.ts`)
- **Target**: Node.js 22.x runtime
- **Output**: Separate directories for each Lambda function:
  - `lambda/Collect/` - Collection function bundle
  - `lambda/Summarize/` - Summarization function bundle
  - `lambda/Deduplicate/` - Deduplication function bundle
  - `lambda/PostToTelegram/` - Posting function bundle (shared by English/Arabic)
- **External dependencies**: AWS SDK and S3 Client are externalized to reduce bundle size
- **Build artifacts**:
  - `channels.json` copied to `lambda/Collect/` for channel configuration
  - JSDOM worker script (`xhr-sync-worker.js`) copied to `lambda/Collect/` for web scraping
- **Banner Assets**: Pre-composed banner images for 19 news categories in both English and Arabic, stored in S3
- **Font Support**: Integrated Arabic font support (Noto Nasklh Arabic) via Lambda layers for ARM64 architecture

### AWS Infrastructure

Defined in `template.yml` (SAM template):

- **4-stage Lambda pipeline**:
  - **CollectFunction**: 10-minute timeout, 1GB memory, x86_64 architecture
  - **SummarizeFunction**: 10-minute timeout, 1GB memory, x86_64 architecture
  - **DeduplicateFunction**: 10-minute timeout, 1GB memory, x86_64 architecture
  - **PostToTelegramEnglish/Arabic**: 1-minute timeout, 512MB memory, ARM64 architecture
- **EventBridge integration** for S3-to-Lambda triggering:
  - `collected-news/` prefix triggers SummarizeFunction
  - `summarized-news/` prefix triggers DeduplicateFunction
  - `deduplicated-news/` prefix triggers both PostToTelegram functions
- **S3 Bucket** (`NewsDataBucket`) with EventBridge notifications enabled for pipeline orchestration
- **Font rendering layers** for ARM64 posting functions (amazon_linux_fonts, stix-fonts)
- **Scheduled execution** via CloudWatch Events (21:10 UTC daily = 00:10 Damascus time) for CollectFunction
- **Multi-provider AI support** with configurable model parameters (OpenAI/Anthropic) via `AI_MODEL` parameter
- **Parameter-based configuration** with environment variable injection and language-specific configurations
- **IAM Policies**:
  - CollectFunction: S3 write access
  - SummarizeFunction: S3 read/write access
  - DeduplicateFunction: S3 read/write access
  - PostToTelegram functions: S3 read access
