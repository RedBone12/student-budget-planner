$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'dist'
$expectedDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$resolvedOutput = [System.IO.Path]::GetFullPath($outputDirectory)

if ($resolvedOutput -ne $expectedDirectory) {
    throw "Refusing to clean unexpected path: $resolvedOutput"
}

if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
}
