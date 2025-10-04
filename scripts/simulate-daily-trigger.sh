#!/bin/bash

set -e

# make sure commands run in sequence
set -o pipefail

# read stack name from samconfig.toml
STACK_NAME=$(grep 'stack_name = ' samconfig.toml | cut -d '"' -f 2)

echo "Stack name: $STACK_NAME"

echo "Fetching CollectFunction name..."

# fetch the name of CollectFunction from the stack
COLLECT_FUNCTION_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --query "StackResources[?LogicalResourceId=='CollectFunction'].PhysicalResourceId" \
  --output text)

echo "CollectFunction name: $COLLECT_FUNCTION_NAME"

echo "Invoking $COLLECT_FUNCTION_NAME asynchronously..."

# invoke the CollectFunction asynchronously and capture response
INVOCATION_RESPONSE=$(aws lambda invoke \
  --function-name "$COLLECT_FUNCTION_NAME" \
  --payload '{}' \
  --invocation-type Event \
  --cli-binary-format raw-in-base64-out \
  /dev/stdout 2>&1 | grep -v '^{' || true)

echo ""
echo "Response: $INVOCATION_RESPONSE"
echo ""

echo "✅ CollectFunction invoked successfully"
