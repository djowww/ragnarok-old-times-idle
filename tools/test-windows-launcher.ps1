$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$errorsFound = @()
Get-ChildItem (Join-Path $repo 'windows') -Filter '*.ps1' | ForEach-Object {
    $tokens = $null; $parseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$parseErrors)
    $errorsFound += @($parseErrors)
}
if ($errorsFound.Count) { throw 'PowerShell parser rejected a launcher.' }
$temp = Join-Path ([IO.Path]::GetTempPath()) ('ragidle-launcher-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $temp 'windows'), (Join-Path $temp 'client-data') -Force | Out-Null
try {
    Copy-Item (Join-Path $repo 'windows/Start-Local.ps1') (Join-Path $temp 'windows/Start-Local.ps1')
    Copy-Item (Join-Path $repo '.env.example') (Join-Path $temp '.env.example')
    Set-Content -Path (Join-Path $temp 'client-data/DATA.INI') -Value '[Data]'
    $global:RagIdleDockerCalls = New-Object System.Collections.Generic.List[string]
    function global:docker {
        $global:RagIdleDockerCalls.Add(($args -join ' '))
        $global:LASTEXITCODE = 0
        if ($args[0] -eq 'info') { 'linux' }
    }
    function global:Invoke-WebRequest { param($Uri, [switch]$UseBasicParsing, $TimeoutSec); [pscustomobject]@{StatusCode=200} }
    & (Join-Path $temp 'windows/Start-Local.ps1') -NoBrowser
    $envPath = Join-Path $temp '.env'
    $first = [IO.File]::ReadAllText($envPath)
    if ($first.Contains('change-me-local-password') -or $first.Contains('change-me-local-root-password')) { throw 'Default credentials remained.' }
    & (Join-Path $temp 'windows/Start-Local.ps1') -NoBrowser
    if ([IO.File]::ReadAllText($envPath) -ne $first) { throw 'Existing configuration was overwritten.' }
    & (Join-Path $temp 'windows/Start-Local.ps1') -Stop
    if (-not ($global:RagIdleDockerCalls -contains 'compose -p ragidle-v1-local -f compose.yaml up --build -d')) { throw 'Unexpected Compose project.' }
    if (-not ($global:RagIdleDockerCalls -contains 'compose -p ragidle-v1-local -f compose.yaml stop')) { throw 'Stop command missing.' }
    if ($global:RagIdleDockerCalls | Where-Object { $_ -match 'down|prune|volume' }) { throw 'Destructive command found.' }
    Write-Host 'WINDOWS_LAUNCHER_PASS: syntax, isolated project, credential generation and preservation, safe stop.'
} finally {
    Remove-Item Function:\docker -ErrorAction SilentlyContinue
    Remove-Item Function:\Invoke-WebRequest -ErrorAction SilentlyContinue
    $resolved = [IO.Path]::GetFullPath($temp)
    $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($parent) -and (Split-Path $resolved -Leaf).StartsWith('ragidle-launcher-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
