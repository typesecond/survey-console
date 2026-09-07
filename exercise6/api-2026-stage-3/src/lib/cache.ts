export const USER_CACHE_PREFIX = 'user:';
export const QUESTION_RESULTS_CACHE_PREFIX = 'question-results:';

export function userCacheKey(userId: number) {
  return `${USER_CACHE_PREFIX}${userId}`;
}

export function questionResultsCacheKey(questionId: number) {
  return `${QUESTION_RESULTS_CACHE_PREFIX}${questionId}`;
}

export function questionResultsRoom(questionId: number) {
  return `question:${questionId}:results`;
}
