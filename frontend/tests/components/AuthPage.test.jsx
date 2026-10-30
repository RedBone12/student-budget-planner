import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connectUser: vi.fn(), api: {
  login: vi.fn(), register: vi.fn(), confirmRegistration: vi.fn(), resendRegistrationCode: vi.fn(),
} }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ connectUser: mocks.connectUser }) }));
vi.mock('../../src/services/api', () => ({ budgetApi: mocks.api }));
import AuthPage from '../../src/pages/AuthPage';

beforeEach(() => vi.resetAllMocks());
function renderPage(mode = 'login') {
  return render(<MemoryRouter initialEntries={['/auth']}><Routes>
    <Route path="/auth" element={<AuthPage mode={mode} />} />
    <Route path="/app/home" element={<p>Dashboard ready</p>} />
    <Route path="/login" element={<p>Login destination</p>} />
  </Routes></MemoryRouter>);
}
async function fill(user, register = false) {
  if (register) await user.type(screen.getByLabelText('Full name'), 'Alice Student');
  await user.type(screen.getByLabelText('Email'), 'alice@example.com');
  await user.type(screen.getByLabelText('Password'), 'Password1');
  if (register) await user.type(screen.getByLabelText('Confirm password'), 'Password1');
}
it('logs in, connects the account and navigates to the dashboard', async () => {
  const account = { email: 'alice@example.com', fullName: 'Alice Student' };
  mocks.api.login.mockResolvedValue(account);
  const user = userEvent.setup(); renderPage(); await fill(user);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByText('Dashboard ready')).toBeInTheDocument();
  expect(mocks.connectUser).toHaveBeenCalledWith(account);
});
it('displays an authentication error and allows retry', async () => {
  mocks.api.login.mockRejectedValue(Object.assign(Error('bad credentials'), { name: 'NotAuthorizedException' }));
  const user = userEvent.setup(); renderPage(); await fill(user);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  expect(mocks.connectUser).not.toHaveBeenCalled();
});
it('registers, resends the verification code, handles a rejected code and verifies successfully', async () => {
  mocks.api.register.mockResolvedValue({ requiresConfirmation: true, email: 'alice@example.com' });
  mocks.api.confirmRegistration.mockRejectedValueOnce(Object.assign(Error(), { name: 'CodeMismatchException' }));
  const user = userEvent.setup(); renderPage('register'); await fill(user, true);
  await user.click(screen.getByRole('button', { name: 'Sign up' }));
  expect(await screen.findByText('Check your email')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Send a new code' }));
  expect(await screen.findByRole('status')).toHaveTextContent('A new code was sent');
  await user.type(screen.getByLabelText('Verification code'), '111111');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('That code was rejected');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByText('Login destination')).toBeInTheDocument();
  expect(mocks.api.confirmRegistration).toHaveBeenCalledWith('alice@example.com', '111111');
});
it('shows resend failures and can return to signup', async () => {
  mocks.api.register.mockResolvedValue({ requiresConfirmation: true, email: 'alice@example.com' });
  mocks.api.resendRegistrationCode.mockRejectedValue(Error('Try again later'));
  const user = userEvent.setup(); renderPage('register'); await fill(user, true);
  await user.click(screen.getByRole('button', { name: 'Sign up' }));
  await user.click(await screen.findByRole('button', { name: 'Send a new code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again later');
  await user.click(screen.getByRole('button', { name: 'Back to sign up' }));
  expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
});
it('navigates to login if registration needs no confirmation', async () => {
  mocks.api.register.mockResolvedValue({ requiresConfirmation: false });
  const user = userEvent.setup(); renderPage('register'); await fill(user, true);
  await user.click(screen.getByRole('button', { name: 'Sign up' }));
  expect(await screen.findByText('Login destination')).toBeInTheDocument();
});
