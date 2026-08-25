#!/usr/bin/env bash
# Tail application logs without SSH.
#   ./deploy/aws/logs.sh          # last 100 lines from the app container
#   ./deploy/aws/logs.sh caddy    # or the web/TLS layer
set -euo pipefail

STACK="${FIT_STACK:-fit-prod}"
REGION="${AWS_REGION:-us-east-1}"
SERVICE="${1:-app}"
LINES="${2:-100}"

INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)

CMD_ID=$(aws ssm send-command --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=['docker compose -f /opt/fit/deploy/aws/docker-compose.yml logs --tail $LINES $SERVICE']" \
  --query "Command.CommandId" --output text)

sleep 6
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --region "$REGION" --query StandardOutputContent --output text
