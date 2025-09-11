# Syrian Daily News Bot

A Telegram bot that automatically collects Syrian news from 30+ Telegram channels (government and official sources) and posts daily summaries with generated banner images in both English and Arabic.

## Features

- Collects posts from 30+ configurable Telegram channels (configured via `channels.json`)
- Processes Arabic content and creates English summaries using OpenAI
- Generates custom banner images based on most frequent news categories
- Posts formatted daily summaries with banners to multiple target Telegram channels (English and Arabic)
- Uses split Lambda architecture with EventBridge integration for better reliability and scalability
- Supports both AWS Lambda deployment and local development with caching
- Handles Damascus timezone for accurate 24-hour news collection
- Uses axios and JSDOM for lightweight web scraping
- ARM64 optimized Lambda functions with font rendering support

## Architecture

### AWS Lambda (Production) - Split Architecture

- **CollectAndSummarizeFunction**: Collects and processes news, uploads to S3
  - Scheduled execution at 21:10 UTC daily
  - Entry point: `src/lambda/CollectAndSummarize.ts`
  - Timeout: 10 minutes for web scraping and AI processing
  - Memory: 1GB
- **PostToTelegramEnglishFunction & PostToTelegramArabicFunction**: Post formatted news with banners to Telegram
  - Triggered by EventBridge events from S3 ObjectCreated
  - Entry point: `src/lambda/PostToTelegram.ts`
  - Architecture: ARM64 with font rendering layers
  - Timeout: 1 minute for posting
  - Memory: 512MB
- **S3 Bucket**: Intermediary storage for news data between functions

### Local Development

- Direct execution for testing both English and Arabic channels
- Entry point: `src/local/index.ts`
- Uses dotenv for environment variables
- Local caching system via `cache/cachedData.json` to avoid re-fetching during development

## Setup

### Prerequisites

- Node.js 22.x
- AWS CLI (for deployment)
- SAM CLI (for AWS deployment)

### Environment Variables

Create a `.env` file with:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
SESSION_STRING=your_session_string
OPENAI_API_KEY=your_openai_key
TELEGRAM_CHANNEL_ID_ENGLISH=your_channel_id_for_local_testing
TELEGRAM_CHANNEL_ID_ARABIC=your_channel_id_for_local_testing
```

### Installation

```bash
npm install
```

## Development

### Local Testing

```bash
npm start
# or directly:
ts-node src/local/index.ts
```

### Development Server

```bash
npm run telegram:serve     # Start Telegram development server
```

### Testing

```bash
npm test          # Run tests with Vitest
npm run test:ui   # Run tests with UI
npm run test:run  # Run tests once
```

### Build

```bash
npm run build
```

## Deployment

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
npm run sam:invoke:collect           # Invoke CollectAndSummarize function locally
npm run sam:invoke:collect:event     # Invoke with scheduled event
npm run sam:invoke:post:english      # Invoke PostToTelegramEnglish function
npm run sam:invoke:post:arabic       # Invoke PostToTelegramArabic function
npm run sam:dev                      # Full dev workflow
```

## Project Structure

```
src/
├── lambda/
│   ├── CollectAndSummarize.ts      # AWS Lambda handler for news collection
│   └── PostToTelegram.ts           # AWS Lambda handler for posting to Telegram
├── local/
│   └── index.ts                    # Local development entry point
├── news-collection/
│   ├── collectAndSummarize.ts      # Main collection and summarization logic
│   ├── extractSANAArticleContent.ts # Content extraction from articles
│   ├── browser.ts                  # Axios + JSDOM web scraping
│   ├── processSANATelegramPost.ts  # Individual post processing
│   └── telegram/
│       └── getPostsInLast24Hours.ts # Multi-channel Telegram API integration
├── ai/
│   ├── summarizeAndTranslate.ts    # OpenAI-powered summarization and translation
│   └── customTerms.ts              # Custom terminology handling
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
├── newsBanner.ts                   # Banner image generation system
├── mostFrequentLabel.ts            # News category detection for banners
└── types.ts                        # TypeScript type definitions

channels.json               # Channel configuration
template.yml               # AWS SAM template
vitest.config.ts           # Test configuration
events/                     # SAM local event files
└── s3-event.json          # S3 event for testing Lambda functions
```

## How It Works

### Split Architecture Flow (Production)

**CollectAndSummarizeFunction**:

1. **Collection**: Uses Telegram API to fetch posts from multiple configured channels in the last 24 hours (Damascus time)
2. **Processing**: Extracts article content from linked URLs using axios and JSDOM
3. **Summarization**: Uses OpenAI to create English summaries and translations from Arabic content
4. **Storage**: Uploads processed news data to S3 bucket with date-based key

**PostToTelegramFunction** (both English and Arabic versions triggered by EventBridge event from S3): 5. **Retrieval**: Downloads processed news data from S3 6. **Prioritization**: Analyzes and prioritizes news items based on importance and relevance 7. **Formatting**: Formats news items into structured Telegram messages (language-specific) 8. **Banner Generation**: Creates custom banner image based on most frequent news category 9. **Publishing**: Posts banner image with formatted summary to respective target Telegram channels via TelegramUser client

### Local Development Flow

- All steps are combined in a single execution via `src/local/index.ts` for testing and development

## License

MIT
