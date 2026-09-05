/* eslint-disable react-refresh/only-export-components */
import { Form, Outlet, useNavigation, useRouteLoaderData } from 'react-router';

import { Navbar, type NavItem } from './components/Navbar';
import { loadOptionalUser, type UserRecord } from './util/auth';

export type RootLoaderData = {
  user: UserRecord | null;
};

const navItems: NavItem[] = [
  {
    id: 'questions',
    label: 'Questions',
    to: '/',
    end: true,
    loggedinonly: true,
  },
  {
    id: 'new-question',
    label: 'Create Question',
    to: '/questions/new',
    adminonly: true,
    loggedinonly: true,
  },
  {
    id: 'login',
    label: 'Login',
    to: '/login',
    end: true,
    guestonly: true,
  },
  {
    id: 'register',
    label: 'Register',
    to: '/register',
    end: true,
    guestonly: true,
  },
];

export async function rootLoader(): Promise<RootLoaderData> {
  return { user: await loadOptionalUser() };
}

function App() {
  const { user } = useRouteLoaderData('root') as RootLoaderData;
  const navigation = useNavigation();
  const effectiveUser = user ?? { fullname: 'Guest' };

  return (
    <div className="min-h-screen bg-base-200">
      <Navbar
        leftHeading="Survey Console"
        navItems={navItems}
        user={effectiveUser}
        rightSlot={
          user ? (
            <Form action="/logout" method="post">
              <button className="btn btn-sm btn-outline" type="submit">
                Log Out
              </button>
            </Form>
          ) : null
        }
      />

      {navigation.state !== 'idle' ? (
        <progress className="progress progress-primary fixed left-0 top-0 z-50 h-1 w-full" />
      ) : null}

      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default App;
