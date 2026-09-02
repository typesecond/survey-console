/*
 * Database access functions for users.
 * Abstracts drizzle-specific code away from route handlers.
 */
import { db } from './index.js';
import { user } from './schema.js';
import { asc, eq, count } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Ok, Err } from '../lib/result.js';

const UNIQUE_VIOLATION = '23505';

type DbError = 'conflict' | 'not_found';

function getPgErrorCode(error: unknown): string | undefined {
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string } | undefined;
    return cause?.code;
  }
  if (typeof error === 'object' && error !== null) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

export async function countUsers() {
  const [row] = await db.select({ count: count() }).from(user);
  return Number(row?.count ?? 0);
}

export async function listUsers(page: number, limit: number) {
  const offset = (page - 1) * limit;
  return db
    .select({
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      email: user.email,
      admin: user.admin,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.id))
    .limit(limit)
    .offset(offset);
}

export async function findUserById(id: number) {
  return db.query.user.findFirst({
    where: { id },
  });
}

export async function findUserByUsername(username: string) {
  return db.query.user.findFirst({
    where: { username },
  });
}

export async function insertUser(values: {
  username: string;
  admin: boolean;
  fullname: string;
  email: string;
  password: string;
}) {
  try {
    const [created] = await db.insert(user).values(values).returning();
    return Ok(created);
  } catch (error) {
    if (getPgErrorCode(error) === UNIQUE_VIOLATION) {
      return Err<DbError>('conflict');
    }
    throw error;
  }
}

export async function updateUser(
  id: number,
  values: {
    username?: string;
    admin?: boolean;
    fullname?: string;
    email?: string;
    password?: string;
  },
) {
  try {
    const [updated] = await db
      .update(user)
      .set(values)
      .where(eq(user.id, id))
      .returning();

    if (!updated) {
      return Err<DbError>('not_found');
    }

    return Ok(updated);
  } catch (error) {
    if (getPgErrorCode(error) === UNIQUE_VIOLATION) {
      return Err<DbError>('conflict');
    }
    throw error;
  }
}

export async function deleteUser(id: number) {
  const deleted = await db
    .delete(user)
    .where(eq(user.id, id))
    .returning({ id: user.id });

  if (deleted.length === 0) {
    return Err<DbError>('not_found');
  }

  return Ok(true);
}

export async function deleteAllUsers() {
  await db.delete(user);
  return Ok(true);
}
