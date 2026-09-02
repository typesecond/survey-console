import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  acquireTestDbLock,
  buildApp,
  createQuestion,
  getQuestionPrefix,
  loginUser,
  parseLocationId,
  releaseTestDbLock,
  resetTestDatabase,
  seedUser,
} from '../../test-support.js';

let app: FastifyInstance;
let adminToken: string;
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
  const loginRes = await loginUser(app, 'admin', adminPassword);
  adminToken = loginRes.json().accessToken;
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

describe('Question CRUD', () => {
  describe('POST / (create)', () => {
    it('admin creates a question and gets 201 with Location header', async () => {
      const { response } = await createQuestion(app, adminToken, {
        question: 'Favorite color?',
        description: 'Pick your favorite color',
        choices: ['Red', 'Green', 'Blue'],
      });

      expect(response.statusCode).toBe(201);
      expect(response.headers['location']).toMatch(
        new RegExp(`${QUESTION_PREFIX}/\\d+`),
      );
    });

    it('rejects a request with missing question field', async () => {
      const res = await app.inject({
        method: 'POST',
        url: QUESTION_PREFIX,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          description: 'No question field',
          choices: ['A', 'B'],
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects a request with empty choices', async () => {
      const res = await app.inject({
        method: 'POST',
        url: QUESTION_PREFIX,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: {
          question: 'Empty choices?',
          description: 'Should fail',
          choices: [],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /:id (get one)', () => {
    it('returns a question with its choices', async () => {
      const { response: createRes } = await createQuestion(app, adminToken, {
        question: 'Best language?',
        description: 'Choose the best programming language',
        choices: ['TypeScript', 'Rust', 'Go'],
      });
      const qid = parseLocationId(createRes.headers['location']);

      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}/${qid}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.question).toBe('Best language?');
      expect(body.description).toBe('Choose the best programming language');
      expect(body.choices).toBeInstanceOf(Array);
      expect(body.choices).toHaveLength(3);
    });

    it('returns choices sorted by position', async () => {
      const { response: createRes } = await createQuestion(app, adminToken, {
        question: 'Order test?',
        description: 'Verify ordering',
        choices: ['First', 'Second', 'Third'],
      });
      const qid = parseLocationId(createRes.headers['location']);

      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}/${qid}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Choices should maintain the order they were created in
      const descriptions = body.choices.map((c: Record<string, unknown>) =>
        typeof c === 'string' ? c : c.description,
      );
      expect(descriptions).toEqual(['First', 'Second', 'Third']);
    });

    it('response contains only declared fields (no extra fields)', async () => {
      const { response: createRes } = await createQuestion(app, adminToken, {
        question: 'Schema shape test?',
        description: 'Verify response has no extra properties',
        choices: ['One', 'Two'],
      });
      const qid = parseLocationId(createRes.headers['location']);

      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}/${qid}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const keys = Object.keys(body).sort();
      expect(keys).toEqual([
        'choices',
        'createdAt',
        'description',
        'id',
        'question',
      ]);
    });

    it('choices are returned as {id, description} objects', async () => {
      const { response: createRes } = await createQuestion(app, adminToken, {
        question: 'Choices shape test?',
        description: 'Verify choices are {id, description}[]',
        choices: ['Alpha', 'Beta'],
      });
      const qid = parseLocationId(createRes.headers['location']);

      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}/${qid}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const choice of body.choices) {
        expect(choice).toHaveProperty('id');
        expect(choice).toHaveProperty('description');
      }
      expect(
        body.choices.map((c: Record<string, unknown>) => c.description),
      ).toEqual(['Alpha', 'Beta']);
    });

    it('returns 404 for a non-existent question', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}/99999`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET / (list)', () => {
    it('returns a paginated list of questions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: QUESTION_PREFIX,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual(
        expect.objectContaining({
          questions: expect.any(Array),
          count: expect.any(Number),
        }),
      );
    });

    it('respects page and limit parameters', async () => {
      // Ensure at least 3 questions exist (some were created above)
      await createQuestion(app, adminToken);
      await createQuestion(app, adminToken);
      await createQuestion(app, adminToken);

      const res = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}?page=1&limit=2`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.questions.length).toBeLessThanOrEqual(2);
      expect(body.count).toBeGreaterThanOrEqual(3);
    });

    it('returns the second page', async () => {
      const firstPage = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}?page=1&limit=2`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const secondPage = await app.inject({
        method: 'GET',
        url: `${QUESTION_PREFIX}?page=2&limit=2`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(secondPage.statusCode).toBe(200);
      const first = firstPage.json();
      const second = secondPage.json();
      // Pages should not overlap
      const firstIds = first.questions.map(
        (q: Record<string, unknown>) => q.id,
      );
      const secondIds = second.questions.map(
        (q: Record<string, unknown>) => q.id,
      );
      for (const id of secondIds) {
        expect(firstIds).not.toContain(id);
      }
    });
  });
});
