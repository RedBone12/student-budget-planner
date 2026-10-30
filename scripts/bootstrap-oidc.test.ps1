$ErrorActionPreference = 'Stop'
$providerArn = 'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com'

function Test-BootstrapScenario([string]$Mode) {
    # Mock the AWS CLI at the command boundary; never contact an AWS account.
    function aws {
        $global:LASTEXITCODE = 0
        switch ("$($args[0]) $($args[1])") {
            'sts get-caller-identity' { return '{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:root"}' }
            'cloudformation describe-stacks' { return '{"Stacks":[{"StackStatus":"UPDATE_COMPLETE"}]}' }
            'cloudformation list-stacks' { return '{"StackSummaries":[{"StackName":"student-budget-planner-github-oidc"}]}' }
            'iam list-open-id-connect-providers' {
                if ($Mode -eq 'missing') { return '{"OpenIDConnectProviderList":[]}' }
                return (@{ OpenIDConnectProviderList = @(@{ Arn = $providerArn }) } | ConvertTo-Json -Depth 5 -Compress)
            }
            'cloudformation list-stack-resources' {
                if ($args -contains 'student-budget-planner-github-oidc') {
                    $owned = if ($Mode -eq 'owned') { @(@{ LogicalResourceId = 'GitHubProvider'; PhysicalResourceId = $providerArn; ResourceStatus = 'CREATE_COMPLETE' }) } else { @() }
                    return (@{ StackResourceSummaries = $owned } | ConvertTo-Json -Depth 5 -Compress)
                }
                $ids = @{ BudgetTable = 'table'; UserPool = 'pool'; BudgetHttpApi = 'api'; BudgetFunction = 'function'; BudgetFunctionRole = 'runtime-role'; FrontendBucket = 'frontend'; FrontendDistribution = 'distribution'; FrontendRewriteFunction = 'arn:aws:cloudfront::123456789012:function/rewrite'; FrontendOriginAccessControl = 'oac' }
                $resources = @($ids.GetEnumerator() | ForEach-Object { @{ LogicalResourceId = $_.Key; PhysicalResourceId = $_.Value } })
                return (@{ StackResourceSummaries = $resources } | ConvertTo-Json -Depth 5 -Compress)
            }
            default { throw "Unexpected AWS command in read-only bootstrap: $args" }
        }
    }
    & (Join-Path $PSScriptRoot 'bootstrap-oidc.ps1') -Profile offline-test | Out-Null
    $parameters = Get-Content (Join-Path $PSScriptRoot '../tmp/oidc-parameters.json') -Raw | ConvertFrom-Json
    $actualProvider = ($parameters | Where-Object ParameterKey -eq 'ExistingOidcProviderArn').ParameterValue
    $expectedProvider = if ($Mode -eq 'external') { $providerArn } else { '' }
    if ($actualProvider -ne $expectedProvider) { throw "Provider ownership regression in scenario $Mode" }
    $arns = ($parameters | Where-Object ParameterKey -eq 'ApplicationResourceArns').ParameterValue
    if ($arns -match 'function/arn:') { throw 'CloudFront physical ARN was prefixed twice' }
    Write-Output "PASS: $Mode provider; CloudFront ARN preserved; no AWS writes"
}

Test-BootstrapScenario 'missing'
Test-BootstrapScenario 'external'
Test-BootstrapScenario 'owned'
