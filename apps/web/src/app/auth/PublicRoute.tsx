import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';

import { LoadingState } from '../../components/states/LoadingState';
import { useAuth } from '../../lib/auth/auth-context';

export function PublicRoute({ children }: { children: ReactElement }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState label="Checking session..." />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}
