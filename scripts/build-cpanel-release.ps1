# Generates a source-pinned, secret-free deployment artifact from committed files only.
$ErrorActionPreference = 'Stop'
function Assert-Exit { if ($LASTEXITCODE -ne 0) { throw 'Release command failed.' } }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repo
try {
    $sha = (git rev-parse HEAD).Trim(); Assert-Exit
    if ($sha -notmatch '^[a-f0-9]{40}$') { throw 'Invalid source revision.' }
    git diff --quiet; Assert-Exit
    git diff --cached --quiet; Assert-Exit
    pnpm build; Assert-Exit
    pnpm web:build; Assert-Exit
    $stage = Join-Path $repo "dist\cpanel-$sha"
    if (Test-Path -LiteralPath $stage) { throw 'Release stage already exists; inspect before reuse.' }
    New-Item -ItemType Directory -Path $stage | Out-Null
    $source = Join-Path $repo "dist\source-$sha.tar"
    git archive --format=tar "--output=$source" $sha; Assert-Exit
    tar -xf $source -C $stage; Assert-Exit
    $runtime = Join-Path $stage 'runtime'
    New-Item -ItemType Directory -Path $runtime | Out-Null
    foreach ($pair in @(
        @('src/main.ts', 'main'),
        @('scripts/private-postgres-backup.ts', 'private-postgres-backup'),
        @('scripts/private-services.ts', 'private-services'),
        @('scripts/postgres-commission.ts', 'postgres-commission'),
        @('scripts/export-private-state.ts', 'export-private-state')
    )) {
        $output = Join-Path $runtime ($pair[1] + '.cjs')
        pnpm --dir apps/web exec esbuild (Join-Path $repo $pair[0]) --bundle --platform=node --target=node22 --format=cjs "--outfile=$output"; Assert-Exit
    }
    Copy-Item -LiteralPath (Join-Path $repo 'apps/web/dist') -Destination (Join-Path $stage 'apps/web/dist') -Recurse
    [IO.File]::WriteAllText((Join-Path $stage 'SOURCE_COMMIT'), "$sha`n", [Text.UTF8Encoding]::new($false))
    $artifact = Join-Path $repo "dist\pr-$sha.tar.gz"
    tar -czf $artifact -C $stage .; Assert-Exit
    [pscustomobject]@{ SourceCommit=$sha; Artifact=$artifact; SHA256=(Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash } | ConvertTo-Json -Compress
} finally { Pop-Location }
