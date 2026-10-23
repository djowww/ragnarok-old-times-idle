param([switch]$Stop, [switch]$CheckOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = 'ragidle-v1-local'
function Invoke-LocalDocker([string[]]$DockerArguments) {
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker retornou erro. Confira a mensagem acima.' }
}
Push-Location -LiteralPath $root
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Instale e abra o Docker Desktop antes de continuar.' }
    $engine = Invoke-LocalDocker -DockerArguments @('info', '--format', '{{.OSType}}')
    if (($engine | Out-String).Trim() -ne 'linux') { throw 'Selecione containers Linux no Docker Desktop.' }
    $compose = @('compose', '-p', $project, '-f', 'compose.yaml')
    if ($Stop) {
        Invoke-LocalDocker -DockerArguments ($compose + @('stop'))
        Write-Host 'RagIDLE local parado. Os dados foram preservados.'
        return
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'client-data/DATA.INI'))) {
        throw 'Adicione client-data/DATA.INI e os GRFs do cliente. Consulte docs/WINDOWS.md.'
    }
    if ($CheckOnly) { Write-Host 'Requisitos locais conferidos.'; return }
    $envPath = Join-Path $root '.env'
    if (-not (Test-Path -LiteralPath $envPath)) {
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $bytes = New-Object byte[] 32
            $rng.GetBytes($bytes); $dbSecret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
            $rng.GetBytes($bytes); $rootSecret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        } finally { $rng.Dispose() }
        $example = [IO.File]::ReadAllText((Join-Path $root '.env.example'))
        $example = [regex]::Replace($example, '(?m)^DB_PASSWORD=.*$', ('DB_PASSWORD=' + $dbSecret))
        $example = [regex]::Replace($example, '(?m)^DB_ROOT_PASSWORD=.*$', ('DB_ROOT_PASSWORD=' + $rootSecret))
        [IO.File]::WriteAllText($envPath, $example, (New-Object Text.UTF8Encoding($false)))
        Write-Host 'Configuracao local criada com senhas aleatorias.'
    }
    Invoke-LocalDocker -DockerArguments ($compose + @('config', '--quiet'))
    Invoke-LocalDocker -DockerArguments ($compose + @('up', '--build', '-d'))
    Write-Host 'Aguardando o jogo iniciar...'
    $ready = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri 'http://localhost:3339/api/health' -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'A API nao ficou saudavel. Consulte os logs descritos em docs/WINDOWS.md.' }
    Write-Host 'RagIDLE disponivel em http://localhost:3339/'
    if (-not $NoBrowser) { Start-Process -FilePath 'http://localhost:3339/' }
} catch {
    Write-Error $_
    exit 1
} finally { Pop-Location }
