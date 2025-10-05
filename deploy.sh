#!/bin/bash

set -e

# make sure commands run in sequence
set -o pipefail

# Load environment variables from .env file
source .env

yarn build

sam build

# Install sharp with Linux binaries using Docker in isolated container
docker run --rm -v "$(pwd)":/host -w /tmp node:22-slim sh -c '
  export DEBIAN_FRONTEND=noninteractive &&
  npm init -y && 
  npm install --include=optional sharp@0.34.3 && 
  cp -r node_modules /host/.aws-sam/build/PostToTelegramArabicFunction/ &&
  cp -r node_modules /host/.aws-sam/build/PostToTelegramEnglishFunction/ &&
  cp -r node_modules /host/.aws-sam/build/PublishToWebsiteFunction/
'

# Copy sharp binaries to Lambda function builds
# cp -r .node_modules .aws-sam/build/PostToTelegramArabicFunction/
# cp -r .node_modules .aws-sam/build/PostToTelegramEnglishFunction/

# Clean up temporary directory
rm -rf "$TEMP_DIR"

# Deploy using SAM with the environment variables
sam deploy --no-fail-on-empty-changeset \
  --parameter-overrides \
  "ParameterKey=TelegramBotToken,ParameterValue=${TELEGRAM_BOT_TOKEN}" \
  "ParameterKey=TelegramApiId,ParameterValue=${TELEGRAM_API_ID}" \
  "ParameterKey=TelegramApiHash,ParameterValue=${TELEGRAM_API_HASH}" \
  "ParameterKey=SessionString,ParameterValue=${SESSION_STRING}" \
  "ParameterKey=OpenaiApiKey,ParameterValue=${OPENAI_API_KEY}" \
  "ParameterKey=TelegramChannelIdEnglish,ParameterValue=${TELEGRAM_CHANNEL_ID_ENGLISH}" \
  "ParameterKey=TelegramChannelIdArabic,ParameterValue=${TELEGRAM_CHANNEL_ID_ARABIC}" \
  "ParameterKey=GithubToken,ParameterValue=${GITHUB_TOKEN}" \
  "ParameterKey=SimulateWebsitePublish,ParameterValue=${SIMULATE_WEBSITE_PUBLISH}" \
  "ParameterKey=AlertEmail,ParameterValue=${ALERT_EMAIL}"
