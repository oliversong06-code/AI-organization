<#
  Safe first-run / everyday-start script for Windows.
  - Never deletes or overwrites existing data.
  - Only runs `npm install` if node_modules is missing.
  - Only runs migrations if prisma/dev.db doesn't exist yet.
  - Always ends by starting `npm run dev` (binds to 127.0.0.1 only).
#>

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if ($PSScriptRoot -match "OneDrive") {
    Write-Warning "이 프로젝트가 OneDrive 동기화 폴더 안에 있는 것 같습니다. SQLite 손상 위험이 있으니 OneDrive 밖(예: C:\dev\...)으로 옮기는 것을 권장합니다."
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies (npm install)..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

if (-not (Test-Path "prisma\dev.db")) {
    Write-Host "No prisma/dev.db found — applying migrations and seeding initial data..."
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" }
    npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
    npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw "db:seed failed" }
} else {
    Write-Host "prisma/dev.db already exists — skipping migrate/seed (existing data is preserved)."
    npx prisma generate | Out-Null
}

Write-Host ""
Write-Host "Starting the app at http://127.0.0.1:3000 ..."
Write-Host "(Claude Code connects to the local MCP server automatically via .mcp.json — no separate step needed.)"
Write-Host ""
npm run dev
