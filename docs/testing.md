# Testing

Use Node.js 24.13.0. No AWS credentials, cloud resources or real user accounts are needed.

## Run locally (PowerShell)

From the repository root:

```powershell
npm ci --prefix frontend
npm ci --prefix backend/src
npm --prefix frontend test
npm --prefix backend/src test
npm --prefix frontend run lint
npm --prefix frontend run coverage
npm --prefix backend/src run coverage
npm --prefix frontend run build

Push-Location frontend
npx playwright install chromium
Pop-Location
npm --prefix frontend run test:e2e
```

Success means zero failed tests, both coverage commands exit with code 0, and Playwright reports `1 passed`. E2E starts and stops its own local API and Vite servers on `127.0.0.1:4174` and `127.0.0.1:4173`. Both ports must be free. It does not reuse an existing application server.

## Coverage and test layers

| Layer | Tests | What is exercised |
| --- | ---: | --- |
| Original frontend Node regression suite | 11 | Reducer, validation, dates, statistics, storage and account state |
| React Testing Library + user-event | 12 | Real expense/auth pages, forms, tables, reducer updates, validation, add/edit/cancel/reset/delete, pending-save protection, API failure messages, login, signup, resend and verification |
| Frontend API client | 6 | Real HTTP requests through the Lambda handler, CRUD, bearer headers, path encoding, session failure, invalid input; mocked fetch for network failures and unusual response formats |
| Backend domain | 5 | Partition keys, cent conversion, domain validation and JSON parsing |
| Lambda handler | 9 | All ten routes, Cognito subject validation and owner isolation, ignored forged body ownership, conditional writes, linked-category protection, settings, invalid JSON/body shapes and safe DynamoDB errors |
| HTTP API integration | 2 | Real Node HTTP server to real handler to simulated DynamoDB commands; request/response status, JSON, authentication boundary, CRUD, user isolation and storage outage |
| Chromium E2E | 1 | Protected route redirect, login, create/edit expense, reload persistence, switch accounts, delete, reload and logout |

The page tests render actual React components using accessible labels and roles. The expense page uses the real reducer in a small test context; its API calls are mocked so failures and pending requests can be controlled. Authentication page tests simulate authentication responses and assert navigation and errors.

`npm --prefix frontend run test:components` runs just the 12 page tests. `npm --prefix frontend run test:integration` runs the 6 API client tests. `npm --prefix frontend test` runs all 29 non-browser frontend tests. `npm --prefix backend/src test` runs all 16 backend tests.

`npm --prefix frontend run coverage` keeps the original logic coverage gate and adds Vitest V8 coverage over five explicitly listed files: the expense/auth pages, expense form/table and API client. Reports are written to `frontend/coverage` (HTML and LCOV). This is scoped coverage, not coverage of every frontend page. Backend coverage includes the real handler and domain modules; SDK dependencies are excluded.

## Local integration boundaries

`backend/src/app.mjs` exports the production `handler` and a `createHandler` factory. Production still constructs a reusable AWS SDK client; tests inject a local client at the DynamoDB command boundary. The memory implementation in `backend/tests/support/local-api.mjs` exercises partition ownership and conditional-write handling without AWS calls. It is a test double, not DynamoDB Local, and cannot prove AWS SDK serialization, service-specific behavior or IAM permissions.

The local HTTP adapter converts HTTP requests into API Gateway v2-style events and invokes the real handler. Fixed opaque fixture tokens map to Alice and Bob at this simulated gateway boundary. Tests verify the handler uses `requestContext.authorizer.jwt.claims.sub` and rejects missing or malformed subjects; they do not validate token signatures, expiry, issuer or audience. Production JWT verification remains API Gateway's responsibility.

Browser E2E runs the actual React application, auth/API services, HTTP adapter and Lambda handler. Only Cognito SDK calls and DynamoDB storage are substituted. The separate `vite.e2e.config.js` supplies local-only configuration and an auth fixture; it refuses production builds. Normal `vite.config.js` never imports these fixtures. The browser journey blocks non-local network requests.

Tests also cover two input-hardening fixes: JSON `null`, arrays and primitive request bodies now return 400, and non-string or whitespace-only subjects are rejected before a database request. No AWS infrastructure is modified by the test harness.

## CI

The quality job runs frontend regression/page/API coverage, backend domain/handler/HTTP coverage, ESLint and the production frontend build. The independent `Browser E2E` job installs Chromium and runs the local journey. HTML coverage and browser reports are uploaded; failed browser runs include a screenshot and trace for diagnosis.

Cloud-backed acceptance testing (deployed Cognito/API Gateway, real DynamoDB and IAM) remains a separate activity. This suite does not claim that those services have been validated live.
