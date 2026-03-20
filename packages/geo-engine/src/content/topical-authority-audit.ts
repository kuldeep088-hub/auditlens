/**
 * Topical Authority audit for GEO.
 * Checks GEO-TOPIC-001 and GEO-TOPIC-002 to evaluate topic cluster
 * coverage and interlinking depth -- key signals AI engines use to
 * determine domain expertise on specific subjects.
 *
 * Uses heuristic URL-path-based clustering, no Claude API.
 */

import crypto from 'node:crypto';
import type { CheckResult, PageData } from '@audit/types';

function makeResult(
  checkId: string,
  checkName: string,
  pageUrl: string | null,
  status: CheckResult['status'],
  severity: CheckResult['severity'],
  score: number,
  message: string,
  details: Record<string, unknown> | null,
  recommendation: string | null,
): CheckResult {
  return {
    id: crypto.randomUUID(),
    checkId,
    checkName,
    pillar: 'geo',
    category: 'Content Structure',
    pageUrl,
    status,
    severity,
    score: Math.max(0, Math.min(100, score)),
    message,
    details,
    recommendation,
    wcagCriterion: null,
    element: null,
  };
}

interface LinkEdge {
  source: string;
  destination: string;
}

/**
 * Group pages into topic clusters based on URL path segments.
 * Uses the first two meaningful path segments as the cluster key.
 */
function buildClusters(pages: PageData[]): Map<string, string[]> {
  const clusters = new Map<string, string[]>();

  for (const page of pages) {
    let pathname: string;
    try { pathname = new URL(page.url).pathname; }
    catch { pathname = page.url; }

    const segments = pathname.replace(/\/+$/, '').split('/').filter((s) => s.length > 0);

    let clusterKey: string;
    if (segments.length === 0) clusterKey = '/';
    else if (segments.length === 1) clusterKey = `/${segments[0]}`;
    else clusterKey = `/${segments[0]}/${segments[1]}`;

    if (!clusters.has(clusterKey)) clusters.set(clusterKey, []);
    clusters.get(clusterKey)!.push(page.url);
  }
  return clusters;
}

/**
 * GEO-TOPIC-001: Topic cluster coverage.
 * Group pages by URL path segments. Clusters with <3 pages = thin.
 */
function checkTopicClusterCoverage(pages: PageData[]): CheckResult {
  if (pages.length < 3) {
    return makeResult('GEO-TOPIC-001', 'Topic Cluster Coverage', null, 'info', 'info', 50,
      `Only ${pages.length} page(s) crawled -- insufficient to evaluate topic clusters.`,
      { totalPages: pages.length },
      'Create more content pages organized into topic clusters (3+ pages per topic) to demonstrate topical authority.');
  }

  const clusters = buildClusters(pages);
  const meaningfulClusters: { key: string; pageCount: number; urls: string[] }[] = [];
  let thinClusterCount = 0;

  for (const [key, urls] of clusters) {
    if (key === '/') continue;
    meaningfulClusters.push({ key, pageCount: urls.length, urls: urls.slice(0, 5) });
    if (urls.length < 3) thinClusterCount++;
  }

  if (meaningfulClusters.length === 0) {
    return makeResult('GEO-TOPIC-001', 'Topic Cluster Coverage', null, 'info', 'info', 40,
      'No discernible topic clusters found based on URL structure.',
      { totalPages: pages.length, clusterCount: 0 },
      'Organize content into clear URL hierarchies (e.g., /blog/topic/article) to establish recognizable topic clusters.');
  }

  const totalClusterPages = meaningfulClusters.reduce((sum, c) => sum + c.pageCount, 0);
  const averageClusterSize = totalClusterPages / meaningfulClusters.length;
  const healthyClusterCount = meaningfulClusters.length - thinClusterCount;

  const healthRatio = healthyClusterCount / meaningfulClusters.length;
  const sizeBonus = Math.min(1, averageClusterSize / 5);
  const score = Math.round(healthRatio * 60 + sizeBonus * 40);
  const status: CheckResult['status'] = score >= 60 ? 'pass' : score >= 30 ? 'warning' : 'info';

  return makeResult('GEO-TOPIC-001', 'Topic Cluster Coverage', null, status, 'info', score,
    `Found ${meaningfulClusters.length} topic cluster(s) with an average of ${averageClusterSize.toFixed(1)} pages. ${thinClusterCount} cluster(s) have fewer than 3 pages.`,
    {
      totalClusters: meaningfulClusters.length, thinClusterCount, healthyClusterCount,
      averageClusterSize: Number(averageClusterSize.toFixed(1)),
      clusters: meaningfulClusters.sort((a, b) => b.pageCount - a.pageCount).slice(0, 15),
    },
    thinClusterCount > 0
      ? `Expand thin topic clusters to at least 3 pages each. AI engines associate deeper coverage with topical authority. ${thinClusterCount} cluster(s) need more content.`
      : null);
}

/**
 * GEO-TOPIC-002: Cluster interlinking.
 * For each cluster, check what % of pages link to another page in the same cluster.
 */
function checkClusterInterlinking(pages: PageData[], linkGraph: LinkEdge[]): CheckResult {
  if (pages.length < 3) {
    return makeResult('GEO-TOPIC-002', 'Cluster Interlinking', null, 'info', 'warning', 50,
      `Only ${pages.length} page(s) crawled -- insufficient to evaluate cluster interlinking.`,
      { totalPages: pages.length },
      'Create more content pages and interlink related pages within topic clusters.');
  }

  const clusters = buildClusters(pages);
  const linkMap = new Map<string, Set<string>>();
  for (const edge of linkGraph) {
    if (!linkMap.has(edge.source)) linkMap.set(edge.source, new Set());
    linkMap.get(edge.source)!.add(edge.destination);
  }

  function normalize(url: string): string { return url.replace(/\/+$/, ''); }

  const clusterStats: { key: string; pageCount: number; pagesWithIntraLinks: number; linkagePercent: number }[] = [];
  let totalLinkagePercent = 0;
  let clusterCount = 0;

  for (const [key, urls] of clusters) {
    if (key === '/' || urls.length < 2) continue;
    const normalizedUrls = new Set(urls.map(normalize));
    let pagesWithIntraLinks = 0;

    for (const url of urls) {
      const destinations = linkMap.get(url) || linkMap.get(normalize(url));
      if (!destinations) continue;
      let linksToCluster = false;
      for (const dest of destinations) {
        if (normalizedUrls.has(normalize(dest)) && normalize(dest) !== normalize(url)) {
          linksToCluster = true;
          break;
        }
      }
      if (linksToCluster) pagesWithIntraLinks++;
    }

    const linkagePercent = Math.round((pagesWithIntraLinks / urls.length) * 100);
    totalLinkagePercent += linkagePercent;
    clusterCount++;
    clusterStats.push({ key, pageCount: urls.length, pagesWithIntraLinks, linkagePercent });
  }

  if (clusterCount === 0) {
    return makeResult('GEO-TOPIC-002', 'Cluster Interlinking', null, 'info', 'warning', 40,
      'No multi-page topic clusters found to evaluate interlinking.',
      { clusterCount: 0, totalPages: pages.length },
      'Organize content into topic clusters with consistent URL paths and add internal links between related pages.');
  }

  const averageLinkage = Math.round(totalLinkagePercent / clusterCount);
  const score = averageLinkage;
  const status: CheckResult['status'] = score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail';
  const weakClusters = clusterStats.filter((c) => c.linkagePercent < 50);

  return makeResult('GEO-TOPIC-002', 'Cluster Interlinking', null, status, 'warning', score,
    `Average intra-cluster linkage: ${averageLinkage}% across ${clusterCount} cluster(s). ${weakClusters.length} cluster(s) have weak internal linking (<50%).`,
    {
      averageLinkage, clusterCount, weakClusterCount: weakClusters.length,
      clusters: clusterStats.sort((a, b) => a.linkagePercent - b.linkagePercent).slice(0, 15),
    },
    averageLinkage < 70
      ? 'Strengthen internal linking within topic clusters. Every page in a cluster should link to at least one other page in the same cluster. AI engines follow internal links to assess topical depth.'
      : null);
}

/**
 * Run Topical Authority audit across all pages.
 */
export function runTopicalAuthorityAudit(
  pages: PageData[],
  linkGraph: { source: string; destination: string }[],
): CheckResult[] {
  const results: CheckResult[] = [];
  results.push(checkTopicClusterCoverage(pages));
  results.push(checkClusterInterlinking(pages, linkGraph));
  return results;
}
