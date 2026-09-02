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
    username: 'regularuser',
    password: 'regularuser123!',
    fullname: 'Regular User',
    email: 'regularuser@example.com',
  });
  userToken = userRes.json().accessToken;
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

describe('PUT /:id (update question)', () => {
  it('admin updates a question and gets 200 with message', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Original question?',
      description: 'Original description',
      choices: ['A', 'B', 'C'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    const res = await app.inject({
      method: 'PUT',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        question: 'Updated question?',
        description: 'Updated description',
        choices: ['X', 'Y'],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('updated');
  });

  it('updated question reflects new data on GET', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Before update?',
      description: 'Before description',
      choices: ['Old A', 'Old B'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    await app.inject({
      method: 'PUT',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        question: 'After update?',
        description: 'After description',
        choices: ['New A', 'New B', 'New C'],
      },
    });

    const getRes = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.question).toBe('After update?');
    expect(body.description).toBe('After description');
    // Choices should reflect the update
    const descriptions = body.choices.map((c: Record<string, unknown>) =>
      typeof c === 'string' ? c : c.description,
    );
    expect(descriptions).toEqual(['New A', 'New B', 'New C']);
  });

  it('returns 404 when updating a non-existent question', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${QUESTION_PREFIX}/99999`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        question: 'Ghost?',
        description: 'Does not exist',
        choices: ['A'],
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('non-admin cannot update a question (403)', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Admin only update?',
      description: 'Should not be updatable by regular user',
      choices: ['A', 'B'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    const res = await app.inject({
      method: 'PUT',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        question: 'Hijacked?',
        description: 'Nope',
        choices: ['X'],
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${QUESTION_PREFIX}/1`,
      payload: {
        question: 'No token?',
        description: 'Should fail',
        choices: ['A'],
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('clears existing votes when question is updated', async () => {
    // Create question, vote on it, then update the question
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Vote then update?',
      description: 'Votes should be cleared on update',
      choices: ['Alpha', 'Beta'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    // Get choice IDs directly from the database
    const choiceIdList = await getChoiceIds(qid);

    // Vote on the first choice
    await app.inject({
      method: 'POST',
      url: `${QUESTION_PREFIX}/${qid}/vote`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { choice: choiceIdList[0] },
    });

    // Update the question
    await app.inject({
      method: 'PUT',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        question: 'Updated after vote?',
        description: 'Votes should be gone',
        choices: ['Gamma', 'Delta'],
      },
    });

    // Results should be empty after update
    const resultsRes = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${qid}/results`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resultsRes.statusCode).toBe(200);
    expect(resultsRes.json()).toEqual([]);
  });
});
