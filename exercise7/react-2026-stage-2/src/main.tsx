/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import App, { rootLoader } from './App';
import Login, {
  action as loginAction,
  loader as loginLoader,
} from './pages/Login';
import QuestionEditorPage, {
  action as questionEditorAction,
  loader as questionEditorLoader,
} from './pages/QuestionEditorPage';
import QuestionResultsPage, {
  loader as questionResultsLoader,
} from './pages/QuestionResultsPage';
import QuestionsIndexPage, {
  action as questionsIndexAction,
  loader as questionsIndexLoader,
} from './pages/QuestionsIndexPage';
import QuestionVotePage, {
  action as questionVoteAction,
  loader as questionVoteLoader,
} from './pages/QuestionVotePage';
import Register, {
  action as registerAction,
  loader as registerLoader,
} from './pages/Register';
import RouteErrorBoundary from './pages/RouteErrorBoundary';
import { logoutAction } from './util/auth';

import './index.css';

const Loading = () => (
  <div className="flex min-h-screen items-center justify-center bg-base-200">
    <span className="loading loading-bars loading-lg" />
  </div>
);

const router = createBrowserRouter([
  {
    id: 'root',
    path: '/',
    loader: rootLoader,
    HydrateFallback: Loading,
    ErrorBoundary: RouteErrorBoundary,
    Component: App,
    children: [
      {
        index: true,
        loader: questionsIndexLoader,
        action: questionsIndexAction,
        Component: QuestionsIndexPage,
      },
      {
        path: 'login',
        loader: loginLoader,
        action: loginAction,
        Component: Login,
      },
      {
        path: 'register',
        loader: registerLoader,
        action: registerAction,
        Component: Register,
      },
      {
        path: 'logout',
        action: logoutAction,
        Component: () => <Navigate to="/" replace />,
      },
      {
        path: 'questions/new',
        loader: questionEditorLoader,
        action: questionEditorAction,
        Component: QuestionEditorPage,
      },
      {
        path: 'questions/:id/edit',
        loader: questionEditorLoader,
        action: questionEditorAction,
        Component: QuestionEditorPage,
      },
      {
        path: 'questions/:id/vote',
        loader: questionVoteLoader,
        action: questionVoteAction,
        Component: QuestionVotePage,
      },
      {
        path: 'questions/:id/results',
        loader: questionResultsLoader,
        Component: QuestionResultsPage,
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
