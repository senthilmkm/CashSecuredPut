# GCP Cloud Function deployment script for CashSecuredPut Proxy
Write-Host "Setting active project to publictrading-platform-0626..." -ForegroundColor Cyan
gcloud config set project publictrading-platform-0626

Write-Host "Deploying cashsecuredput-proxy Cloud Function..." -ForegroundColor Cyan
gcloud functions deploy cashsecuredput-proxy `
  --gen2 `
  --runtime=nodejs20 `
  --region=us-central1 `
  --source=. `
  --entry-point=handler `
  --trigger-http `
  --allow-unauthenticated `
  --set-secrets="PUBLIC_API_SECRET=publictrading-public-api-secret:latest"

Write-Host "Deployment completed!" -ForegroundColor Green
