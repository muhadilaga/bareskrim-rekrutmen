$files = @(
    "test-discord.js",
    "test-discord.mjs",
    "check.cjs",
    "check-git.cjs",
    "push.cjs",
    "push2.cjs"
)
foreach ($f in $files) {
    $path = Join-Path $PSScriptRoot $f
    if (Test-Path $path) {
        Remove-Item -LiteralPath $path -Force
        Write-Host "Deleted: $f"
    } else {
        Write-Host "Not found: $f"
    }
}
