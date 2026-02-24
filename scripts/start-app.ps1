param(
    [int]$Port = 3000,
    [string]$AppFile = "server.js",
    [string]$LogFile = "logs/app.log",
    [string]$ErrorFile = "logs/error.log",
    [string]$Apphost = "http://localhost"
)

# Get the project root (parent of the scripts directory)
$projectRoot = Split-Path -Parent $PSScriptRoot
Write-Output "Project root: $projectRoot"

# Convert relative paths to absolute
if (-not [System.IO.Path]::IsPathRooted($AppFile)) {
    $AppFile = Join-Path $projectRoot $AppFile
}
if (-not [System.IO.Path]::IsPathRooted($LogFile)) {
    $LogFile = Join-Path $projectRoot $LogFile
}
if (-not [System.IO.Path]::IsPathRooted($ErrorFile)) {
    $ErrorFile = Join-Path $projectRoot $ErrorFile
}

Write-Output "AppFile: $AppFile"
Write-Output "LogFile: $LogFile"
Write-Output "ErrorFile: $ErrorFile"

# Ensure logs directory exists
$logDir = Split-Path -Parent $LogFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
# Ensure error log directory exists (may be different)
$errLogDir = Split-Path -Parent $ErrorFile
if (-not (Test-Path $errLogDir)) { New-Item -ItemType Directory -Path $errLogDir -Force | Out-Null }

# Ensure log files exist so redirection will work reliably
if (-not (Test-Path $LogFile)) { New-Item -ItemType File -Path $LogFile -Force | Out-Null }
if (-not (Test-Path $ErrorFile)) { New-Item -ItemType File -Path $ErrorFile -Force | Out-Null }

Write-Output "Stopping any process using port $Port (if present)..."
$rawLines = & netstat -ano
# Find lines that contain the port (avoid matching ports that contain the port as part of a larger number)
$matching = $rawLines | Where-Object { $_ -match ":$Port\b" }

# Extract numeric PIDs from end of line, ignore PID 0 and collect unique values
$pids = @()
foreach ($l in $matching) {
    if ($l -match '\s+(\d+)\s*$') {
        $found = $matches[1]
        if ($found -and $found -ne '0') { $pids += $found }
    }
}
$uniquePids = $pids | Sort-Object -Unique
if ($uniquePids.Count -eq 0) {
    Write-Output "No process found listening on port $Port."
} else {
    foreach ($procPid in $uniquePids) {
        try {
            Write-Output "Killing PID $procPid"
            & taskkill /PID $procPid /F | Out-Null
        } catch {
            Write-Warning ("Failed to kill PID {0}: {1}" -f $procPid, $_.Exception.Message)
        }
    }
}

# Verify node is available
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "node not found in PATH. Install Node.js or add it to PATH."
    exit 1
}

Write-Output "Starting $AppFile (port $Port), logging to $LogFile"
# Start node in background, redirect stdout/stderr to log file
$nodeExe = $nodeCmd.Source

# Start the process and capture it
$proc = Start-Process -FilePath $nodeExe -ArgumentList $AppFile -WorkingDirectory $projectRoot -RedirectStandardOutput $LogFile -RedirectStandardError $ErrorFile -WindowStyle Hidden -PassThru

Write-Output "Process started with PID $($proc.Id)"

# Wait a bit and check if process is still alive
Start-Sleep -Milliseconds 1000
if ($proc.HasExited) {
    Write-Error "Process exited immediately (PID $($proc.Id)). Check logs:"
    if (Test-Path $ErrorFile) { Get-Content $ErrorFile }
    exit 1
}

Write-Output "App running on PID $($proc.Id)"

$url = "$Apphost`:$Port/"
Write-Output "Opening default browser to $url"
Start-Process $url

Write-Output "Done. Check $LogFile for output."
