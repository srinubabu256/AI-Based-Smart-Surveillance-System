Write-Host "Starting Smart Surveillance System Setup..." -ForegroundColor Green

# Function to check if a command exists
function Test-Command ($command) {
    if (Get-Command $command -ErrorAction SilentlyContinue) {
        return $true
    }
    return $false
}

# Check prerequisites
if (-not (Test-Command "python")) {
    Write-Error "Python is not installed or not in PATH."
    exit 1
}
if (-not (Test-Command "npm")) {
    Write-Error "Node.js (npm) is not installed or not in PATH."
    exit 1
}

$root = Get-Location

# Backend Setup & Run
Write-Host "`nSetting up Backend..." -ForegroundColor Cyan
Set-Location "$root\backend"

if (Test-Path "requirements.txt") {
    Write-Host "Installing backend dependencies..."
    pip install -r requirements.txt
}

Write-Host "Starting Backend Server..."
# Start backend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; python -m uvicorn server:app --reload --port 8000"

# Frontend Setup & Run
Write-Host "`nSetting up Frontend..." -ForegroundColor Cyan
Set-Location "$root\frontend"

if (Test-Path "package.json") {
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing frontend dependencies (this might take a while)..."
        npm install --legacy-peer-deps
    }
}

Write-Host "Starting Frontend..."
# Start frontend in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm start"

Set-Location $root
Write-Host "`nProject started! Check the new windows." -ForegroundColor Green
