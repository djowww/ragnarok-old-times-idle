$ErrorActionPreference = 'Stop'
try {
    $root = Split-Path -Parent $PSScriptRoot
    $readme = [IO.File]::ReadAllText((Join-Path $root 'README.md'), [Text.Encoding]::UTF8)
    $match = [regex]::Match($readme, '(?m)^\[preview\]:\s*(https://\S+)\s*$')
    if (-not $match.Success) { throw 'Endereco da preview ausente no README.' }
    $uri = [Uri]$match.Groups[1].Value
    if ($uri.Scheme -ne 'https' -or $uri.UserInfo) { throw 'Endereco de preview invalido.' }
    Start-Process -FilePath $uri.AbsoluteUri
} catch {
    Write-Error $_
    exit 1
}
