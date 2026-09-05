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
import { useState } from 'react';

import {
  collectChoiceFields,
  ensureAdmin,
  getQueryMessage,
  parseQuestionId,
  redirectToLogin,
  requestJSON,
  type QuestionDetail,
} from '../util/auth';

type QuestionEditorLoaderData = {
  mode: 'create' | 'edit';
  question: QuestionDetail | null;
};

type QuestionEditorActionData = {
  message: string;
};

export async function loader({
  params,
  request,
}: LoaderFunctionArgs): Promise<QuestionEditorLoaderData> {
  await ensureAdmin(request);

  if (!params.id) {
    return { mode: 'create', question: null };
  }

  const id = parseQuestionId(params.id);
  const result = await requestJSON<QuestionDetail>({
    url: `/api/question/${id}`,
    request,
    authenticated: true,
  });

  if (result.isErr) {
    if (result.error.authExpired) {
      throw redirectToLogin(request);
    }
    throw new Response(result.error.message, { status: result.error.status });
  }

  return { mode: 'edit', question: result.value };
}

export async function action({ params, request }: ActionFunctionArgs) {
  await ensureAdmin(request);

  const formData = await request.formData();
  const question = String(formData.get('question') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const choices = collectChoiceFields(formData);

  if (!question || !description) {
    return { message: 'Question and description are required.' };
  }
  if (choices.length === 0) {
    return { message: 'At least one answer choice is required.' };
  }

  const payload = JSON.stringify({ question, description, choices });
  const isEdit = Boolean(params.id);
  const id = params.id ? parseQuestionId(params.id) : null;

  const result = await requestJSON<{ id?: number; message: string }>({
    url: isEdit ? `/api/question/${id}` : '/api/question',
    request,
    authenticated: true,
    method: isEdit ? 'PUT' : 'POST',
    body: payload,
  });

  if (result.isErr) {
    if (result.error.authExpired) {
      throw redirectToLogin(request);
    }
    return { message: result.error.message };
  }

  const destination = isEdit
    ? `/questions/${id}/edit?message=${encodeURIComponent('Question updated.')}`
    : `/questions/${result.value.id}/edit?message=${encodeURIComponent('Question created.')}`;
  return redirect(destination);
}

export default function QuestionEditorPage() {
  const { mode, question } = useLoaderData() as QuestionEditorLoaderData;
  const actionData = useActionData() as QuestionEditorActionData | undefined;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [choices, setChoices] = useState(
    question?.choices.map((choice, index) => ({
      key: `${choice.id}-${index}`,
      value: choice.description,
    })) ?? [
      { key: 'choice-1', value: '' },
      { key: 'choice-2', value: '' },
    ],
  );

  const pageMessage = getQueryMessage(searchParams);
  const isSubmitting = navigation.state === 'submitting';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
            Admin
          </p>
          <h1 className="text-3xl font-bold">
            {mode === 'create' ? 'Create Question' : 'Edit Question'}
          </h1>
          <p className="mt-2 text-base-content/70">
            Build the prompt, update its description, and manage answer choices
            in order.
          </p>
        </div>
        <Link className="btn btn-ghost" to="/">
          Back to List
        </Link>
      </div>

      {pageMessage ? (
        <div className="alert alert-success">{pageMessage}</div>
      ) : null}
      {actionData?.message ? (
        <div className="alert alert-error">{actionData.message}</div>
      ) : null}

      <Form
        className="space-y-6 rounded-box bg-base-100 p-6 shadow-sm"
        method="post"
      >
        <div className="grid gap-6">
          <label className="form-control gap-2">
            <span className="label-text font-medium">Question</span>
            <input
              className="input input-bordered"
              defaultValue={question?.question ?? ''}
              name="question"
              placeholder="What should people vote on?"
              type="text"
            />
          </label>

          <label className="form-control gap-2">
            <span className="label-text font-medium">Description</span>
            <textarea
              className="textarea textarea-bordered min-h-28"
              defaultValue={question?.description ?? ''}
              name="description"
              placeholder="Add context or instructions for the poll."
            />
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Answer Choices</span>
              <button
                className="btn btn-sm btn-outline"
                onClick={() =>
                  setChoices((current) => [
                    ...current,
                    { key: `choice-${crypto.randomUUID()}`, value: '' },
                  ])
                }
                type="button"
              >
                Add Choice
              </button>
            </div>

            <div className="space-y-3">
              {choices.map((choice, index) => (
                <div key={choice.key} className="flex items-center gap-3">
                  <div className="badge badge-outline w-12">{index + 1}</div>
                  <input
                    className="input input-bordered flex-1"
                    defaultValue={choice.value}
                    name="choices"
                    placeholder={`Choice ${index + 1}`}
                    type="text"
                  />
                  <button
                    className="btn btn-sm btn-ghost text-error"
                    disabled={choices.length <= 1}
                    onClick={() =>
                      setChoices((current) =>
                        current.filter(
                          (_, choiceIndex) => choiceIndex !== index,
                        ),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Link className="btn btn-ghost" to="/">
            Cancel
          </Link>
          <button
            className="btn btn-primary"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? 'Saving...'
              : mode === 'create'
                ? 'Create Question'
                : 'Save Changes'}
          </button>
        </div>
      </Form>
    </div>
  );
}
