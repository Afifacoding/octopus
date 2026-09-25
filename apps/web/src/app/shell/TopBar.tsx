import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { SnapshotSearch } from './SnapshotSearch';
import { useAuth } from '../../lib/auth/auth-context';

export function TopBar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const pref = localStorage.getItem('octopus-theme');
    if (pref === 'dark') {
      root.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.toggle('dark');
    const nextDark = root.classList.contains('dark');
    setIsDark(nextDark);
    localStorage.setItem('octopus-theme', nextDark ? 'dark' : 'light');
  };

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.username.slice(0, 2).toUpperCase() ?? 'OU';

  return (
    <header className="header">
      <div>
        <div className="eyebrow">{user?.username ?? 'Project Workspace'}</div>
        <h1>Dashboard</h1>
      </div>

      <div className="header-actions">
        <SnapshotSearch />
        <button className="btn btn-ghost" type="button" onClick={toggleTheme}>
          {isDark ? 'Light' : 'Dark'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onLogout}>
          Sign out
        </button>
        <Link className="avatar" to="/profile" aria-label="Open profile">
          {initials}
        </Link>
      </div>
    </header>
  );
}
