# Syrian Daily News Bot

A Telegram bot that automatically collects Syrian news from SANA (Syrian Arab News Agency) and posts daily summaries in English.

## Features

- Scrapes recent posts from SANA Telegram channel
- Processes Arabic content and creates English summaries using OpenAI
- Posts formatted daily summaries to a target Telegram channel
- Supports both AWS Lambda deployment and local development
- Handles Damascus timezone for accurate 24-hour news collection

## Architecture

### AWS Lambda (Production)
- Scheduled execution at 21:10 UTC daily
- Uses Chromium layer for web scraping
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
npm run dev
# or directly:
ts-node src/local.ts
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

## Project Structure

```
src/
├── lambda.ts          # AWS Lambda handler
├── local.ts           # Local development entry point
├── bot.ts             # Telegram bot configuration
├── browser.ts         # Web scraping with Puppeteer
├── dateUtils.ts       # Damascus timezone utilities
└── constants.ts       # Configuration constants

template.yml           # AWS SAM template
```

## How It Works

1. **Collection**: Fetches posts from SANA Telegram channel from the last 24 hours (Damascus time)
2. **Processing**: Extracts content from each post using web scraping
3. **Summarization**: Uses OpenAI to create English summaries from Arabic content
4. **Publishing**: Posts formatted summary to target Telegram channel

## License

MIT