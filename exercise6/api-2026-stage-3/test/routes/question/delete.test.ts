import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  acquireTestDbLock,
  buildApp,
  createQuestion,
  createUser,
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

describe('DELETE /:id (delete question)', () => {
  it('admin deletes a question and gets 200 with message', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Deletable?',
      description: 'Will be deleted',
      choices: ['Yes', 'No'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    const res = await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('deleted');
  });

  it('deleted question returns 404 on GET', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Gone soon?',
      description: 'Will be deleted then fetched',
      choices: ['A', 'B'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const getRes = await app.inject({
      method: 'GET',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(getRes.statusCode).toBe(404);
  });

  it('deleted question no longer appears in the list', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Vanishing from list?',
      description: 'Should disappear from list after delete',
      choices: ['X'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: QUESTION_PREFIX,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const ids = listRes
      .json()
      .questions.map((q: Record<string, unknown>) => q.id);
    expect(ids).not.toContain(qid);
  });

  it('returns 404 when deleting a non-existent question', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/99999`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('non-admin cannot delete a question (403)', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Protected from non-admin?',
      description: 'Regular user should not delete this',
      choices: ['A', 'B'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    const res = await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/1`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('deleting the same question twice returns 404 on the second attempt', async () => {
    const { response: createRes } = await createQuestion(app, adminToken, {
      question: 'Double delete?',
      description: 'Second delete should fail',
      choices: ['A'],
    });
    const qid = parseLocationId(createRes.headers['location']);

    const first = await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'DELETE',
      url: `${QUESTION_PREFIX}/${qid}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(second.statusCode).toBe(404);
  });
});
