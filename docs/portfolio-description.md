# Portfolio and CV wording

## Project title

**Student Budget Planner — Team React and AWS Serverless Project**

Live application: https://d3051uxkdikknp.cloudfront.net

## CV version

- Collaborated on a team project and took ownership of the React frontend, implementing expense CRUD, category budgets, dashboards, charts, notifications, filtering, responsive layouts, and PDF export.
- Modified and extended a teammate's backend foundation to integrate Cognito authentication, authenticated API Gateway and Lambda routes, and per-user DynamoDB persistence.
- Configured and deployed the AWS infrastructure with SAM/CloudFormation, serving the frontend over HTTPS through CloudFront and a private S3 bucket protected by Origin Access Control.
- Integrated and debugged the frontend-backend data flow, added input and authentication safeguards, and maintained a 16-test regression suite with a successful production build.

## Short CV version

Collaborated on a team budgeting project, taking ownership of the React frontend and later modifying a teammate's backend foundation for AWS deployment. Integrated Cognito, API Gateway, Lambda, DynamoDB, private S3, CloudFront, and SAM to deliver authenticated cloud persistence, expense tracking, charts, PDF reports, and 16 automated regression tests.

## LinkedIn project description

I worked in a team to develop a full-stack application for managing student expenses and category budgets. I was responsible for the React frontend, including expense CRUD, dashboards, charts, notification preferences, report filtering, responsive layouts, and PDF export.

I modified and extended the backend foundation created by a teammate to complete the AWS integration. The deployed version uses Cognito for email verification and sign-in, API Gateway for JWT-protected routes, Lambda for validation and business logic, and DynamoDB for user-isolated data. I configured the cloud resources in AWS SAM/CloudFormation and deployed the frontend through CloudFront with a private S3 origin. I also completed frontend-backend integration, deployment debugging, route rewriting, CORS configuration, validation, and cost monitoring.

## 中文说明

参与团队预算管理项目，主要负责 React 前端开发，实现支出增删改查、分类预算、仪表盘、图表、通知、筛选、响应式布局和 PDF 报告。在队友已有后端的基础上进行修改和扩展，接入 Cognito、API Gateway、Lambda 和 DynamoDB，完成按用户隔离的云端数据存储；使用 AWS SAM/CloudFormation 配置基础设施，并通过 CloudFront 和私有 S3 完成 HTTPS 部署及前后端联调。

## Verified evidence

- Public CloudFront application responds successfully over HTTPS.
- Cognito registration, email verification, login, and session restoration were exercised in the deployed application.
- Expense data was confirmed to remain after a production-page refresh.
- CloudFormation stack status was `UPDATE_COMPLETE` after deployment.
- The automated test suite passed 16 of 16 tests and the Vite production build completed successfully.

Ownership statement: this is a team project. My primary contribution was the frontend. The backend foundation was created by a teammate; my contribution also included modifying and extending that foundation for AWS integration, deployment, frontend-backend debugging, and validation.
