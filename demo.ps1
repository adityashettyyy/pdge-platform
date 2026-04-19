param([string]$IncidentId = "")

$BASE = "http://localhost:3001/api"

Write-Host ""
Write-Host "=== PDGE DEMO SCRIPT ===" -ForegroundColor Cyan

Write-Host ""
Write-Host "[1/3] Authenticating..." -ForegroundColor Yellow

try {
  $body = '{"email":"admin@pdge.local","password":"admin123"}'
  $auth = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -ContentType "application/json" -Body $body
  $TOKEN = $auth.token
  if (-not $TOKEN) {
    Write-Host "LOGIN FAILED - no token received" -ForegroundColor Red
    exit 1
  }
  Write-Host "  Logged in as: $($auth.user.name) ($($auth.user.role))" -ForegroundColor Green
} catch {
  Write-Host "BACKEND NOT REACHABLE. Start backend first." -ForegroundColor Red
  exit 1
}

if ($IncidentId -eq "") {

  Write-Host ""
  Write-Host "[2/3] Submitting disaster report (FLOOD at Zone Beta)..." -ForegroundColor Yellow

  try {
    $reportBody = '{"type":"FLOOD","latitude":19.072,"longitude":72.880,"originNodeId":"node-zone-beta","gpsValid":true,"description":"Major flooding at Zone Beta. Water levels rising rapidly."}'
    $report = Invoke-RestMethod -Uri "$BASE/incidents/report" -Method POST -ContentType "application/json" -Headers @{Authorization="Bearer $TOKEN"} -Body $reportBody
    $IncidentId = $report.incidentId
    Write-Host "  Incident ID: $IncidentId" -ForegroundColor Green
    Write-Host "  Initial trust score: $($report.trustScore)" -ForegroundColor Green
    Write-Host "  Watch trust worker terminal..." -ForegroundColor Gray
  } catch {
    Write-Host "Failed to create incident: $_" -ForegroundColor Red
    exit 1
  }

  Start-Sleep 2

  Write-Host "  Adding corroborating report 2..." -ForegroundColor Yellow
  try {
    $r2body = '{"gpsValid":true,"latitude":19.073,"longitude":72.881}'
    Invoke-RestMethod -Uri "$BASE/incidents/$IncidentId/report" -Method POST -ContentType "application/json" -Headers @{Authorization="Bearer $TOKEN"} -Body $r2body | Out-Null
  } catch {
    Write-Host "  Report 2 failed: $_" -ForegroundColor Red
  }

  Start-Sleep 2

  Write-Host "  Adding corroborating report 3 (TRIGGERS SIMULATION)..." -ForegroundColor Yellow
  try {
    $r3body = '{"gpsValid":true,"latitude":19.071,"longitude":72.879}'
    Invoke-RestMethod -Uri "$BASE/incidents/$IncidentId/report" -Method POST -ContentType "application/json" -Headers @{Authorization="Bearer $TOKEN"} -Body $r3body | Out-Null
  } catch {
    Write-Host "  Report 3 failed: $_" -ForegroundColor Red
  }

} else {

  Write-Host ""
  Write-Host "[2/3] Pushing trust score over threshold for existing incident..." -ForegroundColor Yellow
  try {
    $pushBody = '{"gpsValid":true,"latitude":19.072,"longitude":72.880}'
    Invoke-RestMethod -Uri "$BASE/incidents/$IncidentId/report" -Method POST -ContentType "application/json" -Headers @{Authorization="Bearer $TOKEN"} -Body $pushBody | Out-Null
    Write-Host "  Report added - score should now exceed 70" -ForegroundColor Green
  } catch {
    Write-Host "  Failed to add report: $_" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "[3/3] Waiting for simulation to complete..." -ForegroundColor Yellow
Write-Host "  Trust worker:  score + VERIFIED" -ForegroundColor Gray
Write-Host "  Sim worker:    BFS running + allocation tier" -ForegroundColor Gray
Write-Host "  Python:        /simulate + /allocate 200 OK" -ForegroundColor Gray

Start-Sleep 8

Write-Host ""
Write-Host "Checking allocation plan..." -ForegroundColor Yellow

try {
  $plans = Invoke-RestMethod -Uri "$BASE/allocation-plans" -Method GET -Headers @{Authorization="Bearer $TOKEN"}
  if ($plans -and $plans.Count -gt 0) {
    $plan = $plans[0]
    Write-Host ""
    Write-Host "PLAN CREATED:" -ForegroundColor Green
    Write-Host "  Strategy:  $($plan.strategyUsed)" -ForegroundColor Cyan
    Write-Host "  Resources: $($plan.totalResources)" -ForegroundColor Cyan
    Write-Host "  Confidence: $([math]::Round($plan.confidence * 100, 0))%" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Go to AI Commander in browser to approve the plan." -ForegroundColor Yellow
  } else {
    Write-Host "Plan not ready yet - check browser in a few seconds" -ForegroundColor Yellow
  }
} catch {
  Write-Host "Could not fetch plans: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== DEMO COMPLETE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. AI Commander - Generate sitrep - Approve plan" -ForegroundColor Gray
Write-Host "  2. Live Map - high-risk nodes are now red" -ForegroundColor Gray
Write-Host "  3. Resources - deployed count increased" -ForegroundColor Gray
Write-Host "  4. Analytics - response time delta shown" -ForegroundColor Gray