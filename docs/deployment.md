# Automated development deployment

The application stays serverless: React on private S3/CloudFront, API Gateway, Lambda, Cognito and DynamoDB. Docker is used only by the optional SAM local example.

## Release flow

1. A PR must pass `Tests, lint and build`, `Browser E2E` and `SAM lint` before merging.
2. A push to `main` runs CI again. `Deploy development` listens for successful CI completion on `main`.
3. Eligibility checks verify the exact current main SHA and all three successful CI jobs. Older commits, failed CI and PR CI cannot deploy. Manual dispatch also requires successful push CI for the current main SHA.
4. GitHub exchanges its OIDC token for temporary AWS credentials. Only the deployment job gets `id-token: write`; no AWS access-key secret is used.
5. SAM builds and deploys `student-budget-planner-dev` in `eu-west-1`, using a separate CloudFormation execution role and explicit CI arguments. The local SSO profile in `samconfig.toml` is not used.
6. Stack outputs supply the API URL and Cognito IDs to the Vite build. Assets upload first, then `index.html` with no-cache headers. Old assets remain available for cached pages; uploads do not use `--delete`.
7. The workflow invalidates `/*`, waits for completion, and checks the HTTPS site returns the React shell. The job summary records the commit and website URL.

Deployments are serialized and running deployments are never cancelled by newer pushes. This workflow deploys development only; it has no production switch. SAM/CloudFormation rollback remains enabled. Frontend upload and backend deployment are not an atomic transaction: if publication fails after a backend update, the workflow fails and must be rerun after fixing the cause. For rollback, revert via a PR, pass CI and merge; the old version then follows the same deployment path.

## One-time AWS bootstrap

`infra/github-oidc.yaml` declares a reusable GitHub OIDC provider (or reuses the existing account provider), a private SAM artifact bucket, the GitHub deployment role, and a separate CloudFormation execution role.

The trust policy accepts only this repository's `main` ref and the `sts.amazonaws.com` audience. It includes the exact legacy subject and the exact immutable owner/repository ID subject, without a wildcard repository or branch. No GitHub environment is attached to the job, because that would change the OIDC subject format.

The bootstrap reads the existing application stack and scopes service permissions to its physical resources. CloudFormation may update the existing Lambda execution role's inline policy and pass it only to Lambda. GitHub may pass only the new execution role to CloudFormation. This is not an administrator role. New application resources or resource replacements require reviewing and updating these policies; an access-denied error must not be resolved by attaching AdministratorAccess.

In PowerShell from the repository root:

```powershell
# For the original IAM Identity Center profile:
aws sso login --profile student-budget-dev
./scripts/bootstrap-oidc.ps1 -Profile student-budget-dev

# Review infra/github-oidc.yaml and tmp/oidc-parameters.json, then create/update:
./scripts/bootstrap-oidc.ps1 -Profile student-budget-dev -Deploy
```

If the SSO portal is unavailable but you can sign into the AWS console, AWS CLI v2 also supports temporary console-based login:

```powershell
aws login --profile student-budget-console --region eu-west-1
./scripts/bootstrap-oidc.ps1 -Profile student-budget-console
./scripts/bootstrap-oidc.ps1 -Profile student-budget-console -Deploy
```

The read-only invocation generates ignored `tmp/oidc-parameters.json` with the physical resource ARNs. `-Deploy` creates/updates `student-budget-planner-github-oidc`. It does not deploy the application. Successful completion prints these **GitHub repository Actions variables**:

| Variable | Bootstrap output |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` |
| `AWS_CLOUDFORMATION_ROLE_ARN` | `CloudFormationRoleArn` |
| `AWS_ARTIFACT_BUCKET` | `ArtifactBucketName` |

Set them under repository Settings → Secrets and variables → Actions → Variables. They are identifiers, not credentials. Without all three values, the workflow explicitly reports that AWS bootstrap is incomplete and skips deployment. After setup, use Actions → Deploy development → Run workflow on `main`, or merge the next tested change.

The artifact bucket is encrypted, private and retained if the bootstrap stack is deleted. Incomplete uploads are cleaned after seven days; completed artifacts are kept for rollback. GitHub deployment roles and identity configuration should be reviewed if repository ownership changes.

## Local container execution with SAM

Docker Desktop must be running. From the repository root in PowerShell:

```powershell
sam build --template-file backend/template.yaml
sam local invoke BudgetFunction `
  --template .aws-sam/build/template.yaml `
  --event backend/events/missing-identity.json `
  --env-vars backend/local-env.json `
  --region eu-west-1
```

Success is a Lambda response with `statusCode: 400` and `Authenticated user is missing`. This intentionally exercises the real Lambda package in the SAM container before any DynamoDB request. The fixture contains no identity and uses a dummy table name, so it does not access the live budget table. The first invocation downloads the AWS runtime container image. This example does not verify Cognito JWT signatures or exercise database persistence; the local HTTP/browser integration tests are documented in `testing.md`.

## Validation

CI includes four deployment-orchestration tests (output configuration, publication order, failure propagation and configuration guards), ESLint over the scripts, and linting of both CloudFormation templates. Actual OIDC authentication and AWS deployment require a live workflow run; unit tests do not substitute for that acceptance check.

References: [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [SAM deploy options](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html), [temporary AWS CLI console login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html).
