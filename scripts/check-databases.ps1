$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    Write-Output 'Checking PostgreSQL CRUD, join, constraints, cascade, and rollback...'
    docker compose exec -T postgres psql -X -U campus -d campus_tracker -v ON_ERROR_STOP=1 -f /checks/sql-checks.sql
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL checks failed.' }
    Write-Output 'Checking MongoDB CRUD, atomic changes, and validation...'
    docker compose exec -T mongo mongosh --quiet --file /checks/mongo-checks.js
    if ($LASTEXITCODE -ne 0) { throw 'MongoDB checks failed.' }
    Write-Output 'Database checks passed. HTTP API checks are a separate later stage.'
} finally {
    Pop-Location
}
