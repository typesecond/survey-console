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
let existingQuestionId: number;
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

  // Seed a question for GET tests
  const { response: qRes } = await createQuestion(app, adminToken, {
    question: 'Seeded question?',
    description: 'A question for access control tests',
    choices: ['Yes', 'No'],
  });
  existingQuestionId = parseLocationId(qRes.headers['location']);
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

describe('Question access control', () => {
  describe('unauthenticated requests', () => {
    it('GET / returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: QUESTION_PREFIX,
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /:id returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}/${existingQuestionId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST / returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: QUESTION_PREFIX,
        payload: {
          question: 'Unauthorized?',
          description: 'Should not work',
          choices: ['A'],
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('non-admin user', () => {
    it('can list questions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: QUESTION_PREFIX,
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('can get a single question', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}/${existingQuestionId}`,
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('cannot create a question', async () => {
      const res = await app.inject({
        method: 'POST',
        url: QUESTION_PREFIX,
        headers: { Authorization: `Bearer ${userToken}` },
        payload: {
          question: 'Non-admin question?',
          description: 'Should be forbidden',
          choices: ['A', 'B'],
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
