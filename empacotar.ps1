# empacotar.ps1 - gera o .zip de distribuicao do Helmet Library
#
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\empacotar.ps1
#
# Resultado: dist\HelmetLibrary-<versao>.zip com
#   premiere-helmet-library\  instalar.bat  Add Keys.reg  README.md  README.pt-BR.md  LICENSE  CHANGELOG.md
# Ficam de fora: testes, auditoria, .git, .debug, previews e temporarios.
# Para com erro se:
#   - as versoes nao baterem (manifest x2, painel CLIENT_VERSION, host HL_HOST_VERSION);
#   - encontrar certificado/chave no que seria empacotado.
# (Assinatura .zxp: pendente - ver README.)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$ext = Join-Path $root "premiere-helmet-library"

# --- versao: a mesma nos quatro lugares ------------------------------------------
[xml]$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $ext "CSXS\manifest.xml")
$version = $manifest.ExtensionManifest.ExtensionBundleVersion
if (-not $version) { throw "Nao achei ExtensionBundleVersion no manifest.xml" }

$found = @{}
$found["manifest (Extension Version)"] = $manifest.ExtensionManifest.ExtensionList.Extension.Version

$clientMatch = Select-String -Path (Join-Path $ext "client\js\*.js") -Pattern 'CLIENT_VERSION\s*[:=]\s*"([^"]+)"' | Select-Object -First 1
$found["painel (CLIENT_VERSION)"] = if ($clientMatch) { $clientMatch.Matches[0].Groups[1].Value } else { "" }

$hostMatch = Select-String -Path (Join-Path $ext "host\index.jsx") -Pattern 'HL_HOST_VERSION\s*=\s*"([^"]+)"' | Select-Object -First 1
$found["host (HL_HOST_VERSION)"] = if ($hostMatch) { $hostMatch.Matches[0].Groups[1].Value } else { "" }

$wrong = $found.GetEnumerator() | Where-Object { $_.Value -ne $version }
if ($wrong) {
    $list = ($wrong | ForEach-Object { $_.Key + " = '" + $_.Value + "'" }) -join "; "
    throw "Versoes diferentes (manifest diz $version): $list"
}

# --- monta a pasta do pacote --------------------------------------------------------
$dist = Join-Path $root "dist"
$stage = Join-Path $dist "HelmetLibrary-$version"
$zip = Join-Path $dist "HelmetLibrary-$version.zip"

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item -Recurse $ext $stage
foreach ($f in @("instalar.bat", "Add Keys.reg", "README.md", "README.pt-BR.md", "LICENSE", "CHANGELOG.md")) {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src $stage } else { Write-Host "Aviso: $f nao existe, ficou de fora." }
}

# lixo de desenvolvimento que nunca deve ir junto
$junk = @(".debug", ".helmet-previews", "*.tmp", "*.log", "*.bak", "Thumbs.db", "desktop.ini", ".DS_Store")
Get-ChildItem -Recurse -Force $stage -Include $junk | Remove-Item -Recurse -Force

# seguranca: nenhum certificado, chave ou .debug no pacote
$secrets = Get-ChildItem -Recurse -Force $stage -Include @("*.p12", "*.pfx", "*.key", "*.pem", "*.crt", "*.cer", ".debug")
if ($secrets) {
    Remove-Item -Recurse -Force $stage
    throw ("Encontrei certificado/chave/.debug no pacote (nada foi gerado): " + ($secrets.FullName -join ", "))
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Remove-Item -Recurse -Force $stage

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Pronto: $zip ($size MB)"
