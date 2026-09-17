import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { budgetApi } from '../services/api';

const links = [
  ['home', 'Home'],
  ['expenses', 'Expenses'],
  ['charts', 'Charts'],
  ['notifications', 'Notifications'],
  ['settings', 'Settings'],
  ['reports', 'Reports'],
];

export default function DashboardLayout() {
  const { dispatch } = useApp();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const logout = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await budgetApi.logout();
      dispatch({ type: 'LOGOUT' });
      navigate('/login');
    } catch (error) {
      setLogoutError(error.message);
      setLoggingOut(false);
    }
  };

  return (
    <div className="app-shell dashboard-bg">
      <div className="dashboard-frame">
        <header className="topbar">
          <div className="brand-row">
            <img src="/assets/logo.png" alt="Student Budget Planner logo" className="brand-icon" />
            <span>Student Budget Planner</span>
          </div>
          <nav className="nav-links">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <button className="ghost-btn small" onClick={logout} disabled={loggingOut}>
            {loggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </header>
        {logoutError ? <p className="form-error centered" role="alert">{logoutError}</p> : null}
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
