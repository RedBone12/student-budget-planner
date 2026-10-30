[CmdletBinding()]
param(
    [string]$Profile = 'student-budget-dev',
    [string]$Region = 'eu-west-1',
    [string]$StackName = 'student-budget-planner-dev',
    [switch]$Deploy
)
$ErrorActionPreference = 'Stop'
if ($StackName -ne 'student-budget-planner-dev') { throw 'This bootstrap is restricted to the existing development stack.' }
$repositoryRoot = Split-Path -Parent $PSScriptRoot
function Read-AwsJson([string[]]$Arguments) {
    $result = & aws @Arguments --profile $Profile --region $Region --output json --no-cli-pager
    if ($LASTEXITCODE -ne 0) { throw "AWS read failed: $($Arguments[0..1] -join ' ')" }
    return ($result | ConvertFrom-Json)
}
$identity = Read-AwsJson @('sts', 'get-caller-identity')
$account = $identity.Account
$partition = ($identity.Arn -split ':')[1]
$stack = (Read-AwsJson @('cloudformation', 'describe-stacks', '--stack-name', $StackName)).Stacks[0]
if ($stack.StackStatus -notin @('CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE')) {
    throw "Application stack is not ready: $($stack.StackStatus)"
}
$resources = (Read-AwsJson @('cloudformation', 'list-stack-resources', '--stack-name', $StackName)).StackResourceSummaries
function PhysicalId([string]$LogicalId) {
    $item = $resources | Where-Object LogicalResourceId -eq $LogicalId
    if (-not $item.PhysicalResourceId) { throw "Missing application resource: $LogicalId" }
    return $item.PhysicalResourceId
}
$table = PhysicalId 'BudgetTable'
$pool = PhysicalId 'UserPool'
$api = PhysicalId 'BudgetHttpApi'
$function = PhysicalId 'BudgetFunction'
$runtimeRole = PhysicalId 'BudgetFunctionRole'
$bucket = PhysicalId 'FrontendBucket'
$distribution = PhysicalId 'FrontendDistribution'
$rewrite = PhysicalId 'FrontendRewriteFunction'
$rewriteArn = if ($rewrite.StartsWith('arn:')) { $rewrite } else { "arn:${partition}:cloudfront::${account}:function/$rewrite" }
$oac = PhysicalId 'FrontendOriginAccessControl'
$frontendArn = "arn:${partition}:s3:::$bucket"
$distributionArn = "arn:${partition}:cloudfront::${account}:distribution/$distribution"
$runtimeRoleArn = "arn:${partition}:iam::${account}:role/$runtimeRole"
$applicationArns = @(
    "arn:${partition}:dynamodb:${Region}:${account}:table/$table",
    "arn:${partition}:dynamodb:${Region}:${account}:table/$table/*",
    "arn:${partition}:cognito-idp:${Region}:${account}:userpool/$pool",
    "arn:${partition}:apigateway:${Region}::/apis/$api",
    "arn:${partition}:apigateway:${Region}::/apis/$api/*",
    "arn:${partition}:lambda:${Region}:${account}:function:$function",
    "arn:${partition}:lambda:${Region}:${account}:function:${function}:*",
    $frontendArn, "$frontendArn/*", $distributionArn,
    $rewriteArn,
    "arn:${partition}:cloudfront::${account}:origin-access-control/$oac"
)
$providers = (Read-AwsJson @('iam', 'list-open-id-connect-providers')).OpenIDConnectProviderList
$provider = $providers | Where-Object Arn -like '*/token.actions.githubusercontent.com' | Select-Object -First 1
$parameters = @{
    ApplicationStackName = $StackName
    ApplicationResourceArns = $applicationArns -join ','
    FrontendBucketArn = $frontendArn
    DistributionArn = $distributionArn
    RuntimeRoleArn = $runtimeRoleArn
    ExistingOidcProviderArn = $(if ($provider) { $provider.Arn } else { '' })
}
$parameterFile = Join-Path $repositoryRoot 'tmp/oidc-parameters.json'
New-Item -ItemType Directory -Force (Split-Path -Parent $parameterFile) | Out-Null
$parameterList = @($parameters.GetEnumerator() | ForEach-Object { @{ ParameterKey = $_.Key; ParameterValue = $_.Value } })
[IO.File]::WriteAllText($parameterFile, (ConvertTo-Json -InputObject $parameterList), [Text.UTF8Encoding]::new($false))
Write-Output "Account: $account; application stack: $StackName"
Write-Output "Review parameters: $parameterFile"
Write-Output "Review IAM template: $(Join-Path $repositoryRoot 'infra/github-oidc.yaml')"
if (-not $Deploy) {
    Write-Output 'Read-only preparation complete. Run again with -Deploy to create/update the OIDC bootstrap stack.'
    return
}
& aws cloudformation deploy --template-file (Join-Path $repositoryRoot 'infra/github-oidc.yaml') `
    --stack-name 'student-budget-planner-github-oidc' --parameter-overrides "file://$parameterFile" `
    --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset --profile $Profile --region $Region --no-cli-pager
if ($LASTEXITCODE -ne 0) { throw 'OIDC bootstrap deployment failed.' }
$deployed = (Read-AwsJson @('cloudformation', 'describe-stacks', '--stack-name', 'student-budget-planner-github-oidc')).Stacks[0]
Write-Output 'Set these GitHub repository Actions variables (not access-key secrets):'
$names = @{ DeployRoleArn = 'AWS_DEPLOY_ROLE_ARN'; CloudFormationRoleArn = 'AWS_CLOUDFORMATION_ROLE_ARN'; ArtifactBucketName = 'AWS_ARTIFACT_BUCKET' }
$deployed.Outputs | ForEach-Object { Write-Output "$($names[$_.OutputKey])=$($_.OutputValue)" }
