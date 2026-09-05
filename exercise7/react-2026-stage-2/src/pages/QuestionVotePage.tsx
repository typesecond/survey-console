/* eslint-disable react-refresh/only-export-components */
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import {
  getQueryMessage,
  parseQuestionId,
  redirectToLogin,
  requestJSON,
  requireAuthenticated,
  type ExistingVote,
  type QuestionDetail,
} from '../util/auth';

type QuestionVoteLoaderData = {
  question: QuestionDetail;
  existingVote: ExistingVote | null;
};

export async function loader({
  params,
  request,
}: LoaderFunctionArgs): Promise<QuestionVoteLoaderData> {
  await requireAuthenticated(request);
  const id = parseQuestionId(params.id);

  const [questionResult, voteResult] = await Promise.all([
    requestJSON<QuestionDetail>({
      url: `/api/question/${id}`,
      request,
      authenticated: true,
    }),
    requestJSON<ExistingVote | null>({
      url: `/api/question/${id}/vote`,
      request,
      authenticated: true,
    }),
  ]);

  if (questionResult.isErr) {
    if (questionResult.error.authExpired) {
      throw redirectToLogin(request);
    }
    throw new Response(questionResult.error.message, {
      status: questionResult.error.status,
    });
  }

  if (voteResult.isErr) {
    if (voteResult.error.authExpired) {
      throw redirectToLogin(request);
    }
    throw new Response(voteResult.error.message, {
      status: voteResult.error.status,
    });
  }

  return { question: questionResult.value, existingVote: voteResult.value };
}

export async function action({ params, request }: ActionFunctionArgs) {
  await requireAuthenticated(request);
  const id = parseQuestionId(params.id);
  const formData = await request.formData();
  const choice = Number(formData.get('choice'));

  if (!Number.isInteger(choice)) {
    return { message: 'Select one of the available answer choices.' };
  }

  const result = await requestJSON<{ message: string }>({
    url: `/api/question/${id}/vote`,
    request,
    authenticated: true,
    method: 'POST',
    body: JSON.stringify({ choice }),
  });

  if (result.isErr) {
    if (result.error.authExpired) {
      throw redirectToLogin(request);
    }
    return { message: result.error.message };
  }

  return redirect(
    `/questions/${id}/vote?message=${encodeURIComponent('Vote recorded.')}`,
  );
}

export default function QuestionVotePage() {
  const { question, existingVote } = useLoaderData() as QuestionVoteLoaderData;
  const actionData = useActionData() as { message: string } | undefined;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const pageMessage = getQueryMessage(searchParams);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
            Voting
          </p>
          <h1 className="text-3xl font-bold">{question.question}</h1>
          <p className="mt-2 text-base-content/70">{question.description}</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-ghost" to="/">
            Back
          </Link>
          <Link
            className="btn btn-outline"
            to={`/questions/${question.id}/results`}
          >
            View Results
          </Link>
        </div>
      </div>

      {pageMessage ? (
        <div className="alert alert-success">{pageMessage}</div>
      ) : null}
      {actionData?.message ? (
        <div className="alert alert-error">{actionData.message}</div>
      ) : null}
      {existingVote ? (
        <div className="alert alert-info">
          Your current vote is already recorded. Submitting again will replace
          it.
        </div>
      ) : null}

      <Form
        className="space-y-4 rounded-box bg-base-100 p-6 shadow-sm"
        method="post"
      >
        {question.choices.map((choice) => (
          <label
            key={choice.id}
            className="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-4 transition hover:border-primary"
          >
            <input
              className="radio radio-primary mt-1"
              defaultChecked={choice.id === existingVote?.answerchoiceid}
              name="choice"
              type="radio"
              value={choice.id}
            />
            <div>
              <div className="font-medium">{choice.description}</div>
              <div className="text-sm text-base-content/60">
                Choice #{choice.id}
              </div>
            </div>
          </label>
        ))}

        <div className="flex justify-end">
          <button
            className="btn btn-primary"
            disabled={navigation.state === 'submitting'}
            type="submit"
          >
            {navigation.state === 'submitting'
              ? 'Saving Vote...'
              : 'Submit Vote'}
          </button>
        </div>
      </Form>
    </div>
  );
}
