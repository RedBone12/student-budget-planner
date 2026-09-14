import {
  confirmSignUp,
  fetchUserAttributes,
  getCurrentUser,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';

export function validateRegistration({ fullName, email, password, confirmPassword }) {
  if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
    throw new Error('Please complete all fields');
  }
  if (password !== confirmPassword) throw new Error('Passwords do not match');
  if (password.length < 8) throw new Error('Password must contain at least 8 characters');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Password must include uppercase, lowercase and a number');
  }
}

export const authService = {
  async register(form) {
    validateRegistration(form);
    const email = form.email.trim().toLowerCase();
    const fullName = form.fullName.trim();
    const result = await signUp({
      username: email,
      password: form.password,
      options: {
        userAttributes: { email, name: fullName },
      },
    });
    return {
      email,
      requiresConfirmation: result.nextStep.signUpStep === 'CONFIRM_SIGN_UP',
    };
  },

  async confirmRegistration(email, confirmationCode) {
    const code = confirmationCode.trim();
    if (!code) throw new Error('Please enter the verification code');
    await confirmSignUp({ username: email.trim().toLowerCase(), confirmationCode: code });
  },

  async resendRegistrationCode(email) {
    const username = email.trim().toLowerCase();
    if (!username) throw new Error('Please enter your email address');
    await resendSignUpCode({ username });
  },

  async login({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new Error('Please enter registered email address/password');
    }
    const result = await signIn({ username: normalizedEmail, password });
    if (!result.isSignedIn) {
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        throw new Error('Please verify your email address before logging in');
      }
      throw new Error('Additional sign-in verification is required');
    }
    return currentSessionUser();
  },

  currentUser: currentSessionUser,
  logout: () => signOut(),
};

export function authErrorMessage(error) {
  switch (error?.name) {
    case 'CodeMismatchException':
      return 'That code was rejected. Use the newest code from your email, or go to log in if verification already succeeded.';
    case 'ExpiredCodeException':
      return 'That code has expired. Request a new verification code.';
    case 'UsernameExistsException':
      return 'An account with this email already exists. Try logging in.';
    case 'NotAuthorizedException':
      return String(error.message).includes('CONFIRMED')
        ? 'This account is already verified. You can log in now.'
        : 'Incorrect email or password.';
    default:
      return error?.message || 'Something went wrong. Please try again.';
  }
}

async function currentSessionUser() {
  await getCurrentUser();
  const attributes = await fetchUserAttributes();
  return {
    fullName: attributes.name || attributes.email || 'Student',
    email: attributes.email || '',
  };
}
