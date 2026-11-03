# Budget planning

## Filters and imports

Expenses combine category, inclusive date range and minimum/maximum euro amounts. Reports apply the same filters to their displayed data and PDF exports.

Planning accepts CSV with the exact header `date,category,amount,notes`. Dates use `YYYY-MM-DD`, cannot be in the future, and amounts must be positive euro values with at most two decimal places. Categories must already belong to the signed-in account. Quoted commas, newlines, escaped quotes, UTF-8 BOM and CRLF are supported. Files are limited to 1 MB and 50 rows. Bank-specific statements and PDF bank imports are not supported.

The browser previews and validates rows before confirmation. The API revalidates all rows and commits the batch and its import receipt in one DynamoDB transaction. Retrying the same import ID returns its original result; reusing that ID with different content fails. Matching date/category/amount/notes rows are skipped by default; the user can explicitly allow duplicates. A fresh upload is a new import, so keep duplicate skipping enabled when uploading a file again.

## Monthly budgets and settlements

Dashboard totals and budget alerts use the current UTC calendar month. Planning can close a completed month and keeps an immutable snapshot of category budgets, spending and transaction counts, including spending in deleted categories. Budget limits are the limits at closing time; historical budget versions are not reconstructed. Later expense or budget edits do not rewrite a closed snapshot.

The daily maintenance task closes the previous month on the first UTC day of each month. Users can close a missed month manually.

## Recurring expenses

Create weekly or monthly schedules with a first due date, optional end date, category, amount and notes. Monthly schedules clamp to the last day of a short month and retain the original anchor day for later months. Each schedule catches up at most 24 entries per invocation. Pausing retains the next due date; resuming catches up missed entries. Removing a schedule retains its generated expenses. Categories referenced by schedules cannot be deleted until those schedules are removed.

Each occurrence and schedule advancement are written in one transaction with conditional writes. Concurrent/retried invocations cannot create the same occurrence twice. The Planning page also provides an explicit run-now action.

## Scheduled email

EventBridge invokes the existing Lambda daily at **09:00 UTC**. It generates due expenses, closes the previous month on the first day, and sends enabled daily reminders, monthly summaries and category budget alerts at the 80% and 100% thresholds. This is 09:00 London time in winter and 10:00 in summer.

Email requires a new explicit master opt-in in Settings. Existing preference flags alone never enable delivery. The destination comes from verified Cognito email claims, not a request-supplied address. Deployment takes the sender from the GitHub Actions secret `AWS_MAIL_SENDER` and supplies it to the SAM `MailSender` parameter. An empty sender disables email availability.

The stack defaults to SES sandbox mode. Both sender and recipient need SES verification; Cognito verification alone is insufficient. After AWS grants SES production access, change the `SesSandbox` deployment parameter and enrollment checks accordingly. Do not remove this check while the account remains in the sandbox.

Per-user delivery records suppress repeated daily/monthly/threshold messages. A failed SES request records `FAILED` and may be retried by a scheduled invocation retry. Once SES accepts a message, the UI reports provider acceptance rather than guaranteed inbox delivery. An uncertain outcome after acceptance remains `SENDING` and suppresses automatic duplicate sends; exactly-once delivery is not claimed. No bounce/complaint ingestion is implemented.

EventBridge retries failed invocations twice within one hour. Review Lambda/CloudWatch failures for missed work; a failed first-day run beyond the retry window needs a manual month close. The personal-scale implementation scans table partition keys daily and queries each account. Larger deployments should use a dedicated account index and queued per-account jobs.

## Deployment verification

Before deploying this change, update the scoped CloudFormation execution role using `scripts/bootstrap-oidc.ps1 -Profile <authenticated-profile> -Deploy`. This adds permission for the exact development EventBridge rule. Configure `AWS_MAIL_SENDER` as a repository secret, then let the normal CI/OIDC deployment run. Verify the rule `student-budget-planner-daily-dev` is enabled, targets the application Lambda and uses `cron(0 9 * * ? *)`. Check the Lambda sender configuration and SES verification without printing secrets. A successful plain SES test proves provider acceptance, not the scheduled path; the scheduled path also needs rule/configuration verification and monitoring after its next run.
