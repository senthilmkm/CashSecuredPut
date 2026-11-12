# GCP Cloud Function deployment script for CashSecuredPut Proxy
Write-Host "Setting active project to publictrading-platform-0626..." -ForegroundColor Cyan
gcloud config set project publictrading-platform-0626

Write-Host "Deploying cashsecuredput-proxy Cloud Function..." -ForegroundColor Cyan
gcloud functions deploy cashsecuredput-proxy `
  --gen2 `
  --runtime=nodejs22 `
  --region=us-central1 `
  --source=. `
  --entry-point=handler `
  --trigger-http `
  --allow-unauthenticated `
  --set-secrets="PUBLIC_API_SECRET=publictrading-public-api-secret:latest,PROXY_ACCESS_SECRET=cashsecuredput-proxy-access-secret:latest,DEVICECHECK_AUTH_KEY=devicecheck-auth-key:latest" `
  --update-env-vars="DEVICECHECK_KEY_ID=V46VRDYTLY,DEVICECHECK_TEAM_ID=2KJK6895B3"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Deployment failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Deployment completed!" -ForegroundColor Green
