import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  acquireTestDbLock,
  buildApp,
  createQuestion,
  createUser,
  getChoiceIds,
  getQuestionPrefix,
  loginUser,
  parseLocationId,
  releaseTestDbLock,
  resetTestDatabase,
  seedUser,
} from '../../test-support.js';

let app: FastifyInstance;
let adminToken: string;
let userToken: string;
let user2Token: string;
let questionId: number;
let choiceIds: number[];
const QUESTION_PREFIX = getQuestionPrefix();
const adminPassword = 'adminpassword123!';

beforeAll(async () => {
  await acquireTestDbLock();
  await resetTestDatabase();
  await seedUser({
    username: 'admin',
    password: adminPassword,
    fullname: 'Admin User',
    email: 'admin@example.com',
    admin: true,
  });

  app = await buildApp();

  const adminLogin = await loginUser(app, 'admin', adminPassword);
  adminToken = adminLogin.json().accessToken;

  const { response: userRes } = await createUser(app, {
    username: 'voter1',
    password: 'voter1pass123!',
    fullname: 'Voter One',
    email: 'voter1@example.com',
  });
  userToken = userRes.json().accessToken;

  const { response: user2Res } = await createUser(app, {
    username: 'voter2',
    password: 'voter2pass123!',
    fullname: 'Voter Two',
    email: 'voter2@example.com',
  });
  user2Token = user2Res.json().accessToken;

  // Create a question to vote on
  const { response: qRes } = await createQuestion(app, adminToken, {
    question: 'Favorite fruit?',
    description: 'Pick your favorite fruit',
    choices: ['Apple', 'Banana', 'Cherry'],
  });
  questionId = parseLocationId(qRes.headers['location']);

  // Retrieve choice IDs directly from the database
  choiceIds = await getChoiceIds(questionId);
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

describe('POST /:id/vote (cast a vote)', () => {
  it('authenticated user can vote on a question', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: choiceIds[0] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('vote');
  });

  it('user can change their vote', async () => {
    // Vote for choice 0 first
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: choiceIds[0] },
    });

    // Change vote to choice 1
    const res = await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: choiceIds[1] },
    });

    expect(res.statusCode).toBe(200);

    // Verify the vote was changed
    const voteRes = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(voteRes.statusCode).toBe(200);
    expect(voteRes.json().answerchoiceid).toBe(choiceIds[1]);
  });

  it('multiple users can vote on the same question', async () => {
    // User 1 votes for choice 0
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: choiceIds[0] },
    });

    // User 2 votes for choice 1
    const res = await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${user2Token}` },
      payload: { choice: choiceIds[1] },
    });

    expect(res.statusCode).toBe(200);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      payload: { choice: choiceIds[0] },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a vote with no choice field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects a vote on a non-existent question (not 500)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/99999/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: 1 },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('rejects a vote with a choice that belongs to a different question', async () => {
    // Create a second question with its own choices
    const { response: otherRes } = await createQuestion(app, adminToken, {
      question: 'Other question?',
      description: 'Choices here should not work on the first question',
      choices: ['Wrong A', 'Wrong B'],
    });
    const otherId = parseLocationId(otherRes.headers['location']);
    const otherChoices = await getChoiceIds(otherId);

    // Try to vote on the original question using a choice from the other question
    const res = await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: otherChoices[0] },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

describe('GET /:id/vote (retrieve own vote)', () => {
  it("returns the user's current vote", async () => {
    // Cast a known vote first
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: choiceIds[2] },
    });

    const res = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.answerchoiceid).toBe(choiceIds[2]);
    expect(body.surveyid).toBe(questionId);
  });

  it('each user sees only their own vote', async () => {
    // User 1 votes for choice 0
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: choiceIds[0] },
    });

    // User 2 votes for choice 2
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${user2Token}` },
      payload: { choice: choiceIds[2] },
    });

    const user1Vote = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    const user2Vote = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
      headers: { Authorization: `Bearer ${user2Token}` },
    });

    expect(user1Vote.json().answerchoiceid).toBe(choiceIds[0]);
    expect(user2Vote.json().answerchoiceid).toBe(choiceIds[2]);
  });

  it('returns empty/null when user has not voted on a question', async () => {
    // Create a fresh question no one has voted on
    const { response: freshRes } = await createQuestion(app, adminToken, {
      question: 'Unvoted question?',
      description: 'No one has voted here',
      choices: ['P', 'Q'],
    });
    const freshId = parseLocationId(freshRes.headers['location']);

    const res = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${freshId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    // Should return 200 with no vote data (undefined/null)
    expect(res.statusCode).toBe(200);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${questionId}/vote`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with empty body for a non-existent question', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/99999/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    // No vote exists, so the query returns nothing — same as "user hasn't voted"
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /:id/results (vote totals)', () => {
  it('returns vote counts grouped by choice', async () => {
    // Create a fresh question for clean results
    const { response: freshRes } = await createQuestion(app, adminToken, {
      question: 'Results test?',
      description: 'Testing vote totals',
      choices: ['Red', 'Blue', 'Green'],
    });
    const freshId = parseLocationId(freshRes.headers['location']);

    // Get choice IDs directly from the database
    const freshChoices = await getChoiceIds(freshId);

    // Two users vote for the same choice
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${freshId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: freshChoices[0] },
    });
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${freshId}/vote`,
      headers: { Authorization: `Bearer ${user2Token}` },
      payload: { choice: freshChoices[0] },
    });

    const resultsRes = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${freshId}/results`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resultsRes.statusCode).toBe(200);
    const results = resultsRes.json();
    expect(results).toBeInstanceOf(Array);

    // Should have one entry for the choice that was voted on
    const voted = results.find(
      (r: Record<string, unknown>) => r.choice === freshChoices[0],
    );
    expect(voted).toBeDefined();
    expect(voted.count).toBe(2);
  });

  it('returns results with multiple choices voted on', async () => {
    // Create a fresh question
    const { response: freshRes } = await createQuestion(app, adminToken, {
      question: 'Multi-choice results?',
      description: 'Testing split vote totals',
      choices: ['Cat', 'Dog'],
    });
    const freshId = parseLocationId(freshRes.headers['location']);

    const freshChoices = await getChoiceIds(freshId);

    // User 1 votes Cat, User 2 votes Dog
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${freshId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: freshChoices[0] },
    });
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${freshId}/vote`,
      headers: { Authorization: `Bearer ${user2Token}` },
      payload: { choice: freshChoices[1] },
    });

    const resultsRes = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${freshId}/results`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resultsRes.statusCode).toBe(200);
    const results = resultsRes.json();
    expect(results).toHaveLength(2);

    const catResult = results.find(
      (r: Record<string, unknown>) => r.choice === freshChoices[0],
    );
    const dogResult = results.find(
      (r: Record<string, unknown>) => r.choice === freshChoices[1],
    );
    expect(catResult.count).toBe(1);
    expect(dogResult.count).toBe(1);
  });

  it('returns empty array when no votes have been cast', async () => {
    const { response: freshRes } = await createQuestion(app, adminToken, {
      question: 'No votes yet?',
      description: 'Should have empty results',
      choices: ['A', 'B'],
    });
    const freshId = parseLocationId(freshRes.headers['location']);

    const res = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${freshId}/results`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('changing a vote updates the totals correctly', async () => {
    const { response: freshRes } = await createQuestion(app, adminToken, {
      question: 'Change vote results?',
      description: 'Verify totals after vote change',
      choices: ['Left', 'Right'],
    });
    const freshId = parseLocationId(freshRes.headers['location']);

    const freshChoices = await getChoiceIds(freshId);

    // Vote Left
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${freshId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: freshChoices[0] },
    });

    // Change vote to Right
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${freshId}/vote`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { choice: freshChoices[1] },
    });

    const resultsRes = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${freshId}/results`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resultsRes.statusCode).toBe(200);
    const results = resultsRes.json();

    // Should only have one entry for Right with count 1
    // Left should not appear (or appear with count 0)
    const leftResult = results.find(
      (r: Record<string, unknown>) => r.choice === freshChoices[0],
    );
    const rightResult = results.find(
      (r: Record<string, unknown>) => r.choice === freshChoices[1],
    );
    expect(leftResult).toBeUndefined();
    expect(rightResult).toBeDefined();
    expect(rightResult.count).toBe(1);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${questionId}/results`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns empty array for a non-existent question', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/99999/results`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // No votes exist for this ID, so the grouped query returns nothing
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
