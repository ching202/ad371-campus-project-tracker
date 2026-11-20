$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    docker info --format '{{.ServerVersion}}'
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker engine is unavailable. Start Docker Desktop successfully before running this script.'
    }
    docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Compose configuration did not validate.' }
    docker compose up -d --build --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'Database startup failed. Inspect docker compose logs.' }
    docker compose ps
    if ($LASTEXITCODE -ne 0) { throw 'Could not read container status.' }
} finally {
    Pop-Location
}
