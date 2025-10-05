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

### Deployment & Testing Scripts

- **Simulate daily trigger**: `./scripts/simulate-daily-trigger.sh` - Manually invokes CollectFunction to simulate the daily scheduled trigger
- **Pull remote files**: `./scripts/pull-remote-files.sh` - Downloads all S3 bucket contents to `cache/remote-files/` for debugging

### AWS SAM Local Development

- **SAM build**: `npm run sam:build` - Build SAM application for local testing
- **SAM local API**: `npm run sam:local` - Start local Lambda environment
- **SAM invoke collect**: `npm run sam:invoke:collect` - Invoke CollectAndSummarize function locally
- **SAM invoke collect with event**: `npm run sam:invoke:collect:event` - Invoke with scheduled event
- **SAM invoke post English**: `npm run sam:invoke:post:english` - Invoke PostToTelegramEnglish function with S3 event
- **SAM invoke post Arabic**: `npm run sam:invoke:post:arabic` - Invoke PostToTelegramArabic function with S3 event
- **SAM dev workflow**: `npm run sam:dev` - Build TypeScript, build SAM, and start local environment

## Architecture Overview

This is a Telegram bot that collects Syrian news from 30+ configured Telegram channels (government and official sources defined in `channels.json`) and posts daily summaries in both English and Arabic with generated banner images. The system uses a modular 5-stage Lambda pipeline architecture with EventBridge for reliable message processing and S3 for stage outputs.

### AWS Lambda Deployment (Production) - Modular Pipeline Architecture

The system uses a 5-stage pipeline with separate Lambda functions connected via S3 and EventBridge:

- **CollectFunction**: `src/lambda/Collect.ts` - Collects raw news posts from Telegram channels

  - **Schedule**: Runs daily at 20:01 UTC via CloudWatch Events (23:01 Damascus time)
  - **Timeout**: 10 minutes for web scraping
  - **Memory**: 1GB for intensive processing
  - **Architecture**: ARM64
  - **Output**: Uploads collected data to S3 at `collected-news/{YYYY-MM-DD}.json`
  - **Core function**: `src/news-collection/collect.ts` - Fetches and processes posts from configured channels

- **DeduplicateFunction**: `src/lambda/Deduplicate.ts` - AI-powered early deduplication with multi-round processing

  - **Trigger**: EventBridge events from S3 ObjectCreated (`collected-news/` prefix)
  - **Timeout**: 15 minutes for multi-round AI processing
  - **Memory**: 1GB for AI operations
  - **Architecture**: ARM64
  - **Output**: Uploads deduplicated data to S3 at `deduplicated-news/{YYYY-MM-DD}.json`
  - **Core function**: `src/ai/deduplicate.ts` - Multi-round batch deduplication with round-robin redistribution
  - **Processing**: Uses 150-item batches, 5 parallel requests, early stopping at 98% ratio threshold

- **SummarizeFunction**: `src/lambda/Summarize.ts` - AI-powered summarization and translation

  - **Trigger**: EventBridge events from S3 ObjectCreated (`deduplicated-news/` prefix)
  - **Timeout**: 10 minutes for AI processing
  - **Memory**: 512MB for AI operations
  - **Architecture**: ARM64
  - **Output**: Uploads summarized data to S3 at `summarized-news/{YYYY-MM-DD}.json`
  - **Core function**: `src/ai/summarize.ts` - Batch summarization with parallel processing (up to 30 batches)

- **PublishToWebsiteFunction**: `src/lambda/PublishToWebsite.ts` - Publishes news to GitHub Pages website

  - **Trigger**: EventBridge events from S3 ObjectCreated (`summarized-news/` prefix)
  - **Timeout**: 1 minute for GitHub API operations
  - **Memory**: 256MB for lightweight publishing
  - **Architecture**: ARM64
  - **Output**: Triggers custom EventBridge event (`summaries-published`) after successful publishing
  - **Core function**: Publishes to GitHub repository for website deployment

- **PostToTelegramEnglishFunction**: `src/lambda/PostToTelegram.ts` - Posts English formatted news with banner

  - **Trigger**: Custom EventBridge event (`summaries-published`) from PublishToWebsiteFunction
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Architecture**: ARM64 with font rendering layers
  - **Environment**: `CONTENT_LANGUAGE=english`, `TELEGRAM_CHANNEL_ID={EnglishChannelId}`, `FONTCONFIG_PATH=/opt/etc/fonts`

- **PostToTelegramArabicFunction**: `src/lambda/PostToTelegram.ts` - Posts Arabic formatted news with banner

  - **Trigger**: Custom EventBridge event (`summaries-published`) from PublishToWebsiteFunction (same as English)
  - **Timeout**: 1 minute for posting
  - **Memory**: 512MB for lightweight posting
  - **Architecture**: ARM64 with font rendering layers
  - **Environment**: `CONTENT_LANGUAGE=arabic`, `TELEGRAM_CHANNEL_ID={ArabicChannelId}`, `FONTCONFIG_PATH=/opt/etc/fonts`

- **S3 Bucket**: Intermediary storage for news data at each pipeline stage

  - **Stage 1 Output**: `collected-news/{YYYY-MM-DD}.json` - Raw collected posts
  - **Stage 2 Output**: `deduplicated-news/{YYYY-MM-DD}.json` - Deduplicated items (early deduplication)
  - **Stage 3 Output**: `summarized-news/{YYYY-MM-DD}.json` - Summarized and translated items
  - **Banners**: `composedBanners/{language}/{label}.jpg` - Pre-composed banner images

- **DynamoDB StateTable**: Tracks briefing processing state and prevents duplicate processing
  - **Primary Key**: `PK` (partition key), `SK` (sort key)
  - **Briefing Entity**: Stores timestamps for each pipeline stage and post URLs
  - **Schema**: `date`, `collectedTime`, `deduplicatedTime`, `summarizedTime`, `publishedToWebsiteTime`, `posts[formatter][language]`
  - **Idempotency**: Each Lambda function checks state before processing to prevent re-execution

### Local Development

- **Entry point**: `src/local/index.ts` - Direct execution for testing both languages
- **Environment**: Uses dotenv for local environment variables
- **Caching**: Uses `cache/cachedData.json` for local development to avoid re-fetching
- **Channel Configuration**: Loads channel list from `channels.json` (30+ channels)

### Core Components

**Data Flow (5-Stage Pipeline)**:

**Stage 1: Collection** (`CollectFunction`):

1. Initialize briefing in DynamoDB via `initializeBriefing()` - Creates state tracking record
2. `collect()` - Main function in `src/news-collection/collect.ts`
   - `getPostsInLast24Hours()` - Fetches recent posts from multiple configured Telegram channels (loaded from `channels.json`)
   - `processTelegramPost()` - Processes individual posts and extracts content from all channel types
3. Upload raw collected posts to S3 at `collected-news/{date}.json`
4. Update briefing state via `updateBriefingCollectedTime()` - Records collection completion timestamp

**Stage 2: Early Deduplication** (`DeduplicateFunction`): 5. Triggered by S3 ObjectCreated event from Stage 1 6. Check briefing state via `getBriefing()` - Validates briefing exists and hasn't been deduplicated yet 7. Download collected posts from S3 8. `deduplicate()` - Multi-round AI-powered deduplication in `src/ai/deduplicate.ts`

- Processes items in batches of 150 items
- Uses round-robin redistribution between rounds to maximize deduplication opportunities
- Runs up to 5 parallel requests per batch group
- Continues until ratio threshold (98%) is reached or max rounds completed
- Merges similar stories while preserving all unique sources

9. Upload deduplicated data to S3 at `deduplicated-news/{date}.json`
10. Update briefing state via `updateBriefingDeduplicatedTime()` - Records deduplication completion timestamp

**Stage 3: Summarization** (`SummarizeFunction`): 11. Triggered by S3 ObjectCreated event from Stage 2 12. Check briefing state via `getBriefing()` - Validates briefing exists and hasn't been summarized yet 13. Download deduplicated posts from S3 14. `summarize()` - Batch AI summarization in `src/ai/summarize.ts`

- Processes up to 30 batches in parallel
- Each batch contains up to 20 news items
- Uses AI to create English summaries and translations from Arabic content

15. Upload summarized data to S3 at `summarized-news/{date}.json`
16. Update briefing state via `updateBriefingSummarizedTime()` - Records summarization completion timestamp

**Stage 4: Website Publishing** (`PublishToWebsiteFunction`): 17. Triggered by S3 ObjectCreated event from Stage 3 18. Check briefing state via `getBriefing()` - Validates briefing exists and hasn't been published yet 19. Download summarized news from S3 20. Publish content to GitHub repository for website deployment 21. Update briefing state via `updateBriefingPublishedToWebsiteTime()` - Records publishing completion timestamp 22. Trigger custom EventBridge event (`summaries-published`) to notify Telegram posting functions

**Stage 5: Telegram Posting** (`PostToTelegramEnglishFunction` & `PostToTelegramArabicFunction`): 23. Both triggered by custom EventBridge event (`summaries-published`) from Stage 4 24. Check briefing state via `getBriefing()` - Validates briefing exists and hasn't been posted for this language yet 25. Download summarized news from S3 26. `prioritizeAndFormat()` - Final prioritization and formatting in `src/prioritizeAndFormat.ts` - `prioritizeNews()` - Prioritizes news items based on importance and relevance - `formatNewsItemsForTelegram()` - Formats news items into structured Telegram messages (language determined by `CONTENT_LANGUAGE` env var) 27. `getMostFrequentLabel()` - Determines banner category from news labels 28. Fetch pre-composed banner from S3 (`composedBanners/{language}/{label}.jpg`) 29. `addDateToBanner()` - Adds date overlay to banner image 30. `TelegramUser.sendPhotoToChannel()` - Posts banner image with formatted summary to target Telegram channel 31. Update briefing state via `updateBriefingPost()` - Records post URL in DynamoDB

**Local Development Flow**:

- `src/local/index.ts` - Executes pipeline locally with different stage ordering for testing
- Local pipeline: Collect → Deduplicate → Summarize → Format → (Optionally) Post
- Uses local caching system to avoid re-fetching and re-processing during development

**Key Modules**:

**Lambda Entry Points**:

- `src/lambda/Collect.ts` - Stage 1: Collection Lambda handler
- `src/lambda/Deduplicate.ts` - Stage 2: Early deduplication Lambda handler
- `src/lambda/Summarize.ts` - Stage 3: Summarization Lambda handler
- `src/lambda/PublishToWebsite.ts` - Stage 4: Website publishing Lambda handler
- `src/lambda/PostToTelegram.ts` - Stage 5: Posting Lambda handler (shared by English/Arabic)

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

**Publishing**:

- `src/publish/publishToGitHub.ts` - GitHub API integration for website publishing

**Banner Generation**:

- `src/banner/newsBanner.ts` - Advanced SVG-based banner image generation system with date overlay
- `src/banner/composeBanners.ts` - Banner composition utility for pre-generating variants
- `src/banner/bannersDemo.ts` - Banner generation demonstration and testing utility
- `src/mostFrequentLabel.ts` - Determines most frequent news category for banners

**State Management**:

- `src/db/Table.ts` - DynamoDB table configuration with dynamodb-toolbox
- `src/db/BriefingEntity.ts` - Briefing entity schema and CRUD operations for pipeline state tracking

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
- `GITHUB_TOKEN` - GitHub token for publishing to website
- `SIMULATE_WEBSITE_PUBLISH` - Whether to simulate website publishing (optional, defaults to "false")
- `ALERT_EMAIL` - Email address for DLQ alerts (deployment only)

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

- **5-stage Lambda pipeline**:
  - **CollectFunction**: 10-minute timeout, 1GB memory, ARM64 architecture
  - **DeduplicateFunction**: 15-minute timeout, 1GB memory, ARM64 architecture
  - **SummarizeFunction**: 10-minute timeout, 512MB memory, ARM64 architecture
  - **PublishToWebsiteFunction**: 1-minute timeout, 256MB memory, ARM64 architecture
  - **PostToTelegramEnglish/Arabic**: 1-minute timeout, 512MB memory, ARM64 architecture
- **EventBridge integration** for S3-to-Lambda and custom event triggering:
  - `collected-news/` prefix triggers DeduplicateFunction
  - `deduplicated-news/` prefix triggers SummarizeFunction
  - `summarized-news/` prefix triggers PublishToWebsiteFunction
  - Custom `summaries-published` event triggers both PostToTelegram functions
- **S3 Bucket** (`NewsDataBucket`) with EventBridge notifications enabled for pipeline orchestration
- **DynamoDB StateTable** for pipeline state tracking with idempotency guarantees
  - Pay-per-request billing mode
  - Single-table design with PK/SK pattern
  - Global environment variable: `STATE_TABLE_NAME`
  - Managed via dynamodb-toolbox library
- **Error Handling & Monitoring**:
  - Dead Letter Queues (SQS) for each Lambda function with 14-day message retention
  - CloudWatch alarms for DLQ messages with SNS email notifications
  - Graceful error handling in state update operations
  - Zero retry attempts with 1-hour event age limit for Lambda invocations
- **Font rendering layers** for ARM64 posting functions (amazon_linux_fonts, stix-fonts)
- **Custom EventBridge bus** (`GitHubActionsEventBus`) for GitHub Actions integration
- **Scheduled execution** via CloudWatch Events (20:01 UTC daily = 23:01 Damascus time) for CollectFunction
- **Multi-provider AI support** with configurable model parameters (OpenAI/Anthropic) via `AI_MODEL` parameter
- **Parameter-based configuration** with environment variable injection and language-specific configurations
- **Global Environment Variables** (applied to all functions):
  - `STATE_TABLE_NAME` - DynamoDB table name
  - `NODE_OPTIONS=--enable-source-maps` - Source map support for debugging
  - `NODE_ENV=production` - Production mode
  - `IS_LAMBDA=true` - Lambda environment flag
- **Global IAM Policies** (applied to all functions):
  - AWSLambdaBasicExecutionRole - CloudWatch Logs access
  - DynamoDBCrudPolicy - Full access to StateTable
  - SQSSendMessagePolicy - Write access to respective DLQ
- **Function-specific IAM Policies**:
  - CollectFunction: S3 write access
  - DeduplicateFunction: S3 read/write access
  - SummarizeFunction: S3 read/write access
  - PublishToWebsiteFunction: S3 read access, EventBridge PutEvents to GitHubActionsEventBus
  - PostToTelegram functions: S3 read access
