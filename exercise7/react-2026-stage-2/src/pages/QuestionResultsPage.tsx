/* eslint-disable react-refresh/only-export-components */
import { startTransition, useEffect, useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { io } from 'socket.io-client';

import {
  parseQuestionId,
  redirectToLogin,
  requestJSON,
  requireAuthenticated,
  type QuestionDetail,
  type VoteResult,
} from '../util/auth';

type ResultsLoaderData = {
  question: QuestionDetail;
  results: VoteResult[];
};

type LiveResultsPayload = {
  questionId: number;
  results: VoteResult[];
  replicaId: string;
  emittedAt: string;
};

export async function loader({
  params,
  request,
}: LoaderFunctionArgs): Promise<ResultsLoaderData> {
  await requireAuthenticated(request);
  const id = parseQuestionId(params.id);

  const [questionResult, resultsResult] = await Promise.all([
    requestJSON<QuestionDetail>({
      url: `/api/question/${id}`,
      request,
      authenticated: true,
    }),
    requestJSON<VoteResult[]>({
      url: `/api/question/${id}/results`,
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

  if (resultsResult.isErr) {
    if (resultsResult.error.authExpired) {
      throw redirectToLogin(request);
    }
    throw new Response(resultsResult.error.message, {
      status: resultsResult.error.status,
    });
  }

  return { question: questionResult.value, results: resultsResult.value };
}

export default function QuestionResultsPage() {
  const { question, results } = useLoaderData() as ResultsLoaderData;
  const [liveUpdate, setLiveUpdate] = useState<LiveResultsPayload | null>(null);

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      withCredentials: true,
    });

    socket.on('connect', () => {
      socket.emit('question-results:subscribe', question.id);
    });

    socket.on(
      'question-results:update',
      (payload: LiveResultsPayload | undefined) => {
        if (!payload || payload.questionId !== question.id) {
          return;
        }

        startTransition(() => {
          setLiveUpdate(payload);
        });
      },
    );

    return () => {
      socket.emit('question-results:unsubscribe', question.id);
      socket.close();
    };
  }, [question.id]);

  useEffect(() => {
    let cancelled = false;

    async function refreshResults() {
      const result = await requestJSON<VoteResult[]>({
        url: `/api/question/${question.id}/results`,
        authenticated: true,
      });

      if (cancelled || result.isErr) {
        return;
      }

      startTransition(() => {
        setLiveUpdate({
          questionId: question.id,
          results: result.value,
          replicaId: 'poll',
          emittedAt: new Date().toISOString(),
        });
      });
    }

    const intervalId = window.setInterval(() => {
      void refreshResults();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [question.id]);

  const displayedResults =
    liveUpdate?.questionId === question.id ? liveUpdate.results : results;
  const liveStatus =
    liveUpdate?.questionId === question.id
      ? {
          replicaId: liveUpdate.replicaId,
          emittedAt: liveUpdate.emittedAt,
        }
      : null;

  const counts = new Map(
    displayedResults.map((result) => [result.choice, result.count]),
  );
  const totalVotes = displayedResults.reduce(
    (sum, result) => sum + result.count,
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
            Results
          </p>
          <h1 className="text-3xl font-bold">{question.question}</h1>
          <p className="mt-2 text-base-content/70">{question.description}</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-ghost" to="/">
            Back
          </Link>
          <Link
            className="btn btn-primary"
            to={`/questions/${question.id}/vote`}
          >
            Vote
          </Link>
        </div>
      </div>

      <div className="stats stats-vertical bg-base-100 shadow sm:stats-horizontal">
        <div className="stat">
          <div className="stat-title">Total Votes</div>
          <div className="stat-value text-primary">{totalVotes}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Choices</div>
          <div className="stat-value text-secondary">
            {question.choices.length}
          </div>
        </div>
      </div>

      <div className="alert alert-info">
        Live updates are active for this question.
        {liveStatus ? (
          <span className="ml-2 text-sm">
            Last update from {liveStatus.replicaId} at{' '}
            {new Date(liveStatus.emittedAt).toLocaleTimeString()}.
          </span>
        ) : null}
      </div>

      <section className="space-y-4 rounded-box bg-base-100 p-6 shadow-sm">
        {question.choices.map((choice) => {
          const count = counts.get(choice.id) ?? 0;
          const percent =
            totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);

          return (
            <div key={choice.id} className="space-y-2">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-medium">{choice.description}</div>
                  <div className="text-sm text-base-content/60">
                    Choice #{choice.id}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{count}</div>
                  <div className="text-sm text-base-content/60">{percent}%</div>
                </div>
              </div>
              <progress
                className="progress progress-primary h-3 w-full"
                max={100}
                value={percent}
              />
            </div>
          );
        })}

        {question.choices.length === 0 ? (
          <p className="text-base-content/70">
            This question currently has no answer choices.
          </p>
        ) : null}
      </section>
    </div>
  );
}
