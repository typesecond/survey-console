import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import {
  acquireTestDbLock,
  buildApp,
  createUser,
  findUserByUsername,
  getUserPrefix,
  loginUser,
  parseLocationId,
  releaseTestDbLock,
  resetTestDatabase,
  seedUser,
} from '../test-support.js';

let app: FastifyInstance;
let adminToken: string;
const API_PREFIX = '/api';
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
});

afterAll(async () => {
  await app.close();
  await releaseTestDbLock();
});

describe('User routes', () => {
  it('checks that the root route is up', async () => {
    const res = await app.inject({ method: 'GET', url: API_PREFIX });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ root: true });
  });

  it('creates a user, sets Location, and hashes the stored password', async () => {
    const { payload, response } = await createUser(app, {
      username: 'createduser',
      password: 'createduser123!',
      fullname: 'Created User',
      email: 'createduser@example.com',
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['location']).toMatch(
      new RegExp(`${USER_PREFIX}/\\d+`),
    );

    const storedUser = await findUserByUsername(payload.username);
    expect(storedUser).toBeDefined();
    expect(storedUser?.password).not.toBe(payload.password);
    expect(await bcrypt.compare(payload.password, storedUser!.password)).toBe(
      true,
    );
  });

  it('rejects duplicate usernames with 409', async () => {
    await createUser(app, {
      username: 'duplicateuser',
      password: 'duplicateuser123!',
      fullname: 'Duplicate User',
      email: 'duplicateuser@example.com',
    });

    const { response } = await createUser(app, {
      username: 'duplicateuser',
      password: 'anotherpass123!',
      fullname: 'Duplicate User Again',
      email: 'duplicateuser2@example.com',
    });

    expect(response.statusCode).toBe(409);
  });

  it('rejects duplicate emails with 409', async () => {
    await createUser(app, {
      username: 'duplicateemail1',
      password: 'duplicateemail123!',
      fullname: 'Duplicate Email One',
      email: 'duplicateemail@example.com',
    });

    const { response } = await createUser(app, {
      username: 'duplicateemail2',
      password: 'duplicateemail456!',
      fullname: 'Duplicate Email Two',
      email: 'duplicateemail@example.com',
    });

    expect(response.statusCode).toBe(409);
  });

  it('lists users for an admin', async () => {
    await createUser(app, {
      username: 'listuser1',
      password: 'listuser123!',
      fullname: 'List User One',
      email: 'listuser1@example.com',
    });
    await createUser(app, {
      username: 'listuser2',
      password: 'listuser456!',
      fullname: 'List User Two',
      email: 'listuser2@example.com',
    });

    const res = await app.inject({
      method: 'GET',
      url: USER_PREFIX,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.objectContaining({
        count: expect.any(Number),
        users: expect.any(Array),
      }),
    );
    expect(res.json().count).toBe(res.json().users.length);
    expect(res.json().users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'listuser1' }),
        expect.objectContaining({ username: 'listuser2' }),
      ]),
    );
  });

  it('updates fullname without changing the stored password hash', async () => {
    const { payload, response } = await createUser(app, {
      username: 'fullnameonly',
      password: 'fullnameonly123!',
      fullname: 'Full Name Only',
      email: 'fullnameonly@example.com',
    });
    const userId = parseLocationId(response.headers['location']);
    const before = await findUserByUsername(payload.username);

    const putRes = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${userId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { fullname: 'Updated Full Name' },
    });

    expect(putRes.statusCode).toBe(200);

    const after = await findUserByUsername(payload.username);
    expect(after?.fullname).toBe('Updated Full Name');
    expect(after?.password).toBe(before?.password);
  });

  it('updates the password without changing fullname', async () => {
    const { payload, response } = await createUser(app, {
      username: 'passwordonly',
      password: 'passwordonly123!',
      fullname: 'Password Only',
      email: 'passwordonly@example.com',
    });
    const userId = parseLocationId(response.headers['location']);

    const putRes = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${userId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { password: 'brandnewpassword123!' },
    });

    expect(putRes.statusCode).toBe(200);

    const storedUser = await findUserByUsername(payload.username);
    expect(storedUser?.fullname).toBe(payload.fullname);
    expect(
      await bcrypt.compare('brandnewpassword123!', storedUser!.password),
    ).toBe(true);
  });

  it('deletes an existing user', async () => {
    const { response } = await createUser(app, {
      username: 'deletableuser',
      password: 'deletableuser123!',
      fullname: 'Deletable User',
      email: 'deletableuser@example.com',
    });
    const userId = parseLocationId(response.headers['location']);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `${USER_PREFIX}/${userId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `${USER_PREFIX}/${userId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Known behavior gaps', () => {
  it('returns 404 when updating a non-existent user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/99999`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { fullname: 'Nobody' },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when updating a user's username to another existing username", async () => {
    const firstUser = await createUser(app, {
      username: 'rename-source',
      password: 'rename-source123!',
      fullname: 'Rename Source',
      email: 'rename-source@example.com',
    });
    const secondUser = await createUser(app, {
      username: 'rename-target',
      password: 'rename-target123!',
      fullname: 'Rename Target',
      email: 'rename-target@example.com',
    });

    const res = await app.inject({
      method: 'PUT',
      url: `${USER_PREFIX}/${parseLocationId(secondUser.response.headers['location'])}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { username: firstUser.payload.username },
    });

    expect(res.statusCode).toBe(409);
  });
});
