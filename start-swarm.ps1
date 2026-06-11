# Prospektlab Swarm - Startup Script
# Run this from D:\Prospektlab-bot\postiz-app

# Kill anything on port 4000 or 4200
$ports = @(4000, 4200)
foreach ($port in $ports) {
    $connections = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
    foreach ($conn in $connections) {
        $parts = $conn.ToString().Trim() -split '\s+'
        $pid = $parts[-1]
        if ($pid -match '^\d+$' -and $pid -ne '0') {
            Write-Host "Killing process $pid on port $port"
            Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
        }
    }
}

Start-Sleep -Seconds 2

# Load environment variables from .env
$envFile = Join-Path $PSScriptRoot ".env"
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

$env:NODE_OPTIONS = "--max-old-space-size=6144"

# Start backend in background
Write-Host "Starting backend on port $env:PORT..."
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PSScriptRoot
    $env:NODE_OPTIONS = "--max-old-space-size=6144"
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]*)=(.*)$') {
            $n = $matches[1].Trim(); $v = $matches[2].Trim().Trim('"')
            [System.Environment]::SetEnvironmentVariable($n, $v, 'Process')
        }
    }
    node "dist\backend\apps\backend\src\main.js" 2>&1 | Out-File "backend.log" -Append
}

Write-Host "Waiting for backend to start..."
$maxWait = 60
$waited = 0
do {
    Start-Sleep -Seconds 2
    $waited += 2
    $listening = netstat -an | Select-String ":4000 " | Select-String "LISTENING"
} while (-not $listening -and $waited -lt $maxWait)

if ($listening) {
    Write-Host "✓ Backend running on port 4000"
} else {
    Write-Host "✗ Backend failed to start within ${maxWait}s"
}

# Start frontend
Write-Host "Starting frontend on port 4200..."
Start-Process -FilePath "pnpm" -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $PSScriptRoot "apps\frontend") -NoNewWindow -RedirectStandardOutput "frontend.log" -RedirectStandardError "frontend.err.log"

Write-Host ""
Write-Host "Services starting:"
Write-Host "  Backend:  http://localhost:4000"
Write-Host "  Frontend: http://localhost:4200"
Write-Host "  Swarm UI: http://localhost:4200/swarm"
Write-Host ""
Write-Host "Logs: backend.log, frontend.log"
