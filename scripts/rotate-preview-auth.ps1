# Run on the owner's Windows account. Secrets are never command-line arguments or output.
$ErrorActionPreference = 'Stop'
$privateDir = Join-Path $env:USERPROFILE '.ssh\pr-preview'
if (-not (Test-Path -LiteralPath $privateDir)) {
    New-Item -ItemType Directory -Path $privateDir | Out-Null
}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($identity)
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
Set-Acl -LiteralPath $privateDir -AclObject $acl
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$credentialPath = Join-Path $privateDir "login-$stamp.clixml"
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = [Convert]::ToBase64String($bytes)
$credential = [pscredential]::new('pr_owner', (ConvertTo-SecureString $password -AsPlainText -Force))
$credential | Export-Clixml -LiteralPath $credentialPath
$roundtrip = Import-Clixml -LiteralPath $credentialPath
if ($roundtrip.GetNetworkCredential().Password -cne $password) { throw 'Credential storage verification failed.' }

$remote = @'
set -eu
umask 077
target=/home/wealthos/pr.wealthos.ir/.htpasswd
backup=/home/wealthos/apps/pr/.deploy-backups/auth-before-STAMP
test -f "$target"
test "$(wc -l < "$target")" -eq 1
test "$(cut -d: -f1 "$target")" = pr_owner
test ! -e "$backup"
mkdir -m 700 "$backup"
cp "$target" "$backup/verifier"
setfacl -b "$backup/verifier"
chmod 600 "$backup/verifier"
# Preserve target inode/ACL because this account cannot replace files in the docroot.
htpasswd -i -B "$target" pr_owner >/dev/null 2>&1
test "$(wc -l < "$target")" -eq 1
if cmp -s "$target" "$backup/verifier"; then exit 42; fi
printf 'rotation_applied\n'
'@
$remote = $remote.Replace('STAMP', $stamp).Replace("`r", '')
$start = [System.Diagnostics.ProcessStartInfo]::new('ssh')
foreach ($arg in @('-o','BatchMode=yes','-o','ConnectTimeout=10','-p','2490','-i',
    (Join-Path $env:USERPROFILE '.ssh\wealthos_dev'),'wealthos_dev@62.204.61.18',$remote)) {
    $start.ArgumentList.Add($arg)
}
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::Start($start)
$process.StandardInput.WriteLine($password)
$process.StandardInput.Close()
$output = $process.StandardOutput.ReadToEnd()
$null = $process.StandardError.ReadToEnd()
$process.WaitForExit()
if ($process.ExitCode -ne 0 -or $output -notmatch 'rotation_applied') {
    throw "Rotation not verified. Keep the encrypted credential at $credentialPath; inspect the server before retrying."
}
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(20)
try {
    $unauth = $client.GetAsync('https://pr.wealthos.ir/').GetAwaiter().GetResult()
    $token = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('pr_owner:' + $password))
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Basic', $token)
    $auth = $client.GetAsync('https://pr.wealthos.ir/health').GetAwaiter().GetResult()
    if ([int]$unauth.StatusCode -ne 401 -or [int]$auth.StatusCode -ne 200) {
        throw 'Credential changed, but domain verification failed; preserve stored login and inspect access.'
    }
    [pscustomobject]@{ Rotated=$true; AnonymousStatus=401; AuthenticatedHealthStatus=200;
        CredentialPath=$credentialPath; PreviousVerifierReplaced=$true } | ConvertTo-Json -Compress
} finally {
    $client.Dispose()
    $password = $null
    $token = $null
}
