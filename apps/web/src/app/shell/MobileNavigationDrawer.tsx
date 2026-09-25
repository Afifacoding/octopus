import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../../lib/auth/auth-context';
import { SHELL_NAV_ITEMS } from './navigation';

type MobileNavigationDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function MobileNavigationDrawer(props: MobileNavigationDrawerProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!props.isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.isOpen, props.onClose]);

  const onLogout = async () => {
    await logout();
    props.onClose();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <button
        type="button"
        className={`mobile-drawer-backdrop${props.isOpen ? ' open' : ''}`}
        aria-label="Close navigation backdrop"
        aria-hidden={!props.isOpen}
        tabIndex={props.isOpen ? 0 : -1}
        onClick={props.onClose}
      />

      <aside
        className={`mobile-drawer${props.isOpen ? ' open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!props.isOpen}
      >
        <div className="mobile-drawer-inner">
          <div className="mobile-drawer-top">
            <div>
              <div className="brand-name">OCTOPUS</div>
              <div className="brand-sub">by Ghost Protocol</div>
            </div>
            <button
              type="button"
              className="mobile-nav-close"
              aria-label="Close navigation"
              onClick={props.onClose}
            >
              ✕
            </button>
          </div>

          <NavLink
            className="switcher"
            to="/projects"
            aria-label="Open projects workspace"
            onClick={props.onClose}
          >
            <span className="switcher-left">
              <span className="dot" aria-hidden="true" />
              <span className="switcher-name">{user?.username ?? 'Project Workspace'}</span>
            </span>
            <span className="muted" aria-hidden="true">
              ▾
            </span>
          </NavLink>

          <nav className="nav mobile-drawer-nav">
            {SHELL_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
                onClick={props.onClose}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mobile-logout-wrap">
            <button
              type="button"
              className="mobile-logout"
              aria-label="Logout"
              onClick={() => {
                void onLogout();
              }}
            >
              <span aria-hidden="true">↪</span>
              Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}