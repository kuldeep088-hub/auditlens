'use client';

import { useEffect, useState } from 'react';
import { listAudits, type AuditSummary } from '@/lib/api';

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 48, height: 48, borderRadius: '50%',
      border: `3px solid ${color}`,
      fontWeight: 800, fontSize: '1rem', color,
    }}>
      {score}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    complete: { label: 'Complete', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    running: { label: 'Running', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    queued: { label: 'Queued', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    failed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  };
  const s = map[status] ?? map.queued;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
      color: s.color, background: s.bg,
    }}>
      {status === 'running' && <span style={{ marginRight: 4 }}>●</span>}
      {s.label}
    </span>
  );
}

function PillarBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{score}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)' }}>
        <div style={{ height: 4, borderRadius: 2, background: color, width: `${score}%`, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listAudits()
      .then(setAudits)
      .catch(() => setError('Cannot connect to API. Make sure the API server is running on port 3100.'))
      .finally(() => setLoading(false));
  }, []);

  const completed = audits.filter(a => a.status === 'complete');
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, a) => s + (a.scores?.overall ?? 0), 0) / completed.length)
    : 0;

  return (
    <div>
      {/* Hero */}
      <div className="mb-8">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
          AuditLens Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Monitor SEO health, accessibility compliance, and AI visibility across all your websites.
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Audits', value: audits.length, icon: '📊' },
          { label: 'Completed', value: completed.length, icon: '✅' },
          { label: 'Avg Score', value: avgScore ? `${avgScore}/100` : '—', icon: '🎯' },
          { label: 'Sites Audited', value: new Set(audits.map(a => new URL(a.url).hostname)).size, icon: '🌐' },
        ].map(stat => (
          <div key={stat.label} className="card">
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{stat.icon}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)' }}>{stat.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Audit List */}
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Recent Audits</h2>
        <a href="/audit/new" className="btn-primary" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
          + Start New Audit
        </a>
      </div>

      {loading && (
        <div className="card text-center py-12" style={{ color: 'var(--text-muted)' }}>
          Loading audits...
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
          <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>⚠ API Connection Error</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{error}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
            Run: <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>npm run dev:api</code> in your terminal
          </p>
        </div>
      )}

      {!loading && !error && audits.length === 0 && (
        <div className="card text-center py-16">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>No audits yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem' }}>
            Run your first website audit to get started
          </p>
          <a href="/audit/new" className="btn-primary" style={{ textDecoration: 'none' }}>
            Start Your First Audit
          </a>
        </div>
      )}

      {!loading && audits.length > 0 && (
        <div className="grid gap-4">
          {audits.map(audit => {
            const pillarMap: Record<string, string> = { seo: '#4f6ef7', au: '#22c55e', geo: '#f59e0b' };
            return (
              <a
                key={audit.id}
                href={`/audit/${audit.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {audit.scores && <ScoreBadge score={audit.scores.overall} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                            {(() => { try { return new URL(audit.url).hostname; } catch { return audit.url; } })()}
                          </span>
                          <StatusBadge status={audit.status} />
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                          {audit.url} · {new Date(audit.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {audit.totalChecks && <span> · {audit.totalChecks} checks</span>}
                        </div>
                        {audit.scores && (
                          <div className="grid gap-2" style={{ maxWidth: 400 }}>
                            {audit.scores.pillars
                              .filter(p => p.score > 0)
                              .map(p => (
                                <PillarBar
                                  key={p.pillar}
                                  label={p.pillar.toUpperCase()}
                                  score={p.score}
                                  color={pillarMap[p.pillar] ?? '#7b80a0'}
                                />
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {audit.scores?.issueCount && (
                      <div className="flex gap-3 flex-shrink-0">
                        {audit.scores.issueCount.critical > 0 && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ef4444' }}>{audit.scores.issueCount.critical}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Critical</div>
                          </div>
                        )}
                        {audit.scores.issueCount.high > 0 && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#f59e0b' }}>{audit.scores.issueCount.high}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>High</div>
                          </div>
                        )}
                        {audit.scores.issueCount.warning > 0 && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#3b82f6' }}>{audit.scores.issueCount.warning}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Warnings</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
