# Syrian Daily News Bot

A Telegram bot that automatically collects Syrian news from 30+ Telegram channels (government and official sources), using AI to summarize, translate, label, and prioritize the content before posting daily summaries with generated banner images in both English and Arabic.

## Telegram Channels

📢 **English Channel**: [@SyriaDailyEN](https://t.me/SyriaDailyEN)  
📢 **Arabic Channel**: [@SyriaDailyAR](https://t.me/SyriaDailyAR)

## Features

- **Multi-channel Collection**: Monitors 30+ configurable Telegram channels from `channels.json`
- **AI-Powered Processing**: Uses OpenAI or Anthropic models for summarization, translation, and deduplication
- **4-Stage Modular Pipeline**: Separate Lambda functions for Collection → Summarization → Deduplication → Posting
- **Parallel AI Processing**: Batch summarization with up to 30 parallel batches of 20 items each
- **Intelligent Deduplication**: AI-powered merging of duplicate stories while preserving all sources
- **Dynamic Banner Generation**: Creates SVG-based banner images with category-specific backgrounds for 19+ news types
- **Dual Language Support**: Posts formatted summaries in both English and Arabic with language-specific banners
- **EventBridge Orchestration**: S3-triggered Lambda functions for reliable, scalable pipeline execution
- **Local Development**: Full local testing environment with caching system
- **Damascus Timezone**: Accurate 24-hour news collection based on local Syrian time
- **Lightweight Scraping**: Uses axios and JSDOM for efficient web content extraction
- **ARM64 Optimization**: Memory-efficient posting functions with integrated font rendering support

## Architecture

### AWS Lambda (Production) - 4-Stage Modular Pipeline

The system uses a modular pipeline where each stage is a separate Lambda function, orchestrated via S3 and EventBridge:

**Stage 1: Collection**
- **CollectFunction**: Collects raw news posts from Telegram channels
  - Scheduled execution at 21:10 UTC daily (00:10 Damascus time)
  - Entry point: `src/lambda/Collect.ts`
  - Timeout: 10 minutes for web scraping
  - Memory: 1GB, x86_64 architecture
  - Output: `collected-news/{date}.json` → S3

**Stage 2: Summarization**
- **SummarizeFunction**: AI-powered summarization and translation
  - Triggered by S3 ObjectCreated event from Stage 1
  - Entry point: `src/lambda/Summarize.ts`
  - Timeout: 10 minutes for AI processing
  - Memory: 1GB, x86_64 architecture
  - Output: `summarized-news/{date}.json` → S3

**Stage 3: Deduplication**
- **DeduplicateFunction**: AI-powered deduplication and prioritization
  - Triggered by S3 ObjectCreated event from Stage 2
  - Entry point: `src/lambda/Deduplicate.ts`
  - Timeout: 10 minutes for AI processing
  - Memory: 1GB, x86_64 architecture
  - Output: `deduplicated-news/{date}.json` → S3

**Stage 4: Posting**
- **PostToTelegramEnglishFunction & PostToTelegramArabicFunction**: Post formatted news with banners
  - Triggered by S3 ObjectCreated event from Stage 3 (same trigger for both)
  - Entry point: `src/lambda/PostToTelegram.ts`
  - Timeout: 1 minute for posting
  - Memory: 512MB, ARM64 architecture with font rendering layers
  - Fetches pre-composed banners from S3 and adds date overlay

### Local Development

- Direct execution that runs the full 4-stage pipeline locally
- Entry point: `src/local/index.ts`
- Tests both English and Arabic output in a single run
- Uses dotenv for environment variables
- Local caching system via `cache/cachedData.json` to avoid re-fetching and re-processing during development

## Quick Start

### Prerequisites

- Node.js 22.x
- Yarn
- Git
- A way to tunnel your local server to the internet (e.g. [ngrok](https://ngrok.com/))
- A testing Telegram channel to post the summaries to (you can use the same channel for both languages)
- A Telegram bot token (you can get it from [@BotFather](https://t.me/BotFather))
- An AI API key (e.g. [OpenAI](https://openai.com/) or [Anthropic](https://www.anthropic.com/))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/sy-daily.git
cd sy-daily

# Install dependencies
yarn install
```

### Environment Setup

**Required Credentials**:

- **Telegram Bot Token**: Get from [@BotFather](https://t.me/BotFather)
- **Telegram API Credentials**: Get from [my.telegram.org](https://my.telegram.org)
- **Session String**: Generated when you first run the app with valid API credentials. You leave it blank in local development for the first time you run the app, but make sure to temporarily disable the check in the `src/telegram/user.ts` file.
- **AI API Key**: Either OpenAI or Anthropic API key for content processing
- **Channel IDs**: Telegram channel IDs where you want to post the summaries

### Running Locally

1. **Create environment file**: Copy `.env.example` to `.env` and fill in your credentials.

```env
DEV_PUBLIC_SERVER=your_public_server_url
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
SESSION_STRING=your_session_string

# AI Provider Configuration (choose one or both)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
AI_MODEL=openai:gpt-4.1-2025-04-14
# Alternative: AI_MODEL=anthropic:claude-3-5-sonnet-20241022

# Telegram Channel Configuration
TELEGRAM_CHANNEL_ID_ENGLISH=your_english_channel_id
TELEGRAM_CHANNEL_ID_ARABIC=your_arabic_channel_id
```

1. **Create or identify your Telegram channel IDs**:

You can find your channel ID (typically a negative number) by starting the Telegram bot in your local environment

```bash
yarn run telegram:serve
```

then register the webhook

```bash
yarn run telegram:register-webhook
```

Note: you need to have a way to tunnel your local server to the internet (e.g. [ngrok](https://ngrok.com/)), that you need to set in the `DEV_PUBLIC_SERVER` environment variable.

Once the webhook is registered, you can send a message to the channel and see the channel ID in the console output.

3. **Run the bot locally**:

```bash
# Start the news collection and posting process
yarn start

# This will:
# 1. Collect news from 30+ configured Telegram channels
# 2. Process and summarize the content using AI
# 3. Generate banner images for both languages
# 4. Post formatted summaries to your configured channels
```

Notes:

- The first time you run the app, it will persist the cache in the `cache/cachedData.json` file. This will be used to skip the collection and summarization process the next time you run the app, and will speed up the process and save on the AI credits. You can delete the file to start fresh.
- The first time you run the app, it will interactively ask you to enter your Telegram user credentials to acquire a session string. You can subsequently use the `SESSION_STRING` environment variable to avoid this step. Make sure to temporarily disable the check in the `src/telegram/user.ts` file and set the `SESSION_STRING` environment variable then re-enable the check.

### Testing Your Setup

```bash
# Run tests to ensure everything works
yarn test

# Test with UI
yarn run test:ui

# Build to check for TypeScript errors
yarn run build
```

## Development

### Development Server

```bash
yarn run telegram:serve     # Start Telegram development server
```

### Banner Generation

```bash
npm run banners:compose    # Generate banner compositions
npm run banners:update     # Update all composed banner variants
```

## Deployment

### Prerequisites

- AWS Account
- AWS CLI (configured with the appropriate permissions)
- SAM CLI
- Docker

### Prepare for Deployment

```bash
npm run predeploy
```

### Deploy to AWS

```bash
npm run deploy
```

### Register Telegram Webhook

```bash
npm run telegram:register-webhook
```

### SAM Local Development

```bash
npm run sam:build                    # Build SAM application
npm run sam:local                    # Start local Lambda environment
npm run sam:invoke:collect           # Invoke Collect function locally
npm run sam:invoke:collect:event     # Invoke Collect with scheduled event
npm run sam:invoke:post:english      # Invoke PostToTelegramEnglish function
npm run sam:invoke:post:arabic       # Invoke PostToTelegramArabic function
npm run sam:dev                      # Full dev workflow
```

## Project Structure

```
src/
├── lambda/                         # Lambda entry points (4-stage pipeline)
│   ├── Collect.ts                  # Stage 1: Collection handler
│   ├── Summarize.ts                # Stage 2: Summarization handler
│   ├── Deduplicate.ts              # Stage 3: Deduplication handler
│   └── PostToTelegram.ts           # Stage 4: Posting handler (English/Arabic)
├── local/
│   └── index.ts                    # Local development entry point (full pipeline)
├── news-collection/
│   ├── collect.ts                  # Main collection logic
│   ├── extractSANAArticleContent.ts # Content extraction from articles
│   ├── browser.ts                  # Axios + JSDOM web scraping
│   ├── processSANATelegramPost.ts  # Individual post processing
│   └── telegram/
│       └── getPostsInLast24Hours.ts # Multi-channel Telegram API integration
├── ai/
│   ├── summarize.ts                # Batch AI summarization (parallel processing)
│   ├── deduplicate.ts              # AI-powered deduplication and merging
│   ├── getLLMProvider.ts           # AI provider abstraction (OpenAI/Anthropic)
│   └── customTerms.ts              # Custom terminology handling
├── banner/
│   ├── newsBanner.ts               # SVG-based banner generation with date overlay
│   ├── composeBanners.ts           # Banner composition utility
│   └── bannersDemo.ts              # Banner generation demo and testing
├── formatting/
│   ├── index.ts                    # Formatting system entry point
│   ├── telegramNewsFormatter.ts    # Telegram message formatting
│   ├── measureTelegramRenderedHtml.ts # HTML rendering measurement
│   └── strings.ts                  # String constants and templates
├── telegram/
│   ├── bot.ts                      # Grammy-based Telegram bot
│   └── user.ts                     # Telegram user client for channel posting
├── telegram-dev/
│   ├── registerTelegramWebhook.ts  # Webhook registration utility
│   └── server.ts                   # Development server
├── utils/
│   └── dateUtils.ts                # Damascus timezone utilities
├── prioritizeNews.ts               # News prioritization logic with label weighting
├── prioritizeAndFormat.ts          # Combined prioritization and formatting
├── mostFrequentLabel.ts            # News category detection for banners
└── types.ts                        # TypeScript type definitions and Zod schemas

assets/
├── fonts/                          # Arabic fonts for banner generation
├── label-bgs/                      # Category-specific background images (19 types)
├── logo-arabic.png                 # Arabic logo
├── logo-english.png                # English logo
└── telegram-logo.png               # Telegram branding

composedBanners/                    # Pre-composed banners (uploaded to S3)
├── english/                        # Pre-composed English banners
└── arabic/                         # Pre-composed Arabic banners

channels.json                       # Channel configuration (30+ sources)
template.yml                        # AWS SAM template (4 Lambda functions)
esbuild.config.ts                   # Build configuration for Lambda bundling
vitest.config.ts                    # Test configuration
events/                             # SAM local event files
├── s3-event.json                   # S3 event for testing Lambda functions
└── schedule-event.json             # Scheduled event for testing collection
deploy.sh                           # Deployment script
updateComposedBanners.sh            # Banner update utility
```

## How It Works

### 4-Stage Pipeline Flow (Production)

**Stage 1: CollectFunction** (Scheduled at 21:10 UTC daily)
1. **Collection**: Uses Telegram API to fetch posts from 30+ configured channels in the last 24 hours (Damascus time)
2. **Processing**: Extracts article content from linked URLs using axios and JSDOM
3. **Storage**: Uploads raw collected posts to S3 at `collected-news/{date}.json`

**Stage 2: SummarizeFunction** (Triggered by S3 ObjectCreated event)
4. **Retrieval**: Downloads raw collected posts from S3
5. **Batch Processing**: Splits posts into batches of 20 items each
6. **Parallel Summarization**: Processes up to 30 batches in parallel using AI
7. **Translation**: Creates English summaries and translations from Arabic content
8. **Storage**: Uploads summarized data to S3 at `summarized-news/{date}.json`

**Stage 3: DeduplicateFunction** (Triggered by S3 ObjectCreated event)
9. **Retrieval**: Downloads summarized news from S3
10. **Initial Prioritization**: Filters and prioritizes top 100 items based on importance scores
11. **AI Deduplication**: Merges duplicate stories while preserving all sources and labels
12. **Storage**: Uploads deduplicated data to S3 at `deduplicated-news/{date}.json`

**Stage 4: PostToTelegramFunction** (Both English and Arabic triggered by S3 ObjectCreated event)
13. **Retrieval**: Downloads deduplicated news from S3
14. **Final Prioritization**: Analyzes and prioritizes news items using weighted label system
15. **Formatting**: Formats news items into structured Telegram messages (language-specific with HTML formatting)
16. **Banner Selection**: Determines most frequent news category and fetches pre-composed banner from S3
17. **Date Overlay**: Adds date overlay to banner image
18. **Publishing**: Posts banner image with formatted summary to respective target Telegram channels via TelegramUser client

### Local Development Flow

- Executes all 4 stages sequentially in a single run via `src/local/index.ts`
- Tests both English and Arabic output
- Uses local caching to avoid re-fetching and re-processing during development

## License

MIT
