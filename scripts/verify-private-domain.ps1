# Authenticated, read-only HTTPS checks. No passwords, tokens, or response data emitted.
$ErrorActionPreference='Stop'
$directory=Join-Path $env:USERPROFILE '.ssh\pr-preview'
$file=Get-ChildItem -LiteralPath $directory -Filter 'login-*.clixml' | Sort-Object Name -Descending | Select-Object -First 1
if (-not $file) { throw 'Secure owner login is unavailable.' }
$credential=Import-Clixml -LiteralPath $file.FullName
$handler=[Net.Http.HttpClientHandler]::new(); $handler.AllowAutoRedirect=$false
$client=[Net.Http.HttpClient]::new($handler); $client.Timeout=[TimeSpan]::FromSeconds(20)
try {
    $anonymous=$client.GetAsync('https://pr.wealthos.ir/').GetAwaiter().GetResult()
    if ([int]$anonymous.StatusCode -ne 401) { throw 'Anonymous access was not denied.' }
    $token=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($credential.UserName+':'+$credential.GetNetworkCredential().Password))
    $client.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Basic',$token)
    $results=@()
    foreach ($path in @('/','/health','/ready','/api/workbench','/api/strategy','/api/decision-context',
        '/api/drafts/sources','/api/feedback','/api/workflow-cost','/api/model-governance','/api/onboarding',
        '/api/account/activity','/api/memory','/api/claims','/api/research','/api/risk','/api/connectors')) {
        $response=$client.GetAsync('https://pr.wealthos.ir'+$path).GetAwaiter().GetResult()
        if ([int]$response.StatusCode -ne 200) { throw "Domain path failed: $path" }
        $body=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ($path -eq '/ready') {
            $ready=$body | ConvertFrom-Json
            if ($ready.persistence -ne 'postgres' -or $ready.durability -ne 'persistent') { throw 'Domain storage is not persistent.' }
        }
        if ($path -eq '/') {
            if ($body -notmatch 'id="root"' -or $body -notmatch '/assets/[^" ]+\.js') { throw 'Application shell missing.' }
            $asset=$Matches[0]
            $assetResponse=$client.GetAsync('https://pr.wealthos.ir'+$asset).GetAwaiter().GetResult()
            if ([int]$assetResponse.StatusCode -ne 200) { throw 'Built application asset missing.' }
        }
        $results+=@{ Path=$path; Status=200 }
    }
    [pscustomobject]@{ AnonymousStatus=401; AuthenticatedChecks=$results; Persistence='postgres'; Durability='persistent'; TLSValidation='system-default'; Asset=$asset } | ConvertTo-Json -Depth 4 -Compress
} finally { $client.Dispose(); $credential=$null; $token=$null; $body=$null }
