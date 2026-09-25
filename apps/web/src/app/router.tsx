import { createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute } from './auth/ProtectedRoute';
import { PublicRoute } from './auth/PublicRoute';
import { AppShell } from './shell/AppShell';
import { ErrorBoundaryPage } from './ui/ErrorBoundaryPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { OctoPage } from '../pages/OctoPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { ProjectDetailsPage } from '../pages/ProjectDetailsPage';
import { ProjectSecretsPage } from '../pages/ProjectSecretsPage';
import { SnapshotBlueprintPage } from '../pages/SnapshotBlueprintPage';
import { SnapshotDirectoryTreePage } from '../pages/SnapshotDirectoryTreePage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SnapshotDetailsPage } from '../pages/SnapshotDetailsPage';
import { SignupPage } from '../pages/SignupPage';
import { VerificationPendingPage } from '../pages/VerificationPendingPage';
import { VerifyEmailPage } from '../pages/VerifyEmailPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
    errorElement: <ErrorBoundaryPage />,
  },
  {
    path: '/signup',
    element: (
      <PublicRoute>
        <SignupPage />
      </PublicRoute>
    ),
    errorElement: <ErrorBoundaryPage />,
  },
  {
    path: '/verify-email',
    element: <VerifyEmailPage />,
    errorElement: <ErrorBoundaryPage />,
  },
  {
    path: '/verification-pending',
    element: <VerificationPendingPage />,
    errorElement: <ErrorBoundaryPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundaryPage />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'octo',
        element: <OctoPage />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: 'projects',
        element: <ProjectsPage />,
      },
      {
        path: 'projects/:projectId',
        element: <ProjectDetailsPage />,
      },
      {
        path: 'projects/:projectId/snapshots/:snapshotId',
        element: <SnapshotDetailsPage />,
      },
      {
        path: 'projects/:projectId/snapshots/:snapshotId/directory',
        element: <SnapshotDirectoryTreePage />,
      },
      {
        path: 'projects/:projectId/snapshots/:snapshotId/blueprint',
        element: <SnapshotBlueprintPage />,
      },
      {
        path: 'projects/:projectId/secrets',
        element: <ProjectSecretsPage />,
      },
      {
        path: 'integration-guide',
        element: (
          <PlaceholderPage
            title="Integration Guide"
            description="Extension integration workflows will be expanded in extension phases."
          />
        ),
      },
      {
        path: 'support',
        element: (
          <PlaceholderPage
            title="Support"
            description="Support and help content will be added in later phases."
          />
        ),
      },
      {
        path: 'settings',
        element: (
          <PlaceholderPage
            title="Settings"
            description="Settings modules will be implemented incrementally in future phases."
          />
        ),
      },
    ],
  },
]);
