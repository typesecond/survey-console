import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export default function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-box bg-base-100 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-error">
          {error.status}
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {error.statusText || 'Request Failed'}
        </h1>
        <p className="mt-3 text-base-content/70">
          {typeof error.data === 'string'
            ? error.data
            : 'The requested page could not be loaded.'}
        </p>
        <div className="mt-6">
          <Link className="btn btn-primary" to="/">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-box bg-base-100 p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-error">
        Unexpected
      </p>
      <h1 className="mt-2 text-3xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-base-content/70">
        {error instanceof Error ? error.message : 'An unknown error occurred.'}
      </p>
      <div className="mt-6">
        <Link className="btn btn-primary" to="/">
          Return Home
        </Link>
      </div>
    </div>
  );
}
