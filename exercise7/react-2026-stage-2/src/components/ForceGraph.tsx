import { useEffect, useMemo, useState } from 'react';

export type ForceGraphNodeBase = {
  id: number;
  label: string;
  voteCount: number;
};

export type ForceGraphEdgeBase = {
  source: number;
  target: number;
  weight: number;
};

type PositionedNode = {
  id: number;
  x: number;
  y: number;
};

const GRAPH_WIDTH = 920;
const GRAPH_HEIGHT = 540;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildLayout<NodeType extends ForceGraphNodeBase>(
  nodes: NodeType[],
  edges: ForceGraphEdgeBase[],
) {
  const positions = new Map<number, PositionedNode>();
  if (nodes.length === 0) {
    return positions;
  }

  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const radius = Math.min(GRAPH_WIDTH, GRAPH_HEIGHT) * 0.32;
  const velocities = new Map<number, { vx: number; vy: number }>();

  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length);
    positions.set(node.id, {
      id: node.id,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
    velocities.set(node.id, { vx: 0, vy: 0 });
  });

  for (let step = 0; step < 160; step += 1) {
    for (let index = 0; index < nodes.length; index += 1) {
      for (let inner = index + 1; inner < nodes.length; inner += 1) {
        const left = positions.get(nodes[index].id)!;
        const right = positions.get(nodes[inner].id)!;
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distanceSq = Math.max(1, dx * dx + dy * dy);
        const distance = Math.sqrt(distanceSq);
        const repulsion = 1200 / distanceSq;
        const rx = (dx / distance) * repulsion;
        const ry = (dy / distance) * repulsion;
        velocities.get(left.id)!.vx -= rx;
        velocities.get(left.id)!.vy -= ry;
        velocities.get(right.id)!.vx += rx;
        velocities.get(right.id)!.vy += ry;
      }
    }

    for (const edge of edges) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const springTarget = 100 + (1 - edge.weight) * 160;
      const springForce =
        ((distance - springTarget) / 200) * (0.2 + edge.weight);
      const sx = (dx / distance) * springForce;
      const sy = (dy / distance) * springForce;
      velocities.get(source.id)!.vx += sx;
      velocities.get(source.id)!.vy += sy;
      velocities.get(target.id)!.vx -= sx;
      velocities.get(target.id)!.vy -= sy;
    }

    for (const node of nodes) {
      const position = positions.get(node.id)!;
      const velocity = velocities.get(node.id)!;
      velocity.vx += (centerX - position.x) * 0.0008;
      velocity.vy += (centerY - position.y) * 0.0008;
      velocity.vx *= 0.82;
      velocity.vy *= 0.82;
      position.x = clamp(position.x + velocity.vx, 48, GRAPH_WIDTH - 48);
      position.y = clamp(position.y + velocity.vy, 48, GRAPH_HEIGHT - 48);
    }
  }

  return positions;
}

function interpolateLayouts(
  from: Map<number, PositionedNode>,
  to: Map<number, PositionedNode>,
  progress: number,
) {
  const layout = new Map<number, PositionedNode>();
  for (const [nodeId, target] of to.entries()) {
    const source = from.get(nodeId) ?? target;
    layout.set(nodeId, {
      id: nodeId,
      x: source.x + (target.x - source.x) * progress,
      y: source.y + (target.y - source.y) * progress,
    });
  }
  return layout;
}

export default function ForceGraph<
  NodeType extends ForceGraphNodeBase,
  EdgeType extends ForceGraphEdgeBase,
>({
  title,
  nodes,
  edges,
  selectedNodeId,
  neighborIds,
  onSelectNode,
  edgeMetricLabel,
  nodeTone = 'fill-primary',
  layoutOverride,
  edgeStrokeWidth,
}: {
  title: string;
  nodes: NodeType[];
  edges: EdgeType[];
  selectedNodeId: number | null;
  neighborIds: Set<number>;
  onSelectNode(nodeId: number | null): void;
  edgeMetricLabel(edge: EdgeType): string;
  nodeTone?: 'fill-primary' | 'fill-secondary';
  layoutOverride?: Map<number, { x: number; y: number }> | null;
  edgeStrokeWidth?(edge: EdgeType): number;
}) {
  const baseLayout = useMemo(() => buildLayout(nodes, edges), [nodes, edges]);
  const targetLayout = useMemo(() => {
    if (!layoutOverride) {
      return baseLayout;
    }

    const overridden = new Map(baseLayout);
    for (const [nodeId, position] of layoutOverride.entries()) {
      const existing = overridden.get(nodeId);
      overridden.set(nodeId, {
        ...(existing ?? {}),
        id: nodeId,
        x: position.x,
        y: position.y,
      });
    }
    return overridden;
  }, [baseLayout, layoutOverride]);
  const [positions, setPositions] =
    useState<Map<number, PositionedNode>>(targetLayout);

  useEffect(() => {
    setPositions(baseLayout);
  }, [baseLayout]);

  useEffect(() => {
    const start = performance.now();
    const duration = 800;
    let frameId = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      setPositions(interpolateLayouts(baseLayout, targetLayout, progress));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [baseLayout, targetLayout]);

  const maxVotes = Math.max(1, ...nodes.map((node) => node.voteCount));

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-base-content/60">
            Click a node to inspect its strongest connections.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onSelectNode(null)}
          type="button"
        >
          Clear Focus
        </button>
      </div>

      {nodes.length === 0 ? (
        <div className="rounded-box border border-dashed border-base-300 p-8 text-center text-base-content/60">
          No graph data is available yet.
        </div>
      ) : (
        <svg
          className="h-auto w-full rounded-box bg-base-200/60"
          role="img"
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        >
          <title>{title}</title>
          {edges.map((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) {
              return null;
            }

            const isFocused =
              selectedNodeId === null ||
              edge.source === selectedNodeId ||
              edge.target === selectedNodeId;

            return (
              <g key={`${edge.source}-${edge.target}`}>
                <line
                  opacity={isFocused ? 0.75 : 0.18}
                  stroke="currentColor"
                  strokeWidth={edgeStrokeWidth?.(edge) ?? 1 + edge.weight * 6}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />
                <title>{edgeMetricLabel(edge)}</title>
              </g>
            );
          })}

          {nodes.map((node) => {
            const position = positions.get(node.id)!;
            const radius = 14 + (node.voteCount / maxVotes) * 20;
            const isSelected = node.id === selectedNodeId;
            const isNeighbor = neighborIds.has(node.id);
            const isMuted =
              selectedNodeId !== null && !isSelected && !isNeighbor;

            return (
              <g
                className="cursor-pointer"
                key={node.id}
                onClick={() => onSelectNode(isSelected ? null : node.id)}
              >
                <circle
                  className={nodeTone}
                  cx={position.x}
                  cy={position.y}
                  fillOpacity={isMuted ? 0.25 : isSelected ? 0.98 : 0.82}
                  r={radius}
                  stroke="currentColor"
                  strokeOpacity={isSelected ? 0.95 : 0.4}
                  strokeWidth={isSelected ? 4 : 1.5}
                />
                <text
                  fill="currentColor"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="middle"
                  x={position.x}
                  y={position.y + 4}
                >
                  {node.id}
                </text>
                <text
                  fill="currentColor"
                  fontSize="12"
                  textAnchor="middle"
                  x={position.x}
                  y={position.y + radius + 18}
                >
                  {node.label.length > 26
                    ? `${node.label.slice(0, 23)}...`
                    : node.label}
                </text>
                <title>{`${node.label} • ${node.voteCount} votes`}</title>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
