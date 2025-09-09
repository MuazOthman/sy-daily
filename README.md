# Syrian Daily News Bot

A Telegram bot that automatically collects Syrian news from multiple Telegram channels and posts daily summaries in English.

## Features

- Collects posts from multiple configurable Telegram channels (configured via `channels.json`)
- Processes Arabic content and creates English summaries using OpenAI
- Posts formatted daily summaries to a target Telegram channel
- Supports both AWS Lambda deployment and local development
- Handles Damascus timezone for accurate 24-hour news collection
- Uses axios and JSDOM for lightweight web scraping

## Architecture

### AWS Lambda (Production)
- Scheduled execution at 21:10 UTC daily
- Entry point: `src/lambda.ts`

### Local Development
- Direct execution for testing
- Entry point: `src/local.ts`
- Uses dotenv for environment variables

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
ts-node src/local.ts
```

### Development Server
```bash
npm run serve     # Start development server
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
npm run register-webhook
```

### SAM Local Development
```bash
npm run sam:build      # Build SAM application
npm run sam:local      # Start local Lambda environment
npm run sam:invoke     # Invoke Lambda function locally
npm run sam:dev        # Full dev workflow
```

## Project Structure

```
src/
├── lambda.ts                       # AWS Lambda handler
├── local.ts                        # Local development entry point
├── executeForLast24Hours.ts        # Main orchestrator function
├── getPostsInLast24Hours.ts        # Telegram API integration for post collection
├── processSANATelegramPost.ts      # Individual post processing
├── extractSANAArticleContent.ts    # Content extraction from articles
├── summarizeAndTranslate.ts        # OpenAI-powered summarization and translation
├── prioritizeNews.ts               # News prioritization logic
├── formatNewsItemsForTelegram.ts   # Telegram message formatting
├── bot.ts                          # Grammy-based Telegram bot
├── browser.ts                      # Axios + JSDOM web scraping
├── dateUtils.ts                    # Damascus timezone utilities
├── constants.ts                    # Configuration constants
├── strings.ts                      # String constants and templates
├── types.ts                        # TypeScript type definitions
└── dev/
    ├── registerTelegramWebhook.ts  # Webhook registration utility
    └── server.ts                   # Development server

channels.json               # Channel configuration
template.yml               # AWS SAM template
vitest.config.ts           # Test configuration
```

## How It Works

1. **Collection**: Uses Telegram API to fetch posts from multiple configured channels in the last 24 hours (Damascus time)
2. **Processing**: Extracts article content from linked URLs using axios and JSDOM
3. **Summarization**: Uses OpenAI to create English summaries and translations from Arabic content
4. **Prioritization**: Analyzes and prioritizes news items based on importance and relevance
5. **Formatting**: Formats news items into structured Telegram messages
6. **Publishing**: Posts formatted summary to target Telegram channel via Grammy bot framework

## License

MIT