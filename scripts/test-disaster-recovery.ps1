param([switch]$Execute)
$ErrorActionPreference = 'Stop'
if (-not $Execute) { throw 'Este teste apaga o Redis local. Execute conscientemente: ./scripts/test-disaster-recovery.ps1 -Execute' }

function Read-DotEnv([string]$Name, [string]$Fallback) {
  $line = Get-Content .env | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if (-not $line) { return $Fallback }
  return ($line -split '=', 2)[1].Trim()
}
$dbUser = Read-DotEnv 'POSTGRES_USER' 'prospector'
$dbName = Read-DotEnv 'POSTGRES_DB' 'prospector'
function Invoke-Db([string]$Sql) {
  $result = & docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -tAc $Sql
  if ($LASTEXITCODE -ne 0) { throw "Falha SQL no teste de recuperação" }
  return ($result | Out-String).Trim()
}

$runId = "recovery-drill-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$created = $false
$redisFlushed = $false
try {
  docker compose stop worker scheduler | Out-Host
  $runnable = [int](Invoke-Db 'SELECT (SELECT count(*) FROM "ProspectingRun" WHERE status IN (''PENDING'',''QUEUED'',''RUNNING'',''RECOVERING'')) + (SELECT count(*) FROM "WebsiteAnalysis" WHERE status IN (''WAITING'',''ACTIVE'',''RECOVERING'')) + (SELECT count(*) FROM "Campaign" WHERE status IN (''SCHEDULED'',''RUNNING'')) + (SELECT count(*) FROM "InsightBatch" WHERE status IN (''WAITING'',''ACTIVE'',''RECOVERING''));')
  if ($runnable -ne 0) { throw "Teste abortado: existem $runnable jobs executáveis. Aguarde as filas esvaziarem." }

  $insert = @"
INSERT INTO "ProspectingRun" ("id","country","state","city","category","status","idempotencyKey","currentStage","createdAt","updatedAt")
VALUES ('$runId','Brasil','DR','Recovery Drill','Teste','QUEUED','drill:$runId','QUEUED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "JobRecord" ("id","queue","name","bullJobId","idempotencyKey","state","runId","payload","createdAt","updatedAt")
VALUES ('job-$runId','prospecting','prospect-run','prospecting-$runId','prospecting:$runId','WAITING','$runId','{"runId":"$runId"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
"@
  Invoke-Db $insert | Out-Null
  $created = $true
  docker compose exec -T redis redis-cli FLUSHDB | Out-Host
  $redisFlushed = $true
  docker compose start scheduler | Out-Host

  $found = $false
  for ($attempt = 0; $attempt -lt 12; $attempt++) {
    Start-Sleep -Seconds 5
    $keys = & docker compose exec -T redis redis-cli --scan --pattern "*$runId*"
    if (($keys | Out-String).Trim()) { $found = $true; break }
  }
  if (-not $found) { throw 'O scheduler não reconstruiu o job a partir do PostgreSQL em 60 segundos.' }
  $durable = [int](Invoke-Db ('SELECT count(*) FROM "JobRecord" WHERE "runId"=' + "'$runId';"))
  if ($durable -ne 1) { throw "Idempotência inválida: esperava 1 JobRecord e encontrou $durable." }
  Write-Host 'SUCESSO: perda total do Redis recuperada pelo scheduler, com um único registro durável.' -ForegroundColor Green
}
finally {
  docker compose stop scheduler | Out-Host
  if ($created) { Invoke-Db ('DELETE FROM "JobRecord" WHERE "runId"=' + "'$runId'; " + 'DELETE FROM "ProspectingRun" WHERE id=' + "'$runId';") | Out-Null }
  if ($redisFlushed) { docker compose exec -T redis redis-cli FLUSHDB | Out-Host }
  docker compose start scheduler | Out-Host
  Start-Sleep -Seconds 35
  docker compose start worker | Out-Host
}
