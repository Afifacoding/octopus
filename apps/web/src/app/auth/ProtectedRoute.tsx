import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { LoadingState } from '../../components/states/LoadingState';
import { useAuth } from '../../lib/auth/auth-context';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Checking session..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
