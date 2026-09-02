/* eslint-disable vitest/expect-expect */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  acquireTestDbLock,
  buildApp,
  createUser,
  getUserPrefix,
  loginUser,
  releaseTestDbLock,
  resetTestDatabase,
  seedUser,
} from '../../test-support.js';

let app: FastifyInstance;
let adminToken: string;

const USER_PREFIX = getUserPrefix();
const adminPassword = 'adminpassword123!';

function expectProblemResponse(
  res: Awaited<ReturnType<FastifyInstance['inject']>>,
  expectedStatus: number,
) {
  expect(res.statusCode).toBe(expectedStatus);
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json\b/i);
}

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

  for (let n = 1; n <= 5; n += 1) {
    await createUser(app, {
      username: `pageuser${n}`,
      password: `pageuser${n}pass!`,
      fullname: `Page User ${n}`,
      email: `pageuser${n}@example.com`,
    });
  }
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

describe('GET /user pagination', () => {
  it('treats page=1 as the first page', async () => {
    const firstPageRes = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}?page=1&limit=2`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const defaultFirstPageRes = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}?limit=2`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(firstPageRes.statusCode).toBe(200);
    expect(defaultFirstPageRes.statusCode).toBe(200);
    expect(firstPageRes.json()).toEqual(defaultFirstPageRes.json());
    expect(firstPageRes.json()).toEqual(
      expect.objectContaining({
        count: 6,
        users: expect.any(Array),
      }),
    );
    expect(firstPageRes.json().users).toEqual([
      expect.objectContaining({ username: 'admin' }),
      expect.objectContaining({ username: 'pageuser1' }),
    ]);
  });

  it('returns later pages using page and limit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}?page=3&limit=2`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.objectContaining({
        count: 6,
        users: expect.any(Array),
      }),
    );
    expect(res.json().users).toEqual([
      expect.objectContaining({ username: 'pageuser4' }),
      expect.objectContaining({ username: 'pageuser5' }),
    ]);
  });

  it('rejects page=0', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}?page=0&limit=2`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expectProblemResponse(res, 400);
  });

  it('rejects limit=0', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}?page=1&limit=0`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expectProblemResponse(res, 400);
  });

  it('rejects a non-numeric page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}?page=abc&limit=2`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expectProblemResponse(res, 400);
  });

  it('rejects a non-numeric limit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}?page=1&limit=abc`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expectProblemResponse(res, 400);
  });
});
