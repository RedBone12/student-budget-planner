import { Amplify } from 'aws-amplify';

export const awsEnvironment = {
  region: import.meta.env.VITE_AWS_REGION,
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
};

export function configureAws() {
  const missing = Object.entries(awsEnvironment)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing AWS frontend configuration: ${missing.join(', ')}`);
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: awsEnvironment.userPoolId,
        userPoolClientId: awsEnvironment.userPoolClientId,
        loginWith: { email: true },
        signUpVerificationMethod: 'code',
        userAttributes: {
          email: { required: true },
          name: { required: true },
        },
        passwordFormat: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialCharacters: false,
        },
      },
    },
  });
}
