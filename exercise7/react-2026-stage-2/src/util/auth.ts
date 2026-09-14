import { jwtDecode } from 'jwt-decode';
import { redirect } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';

import { Err, Ok, type Result } from './result';

const ACCESS_STORAGE_KEY = 'access';

export type AccessTokenResponse = {
  rotated?: boolean;
  accessToken: string;
  accessExpiresInSec: number;
  refreshExpiresInSec: number;
};

type AccessPayload = {
  id: number;
  sub: string;
  role: 'admin' | 'user';
  iat: number;
  exp: number;
};

export type UserRecord = {
  id: number;
  username: string;
  fullname: string;
  email: string;
  admin: boolean;
  createdAt: string;
};

export type QuestionSummary = {
  id: number;
  question: string;
  description: string;
  createdAt: string;
};

export type QuestionDetail = QuestionSummary & {
  choices: Array<{
    id: number;
    description: string;
  }>;
};

export type ExistingVote = {
  answerchoiceid: number;
  surveyid: number;
  userid: number;
};

export type VoteResult = {
  choice: number;
  count: number;
};

export type QuestionGraphNode = {
  id: number;
  label: string;
  description: string;
  voteCount: number;
  choiceCount: number;
};

export type QuestionGraphEdge = {
  source: number;
  target: number;
  sharedVoters: number;
  sharedVoterRatio: number;
  distributionSimilarity: number;
  weight: number;
};

export type QuestionSimilarityGraph = {
  nodes: QuestionGraphNode[];
  edges: QuestionGraphEdge[];
  stats: {
    questionCount: number;
    edgeCount: number;
    maxVotes: number;
  };
};

export type AnswerChoiceGraphNode = {
  id: number;
  label: string;
  questionId: number;
  questionLabel: string;
  voteCount: number;
};

export type AnswerChoiceGraphEdge = {
  source: number;
  target: number;
  sharedVoters: number;
  affinity: number;
  contextSimilarity: number;
  weight: number;
};

export type AnswerChoiceAffinityGraph = {
  nodes: AnswerChoiceGraphNode[];
  edges: AnswerChoiceGraphEdge[];
  stats: {
    choiceCount: number;
    edgeCount: number;
    maxVotes: number;
  };
};

export type ApiError = {
  status: number;
  message: string;
  authExpired?: boolean;
};

function getReturnTo(request: Request) {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function redirectToLogin(request: Request) {
  return redirect(
    `/login?returnTo=${encodeURIComponent(getReturnTo(request))}`,
  );
}

function readStoredAccessToken(): AccessTokenResponse | null {
  try {
    const raw = localStorage.getItem(ACCESS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AccessTokenResponse;
  } catch {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    return null;
  }
}

export function storeAccessToken(response: AccessTokenResponse) {
  jwtDecode<AccessPayload>(response.accessToken);
  localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(response));
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_STORAGE_KEY);
}

function decodeStoredAccessToken(): AccessPayload | null {
  const stored = readStoredAccessToken();
  if (!stored) return null;

  try {
    return jwtDecode<AccessPayload>(stored.accessToken);
  } catch {
    clearAccessToken();
    return null;
  }
}

function tokenExpiresSoon(payload: AccessPayload, skewSeconds = 10) {
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      title?: string;
      detail?: string;
      message?: string;
    };
    const detail = [body.title, body.detail].filter(Boolean).join(': ');
    const message =
      body.message || detail || `${res.status}: ${res.statusText}`;
    return { status: res.status, message };
  } catch {
    return { status: res.status, message: `${res.status}: ${res.statusText}` };
  }
}

async function renewAccessToken(): Promise<
  Result<AccessTokenResponse, ApiError>
> {
  const res = await fetch('/api/user/refresh', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (res.ok) {
    const response = (await res.json()) as AccessTokenResponse;
    storeAccessToken(response);
    return Ok(response);
  }

  clearAccessToken();
  const error = await parseErrorResponse(res);
  return Err({ ...error, authExpired: true });
}

let refreshInProgress:
  | Promise<Result<AccessTokenResponse, ApiError>>
  | undefined;

async function ensureValidAccessToken(): Promise<Result<string, ApiError>> {
  const decoded = decodeStoredAccessToken();
  if (!decoded) {
    return Err({
      status: 401,
      message: 'Authentication required.',
      authExpired: true,
    });
  }

  if (!tokenExpiresSoon(decoded)) {
    return Ok(readStoredAccessToken()!.accessToken);
  }

  if (!refreshInProgress) {
    refreshInProgress = renewAccessToken();
  }

  try {
    const refreshResult = await refreshInProgress;
    if (refreshResult.isErr) return refreshResult;
    return Ok(refreshResult.value.accessToken);
  } finally {
    refreshInProgress = undefined;
  }
}

export async function requestJSON<T>({
  url,
  request,
  authenticated,
  method = 'GET',
  body,
  retrying = false,
}: {
  url: string;
  request?: Request;
  authenticated?: boolean;
  method?: string;
  body?: string;
  retrying?: boolean;
}): Promise<Result<T, ApiError>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  if (authenticated) {
    const tokenResult = await ensureValidAccessToken();
    if (tokenResult.isErr) return tokenResult;
    headers.Authorization = `Bearer ${tokenResult.value}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials: 'include',
    signal: request?.signal,
  });

  if (res.status === 401 && authenticated && !retrying) {
    const refreshResult = await renewAccessToken();
    if (refreshResult.isErr) return refreshResult;
    return requestJSON<T>({
      url,
      request,
      authenticated,
      method,
      body,
      retrying: true,
    });
  }

  if (res.status === 204) {
    return Ok(undefined as T);
  }

  if (!res.ok) {
    const error = await parseErrorResponse(res);
    if (res.status === 401) {
      return Err({ ...error, authExpired: true });
    }
    return Err(error);
  }

  return Ok((await res.json()) as T);
}

export async function requireAuthenticated(request: Request) {
  const tokenResult = await ensureValidAccessToken();
  if (tokenResult.isErr) {
    throw redirectToLogin(request);
  }

  const decoded = decodeStoredAccessToken();
  if (!decoded) {
    throw redirectToLogin(request);
  }

  return decoded;
}

export async function ensureAdmin(request: Request) {
  const decoded = await requireAuthenticated(request);
  if (decoded.role !== 'admin') {
    throw new Response('Administrator access is required for that page.', {
      status: 403,
      statusText: 'Forbidden',
    });
  }
  return decoded;
}

export async function loadOptionalUser(): Promise<UserRecord | null> {
  const token = decodeStoredAccessToken();
  if (!token) return null;

  const tokenResult = await ensureValidAccessToken();
  if (tokenResult.isErr) return null;

  const result = await requestJSON<UserRecord>({
    url: `/api/user/${token.id}`,
    authenticated: true,
  });

  return result.isOk ? result.value : null;
}

export async function redirectIfAuthenticated() {
  if (await loadOptionalUser()) {
    throw redirect('/');
  }
  return null;
}

async function submitAuthForm(
  request: Request,
  endpoint: '/api/user/login' | '/api/user',
): Promise<Response | { message: string }> {
  const formData = await request.formData();
  const returnTo = String(formData.get('returnTo') ?? '/') || '/';
  formData.delete('returnTo');
  const payload = Object.fromEntries(formData);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await parseErrorResponse(res);
    return { message: error.message };
  }

  const response = (await res.json()) as AccessTokenResponse;
  storeAccessToken(response);

  return redirect(returnTo);
}

export async function loginAction({ request }: ActionFunctionArgs) {
  return submitAuthForm(request, '/api/user/login');
}

export async function registerAction({ request }: ActionFunctionArgs) {
  return submitAuthForm(request, '/api/user');
}

export async function logoutAction() {
  await fetch('/api/user/logout', {
    method: 'POST',
    credentials: 'include',
  });
  clearAccessToken();
  return redirect('/login');
}

export function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseQuestionId(id: string | undefined) {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Response('Question id is invalid.', {
      status: 400,
      statusText: 'Bad Request',
    });
  }
  return parsed;
}

export function getQueryMessage(searchParams: URLSearchParams) {
  return searchParams.get('message');
}

export function collectChoiceFields(formData: FormData) {
  return formData
    .getAll('choices')
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}
