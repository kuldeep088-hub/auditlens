'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAudit, getAuditChecks, getReportUrl, type AuditSummary, type CheckResult } from '@/lib/api';

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        style={{ fill: color, fontSize: size * 0.22, fontWeight: 800, transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        {score}
      </text>
    </svg>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    high: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    warning: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    info: { color: '#7b80a0', bg: 'rgba(123,128,160,0.12)' },
  };
  const s = map[severity] ?? map.info;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700, color: s.color, background: s.bg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status === 'pass' ? { color: '#22c55e', icon: '✓' }
    : status === 'fail' ? { color: '#ef4444', icon: '✗' }
    : status === 'warning' ? { color: '#f59e0b', icon: '⚠' }
    : { color: '#7b80a0', icon: 'ℹ' };
  return <span style={{ color: s.color, fontWeight: 700 }}>{s.icon}</span>;
}

type Tab = 'overview' | 'seo' | 'au' | 'geo' | 'all';

export default function AuditDetailPage({ params }: { params: { id: string } }) {
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAudit = useCallback(async () => {
    try {
      const data = await getAudit(params.id);
      setAudit(data);
      if (data.status === 'complete' && checks.length === 0) {
        const c = await getAuditChecks(params.id);
        setChecks(c);
      }
      return data.status;
    } catch {
      return 'failed';
    }
  }, [params.id, checks.length]);

  useEffect(() => {
    fetchAudit().finally(() => setLoading(false));
  }, [fetchAudit]);

  // Poll while running
  useEffect(() => {
    if (!audit || audit.status === 'complete' || audit.status === 'failed') return;
    const interval = setInterval(async () => {
      const status = await fetchAudit();
      if (status === 'complete' || status === 'failed') clearInterval(interval);
    }, 5000);
    return () => clearInterval(interval);
  }, [audit, fetchAudit]);

  const filteredChecks = checks.filter(c => {
    const matchPillar = tab === 'all' || tab === 'overview' || c.pillar === tab;
    const matchSeverity = severityFilter === 'all' || c.severity === severityFilter;
    const matchSearch = !searchQuery || c.checkName.toLowerCase().includes(searchQuery.toLowerCase()) || c.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchPillar && matchSeverity && matchSearch;
  }).filter(c => tab === 'overview' ? c.status === 'fail' || c.severity === 'critical' || c.severity === 'high' : true);

  const issueChecks = checks.filter(c => c.status === 'fail');

  const pillarColor: Record<string, string> = { seo: '#4f6ef7', au: '#22c55e', geo: '#f59e0b' };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading audit...</div>
  );

  if (!audit) return (
    <div className="card" style={{ borderColor: '#ef4444' }}>
      <p style={{ color: '#ef4444' }}>Audit not found.</p>
      <a href="/" style={{ color: 'var(--brand)', marginTop: 8, display: 'block' }}>← Back to Dashboard</a>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Dashboard</a>
        <div className="flex items-start justify-between gap-4 mt-4 flex-wrap">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>
              {(() => { try { return new URL(audit.url).hostname; } catch { return audit.url; } })()}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{audit.url}</p>
          </div>
          {audit.status === 'complete' && (
            <a href={getReportUrl(audit.id)} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>
              📄 Full Report
            </a>
          )}
        </div>
      </div>

      {/* Running state */}
      {(audit.status === 'running' || audit.status === 'queued') && (
        <div className="card mb-6" style={{ borderColor: 'rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.06)' }}>
          <div className="flex items-center gap-4">
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--brand)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Audit in progress...</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                This page refreshes automatically every 5 seconds. Please wait.
              </div>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Failed state */}
      {audit.status === 'failed' && (
        <div className="card mb-6" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <p style={{ color: '#ef4444', fontWeight: 700 }}>⚠ Audit Failed</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 8 }}>
            The audit encountered an error. Check that the URL is accessible and try again.
          </p>
          <a href="/audit/new" className="btn-primary" style={{ textDecoration: 'none', marginTop: 12, display: 'inline-flex' }}>
            Try Again
          </a>
        </div>
      )}

      {/* Score Overview */}
      {audit.scores && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Overall</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ScoreRing score={audit.scores.overall} size={80} />
              </div>
            </div>
            {audit.scores.pillars.filter(p => p.score > 0).map(p => (
              <div key={p.pillar} className="card text-center">
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  {p.pillar === 'seo' ? '🔍 SEO' : p.pillar === 'au' ? '♿ Accessibility' : '🤖 AI Visibility'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ScoreRing score={p.score} size={80} />
                </div>
              </div>
            ))}
          </div>

          {/* Issue counts */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Critical', count: audit.scores.issueCount.critical, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
              { label: 'High', count: audit.scores.issueCount.high, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
              { label: 'Warnings', count: audit.scores.issueCount.warning, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
              { label: 'Info', count: audit.scores.issueCount.info, color: '#7b80a0', bg: 'rgba(123,128,160,0.08)' },
            ].map(item => (
              <div key={item.label} className="card text-center" style={{ background: item.bg, borderColor: `${item.color}30` }}>
                <div style={{ fontWeight: 800, fontSize: '1.75rem', color: item.color }}>{item.count}</div>
                <div style={{ fontSize: '0.75rem', color: item.color, fontWeight: 600, opacity: 0.8 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Checks Section */}
      {checks.length > 0 && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {(['overview', 'all', 'seo', 'au', 'geo'] as Tab[]).map(t => {
              const labels: Record<Tab, string> = { overview: '🏠 Overview', all: 'All Checks', seo: '🔍 SEO', au: '♿ Accessibility', geo: '🤖 AI Visibility' };
              const count = t === 'overview' ? issueChecks.length : t === 'all' ? checks.length : checks.filter(c => c.pillar === t).length;
              return (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '0.625rem 1rem', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                  border: 'none', background: 'transparent',
                  color: tab === t ? 'var(--brand)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${tab === t ? 'var(--brand)' : 'transparent'}`,
                  marginBottom: -1, transition: 'color 0.15s',
                }}>
                  {labels[t]} <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>({count})</span>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          {tab !== 'overview' && (
            <div className="flex gap-3 mb-4 flex-wrap">
              <input
                type="text"
                placeholder="Search checks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: 1, minWidth: 200, padding: '0.5rem 1rem',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
                }}
              />
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
                style={{ padding: '0.5rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: '0.875rem', outline: 'none', cursor: 'pointer' }}>
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
          )}

          {/* Overview header */}
          {tab === 'overview' && (
            <div className="mb-4" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Showing {issueChecks.length} failed checks that need attention.
            </div>
          )}

          {/* Checks list */}
          <div className="grid gap-2">
            {filteredChecks.length === 0 && (
              <div className="card text-center py-8" style={{ color: 'var(--text-muted)' }}>
                {tab === 'overview' ? '🎉 No critical issues found!' : 'No checks match your filters.'}
              </div>
            )}
            {filteredChecks.map((check, i) => (
              <details key={`${check.checkId}-${i}`} style={{ listStyle: 'none' }}>
                <summary style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '0.875rem 1rem',
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                  cursor: 'pointer', listStyle: 'none',
                }}>
                  <StatusBadge status={check.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{check.checkName}</span>
                      <SeverityBadge severity={check.severity} />
                      <span style={{ fontSize: '0.7rem', color: pillarColor[check.pillar] ?? 'var(--text-muted)', fontWeight: 600, background: `${pillarColor[check.pillar]}20`, padding: '1px 8px', borderRadius: 10 }}>
                        {check.pillar.toUpperCase()}
                      </span>
                      {check.score < 100 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>Score: {check.score}/100</span>}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{check.message}</div>
                  </div>
                </summary>
                <div style={{ padding: '1rem', background: 'var(--surface-2)', borderRadius: '0 0 10px 10px', borderTop: 'none', fontSize: '0.85rem' }}>
                  {check.details && <p style={{ marginBottom: 12, color: 'var(--text-muted)' }}>{check.details}</p>}
                  {check.recommendation && (
                    <div style={{ background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, color: 'var(--brand-light)', marginBottom: 4, fontSize: '0.8rem' }}>💡 Recommendation</div>
                      <div style={{ color: 'var(--text-muted)' }}>{check.recommendation}</div>
                    </div>
                  )}
                  {check.pageUrl && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Page: <a href={check.pageUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-light)' }}>{check.pageUrl}</a>
                    </div>
                  )}
                  {check.element && (
                    <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: '0.75rem', background: 'var(--background)', borderRadius: 6, padding: '0.5rem 0.75rem', color: '#22c55e', overflow: 'auto' }}>
                      {check.element}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
