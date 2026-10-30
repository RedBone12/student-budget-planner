# AWS backend

This folder contains the reproducible AWS backend for the Student Budget Planner.

## What each file does

- `template.yaml` declares Cognito, API Gateway, Lambda, DynamoDB, a private S3 frontend bucket, CloudFront, permissions, and CORS.
- `src/app.mjs` handles authenticated API requests.
- `src/domain.mjs` validates data and converts euro amounts to integer cents.
- `tests/domain.test.mjs` verifies the backend rules without connecting to AWS.

## Security model

- Cognito stores credentials and issues tokens. Passwords are never stored in DynamoDB.
- API Gateway validates the Cognito token before invoking Lambda.
- Lambda reads the Cognito `sub` claim and builds `PK = USER#<sub>` itself.
- The browser cannot select another user's partition key.
- Lambda can access only the DynamoDB table created by this stack.

## Local checks

Run these commands from the project root in PowerShell:

```powershell
node --test backend/tests/domain.test.mjs
sam validate --lint --template-file backend/template.yaml
sam build --template-file backend/template.yaml
```

Docker is not required for these checks. It is needed only for `sam local` container-based execution.

## Deployment

The reviewed development settings are saved in `samconfig.toml`, so later updates use:

```powershell
sam build --template-file backend/template.yaml
sam deploy --config-file backend/samconfig.toml --config-env dev
```

The development stack is named `student-budget-planner-dev`. CloudFormation outputs
the API URL, Cognito IDs, private frontend bucket, CloudFront distribution ID, and
public website URL. The API accepts the two local development origins and the
CloudFront HTTPS origin.

After a frontend change, run `npm --prefix frontend run build` from the project
root and upload `frontend/dist` to the bucket named by the
`FrontendBucketName` stack output. Then create a CloudFront invalidation for `/*`
using the `FrontendDistributionId` output so visitors receive the new build.

The automated alternative is the `Deploy development` GitHub Actions workflow. It deploys only a successfully tested current `main` commit using AWS OIDC, then builds and uploads the frontend and invalidates CloudFront. See [`docs/deployment.md`](../docs/deployment.md) for the one-time identity bootstrap, repository variables, rollback behavior and a safe SAM local container example.
