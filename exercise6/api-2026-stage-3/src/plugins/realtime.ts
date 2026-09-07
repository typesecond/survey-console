import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { config } from '../config.js';
import { questionResultsRoom } from '../lib/cache.js';

type AppRedisClient = ReturnType<typeof createClient>;

type VoteResult = {
  choice: number;
  count: number;
};

type LiveResultsPayload = {
  questionId: number;
  results: VoteResult[];
  replicaId: string;
  emittedAt: string;
};

type RedisCacheApi = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
};

function createRedisUrl() {
  const auth = config.redis.password
    ? `${encodeURIComponent(config.redis.password)}@`
    : '';
  return `redis://${auth}${config.redis.host}:${config.redis.port}/${config.redis.db}`;
}

async function connectRedisClient(name: string) {
  const client = createClient({ url: createRedisUrl() });
  client.on('error', (error) => {
    console.error(`[redis:${name}]`, error);
  });
  await client.connect();
  return client;
}

function createCache(redis: AppRedisClient): RedisCacheApi {
  return {
    async getJSON<T>(key: string) {
      const value = await redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    },
    async setJSON(key, value, ttlSeconds = config.redis.cache_ttl_seconds) {
      await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
    },
    async del(...keys) {
      if (keys.length === 0) return;
      await Promise.all(keys.map((key) => redis.del(key)));
    },
    async deleteByPrefix(prefix) {
      for await (const key of redis.scanIterator({ MATCH: `${prefix}*` })) {
        await redis.del(String(key));
      }
    },
  };
}

export default fp(async (fastify) => {
  const redis = await connectRedisClient('cache');
  const redisPublisher = await connectRedisClient('publisher');
  const redisSubscriber = await connectRedisClient('subscriber');

  const io = new Server(fastify.server, {
    path: '/socket.io',
    serveClient: false,
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.adapter(createAdapter(redisPublisher, redisSubscriber));
  io.on('connection', (socket) => {
    socket.on('question-results:subscribe', (questionId: number) => {
      if (!Number.isInteger(questionId) || questionId <= 0) {
        return;
      }
      void socket.join(questionResultsRoom(questionId));
    });

    socket.on('question-results:unsubscribe', (questionId: number) => {
      if (!Number.isInteger(questionId) || questionId <= 0) {
        return;
      }
      void socket.leave(questionResultsRoom(questionId));
    });
  });

  fastify.decorate('redis', redis);
  fastify.decorate('redisPublisher', redisPublisher);
  fastify.decorate('redisSubscriber', redisSubscriber);
  fastify.decorate('cache', createCache(redis));
  fastify.decorate('io', io);
  fastify.decorate('replicaId', config.runtime.replica_id);
  fastify.decorate(
    'broadcastQuestionResults',
    async (questionId: number, results: VoteResult[]) => {
      const payload: LiveResultsPayload = {
        questionId,
        results,
        replicaId: config.runtime.replica_id,
        emittedAt: new Date().toISOString(),
      };

      await io
        .to(questionResultsRoom(questionId))
        .emit('question-results:update', payload);
    },
  );

  fastify.addHook('onRequest', async (_request, reply) => {
    reply.header('X-Replica-Id', config.runtime.replica_id);
  });

  fastify.addHook('onClose', async () => {
    await Promise.all([
      redis.quit(),
      redisPublisher.quit(),
      redisSubscriber.quit(),
    ]);
    io.close();
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    redis: AppRedisClient;
    redisPublisher: AppRedisClient;
    redisSubscriber: AppRedisClient;
    cache: RedisCacheApi;
    io: Server;
    replicaId: string;
    broadcastQuestionResults(
      questionId: number,
      results: VoteResult[],
    ): Promise<void>;
  }
}
