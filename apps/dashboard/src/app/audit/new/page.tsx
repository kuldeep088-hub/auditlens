'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAudit } from '@/lib/api';

const PILLAR_OPTIONS = [
  { id: 'seo', label: 'SEO', description: 'Technical, on-page & off-page SEO analysis', icon: '🔍' },
  { id: 'au', label: 'Accessibility', description: 'WCAG 2.1/2.2 compliance & usability checks', icon: '♿' },
  { id: 'geo', label: 'AI Visibility (GEO)', description: 'Generative Engine Optimization & AI brand monitoring', icon: '🤖' },
];

const PAGE_PRESETS = [
  { label: 'Quick (10 pages)', value: 10 },
  { label: 'Small (25 pages)', value: 25 },
  { label: 'Standard (50 pages)', value: 50 },
  { label: 'Full (100 pages)', value: 100 },
  { label: 'Deep (500 pages)', value: 500 },
];

export default function NewAuditPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [pillars, setPillars] = useState(['seo', 'au', 'geo']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function togglePillar(id: string) {
    setPillars(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url) { setError('Please enter a URL'); return; }
    if (pillars.length === 0) { setError('Select at least one audit type'); return; }

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) cleanUrl = `https://${cleanUrl}`;

    setLoading(true);
    setError('');

    try {
      const result = await startAudit({ url: cleanUrl, maxPages, pillars });
      router.push(`/audit/${result.id}`);
    } catch {
      setError('Failed to start audit. Make sure the API server is running.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>
          ← Back to Dashboard
        </a>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 16, marginBottom: 8 }}>
          New Website Audit
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Enter a URL to crawl and analyze. The audit runs in the background and takes 2–15 minutes depending on site size.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* URL Input */}
        <div className="card mb-4">
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 12 }}>
            Website URL
          </label>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              width: '100%', padding: '0.75rem 1rem',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: '1rem',
              outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--brand)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
            The system will crawl all pages starting from this URL.
          </p>
        </div>

        {/* Audit Types */}
        <div className="card mb-4">
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 16 }}>
            Audit Types
          </label>
          <div className="grid gap-3">
            {PILLAR_OPTIONS.map(p => (
              <div
                key={p.id}
                onClick={() => togglePillar(p.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                  padding: '1rem', borderRadius: 10,
                  border: `2px solid ${pillars.includes(p.id) ? 'var(--brand)' : 'var(--border)'}`,
                  background: pillars.includes(p.id) ? 'rgba(79,110,247,0.08)' : 'var(--surface-2)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                  background: pillars.includes(p.id) ? 'rgba(79,110,247,0.15)' : 'var(--border)',
                  flexShrink: 0,
                }}>
                  {p.icon}
                </div>
                <div className="flex-1">
                  <div style={{ fontWeight: 700, color: pillars.includes(p.id) ? 'var(--brand-light)' : 'var(--text)', marginBottom: 4 }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.description}</div>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  border: `2px solid ${pillars.includes(p.id) ? 'var(--brand)' : 'var(--text-muted)'}`,
                  background: pillars.includes(p.id) ? 'var(--brand)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {pillars.includes(p.id) && <span style={{ color: 'white', fontSize: 11, fontWeight: 800 }}>✓</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Page Limit */}
        <div className="card mb-6">
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 16 }}>
            Pages to Crawl
          </label>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {PAGE_PRESETS.map(preset => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setMaxPages(preset.value)}
                style={{
                  padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                  border: `2px solid ${maxPages === preset.value ? 'var(--brand)' : 'var(--border)'}`,
                  background: maxPages === preset.value ? 'rgba(79,110,247,0.12)' : 'var(--surface-2)',
                  color: maxPages === preset.value ? 'var(--brand-light)' : 'var(--text)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 12 }}>
            More pages = more accurate results but longer crawl time.
          </p>
        </div>

        {/* Estimated time */}
        <div className="card mb-6" style={{ background: 'rgba(79,110,247,0.06)', borderColor: 'rgba(79,110,247,0.2)' }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '1.25rem' }}>⏱</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Estimated time</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {maxPages <= 10 && '2–4 minutes'}
                {maxPages > 10 && maxPages <= 25 && '3–6 minutes'}
                {maxPages > 25 && maxPages <= 50 && '5–10 minutes'}
                {maxPages > 50 && maxPages <= 100 && '10–20 minutes'}
                {maxPages > 100 && '20–60 minutes'}
                {' '}· {pillars.length} audit type{pillars.length > 1 ? 's' : ''} selected
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: 16, fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary w-full justify-center py-4" disabled={loading}
          style={{ fontSize: '1rem', opacity: loading ? 0.7 : 1, width: '100%' }}>
          {loading ? '⏳ Starting Audit...' : '🚀 Start Audit'}
        </button>
      </form>
    </div>
  );
}
