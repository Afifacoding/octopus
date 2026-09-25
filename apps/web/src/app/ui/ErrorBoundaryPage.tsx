import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { ErrorState } from '../../components/states/ErrorState';

export function ErrorBoundaryPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return <ErrorState title={`Error ${error.status}`} message={error.statusText} />;
  }

  return (
    <ErrorState
      title="Unexpected error"
      message="Something went wrong while rendering the page."
    />
  );
}
