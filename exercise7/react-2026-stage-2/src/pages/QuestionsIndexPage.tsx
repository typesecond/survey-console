/* eslint-disable react-refresh/only-export-components */
import { Link, useFetcher, useLoaderData, useSearchParams } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import {
  ensureAdmin,
  getQueryMessage,
  parsePositiveInt,
  redirectToLogin,
  requestJSON,
  requireAuthenticated,
  type QuestionSummary,
} from '../util/auth';

type QuestionsIndexLoaderData = {
  page: number;
  limit: number;
  count: number;
  questions: QuestionSummary[];
  isAdmin: boolean;
};

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<QuestionsIndexLoaderData> {
  const user = await requireAuthenticated(request);
  const url = new URL(request.url);
  const page = parsePositiveInt(url.searchParams.get('page'), 1);
  const limit = 10;

  const result = await requestJSON<{
    questions: QuestionSummary[];
    count: number;
  }>({
    url: `/api/question?page=${page}&limit=${limit}`,
    request,
    authenticated: true,
  });

  if (result.isErr) {
    if (result.error.authExpired) {
      throw redirectToLogin(request);
    }
    throw new Response(result.error.message, { status: result.error.status });
  }

  return {
    page,
    limit,
    count: result.value.count,
    questions: result.value.questions,
    isAdmin: user.role === 'admin',
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await ensureAdmin(request);

  const data = await request.formData();
  const id = String(data.get('id') ?? '');
  if (!id) {
    return { ok: false, message: 'Question id is required.' };
  }

  const result = await requestJSON<{ message: string }>({
    url: `/api/question/${id}`,
    request,
    authenticated: true,
    method: 'DELETE',
  });

  if (result.isErr) {
    if (result.error.authExpired) {
      throw redirectToLogin(request);
    }
    return { ok: false, message: result.error.message };
  }

  return { ok: true, message: 'Question deleted.' };
}

export default function QuestionsIndexPage() {
  const { page, limit, count, questions, isAdmin } =
    useLoaderData() as QuestionsIndexLoaderData;
  const [searchParams] = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const listMessage = getQueryMessage(searchParams);
  const deleteFetcher = useFetcher<{ ok: boolean; message: string }>();

  return (
    <div className="space-y-6">
      <section className="hero rounded-box bg-base-100 shadow-sm">
        <div className="hero-content flex-col items-start gap-4 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
              Live Polling
            </p>
            <h1 className="text-3xl font-bold">Available Questions</h1>
            <p className="mt-2 max-w-2xl text-base-content/70">
              Browse active survey prompts, vote on a question, or inspect the
              current totals.
            </p>
          </div>
          {isAdmin ? (
            <Link className="btn btn-primary" to="/questions/new">
              New Question
            </Link>
          ) : null}
        </div>
      </section>

      {listMessage ? (
        <div className="alert alert-success">{listMessage}</div>
      ) : null}
      {deleteFetcher.data?.message ? (
        <div
          className={`alert ${deleteFetcher.data.ok ? 'alert-success' : 'alert-error'}`}
        >
          {deleteFetcher.data.message}
        </div>
      ) : null}

      <section className="grid gap-4">
        {questions.length === 0 ? (
          <div className="rounded-box bg-base-100 p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold">No questions yet</h2>
            <p className="mt-2 text-base-content/70">
              {isAdmin
                ? 'Create the first survey question to start collecting votes.'
                : 'An administrator has not published any questions yet.'}
            </p>
          </div>
        ) : (
          questions.map((question) => (
            <article
              key={question.id}
              className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="badge badge-outline">
                    Question #{question.id}
                  </div>
                  <h2 className="text-xl font-semibold">{question.question}</h2>
                  <p className="text-base-content/70">{question.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="btn btn-primary btn-sm"
                    to={`/questions/${question.id}/vote`}
                  >
                    Vote
                  </Link>
                  <Link
                    className="btn btn-outline btn-sm"
                    to={`/questions/${question.id}/results`}
                  >
                    Results
                  </Link>
                  {isAdmin ? (
                    <>
                      <Link
                        className="btn btn-outline btn-sm"
                        to={`/questions/${question.id}/edit`}
                      >
                        Edit
                      </Link>
                      <ConfirmDeleteDialog
                        fetcher={deleteFetcher}
                        questionId={question.id}
                        questionLabel={question.question}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="flex flex-col items-center justify-between gap-3 rounded-box bg-base-100 p-4 shadow-sm sm:flex-row">
        <p className="text-sm text-base-content/70">
          Showing page {page} of {totalPages} ({count} total questions)
        </p>
        <div className="join">
          <Link
            className={`join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}`}
            to={`/?page=${page - 1}`}
          >
            Previous
          </Link>
          <Link
            className={`join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}`}
            to={`/?page=${page + 1}`}
          >
            Next
          </Link>
        </div>
      </section>
    </div>
  );
}
