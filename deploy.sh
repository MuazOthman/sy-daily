#!/bin/bash

# Load environment variables from .env file
source .env

# Deploy using SAM with the environment variables
sam deploy --no-fail-on-empty-changeset \
  --parameter-overrides \
  "ParameterKey=TelegramBotToken,ParameterValue=${TELEGRAM_BOT_TOKEN}" \
  "ParameterKey=TelegramApiId,ParameterValue=${TELEGRAM_API_ID}" \
  "ParameterKey=TelegramApiHash,ParameterValue=${TELEGRAM_API_HASH}" \
  "ParameterKey=SessionString,ParameterValue=${SESSION_STRING}" \
  "ParameterKey=OpenaiApiKey,ParameterValue=${OPENAI_API_KEY}" \
  "ParameterKey=TelegramChannelIdEnglish,ParameterValue=${TELEGRAM_CHANNEL_ID_ENGLISH}" \
  "ParameterKey=TelegramChannelIdArabic,ParameterValue=${TELEGRAM_CHANNEL_ID_ARABIC}"
