/*
 * Starter code for stage 3.
 */
import { FastifyPluginAsync } from 'fastify';
import {
  countQuestions,
  listQuestions,
  findQuestionById,
  createQuestion,
  createAnswerChoices,
  deleteQuestionWithDependents,
  replaceQuestion,
  insertVote,
  findUserVote,
  getVoteResults,
} from '../../db/questions.js';
import { questionResultsCacheKey } from '../../lib/cache.js';
/* Functions imported from database layer
import {
  countQuestions,
  listQuestions,
  findQuestionById,
  createQuestion,
  createAnswerChoices,
  deleteQuestionWithDependents,
  replaceQuestion,
  insertVote,
  findUserVote,
  getVoteResults,
} from '../../db/questions.js';
*/

/* JSON schemas used for various requests. */
const newQuestionRequestSchema = {
  body: {
    type: 'object',
    properties: {
      question: { type: 'string', minLength: 1 } /* Question heading. */,
      description: { type: 'string' } /* Description (subtext) */,
      choices: {
        type: 'array',
        items: {
          /* Ordered list of choices (strings) */ type: 'string',
        },
      },
    },
    required: ['question', 'description', 'choices'],
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

const questionsListQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, default: 10 },
    },
    additionalProperties: false,
  },
};

const newQuestionReturnSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    message: { type: 'string' },
  },
  required: ['id', 'message'],
  additionalProperties: false,
};

const questionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    createdAt: { type: 'object' },
    question: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    choices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' } /* answerchoice id */,
          description: { type: 'string' } /* description of answer option */,
        },
      },
    },
  },
  additionalProperties: false,
};

const resultResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      choice: { type: 'integer' },
      count: { type: 'integer' },
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

const voteRequestSchema = {
  body: {
    type: 'object',
    properties: {
      choice: { type: 'integer' },
    },
    required: ['choice'],
  },
};

const voteResponseSchema = {
  type: 'object',
  properties: {
    answerchoiceid: { type: 'integer' },
    surveyid: { type: 'integer' },
    userid: { type: 'integer' },
  },
  required: ['answerchoiceid', 'surveyid', 'userid'],
};

const questionapi: FastifyPluginAsync = async (
  fastify,
  _opts,
): Promise<void> => {
  /* Get list of all questions.
   * Should support paging via page + limit
   * Should support a count with the total number of questions
   */
  fastify.get<{ Querystring: { page?: number; limit?: number } }>(
    '/',
    {
      schema: {
        ...questionsListQuerySchema,
      },
      preHandler: [fastify.mustbeauthenticated],
    },
    async (req, _res) => {
      /* Implement this using countQuestions and listQuestions. */
      /* return { questions: questionpage, count: total }; */
      const page = req.query.page ?? 1;
      const limit = req.query.limit ?? 10;
      const [questions, total] = await Promise.all([
        listQuestions(page, limit),
        countQuestions(),
      ]);
      return { questions, count: total };
    },
  );

  /*
   * Create a new question by specifying the question text, description, and
   * answer choices.
   *
   * Admin only.
   */
  fastify.post<{
    Body: {
      question: string;
      description: string;
      choices: string[];
    };
  }>(
    '/',
    {
      schema: {
        ...newQuestionRequestSchema,
        response: {
          201: {
            ...newQuestionReturnSchema,
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated, fastify.mustbeadmin],
    },
    async (req, res) => {
      /* Implement this.
       * Might use createQuestion, createAnswerChoices
       */
      const { question, description, choices } = req.body;
      if (!choices || choices.length === 0) {
        throw fastify.httpErrors.badRequest('choices must not be empty');
      }

      const created = await createQuestion(question, description);
      await createAnswerChoices(created.id, choices);

      res.code(201);
      res.header('Location', `${req.url}/${created.id}`);
      return { id: created.id, message: 'question created' };
    },
  );

  /* Get one question.
   * Include answerchoice with (id, description).
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
            ...questionResponseSchema,
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated],
    },
    async (req, _res) => {
      /* Implement this
       * Could use findQuestionById + post processing. */
      const question = await findQuestionById(req.params.id);
      if (!question) {
        throw fastify.httpErrors.notFound('question not found');
      }
      return {
        id: question.id,
        createdAt: question.createdAt,
        question: question.question,
        description: question.description,
        choices: question.choices ?? [],
      };
    },
  );

  /*
   * Update a question.
   * This should delete all votes on this question and all previous answer choices,
   * and replace them with the new choices.
   * Admin only.
   */
  fastify.put<{
    Params: { id: number };
    Body: {
      question: string;
      description: string;
      choices: string[];
    };
  }>(
    '/:id',
    {
      schema: {
        ...idSchema,
        ...newQuestionRequestSchema,
        response: {
          200: {
            ...messageSchema,
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated, fastify.mustbeadmin],
    },
    async (req, _res) => {
      /* Implement this.
       * Could use replaceQuestion
       */
      const { question, description, choices } = req.body;
      if (!choices || choices.length === 0) {
        throw fastify.httpErrors.badRequest('choices must not be empty');
      }

      const result = await replaceQuestion(
        req.params.id,
        question,
        description,
        choices,
      );
      if (result.isErr) {
        if (result.error === 'not_found') {
          throw fastify.httpErrors.notFound('question not found');
        }
      }
      await fastify.cache.del(questionResultsCacheKey(req.params.id));
      return { message: 'question updated' };
    },
  );

  /* Delete a question.
   * This must delete all votes and answer choices associated with this question.
   * Admin only.
   */
  fastify.delete<{
    Params: { id: number };
  }>(
    '/:id',
    {
      schema: {
        ...idSchema,
      },
      preHandler: [fastify.mustbeauthenticated, fastify.mustbeadmin],
    },
    async (req, _res) => {
      /* Implement this. Could use deleteQuestionWithDependents */
      const result = await deleteQuestionWithDependents(req.params.id);
      if (result.isErr) {
        throw fastify.httpErrors.notFound('question not found');
      }
      await fastify.cache.del(questionResultsCacheKey(req.params.id));
      return { message: 'question deleted' };
    },
  );

  /* vote on a question.
   * Takes answerchoice id in body.
   * Replaces any previous vote.
   */
  fastify.post<{
    Body: {
      choice: number;
    };
    Params: { id: number };
  }>(
    '/:id/vote',
    {
      schema: {
        ...idSchema,
        ...voteRequestSchema,
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
       * Could use insertVote
       */
      const { choice } = req.body;
      const result = await insertVote(choice, req.params.id, req.user.id);
      if (result.isErr) {
        if (result.error === 'not_found') {
          throw fastify.httpErrors.notFound('question not found');
        }
        if (result.error === 'invalid_choice') {
          throw fastify.httpErrors.badRequest('invalid choice');
        }
      }
      const latestResults = await getVoteResults(req.params.id);
      await fastify.cache.setJSON(
        questionResultsCacheKey(req.params.id),
        latestResults,
      );
      await fastify.broadcastQuestionResults(req.params.id, latestResults);
      return { message: 'vote recorded' };
    },
  );

  // retrieve user's previous vote
  fastify.get<{
    Params: { id: number };
  }>(
    '/:id/vote',
    {
      schema: {
        ...idSchema,
        response: {
          200: {
            anyOf: [voteResponseSchema, { type: 'null' }],
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated],
    },
    async (req, _res) => {
      /* Implement this.
       * Could use findUserVote
       */
      const existing = await findUserVote(req.params.id, req.user.id);
      return existing ?? null;
    },
  );

  /*
   * Retrieve vote totals.
   *
   * Tabulated by answerchoiceid
   */
  fastify.get<{
    Params: { id: number };
  }>(
    '/:id/results',
    {
      schema: {
        ...idSchema,
        response: {
          200: {
            ...resultResponseSchema,
          },
        },
      },
      preHandler: [fastify.mustbeauthenticated],
    },
    async (req, _res) => {
      /* Implement this.
       * Could use getVoteResults
       */
      const cacheKey = questionResultsCacheKey(req.params.id);
      const cachedResults =
        await fastify.cache.getJSON<Array<{ choice: number; count: number }>>(
          cacheKey,
        );
      if (cachedResults) {
        return cachedResults;
      }

      const results = await getVoteResults(req.params.id);
      await fastify.cache.setJSON(cacheKey, results);
      return results;
    },
  );
};

export default questionapi;
