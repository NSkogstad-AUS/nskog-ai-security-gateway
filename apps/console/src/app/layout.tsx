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
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: 0,
          background: '#f8f9fa',
          color: '#212529',
        }}
      >
        <nav
          style={{
            background: '#1a1a2e',
            color: '#e0e0e0',
            padding: '0.75rem 2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          <strong style={{ fontSize: '1rem', color: '#fff' }}>
            🛡 AI Security Gateway
          </strong>
          <a href="/" style={{ color: '#90caf9', textDecoration: 'none', fontSize: '0.9rem' }}>
            Home
          </a>
          <a
            href="/events"
            style={{ color: '#90caf9', textDecoration: 'none', fontSize: '0.9rem' }}
          >
            Events
          </a>
        </nav>
        <main style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
