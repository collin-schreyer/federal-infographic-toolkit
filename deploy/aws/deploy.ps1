#!/usr/bin/env pwsh
# Deploy the current `main` to AWS. Windows/PowerShell equivalent of deploy.sh.
#
#   .\deploy\aws\deploy.ps1
#
# Tells the EC2 instance (over SSM - no SSH keys needed) to pull the latest
# main, refresh secrets from Parameter Store, rebuild the container, and
# restart. Then waits and health-checks the live site.
#
# Requires: AWS CLI v2 and credentials with the FIT-Deployer policy.

$ErrorActionPreference = 'Stop'

$Stack  = if ($env:FIT_STACK)  { $env:FIT_STACK }  else { 'fit-prod' }
$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }

function Write-Step { param($m) Write-Host "-> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "OK $m"  -ForegroundColor Green }
function Write-Bad  { param($m) Write-Host "!! $m"  -ForegroundColor Red }

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Bad "AWS CLI not found. Install it: https://aws.amazon.com/cli/"
  exit 1
}

Write-Step "Locating instance for stack '$Stack' in $Region..."
$InstanceId = aws cloudformation describe-stacks --stack-name $Stack --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text
$AppUrl = aws cloudformation describe-stacks --stack-name $Stack --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text

if (-not $InstanceId -or $InstanceId -eq 'None') {
  Write-Bad "Could not find an instance for stack '$Stack'. Is the stack deployed?"
  exit 1
}
Write-Host "   instance: $InstanceId"

# Build the SSM parameters as a temp JSON file. Passing them inline invites
# quoting problems on Windows; a file sidesteps that entirely.
$commands = @(
  'set -euxo pipefail',
  'cd /opt/fit',
  'git fetch origin main',
  'git reset --hard origin/main',
  'chmod +x deploy/aws/*.sh',
  "./deploy/aws/render-env.sh $Region",
  'docker compose -f deploy/aws/docker-compose.yml up -d --build',
  'docker image prune -f',
  'docker compose -f deploy/aws/docker-compose.yml ps'
)
$paramFile = Join-Path ([System.IO.Path]::GetTempPath()) "fit-deploy-params-$PID.json"
@{ commands = $commands } | ConvertTo-Json -Depth 4 | Set-Content -Path $paramFile -Encoding utf8

try {
  Write-Step "Sending deploy command (pull -> rebuild -> restart)..."
  $CmdId = aws ssm send-command `
    --instance-ids $InstanceId `
    --region $Region `
    --document-name "AWS-RunShellScript" `
    --comment "FIT deploy $(Get-Date -Format o)" `
    --timeout-seconds 900 `
    --parameters "file://$paramFile" `
    --query "Command.CommandId" --output text

  Write-Host "   command: $CmdId - building on the host, this takes 2-4 minutes..."

  $status = 'Pending'
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 10
    try {
      $status = aws ssm get-command-invocation --command-id $CmdId --instance-id $InstanceId `
        --region $Region --query Status --output text 2>$null
    } catch { $status = 'Pending' }

    if ($status -eq 'Success') { Write-Ok "Build and restart succeeded."; break }
    if ($status -in @('Failed','Cancelled','TimedOut')) {
      Write-Bad "Deploy $status. Error output:"
      aws ssm get-command-invocation --command-id $CmdId --instance-id $InstanceId `
        --region $Region --query StandardErrorContent --output text
      exit 1
    }
    Write-Host "." -NoNewline
  }
} finally {
  Remove-Item $paramFile -ErrorAction SilentlyContinue
}

Write-Step "Health check: $AppUrl/api/health"
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest -Uri "$AppUrl/api/health" -TimeoutSec 10 -UseBasicParsing
    if ($r.StatusCode -eq 200) { Write-Ok "Live and healthy: $AppUrl"; exit 0 }
  } catch { Write-Host "." -NoNewline }
}

Write-Bad "Deploy finished but the health check did not pass. Check logs with:"
Write-Host "  .\deploy\aws\logs.ps1"
exit 1
