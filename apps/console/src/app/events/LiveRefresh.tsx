'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LiveRefresh() {
  const router = useRouter();
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  const gatewayBaseUrl = useMemo(() => {
    return process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001';
  }, []);

  const refreshTimer = useRef<number | null>(null);
  const refreshSoon = () => {
    if (refreshTimer.current) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 600);
  };

  useEffect(() => {
    const params = new URLSearchParams({
      // Only stream events that would change the operations view.
      event_types: [
        'ToolCallBlocked',
        'ApprovalRequested',
        'ApprovalApproved',
        'ApprovalDenied',
        'ToolExecuted',
      ].join(','),
    });

    const url = `${gatewayBaseUrl}/v1/events/stream?${params.toString()}`;
    const es = new EventSource(url);

    const onOpen = () => setStatus('connected');
    const onError = () => setStatus('error');
    const onAgentEvent = () => refreshSoon();

    es.addEventListener('open', onOpen as EventListener);
    es.addEventListener('error', onError as EventListener);
    es.addEventListener('agent_event', onAgentEvent as EventListener);

    return () => {
      es.close();
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [gatewayBaseUrl, router]);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.35rem 0.6rem',
        borderRadius: '999px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        color: '#334155',
        fontSize: '0.82rem',
      }}
      title="Uses Server-Sent Events (SSE) to auto-refresh when new approvals/denies happen."
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background:
            status === 'connected'
              ? '#16a34a'
              : status === 'connecting'
                ? '#f59e0b'
                : '#dc2626',
        }}
      />
      Live updates: {status}
    </div>
  );
}

