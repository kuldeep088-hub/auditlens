import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AuditLens — Website Intelligence Platform',
  description: 'Professional SEO, Accessibility & AI Visibility auditing for modern websites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
              <a href="/" className="flex items-center gap-3 no-underline">
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, #4f6ef7, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: 'white',
                }}>A</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>AuditLens</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: -2 }}>Website Intelligence</div>
                </div>
              </a>
              <nav className="flex items-center gap-2">
                <a href="/" className="btn-secondary" style={{ textDecoration: 'none' }}>Dashboard</a>
                <a href="/audit/new" className="btn-primary" style={{ textDecoration: 'none' }}>
                  + New Audit
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
            {children}
          </main>
          <footer style={{ borderTop: '1px solid var(--border)', padding: '1.5rem 0' }}>
            <div className="max-w-7xl mx-auto px-6 flex items-center justify-between" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <span>© 2026 AuditLens. All rights reserved.</span>
              <span>SEO · Accessibility · AI Visibility</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
