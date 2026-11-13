[CmdletBinding()]
param(
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $projectRoot '.nvmrc'
$nodeVersion = (Get-Content -LiteralPath $versionFile -Raw -Encoding UTF8).Trim()
if ($nodeVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw '.nvmrc must contain an exact Node.js version, for example 24.22.3.'
}

if (-not $CheckOnly) {
  $nvmCommand = Get-Command nvm.exe -CommandType Application -ErrorAction SilentlyContinue
  if (-not $nvmCommand) {
    throw 'Install nvm-windows first: https://github.com/nvm-windows/nvm . Then open a new PowerShell terminal and run this script again.'
  }
  & $nvmCommand.Source install $nodeVersion
  if ($LASTEXITCODE -ne 0) {
    throw "nvm install $nodeVersion failed."
  }
  & $nvmCommand.Source use $nodeVersion
  if ($LASTEXITCODE -ne 0) {
    throw "nvm use $nodeVersion failed. If nvm requests administrator rights, run PowerShell as administrator."
  }
}

$nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw 'node.exe was not found on PATH. Open a new terminal after installing Node.js.'
}
$actualVersion = (& $nodeCommand.Source --version).Trim()
if ($LASTEXITCODE -ne 0 -or $actualVersion -ne "v$nodeVersion") {
  throw "Expected Node.js v$nodeVersion but found $actualVersion. Check 'Get-Command node.exe' for another installation taking priority on PATH."
}

Write-Host "Node.js $actualVersion matches .nvmrc."
Write-Host 'Next: npm.cmd ci'
Write-Host 'Then: npm.cmd start'
