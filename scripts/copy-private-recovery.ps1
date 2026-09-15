# Capture recovery secrets without printing them; protect using the owner's Windows DPAPI.
param([Parameter(Mandatory=$true)][string]$BackupFile, [Parameter(Mandatory=$true)][string]$ExpectedSHA256)
$ErrorActionPreference = 'Stop'
if ($BackupFile -notmatch '^/home/wealthos/apps/pr/\.private/backups/pr-[0-9]+\.dump\.enc$' -or
    $ExpectedSHA256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid backup receipt.' }
$privateDir = Join-Path $env:USERPROFILE '.ssh\pr-preview'
if (-not (Test-Path -LiteralPath $privateDir)) { throw 'Owner-only private login folder must exist first.' }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = Get-Acl -LiteralPath $privateDir
if (-not $acl.AreAccessRulesProtected) { throw 'Private folder inherits access; refusing secret capture.' }
foreach ($rule in $acl.Access) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $identity.Value) {
        throw 'Unexpected private folder access.'
    }
}
$start = [Diagnostics.ProcessStartInfo]::new('ssh')
# All returned content is captured internally, then DPAPI-encrypted. Never echo it.
$remote = 'node -e ''const fs=require("fs");const p="/home/wealthos/apps/pr/.private/";process.stdout.write(JSON.stringify({backupKey:fs.readFileSync(p+"backup.key").toString("base64"),provision:JSON.parse(fs.readFileSync(p+"postgres-provision.json","utf8")),runtime:JSON.parse(fs.readFileSync(p+"runtime.json","utf8")),commissioning:JSON.parse(fs.readFileSync(p+"commissioning.json","utf8"))}))'''
foreach ($arg in @('-o','BatchMode=yes','-o','ConnectTimeout=10','-p','2490','-i',
    (Join-Path $env:USERPROFILE '.ssh\wealthos_dev'),'wealthos_dev@62.204.61.18',$remote)) { $start.ArgumentList.Add($arg) }
$start.UseShellExecute=$false; $start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($start)
$content=$process.StandardOutput.ReadToEnd(); $null=$process.StandardError.ReadToEnd(); $process.WaitForExit()
if ($process.ExitCode -ne 0) { throw 'Private recovery capture failed.' }
$parsed=$content | ConvertFrom-Json
if ([Convert]::FromBase64String($parsed.backupKey).Length -ne 32 -or -not $parsed.runtime.DATABASE_URL) { throw 'Incomplete recovery material.' }
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$secretPath=Join-Path $privateDir "recovery-$stamp.clixml"
(ConvertTo-SecureString $content -AsPlainText -Force) | Export-Clixml -LiteralPath $secretPath
$roundtrip=Import-Clixml -LiteralPath $secretPath
$verify=[pscredential]::new('recovery',$roundtrip)
if ($verify.GetNetworkCredential().Password -cne $content) { throw 'DPAPI recovery verification failed.' }
$content=$null; $parsed=$null; $verify=$null
$folder=Join-Path $privateDir "backups\$stamp"
New-Item -ItemType Directory -Path $folder -Force | Out-Null
foreach ($file in @($BackupFile,($BackupFile+'.json'))) {
    scp -q -P 2490 -i (Join-Path $env:USERPROFILE '.ssh\wealthos_dev') "wealthos_dev@62.204.61.18:$file" $folder
    if ($LASTEXITCODE -ne 0) { throw 'Encrypted backup copy failed.' }
}
$copied=Join-Path $folder ([IO.Path]::GetFileName($BackupFile))
if ((Get-FileHash -LiteralPath $copied -Algorithm SHA256).Hash -ine $ExpectedSHA256) { throw 'Off-server checksum mismatch.' }
[pscustomobject]@{ EncryptedBackup=$copied; RecoverySecrets=$secretPath; IntegrityVerified=$true; DPAPIRoundtrip=$true } | ConvertTo-Json -Compress
