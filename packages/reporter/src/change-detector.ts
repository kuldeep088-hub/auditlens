import type { AuditResult, CheckResult, AuditScores } from '@audit/types';

export interface ChangeReport {
  scoreChanges: {
    overall: { previous: number; current: number; delta: number };
    seo: { previous: number; current: number; delta: number } | null;
    au: { previous: number; current: number; delta: number } | null;
    geo: { previous: number; current: number; delta: number } | null;
  };
  newIssues: CheckResult[];
  resolvedIssues: CheckResult[];
  regressions: string[];
  improvements: string[];
}

/**
 * Compares two audit runs and produces a change report.
 */
export function detectChanges(
  current: AuditResult,
  previous: AuditResult
): ChangeReport | null {
  if (!current.scores || !previous.scores) return null;

  // Score changes
  const scoreChanges = {
    overall: {
      previous: previous.scores.overall,
      current: current.scores.overall,
      delta: round(current.scores.overall - previous.scores.overall),
    },
    seo: comparePillarScore(current.scores, previous.scores, 'seo'),
    au: comparePillarScore(current.scores, previous.scores, 'au'),
    geo: comparePillarScore(current.scores, previous.scores, 'geo'),
  };

  // Find new vs resolved issues by checkId + pageUrl
  const prevIssueKeys = new Set(
    previous.checks
      .filter((c) => c.status !== 'pass')
      .map((c) => issueKey(c))
  );
  const currIssueKeys = new Set(
    current.checks
      .filter((c) => c.status !== 'pass')
      .map((c) => issueKey(c))
  );

  const newIssues = current.checks.filter(
    (c) => c.status !== 'pass' && !prevIssueKeys.has(issueKey(c))
  );
  const resolvedIssues = previous.checks.filter(
    (c) => c.status !== 'pass' && !currIssueKeys.has(issueKey(c))
  );

  // Detect regressions and improvements (> 5 point swing)
  const regressions: string[] = [];
  const improvements: string[] = [];

  if (scoreChanges.overall.delta < -5) {
    regressions.push(`Overall score dropped by ${Math.abs(scoreChanges.overall.delta)} points`);
  }
  if (scoreChanges.overall.delta > 5) {
    improvements.push(`Overall score improved by ${scoreChanges.overall.delta} points`);
  }

  for (const key of ['seo', 'au', 'geo'] as const) {
    const change = scoreChanges[key];
    if (!change) continue;
    if (change.delta < -5) {
      regressions.push(`${key.toUpperCase()} score dropped by ${Math.abs(change.delta)} points`);
    }
    if (change.delta > 5) {
      improvements.push(`${key.toUpperCase()} score improved by ${change.delta} points`);
    }
  }

  return {
    scoreChanges,
    newIssues,
    resolvedIssues,
    regressions,
    improvements,
  };
}

function issueKey(check: CheckResult): string {
  return `${check.checkId}::${check.pageUrl ?? 'site-wide'}`;
}

function comparePillarScore(
  current: AuditScores,
  previous: AuditScores,
  pillar: string
): { previous: number; current: number; delta: number } | null {
  const curr = current.pillars.find((p) => p.pillar === pillar);
  const prev = previous.pillars.find((p) => p.pillar === pillar);
  if (!curr || !prev) return null;
  return {
    previous: prev.score,
    current: curr.score,
    delta: round(curr.score - prev.score),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
