import type {
  CheckResult,
  AuditScores,
  PillarScore,
  CategoryScore,
  Pillar,
} from '@audit/types';
import {
  PILLAR_WEIGHTS,
  SEO_CATEGORY_WEIGHTS,
  AU_CATEGORY_WEIGHTS,
  GEO_CATEGORY_WEIGHTS,
  getCheckGroup,
} from './weights.js';

/**
 * Aggregates individual CheckResults into the hierarchical scoring structure.
 *
 * check scores → category scores (weighted avg) → pillar scores (weighted avg) → overall
 */
export function aggregateScores(checks: CheckResult[]): AuditScores {
  // Count issues by severity
  const issueCount = { critical: 0, high: 0, warning: 0, info: 0, pass: 0 };
  for (const check of checks) {
    if (check.status === 'pass') {
      issueCount.pass++;
    } else if (check.status === 'fail' || check.status === 'warning' || check.status === 'info') {
      issueCount[check.severity]++;
    }
  }

  // Group checks by pillar → category
  const pillarChecks = new Map<Pillar, Map<string, CheckResult[]>>();

  for (const check of checks) {
    if (!pillarChecks.has(check.pillar)) {
      pillarChecks.set(check.pillar, new Map());
    }
    const categories = pillarChecks.get(check.pillar)!;
    const group = getCheckGroup(check.checkId);
    if (!categories.has(group)) {
      categories.set(group, []);
    }
    categories.get(group)!.push(check);
  }

  // Build pillar scores
  const pillars: PillarScore[] = [];

  for (const pillar of ['seo', 'au', 'geo'] as Pillar[]) {
    const categoryMap = pillarChecks.get(pillar);
    if (!categoryMap || categoryMap.size === 0) {
      pillars.push({
        pillar,
        score: 0,
        weight: PILLAR_WEIGHTS[pillar],
        categories: [],
      });
      continue;
    }

    const weightMap = getCategoryWeights(pillar);
    const categories: CategoryScore[] = [];

    for (const [category, categoryChecks] of categoryMap) {
      // Average check scores within category
      const avgScore =
        categoryChecks.length > 0
          ? categoryChecks.reduce((sum, c) => sum + c.score, 0) / categoryChecks.length
          : 0;

      const weight = weightMap[category] ?? (1 / categoryMap.size);

      categories.push({
        category,
        pillar,
        score: Math.round(avgScore * 10) / 10,
        weight,
        checks: categoryChecks,
      });
    }

    // Weighted average of category scores
    const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
    const pillarScore = totalWeight > 0
      ? categories.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight
      : 0;

    pillars.push({
      pillar,
      score: Math.round(pillarScore * 10) / 10,
      weight: PILLAR_WEIGHTS[pillar],
      categories,
    });
  }

  // Overall score = weighted average of pillar scores
  const activePillars = pillars.filter((p) => p.categories.length > 0);
  const totalPillarWeight = activePillars.reduce((sum, p) => sum + p.weight, 0);
  const overall = totalPillarWeight > 0
    ? activePillars.reduce((sum, p) => sum + p.score * p.weight, 0) / totalPillarWeight
    : 0;

  return {
    overall: Math.round(overall * 10) / 10,
    pillars,
    totalChecks: checks.length,
    issueCount,
  };
}

function getCategoryWeights(pillar: Pillar): Record<string, number> {
  switch (pillar) {
    case 'seo':
      return {
        ...SEO_CATEGORY_WEIGHTS,
        // Flatten sub-groups to their parent weight
        'robots': 0.03,
        'sitemap': 0.045,
        'url-redirect': 0.075,
        'architecture': 0.045,
        'performance': 0.06,
        'mobile': 0.03,
        'security': 0.015,
        'title': 0.07,
        'meta-description': 0.035,
        'heading': 0.0525,
        'content-quality': 0.0875,
        'image': 0.035,
        'internal-link': 0.0525,
        'external-link': 0.0175,
        'off-page-seo': 0.15,
        'structured-data': 0.20,
      };
    case 'au':
      return AU_CATEGORY_WEIGHTS;
    case 'geo':
      return {
        ...GEO_CATEGORY_WEIGHTS,
        'content-structure': 0.35,
        'technical-geo': 0.25,
        'ai-visibility': 0.40,
      };
    default:
      return {};
  }
}

/**
 * Generates a prioritized action plan sorted by impact (severity × score-potential).
 */
export function generateActionPlan(
  checks: CheckResult[]
): { check: CheckResult; priority: number; effort: 'low' | 'medium' | 'high' }[] {
  const failingChecks = checks.filter((c) => c.status !== 'pass');

  const severityImpact: Record<string, number> = {
    critical: 100,
    high: 70,
    warning: 40,
    info: 15,
  };

  return failingChecks
    .map((check) => {
      const impact = severityImpact[check.severity] ?? 10;
      const scorePotential = 100 - check.score;
      const priority = (impact * 0.6) + (scorePotential * 0.4);

      // Estimate effort based on check type
      let effort: 'low' | 'medium' | 'high' = 'medium';
      const id = check.checkId.toLowerCase();
      if (id.includes('meta') || id.includes('title') || id.includes('alt') || id.includes('lang')) {
        effort = 'low';
      } else if (id.includes('perf') || id.includes('arch') || id.includes('content')) {
        effort = 'high';
      }

      return { check, priority, effort };
    })
    .sort((a, b) => b.priority - a.priority);
}
