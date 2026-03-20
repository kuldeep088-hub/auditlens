import type { CheckResult, GeoQueryResult } from '@audit/types';
import { randomUUID } from 'crypto';

/**
 * GEO-VIS-001 through GEO-VIS-005
 * Analyzes brand visibility, sentiment, and competitive position
 * in AI-generated responses based on GeoQueryResult data.
 */
export function runBrandSentimentAnalysis(
  geoQueryResults: GeoQueryResult[],
  siteUrl: string,
): CheckResult[] {
  const results: CheckResult[] = [];

  if (geoQueryResults.length === 0) {
    // Return info-level results when no query data is available
    const checkIds = [
      { id: 'GEO-VIS-001', name: 'AI engine citation presence' },
      { id: 'GEO-VIS-002', name: 'Citation position analysis' },
      { id: 'GEO-VIS-003', name: 'Brand sentiment in AI responses' },
      { id: 'GEO-VIS-004', name: 'Competitor citation gap' },
      { id: 'GEO-VIS-005', name: 'Cross-engine consistency' },
    ];

    for (const check of checkIds) {
      results.push({
        id: randomUUID(),
        checkId: check.id,
        checkName: check.name,
        pillar: 'geo',
        category: 'AI Visibility',
        pageUrl: null,
        status: 'info',
        severity: 'info',
        score: 0,
        message: 'No AI query results available. Run AI engine queries to assess visibility.',
        details: null,
        recommendation: 'Configure geoQueries and geoEngines in audit config, then provide query results for visibility analysis.',
        wcagCriterion: null,
        element: null,
      });
    }

    return results;
  }

  // ── GEO-VIS-001: AI engine citation presence ──────────────────────────
  // What percentage of queries resulted in the site being cited?
  const totalQueries = geoQueryResults.length;
  const citedQueries = geoQueryResults.filter((r) => r.cited);
  const citationRate = Math.round((citedQueries.length / totalQueries) * 100);

  // Break down by engine
  const engineGroups = new Map<string, GeoQueryResult[]>();
  for (const r of geoQueryResults) {
    if (!engineGroups.has(r.engine)) engineGroups.set(r.engine, []);
    engineGroups.get(r.engine)!.push(r);
  }

  const perEnginePresence: { engine: string; total: number; cited: number; rate: number }[] = [];
  for (const [engine, engineResults] of engineGroups) {
    const engineCited = engineResults.filter((r) => r.cited).length;
    perEnginePresence.push({
      engine,
      total: engineResults.length,
      cited: engineCited,
      rate: Math.round((engineCited / engineResults.length) * 100),
    });
  }

  results.push({
    id: randomUUID(),
    checkId: 'GEO-VIS-001',
    checkName: 'AI engine citation presence',
    pillar: 'geo',
    category: 'AI Visibility',
    pageUrl: null,
    status: citationRate >= 60 ? 'pass' : citationRate >= 30 ? 'warning' : 'fail',
    severity: 'critical',
    score: citationRate,
    message: `Site was cited in ${citedQueries.length} of ${totalQueries} AI query response(s) (${citationRate}%).`,
    details: {
      totalQueries,
      citedCount: citedQueries.length,
      citationRate,
      perEngine: perEnginePresence,
      citedQueries: citedQueries.slice(0, 20).map((r) => ({
        engine: r.engine,
        query: r.query,
        citedUrl: r.citedUrl,
        position: r.citationPosition,
      })),
      uncitedQueries: geoQueryResults
        .filter((r) => !r.cited)
        .slice(0, 20)
        .map((r) => ({ engine: r.engine, query: r.query })),
    },
    recommendation: citationRate < 60
      ? 'Improve your content to be more citable by AI engines. Focus on providing clear, authoritative answers to common queries in your domain.'
      : null,
    wcagCriterion: null,
    element: null,
  });

  // ── GEO-VIS-002: Citation position analysis ──────────────────────────
  const citedWithPosition = citedQueries.filter(
    (r) => r.citationPosition !== null && r.citationPosition !== undefined,
  );

  if (citedWithPosition.length > 0) {
    const positions = citedWithPosition.map((r) => r.citationPosition!);
    const avgPosition = Math.round(
      (positions.reduce((sum, p) => sum + p, 0) / positions.length) * 10,
    ) / 10;
    const topPositions = positions.filter((p) => p <= 3).length;
    const topPositionRate = Math.round((topPositions / citedWithPosition.length) * 100);

    // Score: position 1 = 100, position 2 = 80, position 3 = 60, etc.
    const positionScore = Math.max(
      0,
      Math.min(100, Math.round(100 - (avgPosition - 1) * 20)),
    );

    results.push({
      id: randomUUID(),
      checkId: 'GEO-VIS-002',
      checkName: 'Citation position analysis',
      pillar: 'geo',
      category: 'AI Visibility',
      pageUrl: null,
      status: avgPosition <= 2 ? 'pass' : avgPosition <= 4 ? 'warning' : 'fail',
      severity: 'high',
      score: positionScore,
      message: `Average citation position: ${avgPosition}. ${topPositions} of ${citedWithPosition.length} citation(s) (${topPositionRate}%) appear in the top 3 positions.`,
      details: {
        averagePosition: avgPosition,
        topThreeCount: topPositions,
        positionDistribution: {
          top1: positions.filter((p) => p === 1).length,
          top2: positions.filter((p) => p === 2).length,
          top3: positions.filter((p) => p === 3).length,
          lower: positions.filter((p) => p > 3).length,
        },
        citations: citedWithPosition.slice(0, 20).map((r) => ({
          engine: r.engine,
          query: r.query,
          position: r.citationPosition,
          url: r.citedUrl,
        })),
      },
      recommendation: avgPosition > 2
        ? 'Improve citation positioning by strengthening content authority, adding more unique data, and improving content structure. Higher citation positions increase click-through from AI responses.'
        : null,
      wcagCriterion: null,
      element: null,
    });
  } else {
    results.push({
      id: randomUUID(),
      checkId: 'GEO-VIS-002',
      checkName: 'Citation position analysis',
      pillar: 'geo',
      category: 'AI Visibility',
      pageUrl: null,
      status: citedQueries.length > 0 ? 'info' : 'fail',
      severity: 'high',
      score: citedQueries.length > 0 ? 50 : 0,
      message: citedQueries.length > 0
        ? 'Site was cited but no position data was captured. Citation position tracking may not be available for all engines.'
        : 'Site was not cited in any AI engine responses. No position data available.',
      details: null,
      recommendation: 'Ensure query tracking captures citation positions. Focus on being cited first, then optimize for position.',
      wcagCriterion: null,
      element: null,
    });
  }

  // ── GEO-VIS-003: Brand sentiment in AI responses ─────────────────────
  const sentimentCounts = {
    positive: geoQueryResults.filter((r) => r.sentiment === 'positive').length,
    neutral: geoQueryResults.filter((r) => r.sentiment === 'neutral').length,
    negative: geoQueryResults.filter((r) => r.sentiment === 'negative').length,
  };

  // Sentiment score: positive = 100, neutral = 60, negative = 0
  const sentimentScore = totalQueries > 0
    ? Math.round(
        (sentimentCounts.positive * 100 +
          sentimentCounts.neutral * 60 +
          sentimentCounts.negative * 0) /
          totalQueries,
      )
    : 0;

  const dominantSentiment = sentimentCounts.positive >= sentimentCounts.neutral &&
    sentimentCounts.positive >= sentimentCounts.negative
    ? 'positive'
    : sentimentCounts.negative > sentimentCounts.positive &&
        sentimentCounts.negative > sentimentCounts.neutral
      ? 'negative'
      : 'neutral';

  results.push({
    id: randomUUID(),
    checkId: 'GEO-VIS-003',
    checkName: 'Brand sentiment in AI responses',
    pillar: 'geo',
    category: 'AI Visibility',
    pageUrl: null,
    status: sentimentScore >= 70 ? 'pass' : sentimentScore >= 50 ? 'warning' : 'fail',
    severity: 'high',
    score: sentimentScore,
    message: `Brand sentiment score: ${sentimentScore}/100. Distribution: ${sentimentCounts.positive} positive, ${sentimentCounts.neutral} neutral, ${sentimentCounts.negative} negative across ${totalQueries} responses.`,
    details: {
      sentimentScore,
      dominantSentiment,
      distribution: sentimentCounts,
      totalResponses: totalQueries,
      negativeResponses: geoQueryResults
        .filter((r) => r.sentiment === 'negative')
        .slice(0, 10)
        .map((r) => ({ engine: r.engine, query: r.query, snippet: r.citedSnippet })),
      positiveResponses: geoQueryResults
        .filter((r) => r.sentiment === 'positive')
        .slice(0, 10)
        .map((r) => ({ engine: r.engine, query: r.query, snippet: r.citedSnippet })),
    },
    recommendation: sentimentScore < 70
      ? 'Address negative sentiment in AI responses by improving content quality, addressing customer concerns publicly, and building positive brand signals across the web.'
      : null,
    wcagCriterion: null,
    element: null,
  });

  // ── GEO-VIS-004: Competitor citation gap ──────────────────────────────
  // Aggregate competitor data across all query results
  const competitorMap = new Map<string, {
    name: string;
    url: string;
    citationCount: number;
    avgPosition: number;
    positions: number[];
  }>();

  for (const result of geoQueryResults) {
    for (const competitor of result.competitorsCited) {
      const key = competitor.url.toLowerCase();
      if (!competitorMap.has(key)) {
        competitorMap.set(key, {
          name: competitor.name,
          url: competitor.url,
          citationCount: 0,
          avgPosition: 0,
          positions: [],
        });
      }
      const entry = competitorMap.get(key)!;
      entry.citationCount++;
      entry.positions.push(competitor.position);
    }
  }

  // Calculate average positions
  for (const entry of competitorMap.values()) {
    entry.avgPosition = Math.round(
      (entry.positions.reduce((s, p) => s + p, 0) / entry.positions.length) * 10,
    ) / 10;
  }

  const competitors = [...competitorMap.values()]
    .sort((a, b) => b.citationCount - a.citationCount);

  const topCompetitors = competitors.slice(0, 10);

  // Count competitors that appear more often than us
  const ourCitations = citedQueries.length;
  const competitorsAheadOfUs = competitors.filter(
    (c) => c.citationCount > ourCitations,
  ).length;

  // Score: we should ideally be cited as much or more than top competitors
  let gapScore: number;
  if (competitors.length === 0) {
    gapScore = citationRate > 0 ? 100 : 50; // No competitors found
  } else {
    const topCompetitorCitations = competitors[0]?.citationCount ?? 0;
    if (topCompetitorCitations === 0) {
      gapScore = 100;
    } else {
      gapScore = Math.min(100, Math.round((ourCitations / topCompetitorCitations) * 100));
    }
  }

  results.push({
    id: randomUUID(),
    checkId: 'GEO-VIS-004',
    checkName: 'Competitor citation gap',
    pillar: 'geo',
    category: 'AI Visibility',
    pageUrl: null,
    status: gapScore >= 70 ? 'pass' : gapScore >= 40 ? 'warning' : 'fail',
    severity: 'critical',
    score: gapScore,
    message: competitors.length > 0
      ? `Your site was cited ${ourCitations} time(s). ${competitorsAheadOfUs} competitor(s) were cited more often. ${competitors.length} unique competitor(s) detected.`
      : `Your site was cited ${ourCitations} time(s). No competitor citations detected in responses.`,
    details: {
      ourCitations,
      competitorsAheadOfUs,
      uniqueCompetitors: competitors.length,
      topCompetitors: topCompetitors.map((c) => ({
        name: c.name,
        url: c.url,
        citationCount: c.citationCount,
        avgPosition: c.avgPosition,
      })),
    },
    recommendation: gapScore < 70
      ? `Focus on outranking key competitors in AI responses. Top competitors: ${topCompetitors.slice(0, 3).map((c) => c.name).join(', ')}. Improve content depth, add unique data, and strengthen authority signals.`
      : null,
    wcagCriterion: null,
    element: null,
  });

  // ── GEO-VIS-005: Cross-engine consistency ─────────────────────────────
  // Check if the site is cited consistently across different AI engines
  if (engineGroups.size <= 1) {
    results.push({
      id: randomUUID(),
      checkId: 'GEO-VIS-005',
      checkName: 'Cross-engine consistency',
      pillar: 'geo',
      category: 'AI Visibility',
      pageUrl: null,
      status: 'info',
      severity: 'info',
      score: perEnginePresence.length > 0 ? perEnginePresence[0].rate : 0,
      message: `Only ${engineGroups.size} AI engine(s) queried. Cross-engine comparison requires data from multiple engines.`,
      details: {
        enginesQueried: [...engineGroups.keys()],
      },
      recommendation: 'Query multiple AI engines (ChatGPT, Perplexity, Google AI, Bing Copilot) for a comprehensive cross-engine visibility analysis.',
      wcagCriterion: null,
      element: null,
    });
  } else {
    // Calculate consistency: standard deviation of citation rates across engines
    const rates = perEnginePresence.map((e) => e.rate);
    const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length;
    const variance = rates.reduce((s, r) => s + (r - avgRate) ** 2, 0) / rates.length;
    const stdDev = Math.sqrt(variance);

    // Consistency score: lower std dev = more consistent = higher score
    // 0 stdDev = 100 score, 50 stdDev = 0 score
    const consistencyScore = Math.max(0, Math.round(100 - stdDev * 2));

    // Combine consistency with overall presence
    const combinedScore = Math.round((consistencyScore * 0.4) + (avgRate * 0.6));

    // Find engines where we perform worst
    const sortedByRate = [...perEnginePresence].sort((a, b) => a.rate - b.rate);
    const weakestEngine = sortedByRate[0];
    const strongestEngine = sortedByRate[sortedByRate.length - 1];

    results.push({
      id: randomUUID(),
      checkId: 'GEO-VIS-005',
      checkName: 'Cross-engine consistency',
      pillar: 'geo',
      category: 'AI Visibility',
      pageUrl: null,
      status: combinedScore >= 60 ? 'pass' : combinedScore >= 30 ? 'warning' : 'fail',
      severity: 'high',
      score: combinedScore,
      message: `Cross-engine citation consistency score: ${combinedScore}/100. Citation rates range from ${weakestEngine.rate}% (${weakestEngine.engine}) to ${strongestEngine.rate}% (${strongestEngine.engine}).`,
      details: {
        consistencyScore,
        averageCitationRate: Math.round(avgRate),
        standardDeviation: Math.round(stdDev * 10) / 10,
        perEngine: perEnginePresence,
        weakestEngine: { engine: weakestEngine.engine, rate: weakestEngine.rate },
        strongestEngine: { engine: strongestEngine.engine, rate: strongestEngine.rate },
      },
      recommendation: combinedScore < 60
        ? `Improve visibility consistency across AI engines. Weakest performance: ${weakestEngine.engine} (${weakestEngine.rate}% citation rate). Ensure content is accessible and optimized for all major AI crawlers.`
        : null,
      wcagCriterion: null,
      element: null,
    });
  }

  return results;
}
