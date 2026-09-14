import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { budgetApi } from '../services/api';
import { authErrorMessage } from '../services/auth';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState('');
  const confirmationInFlight = useRef(false);
  const { connectUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) {
        const result = await budgetApi.register(form);
        if (result.requiresConfirmation) {
          setConfirmationEmail(result.email);
          setForm((previous) => ({ ...previous, password: '', confirmPassword: '' }));
          return;
        }
        navigate('/login', { state: { message: 'Account created. You can now log in.' } });
      } else {
        const user = await budgetApi.login(form);
        await connectUser(user);
        navigate('/app/home');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmation = async (event) => {
    event.preventDefault();
    if (confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setError('');
    setSubmitting(true);
    try {
      await budgetApi.confirmRegistration(confirmationEmail, confirmationCode);
      navigate('/login', { state: { message: 'Email verified. You can now log in.' } });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      confirmationInFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setStatus('');
    setResending(true);
    try {
      await budgetApi.resendRegistrationCode(confirmationEmail);
      setConfirmationCode('');
      setStatus('A new code was sent. Only the newest code will work.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  if (confirmationEmail) {
    return (
      <div className="app-shell register-bg">
        <div className="auth-card compact">
          <h2>Check your email</h2>
          <p className="auth-help">Enter the verification code sent to {confirmationEmail}.</p>
          <form onSubmit={handleConfirmation} className="auth-form">
            <label>
              <span>Verification code</span>
              <input
                name="confirmationCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={confirmationCode}
                onChange={(event) => setConfirmationCode(event.target.value)}
                required
              />
            </label>
            {error ? <p className="form-error centered" role="alert">{error}</p> : null}
            {status ? <p className="form-success" role="status">{status}</p> : null}
            <button className="primary-btn full-width" type="submit" disabled={submitting}>
              {submitting ? 'Verifying…' : 'Verify email'}
            </button>
          </form>
          <button className="ghost-btn" type="button" onClick={handleResend} disabled={submitting || resending}>
            {resending ? 'Sending…' : 'Send a new code'}
          </button>
          <Link className="ghost-btn" to="/login">Go to log in</Link>
          <button className="ghost-btn" type="button" onClick={() => setConfirmationEmail('')}>
            Back to sign up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${isRegister ? 'register-bg' : 'login-bg'}`}>
      <div className={`auth-card ${isRegister ? 'compact' : 'wide'}`}>
        {!isRegister ? <h1>Student Budget Planner</h1> : null}
        <h2>{isRegister ? 'Create Account' : 'Log in'}</h2>
        {!isRegister && location.state?.message ? <p className="form-success" role="status">{location.state.message}</p> : null}
        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister ? <label><span>Full name</span><input name="fullName" autoComplete="name" value={form.fullName} onChange={handleChange} required /></label> : null}
          <label><span>Email</span><input name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} required /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={handleChange} required /></label>
          {isRegister ? <label><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={handleChange} required /></label> : null}
          {error ? <p className="form-error centered" role="alert">{error}</p> : null}
          <button className="primary-btn full-width" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : isRegister ? 'Sign up' : 'Log in'}
          </button>
        </form>
        <div className="auth-footer">
          <span>or</span>
          <p>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Log in' : 'Sign up'}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
