/*
 * Various utility functions for authentications.
 * These are registered as a plugin here so that they
 * are globally available
 */
import { FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config.js';

// payload of a JWT access token
export type AccessPayload = {
  id: number; // user id
  sub: string; // user name
  role: string; // role: user/admin
  iat: number; // issued-at time
  exp: number; // expires at time
};

// Note: these globally augment fastify, they do not need to be imported
declare module 'fastify' {
  // TS definitions for the mustbeauthenticated and mustbeadmin decorators
  interface FastifyInstance {
    mustbeauthenticated: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    mustbeadmin: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }

  interface FastifyRequest {
    accessVerify<T extends object = object>(): Promise<T>;
    user: AccessPayload;
  }
}

declare module '@fastify/jwt' {
  // as per https://github.com/fastify/fastify-jwt?tab=readme-ov-file#typescript-1
  interface FastifyJWT {
    user: AccessPayload;
  }
  // Extend the JWT interface so TypeScript knows about the fastify.jwt.access
  // and fastify.jwt.refresh methods that are added by @fastify/jwt.
  interface JWT {
    access: JWT;
    refresh: JWT;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify, _opts) => {
  // Primary instance: signs/verifies access tokens.
  // Stored at fastify.jwt.access; request.accessVerify() reads
  // Authorization: Bearer automatically.
  // See https://github.com/fastify/fastify-jwt?tab=readme-ov-file#sign
  await fastify.register(fastifyJwt, {
    secret: config.auth.access_token_secret,
    namespace: 'access', // fastify.jwt.access = JWT instance
    jwtVerify: 'accessVerify', // renames request.jwtVerify -> request.accessVerify
    sign: { expiresIn: config.auth.access_token_expiration },
  });

  // Secondary instance: signs/verifies refresh tokens with a different secret.
  // Stored at fastify.jwt.refresh; we verify refresh tokens explicitly from the cookie.
  await fastify.register(fastifyJwt, {
    secret: config.auth.refresh_token_secret,
    namespace: 'refresh', // fastify.jwt.refresh = JWT instance
    sign: { expiresIn: config.auth.refresh_token_expiration },
  });

  // Decorate the fastify object with a method 'mustbeauthenticated' that
  // can then be invoked as a preHandler, see
  // https://fastify.dev/docs/latest/Reference/Lifecycle/
  // and https://fastify.dev/docs/latest/Reference/Decorators/
  fastify.decorate('mustbeauthenticated', async (request, _reply) => {
    try {
      request.user = await request.accessVerify<AccessPayload>();
    } catch {
      throw fastify.httpErrors.unauthorized('missing or invalid bearer token');
    }
  });

  fastify.decorate('mustbeadmin', async (request, _reply) => {
    if (request.user.role !== 'admin') {
      throw fastify.httpErrors.forbidden('admin required');
    }
  });
};

export default fastifyPlugin(authPlugin);
