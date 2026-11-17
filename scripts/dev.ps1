$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path .env)) {
  $config = Get-Content .env.example -Raw
  $config = $config.Replace('postgresql://user:pass@localhost:5432/content_ai', 'postgresql://auctorio:auctorio@127.0.0.1:55432/content_ai')  # IPv4: Windows tries ::1 first and Docker only forwards IPv4, costing ~2s per new DB connection
  $config = $config.Replace('redis://localhost:6379', 'redis://127.0.0.1:56379')
  $config = $config.Replace('PORT=3000', 'PORT=4301').Replace('http://localhost:3000', 'http://localhost:4301').Replace('http://127.0.0.1:3000', 'http://127.0.0.1:4301').Replace('HOST=0.0.0.0', 'HOST=127.0.0.1')
  $config = $config.Replace('TEXT_PROVIDER=deepseek', 'TEXT_PROVIDER=mock').Replace('IMAGE_PROVIDER=siliconflow', 'IMAGE_PROVIDER=mock')
  $config = $config.Replace('STORAGE_ROOT=/var/www/auctorio/storage', 'STORAGE_ROOT=./storage')
  Set-Content .env $config -Encoding utf8
  Write-Host 'Configuracion local creada en .env.'
}

if (-not (Test-Path node_modules/ts-node) -or -not (Test-Path apps/studio-web/node_modules/@angular/cli)) {
  throw 'Instala las dependencias: npm ci; npm ci --prefix apps/studio-web'
}

$studioPort = 4420
$apiPort = 4301

# Stale ts-node/ng serve processes keep old code, hold the API port and lock the Prisma engine.
# Kill them by port owner AND by command line (this repo's start-*.ts scripts and its ng serve), whole tree.
function Stop-StaleDev {
  $ids = @()
  foreach ($port in @($studioPort, $apiPort)) {
    $ids += Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
  }
  $ids += Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'scripts[\/]start-[a-z-]+\.ts' -or $_.CommandLine -match 'ng\.js serve .*--port 4420' } |
    Select-Object -ExpandProperty ProcessId
  foreach ($id in ($ids | Where-Object { $_ -and $_ -ne $PID } | Select-Object -Unique)) {
    taskkill /PID $id /F /T 2>&1 | Out-Null
  }
}
function Stop-PortOwners { Stop-StaleDev }
Stop-StaleDev
Start-Sleep -Seconds 1
foreach ($port in @($studioPort, $apiPort)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "El puerto $port sigue ocupado por otro proceso; cierralo y reintenta." }
}

docker compose -f compose.local.yml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron iniciar PostgreSQL y Redis con Docker.' }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones.' }
npx prisma generate
# On Windows another node process (worker, test run) can lock the query engine; the JS client is still regenerated.
if ($LASTEXITCODE -ne 0) { Write-Warning 'prisma generate no pudo reemplazar el motor (bloqueado por otro proceso node); se continua.' }

$processes = @()
$env:TS_NODE_TRANSPILE_ONLY = 'true'
try {
  # API plus every queue worker (connection verification, text, images, publishing, ...) so flows complete locally.
  $services = @('api', 'worker:connection', 'worker:discovery', 'worker:text', 'worker:image', 'worker:scraping', 'worker:publishing', 'worker:automation', 'worker:social')
  foreach ($service in $services) {
    $script = 'scripts/start-' + $service.Replace(':', '-') + '.ts'
    $processes += Start-Process node -ArgumentList @('--env-file=.env', 'node_modules/ts-node/dist/bin.js', $script) -PassThru -NoNewWindow
  }
  Write-Host "Studio: http://localhost:$studioPort/studio  |  API: http://localhost:4301/health"
  Write-Host 'Pulsa Ctrl+C para detener la aplicacion.'
  Push-Location apps/studio-web
  try {
    node --env-file=../../.env node_modules/@angular/cli/bin/ng.js serve --configuration development --port $studioPort
    if ($LASTEXITCODE -ne 0) { throw 'Studio no pudo arrancar.' }
  } finally { Pop-Location }
} finally {
  foreach ($process in $processes) { if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue } }
  Stop-PortOwners
}
