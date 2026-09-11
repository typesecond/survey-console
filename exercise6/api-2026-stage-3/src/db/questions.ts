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

export type QuestionGraphNode = {
  id: number;
  label: string;
  description: string;
  voteCount: number;
  choiceCount: number;
};

export type QuestionGraphEdge = {
  source: number;
  target: number;
  sharedVoters: number;
  sharedVoterRatio: number;
  distributionSimilarity: number;
  weight: number;
};

export type AnswerChoiceGraphNode = {
  id: number;
  label: string;
  questionId: number;
  questionLabel: string;
  voteCount: number;
};

export type AnswerChoiceGraphEdge = {
  source: number;
  target: number;
  sharedVoters: number;
  affinity: number;
  contextSimilarity: number;
  weight: number;
};

export type QuestionSimilarityGraph = {
  nodes: QuestionGraphNode[];
  edges: QuestionGraphEdge[];
  stats: {
    questionCount: number;
    edgeCount: number;
    maxVotes: number;
  };
};

export type AnswerChoiceAffinityGraph = {
  nodes: AnswerChoiceGraphNode[];
  edges: AnswerChoiceGraphEdge[];
  stats: {
    choiceCount: number;
    edgeCount: number;
    maxVotes: number;
  };
};

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

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function buildDistributionSimilarity(countsA: number[], countsB: number[]) {
  const maxLength = Math.max(countsA.length, countsB.length);
  const paddedA = [...countsA].sort((a, b) => b - a);
  const paddedB = [...countsB].sort((a, b) => b - a);
  while (paddedA.length < maxLength) paddedA.push(0);
  while (paddedB.length < maxLength) paddedB.push(0);

  const totalA = paddedA.reduce((sum, value) => sum + value, 0);
  const totalB = paddedB.reduce((sum, value) => sum + value, 0);
  if (totalA === 0 || totalB === 0) {
    return 0;
  }

  const normA = paddedA.map((value) => value / totalA);
  const normB = paddedB.map((value) => value / totalB);
  const dot = normA.reduce(
    (sum, value, index) => sum + value * normB[index],
    0,
  );
  const magA = Math.sqrt(normA.reduce((sum, value) => sum + value * value, 0));
  const magB = Math.sqrt(normB.reduce((sum, value) => sum + value * value, 0));
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dot / (magA * magB);
}

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length >= 3 &&
          !new Set([
            'the',
            'and',
            'for',
            'with',
            'that',
            'this',
            'from',
            'what',
            'your',
            'have',
            'will',
            'would',
            'about',
          ]).has(token),
      ),
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
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

export async function getQuestionSimilarityGraph(): Promise<QuestionSimilarityGraph> {
  const [questions, votes] = await Promise.all([
    db.query.surveyquestion.findMany({
      columns: {
        id: true,
        question: true,
        description: true,
      },
      with: {
        choices: {
          columns: {
            id: true,
            description: true,
          },
          orderBy: {
            surveypos: 'asc',
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    }),
    db.select().from(vote),
  ]);

  const votesByQuestion = new Map<number, typeof votes>();
  const voterSets = new Map<number, Set<number>>();
  const questionChoiceCounts = new Map<number, number[]>();

  for (const row of votes) {
    const current = votesByQuestion.get(row.surveyid) ?? [];
    current.push(row);
    votesByQuestion.set(row.surveyid, current);

    const voterSet = voterSets.get(row.surveyid) ?? new Set<number>();
    voterSet.add(row.userid);
    voterSets.set(row.surveyid, voterSet);
  }

  const nodes: QuestionGraphNode[] = questions.map((question) => {
    const questionVotes = votesByQuestion.get(question.id) ?? [];
    const choiceCounts = question.choices.map(
      (choice) =>
        questionVotes.filter((row) => row.answerchoiceid === choice.id).length,
    );
    questionChoiceCounts.set(question.id, choiceCounts);
    return {
      id: question.id,
      label: question.question,
      description: question.description,
      voteCount: questionVotes.length,
      choiceCount: question.choices.length,
    };
  });

  const edges: QuestionGraphEdge[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    for (let inner = index + 1; inner < nodes.length; inner += 1) {
      const left = nodes[index];
      const right = nodes[inner];
      const leftVoters = voterSets.get(left.id) ?? new Set<number>();
      const rightVoters = voterSets.get(right.id) ?? new Set<number>();

      let sharedVoters = 0;
      for (const userId of leftVoters) {
        if (rightVoters.has(userId)) {
          sharedVoters += 1;
        }
      }

      const unionSize = new Set([...leftVoters, ...rightVoters]).size;
      const sharedVoterRatio = unionSize === 0 ? 0 : sharedVoters / unionSize;
      const distributionSimilarity = buildDistributionSimilarity(
        questionChoiceCounts.get(left.id) ?? [],
        questionChoiceCounts.get(right.id) ?? [],
      );
      const weight = sharedVoterRatio * 0.7 + distributionSimilarity * 0.3;

      // A question-to-question relationship only exists if at least one
      // participant actually voted in both questions.
      if (sharedVoters === 0) {
        continue;
      }

      edges.push({
        source: left.id,
        target: right.id,
        sharedVoters,
        sharedVoterRatio: roundMetric(sharedVoterRatio),
        distributionSimilarity: roundMetric(distributionSimilarity),
        weight: roundMetric(weight),
      });
    }
  }

  edges.sort((left, right) => right.weight - left.weight);

  return {
    nodes,
    edges: edges.slice(0, 60),
    stats: {
      questionCount: nodes.length,
      edgeCount: Math.min(edges.length, 60),
      maxVotes: Math.max(0, ...nodes.map((node) => node.voteCount)),
    },
  };
}

export async function getAnswerChoiceAffinityGraph(): Promise<AnswerChoiceAffinityGraph> {
  const [questions, votes] = await Promise.all([
    db.query.surveyquestion.findMany({
      columns: {
        id: true,
        question: true,
      },
      with: {
        choices: {
          columns: {
            id: true,
            description: true,
          },
          orderBy: {
            surveypos: 'asc',
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    }),
    db.select().from(vote).orderBy(asc(vote.userid), asc(vote.surveyid)),
  ]);

  const choiceMetadata = new Map<
    number,
    {
      label: string;
      questionId: number;
      questionLabel: string;
      labelTokens: Set<string>;
      questionTokens: Set<string>;
    }
  >();
  for (const question of questions) {
    for (const choice of question.choices) {
      choiceMetadata.set(choice.id, {
        label: choice.description,
        questionId: question.id,
        questionLabel: question.question,
        labelTokens: tokenize(choice.description),
        questionTokens: tokenize(question.question),
      });
    }
  }

  const choiceVoteCounts = new Map<number, number>();
  const votesByUser = new Map<number, typeof votes>();
  for (const row of votes) {
    choiceVoteCounts.set(
      row.answerchoiceid,
      (choiceVoteCounts.get(row.answerchoiceid) ?? 0) + 1,
    );
    const current = votesByUser.get(row.userid) ?? [];
    current.push(row);
    votesByUser.set(row.userid, current);
  }

  const nodes: AnswerChoiceGraphNode[] = [...choiceMetadata.entries()].map(
    ([id, metadata]) => ({
      id,
      label: metadata.label,
      questionId: metadata.questionId,
      questionLabel: metadata.questionLabel,
      voteCount: choiceVoteCounts.get(id) ?? 0,
    }),
  );

  const edgeCounts = new Map<string, number>();
  for (const userVotes of votesByUser.values()) {
    for (let index = 0; index < userVotes.length; index += 1) {
      for (let inner = index + 1; inner < userVotes.length; inner += 1) {
        const left = userVotes[index];
        const right = userVotes[inner];
        if (left.surveyid === right.surveyid) {
          continue;
        }

        const source = Math.min(left.answerchoiceid, right.answerchoiceid);
        const target = Math.max(left.answerchoiceid, right.answerchoiceid);
        const key = `${source}:${target}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const edges: AnswerChoiceGraphEdge[] = [];
  for (const [key, sharedVoters] of edgeCounts.entries()) {
    const [sourceText, targetText] = key.split(':');
    const source = Number(sourceText);
    const target = Number(targetText);
    const sourceVotes = choiceVoteCounts.get(source) ?? 0;
    const targetVotes = choiceVoteCounts.get(target) ?? 0;
    const denominator = Math.sqrt(sourceVotes * targetVotes);
    const affinity = denominator === 0 ? 0 : sharedVoters / denominator;
    const sourceMetadata = choiceMetadata.get(source);
    const targetMetadata = choiceMetadata.get(target);
    const labelSimilarity =
      sourceMetadata && targetMetadata
        ? jaccardSimilarity(
            sourceMetadata.labelTokens,
            targetMetadata.labelTokens,
          )
        : 0;
    const questionSimilarity =
      sourceMetadata && targetMetadata
        ? jaccardSimilarity(
            sourceMetadata.questionTokens,
            targetMetadata.questionTokens,
          )
        : 0;
    const contextSimilarity = labelSimilarity * 0.6 + questionSimilarity * 0.4;
    const weight = affinity * 0.7 + contextSimilarity * 0.3;

    if (sharedVoters === 0 || weight < 0.12) {
      continue;
    }

    edges.push({
      source,
      target,
      sharedVoters,
      affinity: roundMetric(affinity),
      contextSimilarity: roundMetric(contextSimilarity),
      weight: roundMetric(weight),
    });
  }

  edges.sort((left, right) => right.weight - left.weight);

  return {
    nodes,
    edges: edges.slice(0, 90),
    stats: {
      choiceCount: nodes.length,
      edgeCount: Math.min(edges.length, 90),
      maxVotes: Math.max(0, ...nodes.map((node) => node.voteCount)),
    },
  };
}
