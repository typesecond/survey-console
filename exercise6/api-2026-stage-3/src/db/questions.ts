/*
 * Database access functions for questions, answer choices, and votes.
 * Abstracts drizzle-specific code away from route handlers.
 */
import { db } from './index.js';
import { surveyquestion, answerchoice, vote } from './schema.js';
import { and, asc, eq, count } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Ok, Err } from '../lib/result.js';

const UNIQUE_VIOLATION = '23505';

type DbError = 'conflict' | 'not_found' | 'invalid_choice';

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

export async function countQuestions() {
  const [row] = await db.select({ count: count() }).from(surveyquestion);
  return Number(row?.count ?? 0);
}

export async function listQuestions(page: number, limit: number) {
  const offset = (page - 1) * limit;
  return db
    .select({
      id: surveyquestion.id,
      question: surveyquestion.question,
      description: surveyquestion.description,
      createdAt: surveyquestion.createdAt,
    })
    .from(surveyquestion)
    .orderBy(asc(surveyquestion.id))
    .limit(limit)
    .offset(offset);
}

export async function findQuestionById(id: number) {
  return db.query.surveyquestion.findFirst({
    where: { id },
    with: {
      choices: {
        columns: { id: true, description: true },
        orderBy: { surveypos: 'asc' },
      },
    },
  });
}

export async function createQuestion(question: string, description: string) {
  const [created] = await db
    .insert(surveyquestion)
    .values({ question, description })
    .returning();
  return created;
}

export async function createAnswerChoices(surveyid: number, choices: string[]) {
  if (choices.length === 0) return [];
  const payload = choices.map((description, index) => ({
    description,
    surveyid,
    surveypos: index,
  }));
  return db.insert(answerchoice).values(payload).returning();
}

export async function replaceQuestion(
  id: number,
  question: string,
  description: string,
  choices: string[],
) {
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(surveyquestion)
        .set({ question, description })
        .where(eq(surveyquestion.id, id))
        .returning({ id: surveyquestion.id });

      if (!updated) {
        return Err<DbError>('not_found');
      }

      await tx.delete(vote).where(eq(vote.surveyid, id));
      await tx.delete(answerchoice).where(eq(answerchoice.surveyid, id));

      if (choices.length > 0) {
        await tx.insert(answerchoice).values(
          choices.map((choice, index) => ({
            description: choice,
            surveyid: id,
            surveypos: index,
          })),
        );
      }

      return Ok(true);
    });
  } catch (error) {
    if (getPgErrorCode(error) === UNIQUE_VIOLATION) {
      return Err<DbError>('conflict');
    }
    throw error;
  }
}

export async function deleteQuestionWithDependents(id: number) {
  return db.transaction(async (tx) => {
    await tx.delete(vote).where(eq(vote.surveyid, id));
    await tx.delete(answerchoice).where(eq(answerchoice.surveyid, id));
    const deleted = await tx
      .delete(surveyquestion)
      .where(eq(surveyquestion.id, id))
      .returning({ id: surveyquestion.id });
    if (deleted.length === 0) {
      return Err<DbError>('not_found');
    }
    return Ok(true);
  });
}

export async function insertVote(
  answerchoiceid: number,
  surveyid: number,
  userid: number,
) {
  const question = await db.query.surveyquestion.findFirst({
    where: { id: surveyid },
    columns: { id: true },
  });
  if (!question) {
    return Err<DbError>('not_found');
  }

  const choice = await db.query.answerchoice.findFirst({
    where: { id: answerchoiceid, surveyid },
    columns: { id: true },
  });
  if (!choice) {
    return Err<DbError>('invalid_choice');
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(vote)
      .where(and(eq(vote.userid, userid), eq(vote.surveyid, surveyid)));
    await tx.insert(vote).values({ answerchoiceid, surveyid, userid });
  });

  return Ok({ answerchoiceid, surveyid, userid });
}

export async function findUserVote(surveyid: number, userid: number) {
  return db.query.vote.findFirst({
    where: { surveyid, userid },
  });
}

export async function getVoteResults(surveyid: number) {
  const rows = await db
    .select({
      choice: vote.answerchoiceid,
      count: count(),
    })
    .from(vote)
    .where(eq(vote.surveyid, surveyid))
    .groupBy(vote.answerchoiceid)
    .orderBy(asc(vote.answerchoiceid));

  return rows.map((row) => ({
    choice: row.choice,
    count: Number(row.count),
  }));
}
