#!/usr/bin/env bash
# One-time (repeatable) data migration: Fly.io volume  →  AWS EBS volume.
#
# Copies the SQLite database (all users, projects, render metadata) and every
# generated image. Safe to re-run — it always takes a fresh snapshot from Fly
# and replaces what's on AWS.
#
#   ./deploy/aws/migrate-from-fly.sh
#
# Requires: fly cli (authenticated), aws cli (FIT-Deployer or admin).
#
# IMPORTANT: run this during a quiet moment. Anything users create on Fly AFTER
# the snapshot is taken will not be on AWS unless you re-run it.
set -euo pipefail

STACK="${FIT_STACK:-fit-prod}"
REGION="${AWS_REGION:-us-east-1}"
FLY_APP="${FLY_APP:-federal-infographic-toolkit}"
WORK_DIR=$(mktemp -d)
TARBALL="fit-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"

blue()  { printf '\033[34m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

trap 'rm -rf "$WORK_DIR"' EXIT

blue "→ [1/5] Snapshotting /data on Fly (SQLite checkpointed for a clean copy)..."
# Checkpoint the WAL first so app.db is self-contained, then tar the volume.
fly ssh console --app "$FLY_APP" -C "/bin/sh -c \"
  cd /data &&
  (command -v sqlite3 >/dev/null && sqlite3 app.db 'PRAGMA wal_checkpoint(TRUNCATE);' || true) &&
  tar czf /tmp/$TARBALL app.db uploads 2>/dev/null || tar czf /tmp/$TARBALL app.db app.db-wal app.db-shm uploads
\""

blue "→ [2/5] Downloading snapshot..."
fly ssh sftp get "/tmp/$TARBALL" "$WORK_DIR/$TARBALL" --app "$FLY_APP"
fly ssh console --app "$FLY_APP" -C "rm -f /tmp/$TARBALL" || true
ls -lh "$WORK_DIR/$TARBALL"

blue "→ [3/5] Staging to S3..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="fit-migration-${ACCOUNT_ID}"
aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null || {
  aws s3 mb "s3://$BUCKET" --region "$REGION"
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
}
aws s3 cp "$WORK_DIR/$TARBALL" "s3://$BUCKET/$TARBALL" --region "$REGION"

blue "→ [4/5] Restoring onto the EC2 data volume..."
INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)

CMD_ID=$(aws ssm send-command --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --document-name "AWS-RunShellScript" --timeout-seconds 900 \
  --parameters "commands=[
    'set -euxo pipefail',
    'cd /opt/fit && docker compose -f deploy/aws/docker-compose.yml stop app || true',
    'if [ -f /data/app.db ]; then cp -a /data/app.db /data/app.db.pre-migration-\$(date -u +%Y%m%dT%H%M%SZ); fi',
    'aws s3 cp s3://$BUCKET/$TARBALL /tmp/$TARBALL --region $REGION',
    'rm -f /data/app.db-wal /data/app.db-shm',
    'tar xzf /tmp/$TARBALL -C /data',
    'rm -f /tmp/$TARBALL',
    'chown -R root:root /data',
    'cd /opt/fit && docker compose -f deploy/aws/docker-compose.yml up -d app',
    'sleep 8',
    'ls -la /data | head -20'
  ]" --query "Command.CommandId" --output text)

for i in $(seq 1 60); do
  sleep 8
  STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --region "$REGION" --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in
    Success) green "✓ Restore complete."; break ;;
    Failed|TimedOut|Cancelled)
      aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
        --region "$REGION" --query StandardErrorContent --output text | tail -30
      exit 1 ;;
    *) printf '.' ;;
  esac
done

blue "→ [5/5] Verifying..."
APP_URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text)
sleep 5
curl -fsS -m 15 "$APP_URL/api/health" && echo ""
green "✓ Migration done. Sign in at $APP_URL with your existing credentials."
echo "  (The S3 staging copy is kept at s3://$BUCKET/$TARBALL as a backup.)"
