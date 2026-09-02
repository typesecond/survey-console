import bcrypt from 'bcrypt';
import { asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { config } from '../src/config.js';
import { db } from '../src/db/index.js';
import { user, surveyquestion, answerchoice } from '../src/db/schema.js';
import { buildTestApp } from './vitest-helper.js';

const TEST_DB_LOCK_ID = 37542026;
let uniqueCounter = 0;

// Options for inserting a concrete user fixture into the test database.
type UserSeedOptions = {
  username?: string;
  password?: string;
  fullname?: string;
  email?: string;
  admin?: boolean;
};

// Shape used when posting users through the HTTP API in tests.
type UserPayload = {
  username: string;
  password: string;
  fullname: string;
  email: string;
};

// Produces a unique suffix so repeated test data does not collide on uniques.
function nextSuffix() {
  uniqueCounter += 1;
  return `${process.pid}_${Date.now()}_${uniqueCounter}`;
}

// Computes the mounted user route prefix from the active test config.
export function getUserPrefix() {
  return `${config.routes.api_prefix.replace(/\/$/, '')}${config.routes.user_prefix}`;
}

// Builds the Fastify app with cookies enabled for auth tests.
export async function buildApp() {
  return buildTestApp({ cookies: true });
}

// Takes an advisory lock so only one DB-mutating suite runs at a time.
export async function acquireTestDbLock() {
  // Serialize suites that mutate the shared test database.
  await db.execute(sql`select pg_advisory_lock(${TEST_DB_LOCK_ID})`);
}

// Releases the advisory lock after a suite is done mutating the database.
export async function releaseTestDbLock() {
  await db.execute(sql`select pg_advisory_unlock(${TEST_DB_LOCK_ID})`);
}

// Clears persisted user state so each suite starts from a known database.
export async function resetTestDatabase() {
  // Keep tests isolated by clearing all persisted state between suites.
  try {
    await db.execute(
      sql`truncate table ${user}, ${surveyquestion} restart identity cascade`,
    );
  } catch {
    // surveyquestion may not exist yet; fall back to just users
    await db.execute(sql`truncate table ${user} restart identity cascade`);
  }
}

// Creates a valid user payload with unique defaults, then applies overrides.
export function makeUserPayload(
  overrides: Partial<UserPayload> = {},
): UserPayload {
  const suffix = nextSuffix();
  return {
    username: `user_${suffix}`,
    password: 'password123!',
    fullname: `User ${suffix}`,
    email: `user_${suffix}@example.com`,
    ...overrides,
  };
}

// Inserts a user directly into Postgres for setup scenarios that need seeding.
export async function seedUser(options: UserSeedOptions = {}) {
  const userPayload = makeUserPayload(options);
  // Mirror the production write path by storing only hashed passwords.
  const hashedPassword = await bcrypt.hash(
    userPayload.password,
    config.auth.bcrypt_salt_rounds,
  );

  const [createdUser] = await db
    .insert(user)
    .values({
      username: userPayload.username,
      fullname: userPayload.fullname,
      email: userPayload.email,
      password: hashedPassword,
      admin: options.admin ?? false,
    })
    .returning();

  return { user: createdUser, password: userPayload.password };
}

// Looks up a persisted user record by username for post-request assertions.
export async function findUserByUsername(username: string) {
  return db.query.user.findFirst({
    where: { username },
  });
}

// Extracts the numeric resource id from a creation response Location header.
export function parseLocationId(location: string | string[] | undefined) {
  const value = Array.isArray(location) ? location[0] : location;
  if (!value) {
    throw new Error('Missing Location header');
  }

  // Route tests rely on the app's Location header to discover created ids.
  const id = Number(value.split('/').pop());
  if (!Number.isInteger(id)) {
    throw new Error(`Invalid Location header: ${value}`);
  }

  return id;
}

// Logs in through the real HTTP endpoint and returns the inject response.
export async function loginUser(
  app: FastifyInstance,
  username: string,
  password: string,
) {
  const userPrefix = getUserPrefix();
  return app.inject({
    method: 'POST',
    url: `${userPrefix}/login`,
    payload: { username, password },
  });
}

// Creates a user through the real HTTP endpoint and returns payload plus response.
export async function createUser(
  app: FastifyInstance,
  payload?: Partial<UserPayload>,
) {
  const userPrefix = getUserPrefix();
  const fullPayload = makeUserPayload(payload);
  const response = await app.inject({
    method: 'POST',
    url: userPrefix,
    payload: fullPayload,
  });

  return { payload: fullPayload, response };
}

// ── Question helpers ──

// Shape used when posting questions through the HTTP API in tests.
type QuestionPayload = {
  question: string;
  description: string;
  choices: string[];
};

// Computes the mounted question route prefix from the active test config.
export function getQuestionPrefix() {
  return `${config.routes.api_prefix.replace(/\/$/, '')}/question`;
}

// Creates a valid question payload with unique defaults, then applies overrides.
export function makeQuestionPayload(
  overrides: Partial<QuestionPayload> = {},
): QuestionPayload {
  const suffix = nextSuffix();
  return {
    question: `Question ${suffix}?`,
    description: `Description for question ${suffix}`,
    choices: ['Choice A', 'Choice B', 'Choice C'],
    ...overrides,
  };
}

// Creates a question through the real HTTP endpoint and returns payload plus response.
export async function createQuestion(
  app: FastifyInstance,
  token: string,
  payload?: Partial<QuestionPayload>,
) {
  const questionPrefix = getQuestionPrefix();
  const fullPayload = makeQuestionPayload(payload);
  const response = await app.inject({
    method: 'POST',
    url: questionPrefix,
    headers: { Authorization: `Bearer ${token}` },
    payload: fullPayload,
  });

  return { payload: fullPayload, response };
}

// Looks up answer choice IDs for a question directly from the database,
// sorted by surveypos. Use this instead of GET /:id when the response
// schema may reject extra fields.
export async function getChoiceIds(questionId: number): Promise<number[]> {
  const rows = await db
    .select({ id: answerchoice.id })
    .from(answerchoice)
    .where(eq(answerchoice.surveyid, questionId))
    .orderBy(asc(answerchoice.surveypos));
  return rows.map((r) => r.id);
}
