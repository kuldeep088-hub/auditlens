import type { AuditResult, AuditScores, CheckResult, PillarScore } from '@audit/types';
import { generateActionPlan } from '@audit/scoring';

/**
 * Generates a self-contained interactive HTML report.
 */
export function generateHtmlReport(audit: AuditResult): string {
  const scores = audit.scores;
  if (!scores) return '<html><body><h1>Audit incomplete — no scores available</h1></body></html>';

  const actionPlan = generateActionPlan(audit.checks);
  const criticalIssues = audit.checks.filter((c) => c.severity === 'critical' && c.status !== 'pass');
  const highIssues = audit.checks.filter((c) => c.severity === 'high' && c.status !== 'pass');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit Report — ${escapeHtml(audit.url)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #f8fafc; }
    h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: #f1f5f9; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }
    h3 { font-size: 1.1rem; margin: 1.5rem 0 0.75rem; color: #cbd5e1; }
    .meta { color: #94a3b8; margin-bottom: 2rem; }
    .meta span { margin-right: 2rem; }

    /* Score cards */
    .scores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 2rem 0; }
    .score-card { background: #1e293b; border-radius: 12px; padding: 1.5rem; text-align: center; border: 1px solid #334155; }
    .score-card.overall { border-color: #6366f1; }
    .score-value { font-size: 3rem; font-weight: 700; margin: 0.5rem 0; }
    .score-label { font-size: 0.875rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .score-good { color: #22c55e; }
    .score-ok { color: #eab308; }
    .score-bad { color: #ef4444; }

    /* Issue summary */
    .issue-summary { display: flex; gap: 1rem; margin: 1rem 0; flex-wrap: wrap; }
    .issue-badge { padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; font-size: 0.875rem; }
    .badge-critical { background: #991b1b; color: #fecaca; }
    .badge-high { background: #92400e; color: #fed7aa; }
    .badge-warning { background: #854d0e; color: #fef08a; }
    .badge-info { background: #1e3a5f; color: #bfdbfe; }
    .badge-pass { background: #14532d; color: #bbf7d0; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #1e293b; }
    th { background: #1e293b; color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { font-size: 0.875rem; }
    tr:hover { background: #1e293b; }

    /* Severity indicators */
    .sev { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.5rem; }
    .sev-critical { background: #ef4444; }
    .sev-high { background: #f97316; }
    .sev-warning { background: #eab308; }
    .sev-info { background: #3b82f6; }

    /* Pillar sections */
    .pillar { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin: 1rem 0; border: 1px solid #334155; }
    .pillar-header { display: flex; justify-content: space-between; align-items: center; }
    .pillar-score { font-size: 2rem; font-weight: 700; }

    /* Category bars */
    .category-bar { margin: 0.75rem 0; }
    .category-label { display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 0.25rem; }
    .bar-track { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }

    /* Collapsible sections */
    details { margin: 0.5rem 0; }
    summary { cursor: pointer; padding: 0.75rem; background: #1e293b; border-radius: 8px; font-weight: 500; user-select: none; }
    summary:hover { background: #263348; }
    details[open] summary { border-radius: 8px 8px 0 0; }
    .detail-content { background: #162032; border-radius: 0 0 8px 8px; padding: 1rem; }

    .url { color: #60a5fa; word-break: break-all; font-size: 0.8rem; }
    .recommendation { color: #86efac; font-style: italic; font-size: 0.85rem; margin-top: 0.25rem; }
    .timestamp { color: #64748b; font-size: 0.8rem; }

    @media (max-width: 768px) {
      .scores { grid-template-columns: repeat(2, 1fr); }
      .container { padding: 1rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Website Audit Report</h1>
    <div class="meta">
      <span>URL: <strong>${escapeHtml(audit.url)}</strong></span>
      <span>Date: <strong>${audit.startedAt.toISOString().split('T')[0]}</strong></span>
      <span>Pages: <strong>${audit.crawl?.pages.length ?? 0}</strong></span>
    </div>

    <!-- Overall Scores -->
    <div class="scores">
      <div class="score-card overall">
        <div class="score-label">Overall</div>
        <div class="score-value ${scoreClass(scores.overall)}">${scores.overall}</div>
        <div class="score-label">/ 100</div>
      </div>
      ${scores.pillars.map((p) => `
      <div class="score-card">
        <div class="score-label">${p.pillar.toUpperCase()}</div>
        <div class="score-value ${scoreClass(p.score)}">${p.score}</div>
        <div class="score-label">/ 100</div>
      </div>`).join('')}
    </div>

    <!-- Issue Summary -->
    <div class="issue-summary">
      <div class="issue-badge badge-critical">Critical: ${scores.issueCount.critical}</div>
      <div class="issue-badge badge-high">High: ${scores.issueCount.high}</div>
      <div class="issue-badge badge-warning">Warning: ${scores.issueCount.warning}</div>
      <div class="issue-badge badge-info">Info: ${scores.issueCount.info}</div>
      <div class="issue-badge badge-pass">Pass: ${scores.issueCount.pass}</div>
    </div>

    <!-- Critical Issues -->
    ${criticalIssues.length > 0 ? `
    <h2>Critical Issues (${criticalIssues.length})</h2>
    <table>
      <thead><tr><th>Check</th><th>Issue</th><th>Page</th><th>Fix</th></tr></thead>
      <tbody>
        ${criticalIssues.slice(0, 20).map((c) => `
        <tr>
          <td><span class="sev sev-critical"></span>${escapeHtml(c.checkName)}</td>
          <td>${escapeHtml(c.message)}</td>
          <td class="url">${c.pageUrl ? escapeHtml(truncate(c.pageUrl, 50)) : 'Site-wide'}</td>
          <td class="recommendation">${c.recommendation ? escapeHtml(c.recommendation) : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}

    <!-- Pillar Breakdowns -->
    ${scores.pillars.map((p) => renderPillar(p)).join('')}

    <!-- Top 20 Action Items -->
    <h2>Prioritized Action Plan</h2>
    <table>
      <thead><tr><th>#</th><th>Severity</th><th>Check</th><th>Issue</th><th>Score</th><th>Effort</th></tr></thead>
      <tbody>
        ${actionPlan.slice(0, 20).map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><span class="sev sev-${item.check.severity}"></span>${item.check.severity}</td>
          <td>${escapeHtml(item.check.checkName)}</td>
          <td>${escapeHtml(item.check.message)}</td>
          <td>${item.check.score}</td>
          <td>${item.effort}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="timestamp">
      Report generated: ${new Date().toISOString()}<br>
      Audit started: ${audit.startedAt.toISOString()}<br>
      Audit completed: ${audit.completedAt?.toISOString() ?? 'N/A'}
    </div>
  </div>
</body>
</html>`;
}

function renderPillar(pillar: PillarScore): string {
  const label: Record<string, string> = { seo: 'SEO', au: 'Accessibility & Usability', geo: 'Generative Engine Optimization' };
  return `
    <h2>${label[pillar.pillar] ?? pillar.pillar}</h2>
    <div class="pillar">
      <div class="pillar-header">
        <h3>Score Breakdown</h3>
        <div class="pillar-score ${scoreClass(pillar.score)}">${pillar.score}</div>
      </div>
      ${pillar.categories.map((cat) => `
      <div class="category-bar">
        <div class="category-label">
          <span>${escapeHtml(cat.category)}</span>
          <span class="${scoreClass(cat.score)}">${cat.score}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${cat.score}%; background: ${barColor(cat.score)};"></div>
        </div>
      </div>`).join('')}

      <details>
        <summary>All checks (${pillar.categories.reduce((sum, c) => sum + c.checks.length, 0)})</summary>
        <div class="detail-content">
          <table>
            <thead><tr><th>Status</th><th>Check</th><th>Score</th><th>Message</th></tr></thead>
            <tbody>
              ${pillar.categories.flatMap((c) => c.checks).sort((a, b) => a.score - b.score).map((c) => `
              <tr>
                <td><span class="sev sev-${c.status === 'pass' ? 'info' : c.severity}"></span>${c.status}</td>
                <td>${escapeHtml(c.checkName)}</td>
                <td>${c.score}</td>
                <td>${escapeHtml(truncate(c.message, 100))}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </details>
    </div>`;
}

function scoreClass(score: number): string {
  if (score >= 80) return 'score-good';
  if (score >= 50) return 'score-ok';
  return 'score-bad';
}

function barColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 50) return '#eab308';
  return '#ef4444';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}
