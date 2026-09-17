type GraphNode = {
  id: number;
};

type GraphEdge = {
  source: number;
  target: number;
};

type Point = {
  x: number;
  y: number;
};

export type PlanarityAnalysis = {
  isPlanar: boolean;
  reason: string;
  crossingCount: number;
  obstruction:
    | 'trivial'
    | 'euler'
    | 'k5'
    | 'k33'
    | 'embedding-search'
    | 'crossing';
  positions: Map<number, Point> | null;
};

const WIDTH = 920;
const HEIGHT = 540;
const PADDING = 52;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeEdges(edges: GraphEdge[]) {
  const unique = new Map<string, GraphEdge>();
  for (const edge of edges) {
    if (edge.source === edge.target) {
      continue;
    }
    const source = Math.min(edge.source, edge.target);
    const target = Math.max(edge.source, edge.target);
    unique.set(`${source}:${target}`, { source, target });
  }
  return [...unique.values()];
}

function buildAdjacency(nodes: GraphNode[], edges: GraphEdge[]) {
  const adjacency = new Map<number, Set<number>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set<number>());
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  return adjacency;
}

function getComponents(nodes: GraphNode[], edges: GraphEdge[]) {
  const adjacency = buildAdjacency(nodes, edges);
  const unvisited = new Set(nodes.map((node) => node.id));
  const components: Array<{ nodes: number[]; edges: GraphEdge[] }> = [];

  while (unvisited.size > 0) {
    const [start] = unvisited;
    const stack = [start];
    const componentNodes: number[] = [];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (!unvisited.has(nodeId)) {
        continue;
      }
      unvisited.delete(nodeId);
      componentNodes.push(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (unvisited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    const componentSet = new Set(componentNodes);
    components.push({
      nodes: componentNodes,
      edges: edges.filter(
        (edge) =>
          componentSet.has(edge.source) && componentSet.has(edge.target),
      ),
    });
  }

  return components;
}

function hasK5(componentNodes: number[], adjacency: Map<number, Set<number>>) {
  if (componentNodes.length < 5 || componentNodes.length > 16) {
    return false;
  }

  const sorted = [...componentNodes].sort((left, right) => left - right);
  for (let a = 0; a < sorted.length - 4; a += 1) {
    for (let b = a + 1; b < sorted.length - 3; b += 1) {
      for (let c = b + 1; c < sorted.length - 2; c += 1) {
        for (let d = c + 1; d < sorted.length - 1; d += 1) {
          for (let e = d + 1; e < sorted.length; e += 1) {
            const subset = [
              sorted[a],
              sorted[b],
              sorted[c],
              sorted[d],
              sorted[e],
            ];
            const clique = subset.every((source, index) =>
              subset
                .slice(index + 1)
                .every((target) => adjacency.get(source)?.has(target)),
            );
            if (clique) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

function hasK33(componentNodes: number[], adjacency: Map<number, Set<number>>) {
  if (componentNodes.length < 6 || componentNodes.length > 14) {
    return false;
  }

  const eligible = componentNodes.filter(
    (nodeId) => (adjacency.get(nodeId)?.size ?? 0) >= 3,
  );
  if (eligible.length < 6) {
    return false;
  }

  for (let a = 0; a < eligible.length - 5; a += 1) {
    for (let b = a + 1; b < eligible.length - 4; b += 1) {
      for (let c = b + 1; c < eligible.length - 3; c += 1) {
        for (let d = c + 1; d < eligible.length - 2; d += 1) {
          for (let e = d + 1; e < eligible.length - 1; e += 1) {
            for (let f = e + 1; f < eligible.length; f += 1) {
              const subset = [
                eligible[a],
                eligible[b],
                eligible[c],
                eligible[d],
                eligible[e],
                eligible[f],
              ];

              for (let mask = 0; mask < 64; mask += 1) {
                if (mask.toString(2).split('1').length - 1 !== 3) {
                  continue;
                }

                const left = subset.filter((_, index) => mask & (1 << index));
                const right = subset.filter(
                  (_, index) => (mask & (1 << index)) === 0,
                );

                const isCompleteBipartite = left.every((source) =>
                  right.every((target) => adjacency.get(source)?.has(target)),
                );
                const hasInternalEdges =
                  left.some((source, index) =>
                    left
                      .slice(index + 1)
                      .some((target) => adjacency.get(source)?.has(target)),
                  ) ||
                  right.some((source, index) =>
                    right
                      .slice(index + 1)
                      .some((target) => adjacency.get(source)?.has(target)),
                  );

                if (isCompleteBipartite && !hasInternalEdges) {
                  return true;
                }
              }
            }
          }
        }
      }
    }
  }

  return false;
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function edgesCross(
  first: GraphEdge,
  second: GraphEdge,
  positions: Map<number, Point>,
) {
  if (
    first.source === second.source ||
    first.source === second.target ||
    first.target === second.source ||
    first.target === second.target
  ) {
    return false;
  }

  const a = positions.get(first.source);
  const b = positions.get(first.target);
  const c = positions.get(second.source);
  const d = positions.get(second.target);
  if (!a || !b || !c || !d) {
    return false;
  }

  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  return abC * abD < 0 && cdA * cdB < 0;
}

function countCrossings(edges: GraphEdge[], positions: Map<number, Point>) {
  let crossings = 0;
  for (let index = 0; index < edges.length; index += 1) {
    for (let inner = index + 1; inner < edges.length; inner += 1) {
      if (edgesCross(edges[index], edges[inner], positions)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function seededShuffle(values: number[], seed: number) {
  const shuffled = [...values];
  let state = seed;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function makeCircleLayout(nodeIds: number[], seed: number) {
  const ordered = seed === 0 ? [...nodeIds] : seededShuffle(nodeIds, seed);
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;
  const radius = Math.min(WIDTH, HEIGHT) * 0.36;
  const positions = new Map<number, Point>();

  ordered.forEach((nodeId, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, ordered.length);
    positions.set(nodeId, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  });

  return positions;
}

function planarizeLayout(nodes: GraphNode[], edges: GraphEdge[]) {
  if (nodes.length <= 3 || edges.length <= 1) {
    return {
      positions: makeCircleLayout(
        nodes.map((node) => node.id),
        1,
      ),
      crossings: 0,
    };
  }

  const adjacency = buildAdjacency(nodes, edges);
  let bestPositions = makeCircleLayout(
    nodes.map((node) => node.id),
    0,
  );
  let bestCrossings = countCrossings(edges, bestPositions);

  if (bestCrossings === 0) {
    return { positions: bestPositions, crossings: 0 };
  }

  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const positions = makeCircleLayout(
      nodes.map((node) => node.id),
      attempt * 97,
    );
    let crossings = countCrossings(edges, positions);

    for (let step = 0; step < 220; step += 1) {
      let improved = false;
      for (const node of nodes) {
        const neighbors = [...(adjacency.get(node.id) ?? [])];
        if (neighbors.length === 0) {
          continue;
        }

        const current = positions.get(node.id)!;
        const neighborCenter = neighbors.reduce(
          (acc, neighborId) => {
            const point = positions.get(neighborId)!;
            return { x: acc.x + point.x, y: acc.y + point.y };
          },
          { x: 0, y: 0 },
        );

        const candidate: Point = {
          x: clamp(
            neighborCenter.x / neighbors.length + Math.cos(step + node.id) * 28,
            PADDING,
            WIDTH - PADDING,
          ),
          y: clamp(
            neighborCenter.y / neighbors.length + Math.sin(step + node.id) * 28,
            PADDING,
            HEIGHT - PADDING,
          ),
        };

        positions.set(node.id, candidate);
        const candidateCrossings = countCrossings(edges, positions);
        if (candidateCrossings <= crossings) {
          crossings = candidateCrossings;
          improved = true;
          if (crossings === 0) {
            return { positions, crossings: 0 };
          }
        } else {
          positions.set(node.id, current);
        }
      }

      if (!improved) {
        break;
      }
    }

    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      bestPositions = new Map(positions);
    }

    if (bestCrossings === 0) {
      break;
    }
  }

  return { positions: bestPositions, crossings: bestCrossings };
}

export function analyzePlanarity(
  nodes: GraphNode[],
  edges: GraphEdge[],
): PlanarityAnalysis {
  const normalizedEdges = normalizeEdges(edges);
  if (nodes.length <= 4) {
    return {
      isPlanar: true,
      reason: 'Graphs with four or fewer nodes are planar.',
      crossingCount: 0,
      obstruction: 'trivial',
      positions: makeCircleLayout(
        nodes.map((node) => node.id),
        1,
      ),
    };
  }

  const components = getComponents(nodes, normalizedEdges);
  const adjacency = buildAdjacency(nodes, normalizedEdges);

  for (const component of components) {
    const nodeCount = component.nodes.length;
    const edgeCount = component.edges.length;
    if (nodeCount >= 3 && edgeCount > 3 * nodeCount - 6) {
      return {
        isPlanar: false,
        reason: `This graph violates Euler's planar bound: component has ${edgeCount} edges but at most ${3 * nodeCount - 6} are possible for a planar simple graph with ${nodeCount} nodes.`,
        crossingCount: 0,
        obstruction: 'euler',
        positions: null,
      };
    }
  }

  for (const component of components) {
    if (hasK5(component.nodes, adjacency)) {
      return {
        isPlanar: false,
        reason:
          'This graph contains a K5 clique obstruction, so it is not planar.',
        crossingCount: 0,
        obstruction: 'k5',
        positions: null,
      };
    }
    if (hasK33(component.nodes, adjacency)) {
      return {
        isPlanar: false,
        reason:
          'This graph contains a K3,3 bipartite obstruction, so it is not planar.',
        crossingCount: 0,
        obstruction: 'k33',
        positions: null,
      };
    }
  }

  const planarized = planarizeLayout(nodes, normalizedEdges);
  if (planarized.crossings === 0) {
    return {
      isPlanar: true,
      reason:
        'A crossing-free straight-line embedding was found and the graph has been redrawn to that layout.',
      crossingCount: 0,
      obstruction: 'crossing',
      positions: planarized.positions,
    };
  }

  return {
    isPlanar: false,
    reason: `No crossing-free straight-line embedding was found after planarization search; the best layout still has ${planarized.crossings} edge crossings.`,
    crossingCount: planarized.crossings,
    obstruction: 'embedding-search',
    positions: null,
  };
}
