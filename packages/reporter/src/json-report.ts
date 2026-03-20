import type { AuditResult } from '@audit/types';

/**
 * Generates a JSON export of the full audit result.
 */
export function generateJsonReport(audit: AuditResult): string {
  return JSON.stringify(
    {
      id: audit.id,
      url: audit.url,
      status: audit.status,
      scores: audit.scores,
      checks: audit.checks.map((c) => ({
        checkId: c.checkId,
        checkName: c.checkName,
        pillar: c.pillar,
        category: c.category,
        pageUrl: c.pageUrl,
        status: c.status,
        severity: c.severity,
        score: c.score,
        message: c.message,
        recommendation: c.recommendation,
        wcagCriterion: c.wcagCriterion,
      })),
      geoQueries: audit.geoQueries,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
    },
    null,
    2
  );
}
