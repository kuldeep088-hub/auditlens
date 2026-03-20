import type { CheckResult, PageData, LinkGraphEdge } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * ARCH-001 through ARCH-004
 * Audits site architecture: click depth, orphan pages, PageRank, dead ends.
 */
export function runArchitectureAudit(
  pages: PageData[],
  linkGraph: LinkGraphEdge[],
): CheckResult[] {
  const results: CheckResult[] = [];

  // Build adjacency structures
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const allUrls = new Set<string>();

  for (const page of pages) {
    const norm = normalizeUrl(page.url);
    allUrls.add(norm);
    if (!outgoing.has(norm)) outgoing.set(norm, new Set());
    if (!incoming.has(norm)) incoming.set(norm, new Set());
  }

  for (const edge of linkGraph) {
    const src = normalizeUrl(edge.source);
    const dst = normalizeUrl(edge.destination);
    if (!outgoing.has(src)) outgoing.set(src, new Set());
    outgoing.get(src)!.add(dst);
    if (!incoming.has(dst)) incoming.set(dst, new Set());
    incoming.get(dst)!.add(src);
  }

  // Determine the homepage (shortest URL or root path)
  let homepage = '';
  if (pages.length > 0) {
    const sorted = [...pages].sort((a, b) => {
      try {
        const pathA = new URL(a.url).pathname;
        const pathB = new URL(b.url).pathname;
        if (pathA === '/' && pathB !== '/') return -1;
        if (pathB === '/' && pathA !== '/') return 1;
        return a.url.length - b.url.length;
      } catch {
        return 0;
      }
    });
    homepage = normalizeUrl(sorted[0].url);
  }

  // ── ARCH-001: Click depth (BFS from homepage) ─────────────────────────
  const depth = new Map<string, number>();
  if (homepage) {
    const queue: string[] = [homepage];
    depth.set(homepage, 0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depth.get(current)!;
      const neighbors = outgoing.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!depth.has(neighbor) && allUrls.has(neighbor)) {
            depth.set(neighbor, currentDepth + 1);
            queue.push(neighbor);
          }
        }
      }
    }
  }

  const depthDistribution: Record<number, number> = {};
  const deepPages: { url: string; depth: number }[] = [];
  const DEPTH_THRESHOLD = 3;

  for (const [url, d] of depth.entries()) {
    depthDistribution[d] = (depthDistribution[d] || 0) + 1;
    if (d > DEPTH_THRESHOLD) {
      deepPages.push({ url, depth: d });
    }
  }

  const deepRatio = allUrls.size > 0 ? deepPages.length / allUrls.size : 0;
  results.push({
    id: randomUUID(),
    checkId: 'ARCH-001',
    checkName: 'Click depth from homepage',
    pillar: 'seo',
    category: 'Site Architecture',
    pageUrl: null,
    status: deepRatio > 0.2 ? 'fail' : deepPages.length > 0 ? 'warning' : 'pass',
    severity: deepRatio > 0.2 ? 'high' : 'warning',
    score:
      deepPages.length === 0
        ? 100
        : Math.max(0, Math.round((1 - deepRatio) * 100)),
    message:
      deepPages.length === 0
        ? `All ${depth.size} reachable pages are within ${DEPTH_THRESHOLD} clicks from the homepage.`
        : `${deepPages.length} page(s) are more than ${DEPTH_THRESHOLD} clicks from the homepage.`,
    details: {
      depthDistribution,
      deepPages: deepPages
        .sort((a, b) => b.depth - a.depth)
        .slice(0, 50),
      totalReachable: depth.size,
      totalPages: allUrls.size,
    },
    recommendation:
      deepPages.length > 0
        ? 'Flatten your site architecture. Add internal links or navigation to bring deep pages within 3 clicks of the homepage.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── ARCH-002: Orphan pages (no internal links pointing to them) ───────
  const orphanPages: string[] = [];
  for (const url of allUrls) {
    if (url === homepage) continue;
    const inLinks = incoming.get(url);
    if (!inLinks || inLinks.size === 0) {
      orphanPages.push(url);
    }
  }
  const orphanRatio = allUrls.size > 1 ? orphanPages.length / (allUrls.size - 1) : 0;
  results.push({
    id: randomUUID(),
    checkId: 'ARCH-002',
    checkName: 'Orphan pages',
    pillar: 'seo',
    category: 'Site Architecture',
    pageUrl: null,
    status: orphanPages.length === 0 ? 'pass' : orphanRatio > 0.1 ? 'fail' : 'warning',
    severity: orphanRatio > 0.1 ? 'high' : 'warning',
    score:
      orphanPages.length === 0
        ? 100
        : Math.max(0, Math.round((1 - orphanRatio) * 100)),
    message:
      orphanPages.length === 0
        ? 'No orphan pages detected — all pages have at least one internal link pointing to them.'
        : `${orphanPages.length} page(s) have no internal links pointing to them (orphan pages).`,
    details: orphanPages.length === 0 ? null : { orphanPages: orphanPages.slice(0, 50) },
    recommendation:
      orphanPages.length > 0
        ? 'Add internal links to orphan pages from relevant content or navigation to ensure they are discoverable.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── ARCH-003: PageRank concentration (simplified) ─────────────────────
  // Simple iterative PageRank calculation
  const dampingFactor = 0.85;
  const iterations = 20;
  const n = allUrls.size;

  if (n > 0) {
    const urlList = [...allUrls];
    const urlIndex = new Map<string, number>();
    urlList.forEach((u, i) => urlIndex.set(u, i));

    let pr = new Float64Array(n).fill(1 / n);
    let newPr = new Float64Array(n);

    for (let iter = 0; iter < iterations; iter++) {
      newPr.fill((1 - dampingFactor) / n);
      for (let i = 0; i < n; i++) {
        const url = urlList[i];
        const outLinks = outgoing.get(url);
        const outCount = outLinks ? outLinks.size : 0;
        if (outCount === 0) {
          // Distribute to all pages (dangling node)
          const share = pr[i] / n;
          for (let j = 0; j < n; j++) {
            newPr[j] += dampingFactor * share;
          }
        } else {
          const share = pr[i] / outCount;
          for (const dest of outLinks!) {
            const destIdx = urlIndex.get(dest);
            if (destIdx !== undefined) {
              newPr[destIdx] += dampingFactor * share;
            }
          }
        }
      }
      [pr, newPr] = [newPr, pr];
    }

    // Analyze distribution
    const prScores = urlList.map((url, i) => ({ url, score: pr[i] }));
    prScores.sort((a, b) => b.score - a.score);

    const totalPr = pr.reduce((s, v) => s + v, 0);
    const topN = Math.max(1, Math.floor(n * 0.1)); // top 10%
    const top10PrShare =
      prScores.slice(0, topN).reduce((s, p) => s + p.score, 0) / totalPr;

    // Gini coefficient of PageRank
    const sortedPr = [...pr].sort((a, b) => a - b);
    let giniNumerator = 0;
    for (let i = 0; i < n; i++) {
      giniNumerator += (2 * (i + 1) - n - 1) * sortedPr[i];
    }
    const gini = n > 1 ? giniNumerator / (n * totalPr) : 0;

    const concentrated = gini > 0.6;
    results.push({
      id: randomUUID(),
      checkId: 'ARCH-003',
      checkName: 'PageRank distribution',
      pillar: 'seo',
      category: 'Site Architecture',
      pageUrl: null,
      status: concentrated ? 'warning' : 'pass',
      severity: 'warning',
      score: concentrated ? Math.round((1 - gini) * 100) : 100,
      message: concentrated
        ? `PageRank is highly concentrated (Gini: ${gini.toFixed(2)}). Top 10% of pages hold ${(top10PrShare * 100).toFixed(1)}% of internal link equity.`
        : `PageRank is reasonably distributed (Gini: ${gini.toFixed(2)}). Top 10% of pages hold ${(top10PrShare * 100).toFixed(1)}% of internal link equity.`,
      details: {
        giniCoefficient: Math.round(gini * 1000) / 1000,
        top10PercentShare: Math.round(top10PrShare * 1000) / 1000,
        topPages: prScores.slice(0, 10).map((p) => ({
          url: p.url,
          relativeScore: Math.round((p.score / totalPr) * 10000) / 100,
        })),
        bottomPages: prScores.slice(-5).map((p) => ({
          url: p.url,
          relativeScore: Math.round((p.score / totalPr) * 10000) / 100,
        })),
      },
      recommendation: concentrated
        ? 'Distribute internal link equity more evenly. Add links from high-authority pages to important but low-authority pages.'
        : null,
      wcagCriterion: null,
      element: null,
    });
  }

  // ── ARCH-004: Dead-end pages (no outgoing internal links) ─────────────
  const deadEndPages: string[] = [];
  for (const url of allUrls) {
    const outLinks = outgoing.get(url);
    if (!outLinks || outLinks.size === 0) {
      deadEndPages.push(url);
    }
  }
  const deadEndRatio = allUrls.size > 0 ? deadEndPages.length / allUrls.size : 0;
  results.push({
    id: randomUUID(),
    checkId: 'ARCH-004',
    checkName: 'Dead-end pages',
    pillar: 'seo',
    category: 'Site Architecture',
    pageUrl: null,
    status: deadEndPages.length === 0 ? 'pass' : deadEndRatio > 0.15 ? 'fail' : 'warning',
    severity: deadEndRatio > 0.15 ? 'high' : 'warning',
    score:
      deadEndPages.length === 0
        ? 100
        : Math.max(0, Math.round((1 - deadEndRatio) * 100)),
    message:
      deadEndPages.length === 0
        ? 'No dead-end pages — all pages link to at least one other internal page.'
        : `${deadEndPages.length} page(s) have no outgoing internal links (dead-end pages).`,
    details: deadEndPages.length === 0 ? null : { deadEndPages: deadEndPages.slice(0, 50) },
    recommendation:
      deadEndPages.length > 0
        ? 'Add internal links from dead-end pages to related content to keep users engaged and distribute link equity.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  return results;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
