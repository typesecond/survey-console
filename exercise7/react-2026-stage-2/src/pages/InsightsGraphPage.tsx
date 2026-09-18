/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';

import ForceGraph from '../components/ForceGraph';
import { analyzePlanarity } from '../util/planarity';
import {
  redirectToLogin,
  requestJSON,
  requireAuthenticated,
  type AnswerChoiceAffinityGraph,
  type AnswerChoiceGraphEdge,
  type AnswerChoiceGraphNode,
  type QuestionGraphEdge,
  type QuestionGraphNode,
  type QuestionSimilarityGraph,
} from '../util/auth';

type InsightsLoaderData = {
  questionGraph: QuestionSimilarityGraph;
  choiceGraph: AnswerChoiceAffinityGraph;
};

type ConnectionRecord<NodeType, EdgeType> = {
  node: NodeType;
  edge: EdgeType;
};

function createMockChoiceGraph(
  nodes: AnswerChoiceGraphNode[],
  edges: Array<{
    source: number;
    target: number;
    sharedVoters: number;
    affinity: number;
    contextSimilarity: number;
  }>,
): AnswerChoiceAffinityGraph {
  return {
    nodes,
    edges: edges.map((edge) => ({
      ...edge,
      weight:
        Math.round(
          (edge.affinity * 0.7 + edge.contextSimilarity * 0.3) * 1000,
        ) / 1000,
    })),
    stats: {
      choiceCount: nodes.length,
      edgeCount: edges.length,
      maxVotes: Math.max(0, ...nodes.map((node) => node.voteCount)),
    },
  };
}

const mockPlanarChoiceGraph = createMockChoiceGraph(
  [
    {
      id: 101,
      label: 'Offline mode first',
      questionId: 9001,
      questionLabel: 'Mock Product Roadmap',
      voteCount: 31,
    },
    {
      id: 102,
      label: 'AI summary cards',
      questionId: 9001,
      questionLabel: 'Mock Product Roadmap',
      voteCount: 28,
    },
    {
      id: 103,
      label: 'Team dashboards',
      questionId: 9002,
      questionLabel: 'Mock Analytics Console',
      voteCount: 34,
    },
    {
      id: 104,
      label: 'Export pipelines',
      questionId: 9002,
      questionLabel: 'Mock Analytics Console',
      voteCount: 29,
    },
    {
      id: 105,
      label: 'Scenario planning',
      questionId: 9003,
      questionLabel: 'Mock Strategy Workshop',
      voteCount: 33,
    },
    {
      id: 106,
      label: 'Live collaboration',
      questionId: 9003,
      questionLabel: 'Mock Strategy Workshop',
      voteCount: 30,
    },
  ],
  [
    {
      source: 101,
      target: 102,
      sharedVoters: 17,
      affinity: 0.64,
      contextSimilarity: 0.44,
    },
    {
      source: 102,
      target: 103,
      sharedVoters: 16,
      affinity: 0.6,
      contextSimilarity: 0.48,
    },
    {
      source: 103,
      target: 104,
      sharedVoters: 15,
      affinity: 0.58,
      contextSimilarity: 0.41,
    },
    {
      source: 104,
      target: 105,
      sharedVoters: 18,
      affinity: 0.66,
      contextSimilarity: 0.53,
    },
    {
      source: 105,
      target: 106,
      sharedVoters: 19,
      affinity: 0.7,
      contextSimilarity: 0.57,
    },
    {
      source: 106,
      target: 101,
      sharedVoters: 17,
      affinity: 0.63,
      contextSimilarity: 0.45,
    },
    {
      source: 101,
      target: 103,
      sharedVoters: 14,
      affinity: 0.55,
      contextSimilarity: 0.39,
    },
    {
      source: 101,
      target: 104,
      sharedVoters: 16,
      affinity: 0.61,
      contextSimilarity: 0.47,
    },
    {
      source: 101,
      target: 105,
      sharedVoters: 14,
      affinity: 0.56,
      contextSimilarity: 0.35,
    },
  ],
);

const mockNonPlanarChoiceGraph = createMockChoiceGraph(
  [
    {
      id: 201,
      label: 'Voice notes',
      questionId: 9010,
      questionLabel: 'Mock Collaboration Survey',
      voteCount: 36,
    },
    {
      id: 202,
      label: 'Meeting recaps',
      questionId: 9010,
      questionLabel: 'Mock Collaboration Survey',
      voteCount: 35,
    },
    {
      id: 203,
      label: 'Async approvals',
      questionId: 9010,
      questionLabel: 'Mock Collaboration Survey',
      voteCount: 34,
    },
    {
      id: 204,
      label: 'Customer digests',
      questionId: 9011,
      questionLabel: 'Mock Insights Feed',
      voteCount: 32,
    },
    {
      id: 205,
      label: 'Risk alerts',
      questionId: 9011,
      questionLabel: 'Mock Insights Feed',
      voteCount: 33,
    },
    {
      id: 206,
      label: 'Launch scorecards',
      questionId: 9011,
      questionLabel: 'Mock Insights Feed',
      voteCount: 31,
    },
  ],
  [
    {
      source: 201,
      target: 204,
      sharedVoters: 21,
      affinity: 0.74,
      contextSimilarity: 0.46,
    },
    {
      source: 201,
      target: 205,
      sharedVoters: 22,
      affinity: 0.77,
      contextSimilarity: 0.51,
    },
    {
      source: 201,
      target: 206,
      sharedVoters: 20,
      affinity: 0.71,
      contextSimilarity: 0.44,
    },
    {
      source: 202,
      target: 204,
      sharedVoters: 20,
      affinity: 0.7,
      contextSimilarity: 0.48,
    },
    {
      source: 202,
      target: 205,
      sharedVoters: 21,
      affinity: 0.73,
      contextSimilarity: 0.52,
    },
    {
      source: 202,
      target: 206,
      sharedVoters: 19,
      affinity: 0.69,
      contextSimilarity: 0.47,
    },
    {
      source: 203,
      target: 204,
      sharedVoters: 18,
      affinity: 0.67,
      contextSimilarity: 0.43,
    },
    {
      source: 203,
      target: 205,
      sharedVoters: 20,
      affinity: 0.72,
      contextSimilarity: 0.49,
    },
    {
      source: 203,
      target: 206,
      sharedVoters: 19,
      affinity: 0.7,
      contextSimilarity: 0.46,
    },
  ],
);

const mockPlanarDefaultLayout = new Map<number, { x: number; y: number }>([
  [101, { x: 140, y: 120 }],
  [102, { x: 770, y: 110 }],
  [103, { x: 250, y: 430 }],
  [104, { x: 660, y: 430 }],
  [105, { x: 430, y: 170 }],
  [106, { x: 470, y: 390 }],
]);

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<InsightsLoaderData> {
  await requireAuthenticated(request);

  const [questionGraphResult, choiceGraphResult] = await Promise.all([
    requestJSON<QuestionSimilarityGraph>({
      url: '/api/question/graph/similarity',
      request,
      authenticated: true,
    }),
    requestJSON<AnswerChoiceAffinityGraph>({
      url: '/api/question/graph/affinity',
      request,
      authenticated: true,
    }),
  ]);

  if (questionGraphResult.isErr) {
    if (questionGraphResult.error.authExpired) {
      throw redirectToLogin(request);
    }
    throw new Response(questionGraphResult.error.message, {
      status: questionGraphResult.error.status,
    });
  }

  if (choiceGraphResult.isErr) {
    if (choiceGraphResult.error.authExpired) {
      throw redirectToLogin(request);
    }
    throw new Response(choiceGraphResult.error.message, {
      status: choiceGraphResult.error.status,
    });
  }

  return {
    questionGraph: questionGraphResult.value,
    choiceGraph: choiceGraphResult.value,
  };
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getNeighborIds<EdgeType extends { source: number; target: number }>(
  edges: EdgeType[],
  selectedNodeId: number | null,
) {
  const neighbors = new Set<number>();
  if (selectedNodeId === null) {
    return neighbors;
  }

  for (const edge of edges) {
    if (edge.source === selectedNodeId) {
      neighbors.add(edge.target);
    } else if (edge.target === selectedNodeId) {
      neighbors.add(edge.source);
    }
  }
  return neighbors;
}

function getTopConnections<
  NodeType extends { id: number },
  EdgeType extends { source: number; target: number; weight: number },
>(nodes: NodeType[], edges: EdgeType[], selectedNodeId: number | null) {
  if (selectedNodeId === null) {
    return [];
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .filter(
      (edge) =>
        edge.source === selectedNodeId || edge.target === selectedNodeId,
    )
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 5)
    .flatMap((edge) => {
      const neighborId =
        edge.source === selectedNodeId ? edge.target : edge.source;
      const node = nodeMap.get(neighborId);
      return node ? [{ node, edge }] : [];
    }) as ConnectionRecord<NodeType, EdgeType>[];
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="text-sm uppercase tracking-[0.24em] text-base-content/50">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-base-content/60">{hint}</div>
    </div>
  );
}

function QuestionInspector({
  node,
  connections,
}: {
  node: QuestionGraphNode | null;
  connections: ConnectionRecord<QuestionGraphNode, QuestionGraphEdge>[];
}) {
  return (
    <aside className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <h3 className="text-lg font-semibold">Question Cluster Inspector</h3>
      {!node ? (
        <p className="mt-3 text-sm text-base-content/60">
          Select a question node to inspect its shared voter overlap and
          distribution similarity.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="badge badge-primary badge-outline">
              Question #{node.id}
            </div>
            <h4 className="mt-2 text-xl font-semibold">{node.label}</h4>
            <p className="mt-2 text-sm text-base-content/70">
              {node.description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-box bg-base-200 p-3">
              <div className="text-sm text-base-content/60">Votes</div>
              <div className="text-2xl font-semibold">{node.voteCount}</div>
            </div>
            <div className="rounded-box bg-base-200 p-3">
              <div className="text-sm text-base-content/60">Choices</div>
              <div className="text-2xl font-semibold">{node.choiceCount}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="btn btn-sm btn-primary"
              to={`/questions/${node.id}/results`}
            >
              View Results
            </Link>
            <Link
              className="btn btn-sm btn-outline"
              to={`/questions/${node.id}/vote`}
            >
              Vote Page
            </Link>
          </div>

          <div className="space-y-3">
            <h5 className="font-medium">Strongest Connections</h5>
            {connections.length === 0 ? (
              <p className="text-sm text-base-content/60">
                This node does not have any retained edges yet.
              </p>
            ) : (
              connections.map(({ node: neighbor, edge }) => (
                <div
                  className="rounded-box border border-base-300 p-3"
                  key={`${edge.source}-${edge.target}`}
                >
                  <div className="font-medium">{neighbor.label}</div>
                  <div className="mt-1 text-sm text-base-content/65">
                    Edge weight: {edge.sharedVoters} shared participants
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function ChoiceInspector({
  node,
  connections,
}: {
  node: AnswerChoiceGraphNode | null;
  connections: ConnectionRecord<AnswerChoiceGraphNode, AnswerChoiceGraphEdge>[];
}) {
  return (
    <aside className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <h3 className="text-lg font-semibold">Affinity Inspector</h3>
      {!node ? (
        <p className="mt-3 text-sm text-base-content/60">
          Select an answer-choice node to inspect which preferences tend to
          travel together across surveys.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="badge badge-secondary badge-outline">
              Choice #{node.id}
            </div>
            <h4 className="mt-2 text-xl font-semibold">{node.label}</h4>
            <p className="mt-2 text-sm text-base-content/70">
              From question #{node.questionId}: {node.questionLabel}
            </p>
          </div>

          <div className="rounded-box bg-base-200 p-3">
            <div className="text-sm text-base-content/60">Votes</div>
            <div className="text-2xl font-semibold">{node.voteCount}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="btn btn-sm btn-primary"
              to={`/questions/${node.questionId}/results`}
            >
              Question Results
            </Link>
            <Link
              className="btn btn-sm btn-outline"
              to={`/questions/${node.questionId}/vote`}
            >
              Related Poll
            </Link>
          </div>

          <div className="space-y-3">
            <h5 className="font-medium">Strongest Affinities</h5>
            {connections.length === 0 ? (
              <p className="text-sm text-base-content/60">
                This choice has no retained affinity edges yet.
              </p>
            ) : (
              connections.map(({ node: neighbor, edge }) => (
                <div
                  className="rounded-box border border-base-300 p-3"
                  key={`${edge.source}-${edge.target}`}
                >
                  <div className="font-medium">{neighbor.label}</div>
                  <div className="mt-1 text-sm text-base-content/65">
                    Edge weight: {edge.sharedVoters} shared participants
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-base-content/50">
                    Question #{neighbor.questionId}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function MockChoiceInspector({
  node,
  connections,
}: {
  node: AnswerChoiceGraphNode | null;
  connections: ConnectionRecord<AnswerChoiceGraphNode, AnswerChoiceGraphEdge>[];
}) {
  return (
    <aside className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <h3 className="text-lg font-semibold">Mock Affinity Inspector</h3>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-warning">
        Not Real Survey Data
      </p>
      {!node ? (
        <p className="mt-3 text-sm text-base-content/60">
          Select a mock answer-choice node to inspect why this demo graph is
          useful for the planarity tool.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="badge badge-secondary badge-outline">
              Mock Choice #{node.id}
            </div>
            <h4 className="mt-2 text-xl font-semibold">{node.label}</h4>
            <p className="mt-2 text-sm text-base-content/70">
              Mock parent question: {node.questionLabel}
            </p>
          </div>

          <div className="rounded-box bg-base-200 p-3">
            <div className="text-sm text-base-content/60">Mock Vote Weight</div>
            <div className="text-2xl font-semibold">{node.voteCount}</div>
          </div>

          <div className="space-y-3">
            <h5 className="font-medium">Strongest Mock Affinities</h5>
            {connections.length === 0 ? (
              <p className="text-sm text-base-content/60">
                No mock affinity edges are attached to this node.
              </p>
            ) : (
              connections.map(({ node: neighbor, edge }) => (
                <div
                  className="rounded-box border border-base-300 p-3"
                  key={`${edge.source}-${edge.target}`}
                >
                  <div className="font-medium">{neighbor.label}</div>
                  <div className="mt-1 text-sm text-base-content/65">
                    Edge weight: {edge.sharedVoters} shared participants
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-base-content/50">
                    Mock question #{neighbor.questionId}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function DemoPlanarityGraph({
  title,
  description,
  graph,
  defaultLayout,
}: {
  title: string;
  description: string;
  graph: AnswerChoiceAffinityGraph;
  defaultLayout?: Map<number, { x: number; y: number }> | null;
}) {
  const [selectedChoiceId, setSelectedChoiceId] = useState<number | null>(
    graph.nodes[0]?.id ?? null,
  );
  const [showPlanarLayout, setShowPlanarLayout] = useState(false);

  const choiceNodeMap = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const choiceNeighbors = useMemo(
    () => getNeighborIds(graph.edges, selectedChoiceId),
    [graph.edges, selectedChoiceId],
  );
  const selectedChoice = selectedChoiceId
    ? (choiceNodeMap.get(selectedChoiceId) ?? null)
    : null;
  const choicePlanarity = useMemo(
    () => analyzePlanarity(graph.nodes, graph.edges),
    [graph.edges, graph.nodes],
  );
  const topChoiceConnections = useMemo(
    () => getTopConnections(graph.nodes, graph.edges, selectedChoiceId),
    [graph.edges, graph.nodes, selectedChoiceId],
  );

  return (
    <section className="space-y-4">
      <div className="rounded-box border border-warning/40 bg-warning/10 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <div className="badge badge-warning badge-outline">
            Mock Data Only
          </div>
        </div>
        <p className="mt-2 text-sm text-base-content/75">{description}</p>
      </div>

      <section
        className={`alert ${
          choicePlanarity.isPlanar ? 'alert-success' : 'alert-warning'
        }`}
      >
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="font-medium">
              {choicePlanarity.isPlanar
                ? 'This Mock Graph Is Planar'
                : 'This Mock Graph Is Not Planar'}
            </div>
            <div className="text-sm">
              {choicePlanarity.reason}
              {!choicePlanarity.isPlanar && choicePlanarity.crossingCount > 0
                ? ` Best redraw attempt still had ${choicePlanarity.crossingCount} crossings.`
                : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {choicePlanarity.isPlanar ? (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setShowPlanarLayout(true)}
                type="button"
              >
                Animate to Planar Layout
              </button>
            ) : null}
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setShowPlanarLayout(false)}
              type="button"
            >
              Use Default Layout
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <ForceGraph
          edgeMetricLabel={(edge) =>
            `Edge weight: ${edge.sharedVoters} shared participants`
          }
          edgeStrokeWidth={(edge) => 1 + Math.min(edge.sharedVoters, 8) * 1.2}
          edges={graph.edges}
          layoutOverride={
            showPlanarLayout
              ? choicePlanarity.positions
              : (defaultLayout ?? null)
          }
          neighborIds={choiceNeighbors}
          nodeTone="fill-secondary"
          nodes={graph.nodes}
          onSelectNode={setSelectedChoiceId}
          selectedNodeId={selectedChoiceId}
          title={title}
        />
        <MockChoiceInspector
          connections={topChoiceConnections}
          node={selectedChoice}
        />
      </section>
    </section>
  );
}

export default function InsightsGraphPage() {
  const { questionGraph, choiceGraph } = useLoaderData() as InsightsLoaderData;
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(
    questionGraph.nodes[0]?.id ?? null,
  );
  const [selectedChoiceId, setSelectedChoiceId] = useState<number | null>(
    choiceGraph.nodes[0]?.id ?? null,
  );
  const [showChoicePlanarLayout, setShowChoicePlanarLayout] = useState(false);

  const questionNodeMap = useMemo(
    () => new Map(questionGraph.nodes.map((node) => [node.id, node])),
    [questionGraph.nodes],
  );
  const choiceNodeMap = useMemo(
    () => new Map(choiceGraph.nodes.map((node) => [node.id, node])),
    [choiceGraph.nodes],
  );

  const questionNeighbors = useMemo(
    () => getNeighborIds(questionGraph.edges, selectedQuestionId),
    [questionGraph.edges, selectedQuestionId],
  );
  const choiceNeighbors = useMemo(
    () => getNeighborIds(choiceGraph.edges, selectedChoiceId),
    [choiceGraph.edges, selectedChoiceId],
  );

  const selectedQuestion = selectedQuestionId
    ? (questionNodeMap.get(selectedQuestionId) ?? null)
    : null;
  const selectedChoice = selectedChoiceId
    ? (choiceNodeMap.get(selectedChoiceId) ?? null)
    : null;
  const choicePlanarity = useMemo(
    () => analyzePlanarity(choiceGraph.nodes, choiceGraph.edges),
    [choiceGraph.edges, choiceGraph.nodes],
  );

  const topQuestionConnections = useMemo(
    () =>
      getTopConnections(
        questionGraph.nodes,
        questionGraph.edges,
        selectedQuestionId,
      ),
    [questionGraph.edges, questionGraph.nodes, selectedQuestionId],
  );
  const topChoiceConnections = useMemo(
    () =>
      getTopConnections(choiceGraph.nodes, choiceGraph.edges, selectedChoiceId),
    [choiceGraph.edges, choiceGraph.nodes, selectedChoiceId],
  );

  return (
    <div className="space-y-6">
      <section className="hero rounded-box bg-base-100 shadow-sm">
        <div className="hero-content flex-col items-start gap-4 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
              Survey Analytics
            </p>
            <h1 className="text-3xl font-bold">Connected Insight Graphs</h1>
            <p className="mt-2 max-w-3xl text-base-content/70">
              Explore how questions cluster by shared voting behavior and how
              answer choices form recurring preference patterns across the
              survey set using both shared voters and textual/context
              similarity.
            </p>
          </div>
          <Link className="btn btn-outline" to="/">
            Back to Questions
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          hint="Question nodes included in the similarity map."
          label="Questions"
          value={questionGraph.stats.questionCount}
        />
        <StatCard
          hint="Choice nodes included in the affinity map."
          label="Answer Choices"
          value={choiceGraph.stats.choiceCount}
        />
        <StatCard
          hint="Retained weighted connections across both graphs."
          label="Edges"
          value={questionGraph.stats.edgeCount + choiceGraph.stats.edgeCount}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <ForceGraph
          edgeMetricLabel={(edge) =>
            `Shared voters: ${edge.sharedVoters}, overlap: ${formatPercent(edge.sharedVoterRatio)}, distribution match: ${formatPercent(edge.distributionSimilarity)}`
          }
          edgeStrokeWidth={(edge) => 1 + Math.min(edge.sharedVoters, 8) * 1.2}
          edges={questionGraph.edges}
          neighborIds={questionNeighbors}
          nodes={questionGraph.nodes}
          onSelectNode={setSelectedQuestionId}
          selectedNodeId={selectedQuestionId}
          title="Question-to-Question Similarity Graph"
        />
        <QuestionInspector
          connections={topQuestionConnections}
          node={selectedQuestion}
        />
      </section>

      <section
        className={`alert ${
          choicePlanarity.isPlanar ? 'alert-success' : 'alert-warning'
        }`}
      >
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="font-medium">
              {choicePlanarity.isPlanar
                ? 'Answer Affinity Graph Is Planar'
                : 'Answer Affinity Graph Is Not Planar'}
            </div>
            <div className="text-sm">
              {choicePlanarity.reason}
              {!choicePlanarity.isPlanar && choicePlanarity.crossingCount > 0
                ? ` Best redraw attempt still had ${choicePlanarity.crossingCount} crossings.`
                : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {choicePlanarity.isPlanar ? (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setShowChoicePlanarLayout(true)}
                type="button"
              >
                Animate to Planar Layout
              </button>
            ) : null}
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setShowChoicePlanarLayout(false)}
              type="button"
            >
              Use Default Layout
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <ForceGraph
          edgeMetricLabel={(edge) =>
            `Edge weight: ${edge.sharedVoters} shared participants`
          }
          edgeStrokeWidth={(edge) => 1 + Math.min(edge.sharedVoters, 8) * 1.2}
          edges={choiceGraph.edges}
          layoutOverride={
            showChoicePlanarLayout ? choicePlanarity.positions : null
          }
          neighborIds={choiceNeighbors}
          nodeTone="fill-secondary"
          nodes={choiceGraph.nodes}
          onSelectNode={setSelectedChoiceId}
          selectedNodeId={selectedChoiceId}
          title="Answer Choice Affinity Graph"
        />
        <ChoiceInspector
          connections={topChoiceConnections}
          node={selectedChoice}
        />
      </section>

      <section className="space-y-6">
        <div className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-warning">
            Planarity Showcase
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            Mock Graphs For Demonstration
          </h2>
          <p className="mt-2 max-w-3xl text-base-content/70">
            These two dense graphs are intentionally fabricated to show off the
            planarity tool. They are not derived from real survey responses.
          </p>
        </div>

        <DemoPlanarityGraph
          description="A dense mock affinity network built as a maximal outerplanar graph. Use the button to animate it into a crossing-free layout."
          defaultLayout={mockPlanarDefaultLayout}
          graph={mockPlanarChoiceGraph}
          title="Mock Planar Affinity Graph"
        />

        <DemoPlanarityGraph
          description="A dense mock affinity network with a built-in K3,3 obstruction. It should stay non-planar and explain why."
          graph={mockNonPlanarChoiceGraph}
          title="Mock Non-Planar Affinity Graph"
        />
      </section>
    </div>
  );
}
