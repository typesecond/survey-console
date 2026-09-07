/*
 * Starter code for stage 3
 */
/*
 * Implementation of /user API using a database
 */
import { FastifyPluginAsync } from 'fastify';
import {
  registerRefreshTokenRecord,
  lookupRefreshTokenRecord,
  revokeTokenFamilyRecords,
  revokeRefreshTokenRecord,
} from './refresh_tokens.js';
import bcrypt from 'bcrypt';
import { config } from '../../config.js';
import {
  countUsers,
  listUsers,
  findUserById,
  findUserByUsername,
  insertUser,
  updateUser,
  deleteUser,
  deleteAllUsers,
} from '../../db/users.js';
import { USER_CACHE_PREFIX, userCacheKey } from '../../lib/cache.js';
/* Functions imported from database layer
import {
  countUsers,
  listUsers,
  findUserById,
  findUserByUsername,
  insertUser,
  updateUser,
  deleteUser,
} from '../../db/users.js';
*/

// begin typescript declarations
type RefreshPayload = {
  sub: string; // user name
  jti: string; // jwt token id
  scope: string[]; // scope to denote this is a refresh token
  iat: number; // issued-at time
  exp: number; // expires at time
};

// end typescript declarations
// begin JSON schema declarations

/* JSON schemas used for various requests. */
const newUserRequestSchema = {
  body: {
    type: 'object',
    properties: {
      username: { type: 'string', minLength: 1 },
      fullname: { type: 'string' },
      email: { type: 'string' },
      password: { type: 'string', minLength: 8 },
    },
    additionalProperties: false,
  },
};

const userUpdateRequestSchema = {
  body: {
    type: 'object',
    properties: {
      username: { type: 'string', minLength: 1 },
      fullname: { type: 'string' },
      admin: { type: 'boolean' },
      email: { type: 'string' },
      password: { type: 'string', minLength: 8 },
    },
    additionalProperties: false,
  },
};

const userInfoSchema = {
  type: 'object',
  properties: {
    username: { type: 'string', minLength: 1 },
    fullname: { type: 'string' },
    email: { type: 'string' },
    id: { type: 'integer' },
    admin: { type: 'boolean' },
    createdAt: { type: 'object' },
  },
  additionalProperties: false,
};

const loginSchema = {
  body: {
    type: 'object',
    properties: {
      username: { type: 'string', minLength: 1 },
      password: { type: 'string', minLength: 8 },
    },
    additionalProperties: false,
  },
};

const idSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
    },
    required: ['id'],
  },
};

const usersListResponseSchema = {
  type: 'object',
  properties: {
    users: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          fullname: { type: 'string' },
          email: { type: 'string' },
          admin: { type: 'boolean' },
        },
      },
    },
    count: { type: 'integer' } /* total number of users */,
  },
  required: ['users', 'count'],
};

const usersListQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, default: 10 },
    },
    additionalProperties: false,
  },
};

const messageSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
  required: ['message'],
  additionalProperties: false,
};

const accessTokenReturnSchema = {
  type: 'object',
  properties: {
    rotated: { type: 'boolean' },
    accessToken: { type: 'string' },
    accessExpiresInSec: { type: 'number' },
    refreshExpiresInSec: { type: 'number' },
  },
  required: [
    'accessToken',
    'accessExpiresInSec',
    'refreshExpiresInSec',
    'rotated',
  ],
  additionalProperties: false,
};

// end JSON schema declarations

const userapi: FastifyPluginAsync = async (fastify, _opts): Promise<void> => {
  const refreshCookieOptions = {
    path: `${fastify.prefix}/refresh`,
    httpOnly: true,
    sameSite: 'lax' as const,
  };

  async function issueTokens(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reply: any,
    userId: number,
    username: string,
    role: string,
    familyId?: string,
    rotated = false,
  ) {
    const accessToken = fastify.jwt.access.sign({
      id: userId,
      sub: username,
      role,
    });

    const record = registerRefreshTokenRecord(
      username,
      userId,
      role,
      config.auth.refresh_token_expiration,
      familyId,
    );

    const refreshToken = fastify.jwt.refresh.sign({
      sub: username,
      jti: record.tokenId,
      scope: ['refresh'],
    });

    reply.setCookie(config.auth.refresh_cookie_name, refreshToken, {
      ...refreshCookieOptions,
    });

    return {
      accessToken,
      accessExpiresInSec: config.auth.access_token_expiration,
      refreshExpiresInSec: config.auth.refresh_token_expiration,
      rotated,
    };
  }

  /* Get list of all users.
   * Admin only.
   * Should support pagination via page and limit query params.
   * Should include a total return count.
   * See usersListResponseSchema.
   */
  fastify.get<{ Querystring: { page?: number; limit?: number } }>(
    '/',
    {
      schema: {
        ...usersListQuerySchema,
        response: {
          200: {
            ...usersListResponseSchema,
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated, fastify.mustbeadmin],
    },
    async (req, _res) => {
      const page = req.query.page ?? 1;
      const limit = req.query.limit ?? 10;
      const [users, total] = await Promise.all([
        listUsers(page, limit),
        countUsers(),
      ]);
      return { users, count: total };
    },
  );

  /* Get information about a single user.
   * User may obtain only their own user info, but not their current hashed password.
   * Admins may obtain all records.
   */
  fastify.get<{
    Params: { id: number };
  }>(
    '/:id',
    {
      schema: {
        ...idSchema,
        response: {
          200: {
            ...userInfoSchema,
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated],
    },
    async (req, _res) => {
      /* Implement this to perform the necessary access control checks
       * and return an object conforming to userInfoSchema if they
       * check out.
       */
      const { id } = req.params;
      const requester = req.user;

      if (requester.role !== 'admin' && requester.id !== id) {
        throw fastify.httpErrors.forbidden('access denied');
      }

      const cacheKey = userCacheKey(id);
      const cachedUser = await fastify.cache.getJSON<{
        id: number;
        username: string;
        fullname: string;
        email: string;
        admin: boolean;
        createdAt: Date;
      }>(cacheKey);
      if (cachedUser) {
        return cachedUser;
      }

      const userRecord = await findUserById(id);
      if (!userRecord) {
        throw fastify.httpErrors.notFound('user not found');
      }

      const payload = {
        id: userRecord.id,
        username: userRecord.username,
        fullname: userRecord.fullname,
        email: userRecord.email,
        admin: userRecord.admin,
        createdAt: userRecord.createdAt,
      };
      await fastify.cache.setJSON(cacheKey, payload);
      return payload;
    },
  );

  fastify.post<{
    Body: {
      username: string;
      password: string;
    };
  }>(
    '/login',
    {
      schema: {
        ...loginSchema,
        response: {
          200: { ...accessTokenReturnSchema },
        },
      },
    },
    async (req, res) => {
      /* Implement this by validating the password
       * and returning an access token and refresh token if successful.
       *
       * Note: this may share logic with the POST /user endpoint where
       * newly created users are logged in.
       *
       * Note: this may share logic with when a refresh token is used.
       */
      const { username, password } = req.body;
      const userRecord = await findUserByUsername(username);

      const storedHash =
        userRecord?.password ??
        '$2b$10$invalidhashfortimingprotectionXXXXXXXXXXXXXXX';
      const valid = await bcrypt.compare(password, storedHash);

      if (!userRecord || !valid) {
        throw fastify.httpErrors.unauthorized('Invalid username or password');
      }

      const role = userRecord.admin ? 'admin' : 'user';
      return issueTokens(
        res,
        userRecord.id,
        userRecord.username,
        role,
        undefined,
        false,
      );
    },
  );

  fastify.post('/logout', async (_req, res) => {
    // The refresh cookie is path-scoped to /refresh, so logout may not receive
    // it on the request. Sending a matching clear-cookie response removes it
    // from the browser regardless.
    res.clearCookie(config.auth.refresh_cookie_name, refreshCookieOptions);
    return res.code(204).send();
  });

  // Clients call /refresh when the short-lived access token expires (or is about to).
  // Either reactively (got a 401, refresh, retry) or proactively (check exp claim, refresh
  // before it expires). The refresh token's lifetime is the real session duration.
  fastify.post('/refresh', async (req, res) => {
    /* Implement this.
     * - retrieve refresh token from req.cookies
     * - decode + verify it
     * - look up refresh token record via lookupRefreshTokenRecord
     * - if already revoked, revoke family
     * - revoke the refresh token
     * - Call registerRefreshTokenRecord to register new one
     * - issue new access token and return both access and refresh to client
     */
    const cookieName = config.auth.refresh_cookie_name;
    const cookies = req.cookies as Record<string, string> | undefined;
    const rawToken = cookies?.[cookieName];

    if (!rawToken) {
      throw fastify.httpErrors.unauthorized('Missing refresh cookie');
    }

    let payload: RefreshPayload;
    try {
      payload = fastify.jwt.refresh.verify(rawToken) as RefreshPayload;
    } catch {
      throw fastify.httpErrors.unauthorized('Invalid refresh token');
    }

    if (!payload.jti || !payload.scope?.includes('refresh')) {
      throw fastify.httpErrors.unauthorized('Invalid refresh token');
    }

    const record = lookupRefreshTokenRecord(payload.jti);
    if (!record) {
      throw fastify.httpErrors.unauthorized('Refresh token not found');
    }

    if (record.revoked) {
      revokeTokenFamilyRecords(record.familyId);
      throw fastify.httpErrors.unauthorized('Refresh token reuse detected');
    }

    revokeRefreshTokenRecord(record.tokenId);
    return issueTokens(
      res,
      record.id,
      record.sub,
      record.role,
      record.familyId,
      true,
    );
  });

  /*
   * Create a new user and log them in.
   * New users are never admins.
   */
  fastify.post<{
    Body: {
      username: string;
      fullname: string;
      password: string;
      email: string;
    };
  }>(
    '/',
    {
      schema: {
        ...newUserRequestSchema,
        response: {
          201: {
            ...accessTokenReturnSchema,
          },
        },
      },
    },
    async (req, res) => {
      /* Implement this.
       * Add new user to user db (hashing the password)
       * Log user in by issues refresh + access token.
       * Reuses code with /login endpoint
       */
      const { username, fullname, password, email } = req.body;

      const hashedPassword = await bcrypt.hash(
        password,
        config.auth.bcrypt_salt_rounds,
      );

      const result = await insertUser({
        username,
        fullname,
        password: hashedPassword,
        email,
        admin: false,
      });

      if (result.isErr) {
        throw fastify.httpErrors.conflict('user already exists');
      }

      res.code(201);
      res.header('Location', `${req.url}/${result.value.id}`);

      return issueTokens(
        res,
        result.value.id,
        result.value.username,
        'user',
        undefined,
        false,
      );
    },
  );

  /*
   * Update user profile.  User may update only their own profile;
   * admin may update all profiles.
   */
  fastify.put<{
    Params: { id: number };
    Body: {
      admin?: boolean;
      username?: string;
      fullname?: string;
      password?: string;
      email?: string;
    };
  }>(
    '/:id',
    {
      schema: {
        ...idSchema,
        ...userUpdateRequestSchema,
        response: {
          200: {
            ...messageSchema,
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated],
    },
    async (req, _res) => {
      /* Implement this.
       * - Check authentication and retrieve user
       * - update user object properties (username, fullname, password)
       *   as given
       * - save new user.
       * - be careful to throw httpErrors.conflict if .save fails with
       *   'duplicate user name'
       */
      const { id } = req.params;
      const requester = req.user;

      if (requester.role !== 'admin' && requester.id !== id) {
        throw fastify.httpErrors.forbidden('access denied');
      }

      if (req.body.admin !== undefined && requester.role !== 'admin') {
        throw fastify.httpErrors.forbidden('admin required');
      }

      const updates: {
        admin?: boolean;
        username?: string;
        fullname?: string;
        password?: string;
        email?: string;
      } = {};

      if (req.body.username !== undefined) updates.username = req.body.username;
      if (req.body.fullname !== undefined) updates.fullname = req.body.fullname;
      if (req.body.email !== undefined) updates.email = req.body.email;
      if (req.body.admin !== undefined) updates.admin = req.body.admin;
      if (req.body.password !== undefined) {
        updates.password = await bcrypt.hash(
          req.body.password,
          config.auth.bcrypt_salt_rounds,
        );
      }

      const result = await updateUser(id, updates);
      if (result.isErr) {
        if (result.error === 'not_found') {
          throw fastify.httpErrors.notFound('user not found');
        }
        if (result.error === 'conflict') {
          throw fastify.httpErrors.conflict('username or email already exists');
        }
      }

      await fastify.cache.del(userCacheKey(id));
      return { message: 'user updated' };
    },
  );

  /* Delete user.
   * In most real-world systems, users cannot delete themselves directly
   * via a REST API request due to compliance constraints - companies need
   * to keep records of past users, etc.
   */
  fastify.delete<{
    Params: { id: number };
  }>(
    '/:id',
    {
      schema: {
        ...idSchema,
      },
      preHandler: [fastify.mustbeauthenticated],
    },
    async (req, _res) => {
      /* Implement this.
       * - check authentication
       * - delete user if successful
       */
      const { id } = req.params;
      const requester = req.user;

      if (requester.role !== 'admin' && requester.id !== id) {
        throw fastify.httpErrors.forbidden('access denied');
      }

      const result = await deleteUser(id);
      if (result.isErr) {
        throw fastify.httpErrors.notFound('user not found');
      }

      await fastify.cache.del(userCacheKey(id));
      return { message: 'user deleted' };
    },
  );

  /* Delete the entire user database. Admin only. */
  fastify.delete(
    '/',
    {
      preHandler: [fastify.mustbeauthenticated, fastify.mustbeadmin],
    },
    async (_req, _res) => {
      await deleteAllUsers();
      await fastify.cache.deleteByPrefix(USER_CACHE_PREFIX);
      return { message: 'user database deleted' };
    },
  );
};

export default userapi;
