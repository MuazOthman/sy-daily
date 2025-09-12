#!/bin/bash

set -e

# make sure commands run in sequence
set -o pipefail

# Compose banners
npm run banners:compose

# read stack name from samconfig.toml
STACK_NAME=$(grep 'stack_name = ' samconfig.toml | cut -d '"' -f 2)

# fetch the S3 bucket name from the stack
S3_BUCKET_NAME=$(aws cloudformation describe-stack-resources --stack-name $STACK_NAME --query "StackResources[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" --output text)

# upload the composed banners to the S3 bucket
aws s3 cp composedBanners s3://$S3_BUCKET_NAME/composedBanners --recursive
