# ============================================================
# setup-vercel-env.ps1 - Tambah semua env dari .env ke Vercel (Production)
# Dipakai SEKALI SAJA. Setelah selesai boleh dihapus.
# ============================================================

$envFile = Join-Path $PSScriptRoot ".env"
$lines = Get-Content $envFile

foreach ($line in $lines) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith("#")) { continue }
    $idx = $t.IndexOf("=")
    if ($idx -le 0) { continue }
    $name = $t.Substring(0, $idx).Trim()
    $value = $t.Substring($idx + 1).Trim()
    $value = $value.Trim('"')
    if (-not $name -or -not $value) { continue }
    Write-Host ("Adding {0} ..." -f $name)
    $value | vercel env add $name production --yes
}

Write-Host "Selesai. Semua env sudah ditambahkan ke Production."
