// Browser-only Cognito substitute. Imported exclusively by vite.e2e.config.js.
// The test server accepts only these opaque fixture tokens.
const key = 'e2e-identity';
const identities = {
  'alice@example.com': { token: 'test-alice', name: 'Alice Student' },
  'bob@example.com': { token: 'test-bob', name: 'Bob Student' },
};
function identity() {
  const email = sessionStorage.getItem(key);
  if (!Object.hasOwn(identities, email)) throw new Error('No local test session');
  return { email, ...identities[email] };
}
export async function signIn({ username, password }) {
  if (!Object.hasOwn(identities, username) || password !== 'Password1') {
    throw Object.assign(new Error('Invalid fixture account'), { name: 'NotAuthorizedException' });
  }
  sessionStorage.setItem(key, username);
  return { isSignedIn: true };
}
export async function signOut() { sessionStorage.removeItem(key); }
export async function getCurrentUser() { return { username: identity().email }; }
export async function fetchUserAttributes() {
  const user = identity();
  return { email: user.email, name: user.name };
}
export async function fetchAuthSession() {
  return { tokens: { idToken: identity().token } };
}
export async function signUp() { throw new Error('Registration is covered by component tests'); }
export async function confirmSignUp() { throw new Error('Confirmation is covered by component tests'); }
export async function resendSignUpCode() { throw new Error('Resend is covered by component tests'); }
