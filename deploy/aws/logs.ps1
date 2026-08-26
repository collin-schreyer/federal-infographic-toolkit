#!/usr/bin/env pwsh
# Tail application logs without SSH. Windows/PowerShell equivalent of logs.sh.
#
#   .\deploy\aws\logs.ps1              # last 100 lines from the app container
#   .\deploy\aws\logs.ps1 caddy        # or the web/TLS layer
#   .\deploy\aws\logs.ps1 app 500      # more lines

param(
  [string]$Service = 'app',
  [int]$Lines = 100
)

$ErrorActionPreference = 'Stop'

$Stack  = if ($env:FIT_STACK)  { $env:FIT_STACK }  else { 'fit-prod' }
$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { 'us-east-1' }

$InstanceId = aws cloudformation describe-stacks --stack-name $Stack --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text

$paramFile = Join-Path ([System.IO.Path]::GetTempPath()) "fit-logs-params-$PID.json"
@{ commands = @("docker compose -f /opt/fit/deploy/aws/docker-compose.yml logs --tail $Lines $Service") } |
  ConvertTo-Json -Depth 4 | Set-Content -Path $paramFile -Encoding utf8

try {
  $CmdId = aws ssm send-command --instance-ids $InstanceId --region $Region `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$paramFile" `
    --query "Command.CommandId" --output text

  Start-Sleep -Seconds 6
  aws ssm get-command-invocation --command-id $CmdId --instance-id $InstanceId `
    --region $Region --query StandardOutputContent --output text
} finally {
  Remove-Item $paramFile -ErrorAction SilentlyContinue
}
