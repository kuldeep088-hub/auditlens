import type { CheckResult, GeoQueryResult, PageData } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * GEO-VIS-003: Citation rate across AI queries
 * GEO-VIS-004: Citation position analysis
 * GEO-VIS-005: Zero-click risk assessment
 *
 * Evaluates how AI engines handle queries related to the site:
 * - Whether the site is cited at all (citation rate)
 * - Where in the response the site is cited (citation position)
 * - Whether AI responses are comprehensive enough to eliminate click-through need
 */
export function runZeroClickRiskAudit(
  geoQueries: GeoQueryResult[],
  pages: PageData[],
): CheckResult[] {
  const results: CheckResult[] = [];

  if (geoQueries.length === 0) return results;

  // ── GEO-VIS-003: Citation rate ────────────────────────────────────────
  const citedQueries = geoQueries.filter((q) => q.cited);
  const citationRate =
    geoQueries.length > 0
      ? Math.round((citedQueries.length / geoQueries.length) * 100)
      : 0;

  const citationScore = citationRate; // Direct mapping: percentage = score

  results.push({
    id: randomUUID(),
    checkId: 'GEO-VIS-003',
    checkName: 'AI citation rate',
    pillar: 'geo',
    category: 'AI Visibility',
    pageUrl: null,
    status:
      citationScore >= 70 ? 'pass' : citationScore >= 40 ? 'warning' : 'fail',
    severity: 'critical',
    score: citationScore,
    message: `Site was cited in ${citedQueries.length} of ${geoQueries.length} AI query response(s) (${citationRate}%).`,
    details: {
      totalQueries: geoQueries.length,
      citedCount: citedQueries.length,
      citationRate,
      citedEngines: citedQueries.map((q) => ({
        engine: q.engine,
        query: q.query,
        citedUrl: q.citedUrl,
      })),
      uncitedEngines: geoQueries
        .filter((q) => !q.cited)
        .slice(0, 30)
        .map((q) => ({
          engine: q.engine,
          query: q.query,
        })),
    },
    recommendation:
      citationScore < 70
        ? 'Increase AI citation rate by improving content authority, adding structured data, ensuring comprehensive topic coverage, and building authoritative backlinks. Create content that directly answers common AI queries with citable facts and statistics.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── GEO-VIS-004: Citation position ────────────────────────────────────
  const citedWithPosition = citedQueries.filter(
    (q) => q.citationPosition !== null,
  );

  let avgPosition = 0;
  let positionScore = 0;

  if (citedWithPosition.length > 0) {
    const totalPosition = citedWithPosition.reduce(
      (sum, q) => sum + (q.citationPosition ?? 0),
      0,
    );
    avgPosition = Math.round(
      (totalPosition / citedWithPosition.length) * 10,
    ) / 10;

    // Lower position is better: position 1 = 100, position 2 = 85, position 3 = 70, etc.
    positionScore = Math.max(0, Math.round(100 - (avgPosition - 1) * 15));
  }

  const positionStatus: CheckResult['status'] =
    citedWithPosition.length === 0
      ? 'info'
      : positionScore >= 70
        ? 'pass'
        : positionScore >= 40
          ? 'warning'
          : 'fail';

  results.push({
    id: randomUUID(),
    checkId: 'GEO-VIS-004',
    checkName: 'AI citation position',
    pillar: 'geo',
    category: 'AI Visibility',
    pageUrl: null,
    status: positionStatus,
    severity: 'high',
    score: positionScore,
    message:
      citedWithPosition.length === 0
        ? 'No citation positions available — site was not cited in any AI responses.'
        : `Average citation position: ${avgPosition} across ${citedWithPosition.length} cited response(s). Score: ${positionScore}/100.`,
    details: {
      averagePosition: avgPosition,
      citedWithPosition: citedWithPosition.length,
      positionBreakdown: citedWithPosition.map((q) => ({
        engine: q.engine,
        query: q.query,
        position: q.citationPosition,
      })),
    },
    recommendation:
      positionScore < 70 && citedWithPosition.length > 0
        ? 'Improve citation position by becoming the primary authority on your key topics. Ensure content is the most comprehensive, well-structured, and frequently updated source for target queries.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  // ── GEO-VIS-005: Zero-click risk ─────────────────────────────────────
  // A zero-click risk occurs when an AI response is comprehensive (>500 chars)
  // but does NOT cite our site — meaning the AI answered the user's question
  // without directing traffic to us.
  const zeroClickRiskQueries = geoQueries.filter(
    (q) => q.response.length > 500 && !q.cited,
  );

  const zeroClickRiskRate =
    geoQueries.length > 0
      ? Math.round(
          (zeroClickRiskQueries.length / geoQueries.length) * 100,
        )
      : 0;

  // Score is inverse of risk rate: low risk = high score
  const zeroClickScore = Math.max(0, 100 - zeroClickRiskRate);

  results.push({
    id: randomUUID(),
    checkId: 'GEO-VIS-005',
    checkName: 'Zero-click risk assessment',
    pillar: 'geo',
    category: 'AI Visibility',
    pageUrl: null,
    status:
      zeroClickScore >= 70 ? 'pass' : zeroClickScore >= 40 ? 'warning' : 'fail',
    severity: 'high',
    score: zeroClickScore,
    message: `${zeroClickRiskQueries.length} of ${geoQueries.length} AI response(s) (${zeroClickRiskRate}%) are comprehensive enough to answer the query without citing the site (zero-click risk).`,
    details: {
      totalQueries: geoQueries.length,
      zeroClickRiskCount: zeroClickRiskQueries.length,
      zeroClickRiskRate,
      riskQueries: zeroClickRiskQueries.slice(0, 30).map((q) => ({
        engine: q.engine,
        query: q.query,
        responseLength: q.response.length,
      })),
    },
    recommendation:
      zeroClickScore < 70
        ? 'Reduce zero-click risk by creating unique, proprietary content that AI engines must cite: original research, exclusive data, unique methodologies, and expert opinions that cannot be fully summarized without attribution.'
        : null,
    wcagCriterion: null,
    element: null,
  });

  return results;
}
