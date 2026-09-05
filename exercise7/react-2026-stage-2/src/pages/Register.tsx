/* eslint-disable react-refresh/only-export-components */
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import AuthPageLayout from '../components/AuthPageLayout';
import { redirectIfAuthenticated, registerAction } from '../util/auth';

export async function loader({ request }: LoaderFunctionArgs) {
  void request;
  return redirectIfAuthenticated();
}

export async function action(args: ActionFunctionArgs) {
  return registerAction(args);
}

export default function Register() {
  return (
    <AuthPageLayout
      mode="register"
      title="Create Account"
      subtitle="Register a user account and start answering questions immediately."
      submitLabel="Register"
      alternateLabel="Already registered?"
      alternateTo="/login"
      alternateAction="Log in"
    />
  );
}
