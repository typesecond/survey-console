import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  acquireTestDbLock,
  buildApp,
  createUser,
  getUserPrefix,
  loginUser,
  parseLocationId,
  releaseTestDbLock,
  resetTestDatabase,
  seedUser,
  findUserByUsername,
  makeUserPayload,
} from '../../test-support.js';

let app: FastifyInstance;
const USER_PREFIX = getUserPrefix();

const testUser = makeUserPayload({
  username: 'authtest',
  password: 'testpassword123',
  fullname: 'Auth Test User',
  email: 'authtest@example.com',
});

beforeAll(async () => {
  await acquireTestDbLock();
  await resetTestDatabase();
  app = await buildApp();
  await seedUser(testUser);
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

describe('POST /login with correct credentials', () => {
  it('returns 200', async () => {
    const res = await loginUser(app, testUser.username, testUser.password);
    expect(res.statusCode).toBe(200);
  });

  it('response body has accessToken, accessExpiresInSec, refreshExpiresInSec, rotated', async () => {
    const res = await loginUser(app, testUser.username, testUser.password);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(typeof body.accessToken).toBe('string');
    expect(body).toHaveProperty('accessExpiresInSec');
    expect(typeof body.accessExpiresInSec).toBe('number');
    expect(body).toHaveProperty('refreshExpiresInSec');
    expect(typeof body.refreshExpiresInSec).toBe('number');
    expect(body).toHaveProperty('rotated');
  });

  it('sets a refresh_token cookie', async () => {
    const res = await loginUser(app, testUser.username, testUser.password);
    const cookie = res.cookies.find((c) => c.name === 'refresh_token');
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();
  });
});

describe('POST /login with wrong password', () => {
  it('returns 401', async () => {
    const res = await loginUser(app, testUser.username, 'wrongpassword123');
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /login with nonexistent username', () => {
  it('returns 401', async () => {
    const res = await loginUser(app, 'nosuchuser', 'wrongpassword123');
    expect(res.statusCode).toBe(401);
  });

  it('returns the same error message as a wrong-password attempt (no username enumeration)', async () => {
    const wrongPwdRes = await loginUser(
      app,
      testUser.username,
      'wrongpassword123',
    );
    const noUserRes = await loginUser(app, 'nosuchuser', 'wrongpassword123');
    expect(noUserRes.json().detail).toBe(wrongPwdRes.json().detail);
  });
});

// ---------------------------------------------------------------------------
// POST /user (create) — auto-login after account creation
// ---------------------------------------------------------------------------

describe('POST /user (create)', () => {
  it('returns 201 with accessToken and a refresh_token cookie', async () => {
    const { payload, response: res } = await createUser(app, {
      username: 'newcreatetest',
      password: 'testpassword123',
      fullname: 'New Create Test',
      email: 'newcreatetest@example.com',
    });
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(typeof body.accessToken).toBe('string');
    expect(body).toHaveProperty('accessExpiresInSec');
    expect(body).toHaveProperty('refreshExpiresInSec');

    const cookie = res.cookies.find((c) => c.name === 'refresh_token');
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();

    const storedUser = await findUserByUsername(payload.username);
    expect(storedUser?.email).toBe(payload.email);
    expect(storedUser?.password).not.toBe(payload.password);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated access — every protected endpoint must return 401
// ---------------------------------------------------------------------------

describe('Unauthenticated access', () => {
  let someUserId: number;

  beforeAll(async () => {
    const { response } = await createUser(app, {
      username: 'unauthuser',
      password: 'testpassword123',
      fullname: 'Unauth User',
      email: 'unauthuser@example.com',
    });
    someUserId = parseLocationId(response.headers['location']);
  });

  it('GET /user with no token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: USER_PREFIX });
    expect(res.statusCode).toBe(401);
  });

  it('GET /user/:id with no token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${someUserId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('PUT /user/:id with no token returns 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${someUserId}`,
      payload: { fullname: 'Should Fail' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /user/:id with no token returns 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `${USER_PREFIX}/${someUserId}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
