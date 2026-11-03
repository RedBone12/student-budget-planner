# AI spending insights

Dashboard provides an explicit **Analyze this month** action. Opening the page does not call a model. Lambda derives the user partition from Cognito claims and loads the user's records; caller-supplied financial facts are ignored.

## Evidence and interpretation

`backend/src/insights.mjs` calculates integer-cent totals for the current UTC month through today and compares them with the same calendar days in the preceding month. It also calculates averages over the previous three complete calendar months. Missing records count as zero, not proof of zero spending.

Candidate findings are budget usage at or above 80%, spending increases of at least 25% and EUR 10 versus the comparable prior period, and current entries at least three times the historical category median and at least EUR 20. Unusual-entry checks require at least five earlier entries across the preceding three complete months. This detects differences, not causes, waste or fraud.

An optional budget adjustment requires recorded spending in all three earlier months and an average above the current limit. The proposed amount is that average rounded up to the next EUR 5. Historical spending does not establish affordability. The UI requires confirmation before using the existing authenticated category-update endpoint. No budget changes happen during analysis.

Up to twelve candidate evidence items are provided to the model. It selects up to three findings and three suggestions and writes short explanations. Numeric results are displayed from application calculations. Model explanations cannot contain digits, currency symbols, percentages or HTML; evidence references, lengths, counts and duplicates are validated. Invalid responses are discarded. These constraints reduce unsupported claims; they do not prove semantic accuracy, so users can inspect the underlying evidence and matching expense list.

## Provider and data boundary

The adapter uses the Bedrock Converse API and `eu.amazon.nova-micro-v1:0`, with its EU inference profile. IAM permits only this profile and its listed Nova Micro foundation-model ARNs. No API key is stored. `AiModelId` can be set to an empty string to disable model calls.

Only anonymous evidence IDs, kinds, counts and monetary aggregates enter the model request. Category names, category/expense IDs, individual transaction amounts/dates, notes, raw transaction lists, email and Cognito subjects are excluded. Evidence-to-record mapping stays inside the user's partition and browser. The frontend explains this boundary before the request. Cross-region inference can route within the profile's EU regions.

## Cost, caching and failures

Each account gets at most three generation attempts per UTC day, enforced by conditional DynamoDB writes. Attempts that fail still consume a slot. A fingerprint includes the current day, model, calculation version and evidence; an identical successful analysis is reused for up to 24 hours without another generation attempt. A conditional 30-second lease suppresses concurrent identical requests. The SDK has one attempt, a 15-second abort timeout and a 900-token output limit. This is a per-account limit, not a global spending cap.

Cache and quota records use the DynamoDB TTL attribute `expiresAt`; expired cache entries are ignored even before asynchronous TTL deletion. Displayed results are cleared after source data/account changes, and late results are discarded. Analysis cannot override user isolation.

No data/threshold match, pending requests, daily limits and unavailable providers have separate UI messages. Provider failures or malformed responses show calculated evidence explicitly labeled as non-AI. Logs retain only the task and error type, not financial payloads or model content.

## Validation and live status

Local tests inject a model client to verify privacy boundaries, time periods, validation, cache ownership/invalidation, quotas, database failures, UI confirmation and stale responses. Browser E2E uses a deterministic local model fixture and cannot prove real model quality or provider access.

On 2026-11-03 a real Converse attempt with synthetic evidence was rejected by AWS with `AccessDeniedException`: the account was being verified, normally taking less than two hours according to the returned message. This is an AWS account eligibility check, not a successful model invocation. Deployment and fallback verification can complete while this is pending. Retry a synthetic live invocation after verification; do not report model generation as verified until it succeeds. If AWS continues to reject it beyond the stated interval, follow the account-verification support instructions returned by AWS.

Provider reference: [Amazon Nova Micro model documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-micro.html).
