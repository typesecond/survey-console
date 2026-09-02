import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  acquireTestDbLock,
  buildApp,
  createUser,
  getUserPrefix,
  parseLocationId,
  releaseTestDbLock,
  resetTestDatabase,
} from '../../test-support.js';

let app: FastifyInstance;
const USER_PREFIX = getUserPrefix();

beforeAll(async () => {
  await acquireTestDbLock();
  await resetTestDatabase();
  app = await buildApp();
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
  await releaseTestDbLock();
});

/**
 * Creates a fresh user via POST /user and returns the auto-login tokens.
 * Each call uses a unique username so tests are independent.
 */
async function createUserAndLogin(): Promise<{
  accessToken: string;
  refreshToken: string;
  accessExpiresInSec: number;
  userId: number;
}> {
  const { response: res } = await createUser(app, {
    password: 'tokenpassword123',
  });
  const body = res.json();
  const cookie = res.cookies.find((c) => c.name === 'refresh_token')!;
  return {
    accessToken: body.accessToken,
    refreshToken: cookie.value,
    accessExpiresInSec: body.accessExpiresInSec,
    userId: parseLocationId(res.headers['location']),
  };
}

// ---------------------------------------------------------------------------
// POST /user/refresh — basic rotation
// ---------------------------------------------------------------------------

describe('POST /user/refresh', () => {
  it('returns 200 with new accessToken, rotated: true, and a new refresh_token cookie', async () => {
    const { refreshToken } = await createUserAndLogin();

    const res = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
      cookies: { refresh_token: refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(typeof body.accessToken).toBe('string');
    expect(body.rotated).toBe(true);

    const newCookie = res.cookies.find((c) => c.name === 'refresh_token');
    expect(newCookie).toBeDefined();
    expect(newCookie?.value).not.toBe(refreshToken); // new token issued
  });

  it('rejects reuse of the old refresh token after rotation (401)', async () => {
    const { refreshToken: oldToken } = await createUserAndLogin();

    // First refresh: valid rotation.
    const firstRes = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
      cookies: { refresh_token: oldToken },
    });
    expect(firstRes.statusCode).toBe(200);

    // Replay old token — must be rejected.
    const replayRes = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
      cookies: { refresh_token: oldToken },
    });
    expect(replayRes.statusCode).toBe(401);
  });

  it('returns 401 with no cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().detail).toMatch(/missing refresh cookie/i);
  });

  it('returns 401 for a tampered / invalid JWT in the cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
      cookies: { refresh_token: 'not.a.valid.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('reuse detection revokes the entire token family; the rotated token also fails', async () => {
    const { refreshToken: rt1 } = await createUserAndLogin();

    // Rotate RT1 → RT2.
    const rotateRes = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
      cookies: { refresh_token: rt1 },
    });
    expect(rotateRes.statusCode).toBe(200);
    const rt2 = rotateRes.cookies.find(
      (c) => c.name === 'refresh_token',
    )!.value;

    // Replay RT1 → triggers family revocation, error message must indicate reuse.
    const reuseRes = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
      cookies: { refresh_token: rt1 },
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json().detail).toMatch(/refresh token reuse detected/i);

    // RT2 is in the same family → must also be rejected.
    const rt2Res = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/refresh`,
      cookies: { refresh_token: rt2 },
    });
    expect(rt2Res.statusCode).toBe(401);
  });
});

describe('POST /user/logout', () => {
  it('returns 204 and clears the refresh_token cookie on the refresh path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${USER_PREFIX}/logout`,
    });

    expect(res.statusCode).toBe(204);

    const setCookieHeader = res.headers['set-cookie'];
    const setCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('\n')
      : (setCookieHeader ?? '');

    expect(setCookie).toContain('refresh_token=');
    expect(setCookie).toContain(`Path=${USER_PREFIX}/refresh`);
    expect(setCookie).toMatch(/Expires=/);
  });
});

// ---------------------------------------------------------------------------
// Access token expiration — uses fake timers to advance the clock
// ---------------------------------------------------------------------------

describe('Access token expiration', () => {
  let accessToken: string;
  let userId: number;
  let accessExpiresInSec: number;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    const data = await createUserAndLogin();
    accessToken = data.accessToken;
    userId = data.userId;
    accessExpiresInSec = data.accessExpiresInSec;
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('access token works on a protected endpoint before expiration', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${userId}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('access token returns 401 after expiration', async () => {
    vi.setSystemTime(Date.now() + (accessExpiresInSec + 1) * 1000);

    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${userId}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
