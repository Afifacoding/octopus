import { NavLink } from 'react-router-dom';

import { useAuth } from '../../lib/auth/auth-context';
import { SHELL_NAV_ITEMS } from './navigation';

export function Sidebar(options?: { onNavigate?: () => void }) {
  const { user } = useAuth();

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand">
        <div className="logo" aria-hidden="true">
          OCTO
        </div>
        <div>
          <div className="brand-name">OCTOPUS</div>
          <div className="brand-sub">by Ghost Protocol</div>
        </div>
      </div>

      <NavLink className="switcher" to="/projects" aria-label="Open projects workspace">
        <span className="switcher-left">
          <span className="dot" aria-hidden="true" />
          <span className="switcher-name">{user?.username ?? 'Project Workspace'}</span>
        </span>
        <span className="muted" aria-hidden="true">
          ▾
        </span>
      </NavLink>

      <nav className="nav">
        {SHELL_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
            onClick={options?.onNavigate}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
