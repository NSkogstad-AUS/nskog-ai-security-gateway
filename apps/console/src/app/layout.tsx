import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AI Security Gateway – Console',
  description: 'Admin console for the AI Security Gateway',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: '"IBM Plex Sans", "Segoe UI", -apple-system, sans-serif',
          margin: 0,
          padding: 0,
          background:
            'radial-gradient(circle at top left, #e2e8f0 0%, #f8fafc 35%, #eef2ff 100%)',
          color: '#0f172a',
        }}
      >
        <nav
          style={{
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 50%, #0b1120 100%)',
            color: '#dbeafe',
            padding: '0.8rem 2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            boxShadow: '0 8px 20px rgba(2,6,23,0.28)',
          }}
        >
          <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>
            AI Security Gateway
          </strong>
          <a href="/" style={{ color: '#bfdbfe', textDecoration: 'none', fontSize: '0.9rem' }}>
            Dashboard
          </a>
          <a
            href="/events"
            style={{ color: '#bfdbfe', textDecoration: 'none', fontSize: '0.9rem' }}
          >
            Operations
          </a>
        </nav>
        <main style={{ padding: '2rem', maxWidth: '1180px', margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
