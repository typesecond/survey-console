/* eslint-disable react-refresh/only-export-components */
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import AuthPageLayout from '../components/AuthPageLayout';
import { loginAction, redirectIfAuthenticated } from '../util/auth';

export async function loader({ request }: LoaderFunctionArgs) {
  void request;
  return redirectIfAuthenticated();
}

export async function action(args: ActionFunctionArgs) {
  return loginAction(args);
}

export default function Login() {
  return (
    <AuthPageLayout
      mode="login"
      title="Sign In"
      subtitle="Continue voting, reviewing results, or managing surveys."
      submitLabel="Log In"
      alternateLabel="Need an account?"
      alternateTo="/register"
      alternateAction="Register now"
    />
  );
}
