import type { Pillar } from './audit-config.js';

export type Severity = 'critical' | 'high' | 'warning' | 'info';
export type CheckStatus = 'pass' | 'fail' | 'warning' | 'info' | 'error';

export interface CheckResult {
  id: string;
  checkId: string;
  checkName: string;
  pillar: Pillar;
  category: string;
  pageUrl: string | null;
  status: CheckStatus;
  severity: Severity;
  score: number;
  message: string;
  details: Record<string, unknown> | null;
  recommendation: string | null;
  wcagCriterion: string | null;
  element: string | null;
}

export interface CategoryScore {
  category: string;
  pillar: Pillar;
  score: number;
  weight: number;
  checks: CheckResult[];
}

export interface PillarScore {
  pillar: Pillar;
  score: number;
  weight: number;
  categories: CategoryScore[];
}

export interface AuditScores {
  overall: number;
  pillars: PillarScore[];
  totalChecks: number;
  issueCount: {
    critical: number;
    high: number;
    warning: number;
    info: number;
    pass: number;
  };
}
