const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

export interface AuditSummary {
  id: string;
  url: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  scores?: {
    overall: number;
    pillars: { pillar: string; score: number }[];
    issueCount: { critical: number; high: number; warning: number; info: number };
  };
  startedAt: string;
  completedAt?: string;
  totalChecks?: number;
  issueCount?: { critical: number; high: number; warning: number; info: number };
}

export interface CheckResult {
  checkId: string;
  checkName: string;
  pillar: string;
  category: string;
  pageUrl?: string;
  status: 'pass' | 'fail' | 'warning' | 'info' | 'skip';
  severity: 'critical' | 'high' | 'warning' | 'info';
  score: number;
  message: string;
  details?: string;
  recommendation?: string;
  element?: string;
}

export async function listAudits(): Promise<AuditSummary[]> {
  const res = await fetch(`${API_URL}/api/audits`);
  if (!res.ok) throw new Error('Failed to fetch audits');
  return res.json();
}

export async function getAudit(id: string): Promise<AuditSummary> {
  const res = await fetch(`${API_URL}/api/audits/${id}`);
  if (!res.ok) throw new Error('Failed to fetch audit');
  return res.json();
}

export async function getAuditChecks(id: string): Promise<CheckResult[]> {
  const res = await fetch(`${API_URL}/api/audits/${id}/checks`);
  if (!res.ok) throw new Error('Failed to fetch checks');
  return res.json();
}

export async function startAudit(params: {
  url: string;
  maxPages: number;
  pillars: string[];
}): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_URL}/api/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to start audit');
  return res.json();
}

export function getReportUrl(id: string): string {
  return `${API_URL}/api/audits/${id}/report`;
}
