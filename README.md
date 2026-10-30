# Student Budget Planner

A full-stack student budgeting application built with React and a serverless AWS backend.

**Live application:** [https://d3051uxkdikknp.cloudfront.net](https://d3051uxkdikknp.cloudfront.net)

This is a team project. My main responsibility was the React frontend. I later modified and extended the backend foundation created by a teammate, integrated the application with AWS, and completed the cloud deployment and frontend-backend debugging. The current version includes Cognito authentication, an authenticated API, per-user DynamoDB storage, infrastructure as code, and secure AWS hosting.

## Architecture

```mermaid
flowchart LR
    User[Browser] -->|HTTPS| CF[Amazon CloudFront]
    CF -->|Origin Access Control| S3[Private Amazon S3]
    User -->|Sign up / sign in| Cognito[Amazon Cognito]
    User -->|JWT authenticated requests| API[Amazon API Gateway]
    API -->|Validated Cognito identity| Lambda[AWS Lambda]
    Lambda -->|Per-user partition| DB[(Amazon DynamoDB)]
    Budgets[AWS Budgets] -.->|Account cost alerts| Owner[Project owner]
```

CloudFront serves the React build from a private S3 bucket. Cognito verifies email addresses and issues the ID token used by the browser. API Gateway validates that token before Lambda runs. Lambda derives the DynamoDB partition key from the authenticated Cognito `sub`, so the browser cannot request another user's partition directly.

## Features

- Email registration, verification, login, session restoration, and logout
- Dashboard showing total budget, spending, and remaining balance
- Create, edit, and delete expenses with input validation
- Custom spending categories and category budget limits
- Per-user cloud persistence across devices and browser sessions
- Spending charts, activity notifications, filtering, and PDF report export
- Responsive layouts for desktop and mobile screens
- Friendly authentication errors, verification-code resend, and duplicate-submit protection

## AWS services

| Service | Purpose |
| --- | --- |
| Amazon CloudFront | Public HTTPS delivery and React route rewriting |
| Amazon S3 | Private storage for the production frontend build |
| Amazon Cognito | User accounts, email verification, and JWT sessions |
| Amazon API Gateway | CORS-controlled authenticated HTTP API |
| AWS Lambda | Expense, category, and setting business logic |
| Amazon DynamoDB | Per-user budget data using `USER#<cognito-sub>` partitions |
| AWS CloudFormation / SAM | Reproducible infrastructure and deployments |
| AWS Budgets | Monthly account cost monitoring and email alerts |

## Security and data handling

- Passwords are handled by Cognito and are never stored in this application or DynamoDB.
- API Gateway rejects requests without a valid Cognito JWT.
- Lambda obtains the owner identifier from verified token claims.
- Monetary values are validated and stored as integer cents to avoid floating-point persistence errors.
- The S3 bucket blocks public access; CloudFront reads it through Origin Access Control.
- Production and local browser origins are explicitly listed in the API CORS configuration.

## Local development

Requirements: Node.js 24.13.0 and npm (matching CI).

```powershell
cd frontend
npm install
npm run dev
```

Create `.env.development` from `.env.example` and provide the deployed AWS region, Cognito user pool, app client, and API URL. Then open the Vite URL printed in the terminal.

## Repository structure

```text
student-budget-planner/
├── frontend/          React, Vite, frontend tests and static assets
├── backend/           Lambda code, backend tests and AWS SAM template
├── docs/              Portfolio and CV wording
└── README.md          Project overview and architecture
```

## Validation

```powershell
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run coverage
npm --prefix frontend run test:components
npm --prefix frontend run test:integration
npm --prefix frontend run build
npm --prefix backend/src test
npm --prefix backend/src run coverage
# First install the browser: cd frontend; npx playwright install chromium
npm --prefix frontend run test:e2e
sam validate --lint --template-file backend/template.yaml
```

The test suite contains 11 frontend regression tests, 12 React Testing Library page tests, 6 frontend API client tests, 5 backend domain tests, 9 Lambda handler tests, 2 HTTP API integration tests, and 1 Chromium browser journey. See [`docs/testing.md`](docs/testing.md) for commands, coverage scope, and simulation boundaries.

### Continuous integration

[`CI`](.github/workflows/ci.yml) runs on every pull request, pushes to `main`, and manual dispatch. It installs locked dependencies with `npm ci`, checks frontend/backend JavaScript with ESLint (including JSX and test infrastructure), runs the regression, page, API and handler suites with coverage gates, builds the frontend, runs a Chromium browser journey, and runs `sam validate --lint`. It needs no AWS credentials and does not deploy. The build, frontend coverage report and browser report are retained for seven days as CI artifacts. The build artifact is not a configured production release.

Node's built-in V8 coverage runner and Vitest enforce these baselines:

| Suite | Lines | Branches | Functions |
| --- | --- | --- | --- |
| Frontend regression logic (Node) | 74% | 82% | 77% |
| Frontend selected pages/components and API client (Vitest) | 85% | 75% | 85% |
| Backend handler and domain modules (Node) | 95% | 85% | 100% |

The frontend regression gate covers modules loaded by the original Node tests. The Vitest gate explicitly includes `ExpensesPage`, `AuthPage`, `ExpenseForm`, `RecentExpenses` and the API client, including unexecuted code in those files. Other frontend pages are outside this coverage scope. Backend coverage includes both application source modules (`app.mjs` and `domain.mjs`), excluding SDK dependencies. Coverage tables appear in the Actions logs; falling below any threshold fails the job. AWS services are simulated locally: these tests do not verify deployed infrastructure, JWT signatures, IAM policies or real DynamoDB behavior.

For a fresh checkout, run `npm ci --prefix frontend` and `npm ci --prefix backend/src` before the validation commands. Install Chromium from the frontend directory with `npx playwright install chromium` (CI uses `--with-deps` on Linux). SAM CLI 1.166.2 is used in CI. To make these checks mandatory before merging, configure the repository ruleset or branch protection to require `Tests, lint and build`, `Browser E2E` and `SAM lint` after the first Actions run. Adding a workflow alone does not enable branch protection.

## Deployment

AWS resources are declared in [`backend/template.yaml`](backend/template.yaml). Backend deployment instructions and frontend upload steps are documented in [`backend/README.md`](backend/README.md).

The deployed development stack is `student-budget-planner-dev` in `eu-west-1`. CloudFormation outputs the generated API URL, Cognito IDs, S3 bucket name, CloudFront distribution ID, and website URL.

## Current scope

Budget and transaction notifications are generated inside the application. Monthly summary email and daily reminder controls currently store preferences only; scheduled email delivery is outside the implemented scope.
