export type NavigationItem = {
  label: string;
  path: string;
};

export const SHELL_NAV_ITEMS: NavigationItem[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Projects', path: '/projects' },
  { label: '🐙 Octo', path: '/octo' },
  { label: 'Profile', path: '/profile' },
  { label: 'Integration Guide', path: '/integration-guide' },
  { label: 'Support', path: '/support' },
  { label: 'Settings', path: '/settings' },
];