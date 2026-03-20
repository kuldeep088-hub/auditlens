import type { LinkGraphEdge, PageData } from '@audit/types';

export interface LinkGraphAnalysis {
  edges: LinkGraphEdge[];
  clickDepth: Map<string, number>;
  inlinkCounts: Map<string, number>;
  outlinkCounts: Map<string, number>;
  orphanPages: string[];
  deadEndPages: string[];
}

/**
 * Builds a link graph from crawled pages and computes structural metrics.
 */
export function buildLinkGraph(
  pages: PageData[],
  homepageUrl: string
): LinkGraphAnalysis {
  const edges: LinkGraphEdge[] = [];
  const crawledUrls = new Set(pages.map((p) => p.url));

  // Build edge list
  for (const page of pages) {
    for (const link of page.internalLinks) {
      if (crawledUrls.has(link.href)) {
        edges.push({
          source: page.url,
          destination: link.href,
          anchorText: link.anchorText,
          isNav: link.isNav,
        });
      }
    }
  }

  // Build adjacency lists
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const url of crawledUrls) {
    outgoing.set(url, new Set());
    incoming.set(url, new Set());
  }

  for (const edge of edges) {
    outgoing.get(edge.source)?.add(edge.destination);
    incoming.get(edge.destination)?.add(edge.source);
  }

  // BFS from homepage to compute click depth
  const clickDepth = new Map<string, number>();
  const queue: string[] = [];

  // Find homepage (normalize URL comparison)
  const home = [...crawledUrls].find(
    (u) => u === homepageUrl || u === homepageUrl + '/' || u + '/' === homepageUrl
  );

  if (home) {
    clickDepth.set(home, 0);
    queue.push(home);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentDepth = clickDepth.get(current)!;
    const neighbors = outgoing.get(current) ?? new Set();

    for (const neighbor of neighbors) {
      if (!clickDepth.has(neighbor)) {
        clickDepth.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }
  }

  // Compute inlink/outlink counts (non-nav only for outlinks)
  const inlinkCounts = new Map<string, number>();
  const outlinkCounts = new Map<string, number>();

  for (const url of crawledUrls) {
    inlinkCounts.set(url, incoming.get(url)?.size ?? 0);
    outlinkCounts.set(url, outgoing.get(url)?.size ?? 0);
  }

  // Orphan pages: 0 inlinks and not the homepage
  const orphanPages = [...crawledUrls].filter(
    (url) => url !== home && (inlinkCounts.get(url) ?? 0) === 0
  );

  // Dead-end pages: 0 outlinks
  const deadEndPages = [...crawledUrls].filter(
    (url) => (outlinkCounts.get(url) ?? 0) === 0
  );

  return {
    edges,
    clickDepth,
    inlinkCounts,
    outlinkCounts,
    orphanPages,
    deadEndPages,
  };
}
