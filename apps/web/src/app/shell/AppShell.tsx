import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../lib/auth/auth-context';
import { MobileNavigationDrawer } from './MobileNavigationDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileNavigationOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavigationOpen]);

  const initials = user?.username.slice(0, 2).toUpperCase() ?? 'OU';

  return (
    <div className={`shell${isMobileNavigationOpen ? ' shell-mobile-open' : ''}`}>
      <MobileNavigationDrawer
        isOpen={isMobileNavigationOpen}
        onClose={() => setIsMobileNavigationOpen(false)}
      />

      <Sidebar />
      <div className="main">
        <header className="mobile-header">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label="Open navigation"
            onClick={() => setIsMobileNavigationOpen(true)}
          >
            ☰
          </button>

          <div className="mobile-header-brand" aria-hidden="true">
            <div className="brand-name">OCTOPUS</div>
            <div className="brand-sub">by Ghost Protocol</div>
          </div>

          <Link className="avatar" to="/profile" aria-label="Open profile">
            {initials}
          </Link>
        </header>

        <TopBar />
        <main className="content">
          <div className="wrap">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
