import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useSearchParams,
} from 'react-router';

type AuthActionData = {
  message: string;
};

export default function AuthPageLayout({
  mode,
  title,
  subtitle,
  submitLabel,
  alternateLabel,
  alternateTo,
  alternateAction,
}: {
  mode: 'login' | 'register';
  title: string;
  subtitle: string;
  submitLabel: string;
  alternateLabel: string;
  alternateTo: string;
  alternateAction: string;
}) {
  const actionData = useActionData() as AuthActionData | undefined;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const isRegister = mode === 'register';

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-box bg-primary px-8 py-10 text-primary-content shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em]">
          Survey Platform
        </p>
        <h1 className="mt-4 text-4xl font-bold">{title}</h1>
        <p className="mt-4 max-w-xl text-primary-content/80">{subtitle}</p>
        <div className="mt-10 space-y-3 text-sm text-primary-content/80">
          <p>
            Bookmarkable routes are protected and return you to the page you
            wanted after login.
          </p>
          <p>
            Expired access tokens are renewed automatically before protected
            requests are retried.
          </p>
          <p>
            Admins can create, edit, and delete survey questions without leaving
            the app shell.
          </p>
        </div>
      </section>

      <section className="rounded-box bg-base-100 p-8 shadow-sm">
        <Form className="grid gap-4" method="post">
          <label className="form-control w-full gap-2">
            <span className="label-text font-medium">Username</span>
            <input
              className="input input-bordered w-full"
              name="username"
              type="text"
            />
          </label>

          {isRegister ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-control w-full gap-2">
                <span className="label-text font-medium">Full Name</span>
                <input
                  className="input input-bordered w-full"
                  name="fullname"
                  type="text"
                />
              </label>
              <label className="form-control w-full gap-2">
                <span className="label-text font-medium">Email</span>
                <input
                  className="input input-bordered w-full"
                  name="email"
                  type="email"
                />
              </label>
            </div>
          ) : null}

          <label className="form-control w-full gap-2">
            <span className="label-text font-medium">Password</span>
            <input
              className="input input-bordered w-full"
              name="password"
              type="password"
            />
          </label>

          {returnTo ? (
            <input name="returnTo" type="hidden" value={returnTo} />
          ) : null}

          {actionData?.message ? (
            <div className="alert alert-error">{actionData.message}</div>
          ) : null}

          <button
            className="btn btn-primary w-full"
            disabled={navigation.state === 'submitting'}
            type="submit"
          >
            {navigation.state === 'submitting' ? 'Submitting...' : submitLabel}
          </button>
        </Form>

        <p className="mt-6 text-sm text-base-content/70">
          {alternateLabel}{' '}
          <Link
            className="link link-primary font-medium"
            to={
              returnTo
                ? `${alternateTo}?returnTo=${encodeURIComponent(returnTo)}`
                : alternateTo
            }
          >
            {alternateAction}
          </Link>
        </p>
      </section>
    </div>
  );
}
