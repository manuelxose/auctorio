$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path .env)) {
  $config = Get-Content .env.example -Raw
  $config = $config.Replace('postgresql://user:pass@localhost:5432/content_ai', 'postgresql://auctorio:auctorio@localhost:55432/content_ai')
  $config = $config.Replace('redis://localhost:6379', 'redis://localhost:56379')
  $config = $config.Replace('PORT=3000', 'PORT=4301').Replace('http://localhost:3000', 'http://localhost:4301').Replace('http://127.0.0.1:3000', 'http://127.0.0.1:4301').Replace('HOST=0.0.0.0', 'HOST=127.0.0.1')
  $config = $config.Replace('TEXT_PROVIDER=deepseek', 'TEXT_PROVIDER=mock').Replace('IMAGE_PROVIDER=siliconflow', 'IMAGE_PROVIDER=mock')
  $config = $config.Replace('STORAGE_ROOT=/var/www/auctorio/storage', 'STORAGE_ROOT=./storage')
  Set-Content .env $config -Encoding utf8
  Write-Host 'Configuracion local creada en .env.'
}

if (-not (Test-Path node_modules/ts-node) -or -not (Test-Path apps/studio-web/node_modules/@angular/cli)) {
  throw 'Instala las dependencias: npm ci; npm ci --prefix apps/studio-web'
}

docker compose -f compose.local.yml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron iniciar PostgreSQL y Redis con Docker.' }
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones.' }

$processes = @()
$env:TS_NODE_TRANSPILE_ONLY = 'true'
try {
  $services = @('api')
  foreach ($service in $services) {
    $script = 'scripts/start-' + $service.Replace(':', '-') + '.ts'
    $processes += Start-Process node -ArgumentList @('--env-file=.env', 'node_modules/ts-node/dist/bin.js', $script) -PassThru -NoNewWindow
  }
  Write-Host 'Studio: http://localhost:4420/studio  |  API: http://localhost:4301/health'
  Write-Host 'Pulsa Ctrl+C para detener la aplicacion.'
  Push-Location apps/studio-web
  try {
    node --env-file=../../.env node_modules/@angular/cli/bin/ng.js serve --configuration development --port 4420
    if ($LASTEXITCODE -ne 0) { throw 'Studio no pudo arrancar.' }
  } finally { Pop-Location }
} finally {
  foreach ($process in $processes) { if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue } }
}
