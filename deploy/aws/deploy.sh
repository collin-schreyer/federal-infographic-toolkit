#!/usr/bin/env bash
# Deploy the current `main` to AWS. This is THE deploy command.
#
#   ./deploy/aws/deploy.sh
#
# What it does: tells the EC2 instance (over SSM — no SSH keys needed) to pull
# the latest main, refresh secrets from Parameter Store, rebuild the container,
# and restart. Then it waits and health-checks the live site.
#
# Requires: aws cli, and AWS credentials with the FIT-Deployer policy.
set -euo pipefail

STACK="${FIT_STACK:-fit-prod}"
REGION="${AWS_REGION:-us-east-1}"

blue()  { printf '\033[34m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }

blue "→ Locating instance for stack '$STACK' in $REGION..."
INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)
APP_URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  red "Could not find an instance for stack '$STACK'. Is the stack deployed?"
  exit 1
fi
blue "  instance: $INSTANCE_ID"

blue "→ Sending deploy command (pull → rebuild → restart)..."
CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --region "$REGION" \
  --document-name "AWS-RunShellScript" \
  --comment "FIT deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --timeout-seconds 900 \
  --parameters 'commands=[
    "set -euxo pipefail",
    "cd /opt/fit",
    "git fetch origin main",
    "git reset --hard origin/main",
    "chmod +x deploy/aws/*.sh",
    "./deploy/aws/render-env.sh '"$REGION"'",
    "docker compose -f deploy/aws/docker-compose.yml up -d --build",
    "docker image prune -f",
    "docker compose -f deploy/aws/docker-compose.yml ps"
  ]' \
  --query "Command.CommandId" --output text)

blue "  command: $CMD_ID — building on the host, this takes 2-4 minutes..."

# Poll until the command finishes.
for i in $(seq 1 90); do
  sleep 10
  STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --region "$REGION" --query Status --output text 2>/dev/null || echo "Pending")
  case "$STATUS" in
    Success) green "✓ Build and restart succeeded."; break ;;
    Failed|Cancelled|TimedOut)
      red "✗ Deploy $STATUS. Last 40 lines of output:"
      aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
        --region "$REGION" --query StandardErrorContent --output text | tail -40
      exit 1 ;;
    *) printf '.' ;;
  esac
done

blue "→ Health check: $APP_URL/api/health"
for i in $(seq 1 12); do
  sleep 5
  if curl -fsS -m 10 "$APP_URL/api/health" >/dev/null 2>&1; then
    green "✓ Live and healthy: $APP_URL"
    exit 0
  fi
  printf '.'
done

red "Deploy finished but the health check did not pass. Check logs with:"
echo "  ./deploy/aws/logs.sh"
exit 1
