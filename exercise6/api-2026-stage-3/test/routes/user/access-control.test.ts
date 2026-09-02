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
} from '../../test-support.js';

let app: FastifyInstance;
let adminToken: string;
let user1Token: string;
let user1Id: number;
let user2Id: number;
let userDeleteSelfToken: string;
let userDeleteSelfId: number;
const USER_PREFIX = getUserPrefix();
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

  const user1 = await createUser(app, {
    username: 'acluser1',
    password: 'password123!',
    fullname: 'ACL User One',
    email: 'acluser1@example.com',
  });
  user1Token = user1.response.json().accessToken;
  user1Id = parseLocationId(user1.response.headers['location']);

  const user2 = await createUser(app, {
    username: 'acluser2',
    password: 'password456!',
    fullname: 'ACL User Two',
    email: 'acluser2@example.com',
  });
  user2Id = parseLocationId(user2.response.headers['location']);

  const userDeleteSelf = await createUser(app, {
    username: 'aclselfdelete',
    password: 'password789!',
    fullname: 'ACL Self Delete',
    email: 'aclselfdelete@example.com',
  });
  userDeleteSelfToken = userDeleteSelf.response.json().accessToken;
  userDeleteSelfId = parseLocationId(
    userDeleteSelf.response.headers['location'],
  );
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

// ---------------------------------------------------------------------------
// GET /user  (list — admin-only)
// ---------------------------------------------------------------------------

describe('GET /user (list)', () => {
  it('non-admin gets 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: USER_PREFIX,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin gets 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: USER_PREFIX,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /user/:id  (own profile, another user's profile, admin)
// ---------------------------------------------------------------------------

describe('GET /user/:id', () => {
  it('user reads own profile: 200, returns { username, id, fullname, admin }, no password field', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${user1Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('username', 'acluser1');
    expect(body).toHaveProperty('id', user1Id);
    expect(body).toHaveProperty('fullname', 'ACL User One');
    expect(body).toHaveProperty('admin', false);
    expect(body).not.toHaveProperty('password');
  });

  it("user reading another user's profile gets 403 (not 401)", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${user2Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin reads any profile: 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${user1Id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PUT /user/:id  (own profile, another user, admin)
// ---------------------------------------------------------------------------

describe('PUT /user/:id', () => {
  it('user updates own profile with username in body: 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${user1Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { username: 'acluser1', fullname: 'ACL User One Updated' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('user updates own profile WITHOUT username in body: 200 (not 401)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${user1Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { fullname: 'ACL User One Again' },
    });
    expect(res.statusCode).toBe(200);
  });

  it("user updating another user's profile gets 403 (not 401)", async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${user2Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { fullname: 'Attempted Unauthorized Update' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin updates any user: 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${user2Id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { fullname: 'Admin Updated Name' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('PUT /user/:id admin flag', () => {
  it('non-admin cannot set the admin flag on their own user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${user1Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        username: 'acluser1',
        fullname: 'ACL User One Again',
        email: 'acluser1@example.com',
        admin: true,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('admin can promote another user by setting admin to true', async () => {
    const promoteRes = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${user1Id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'acluser1',
        fullname: 'ACL User One Again',
        email: 'acluser1@example.com',
        admin: true,
      },
    });

    expect(promoteRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${user1Id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toHaveProperty('admin', true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /user/:id  (own account, another user, admin)
// ---------------------------------------------------------------------------
// NOTE: user deletion is intentionally ordered so that each user is only
// deleted once and later tests still have valid subjects.

describe('DELETE /user/:id', () => {
  it('user trying to delete another user gets 403 (not 401)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `${USER_PREFIX}/${user2Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin deletes a user: 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `${USER_PREFIX}/${user2Id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('user deletes self: 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `${USER_PREFIX}/${userDeleteSelfId}`,
      headers: { Authorization: `Bearer ${userDeleteSelfToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
