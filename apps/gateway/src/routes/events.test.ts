import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server';
import * as eventsService from '../services/events';
import type { AgentSecurityEvent } from '@ai-security-gateway/shared';

const originalListEvents = eventsService.listEvents;

const mutableEventsService = eventsService as {
  listEvents: typeof eventsService.listEvents;
};

afterEach(() => {
  mutableEventsService.listEvents = originalListEvents;
});

test('GET /v1/events forwards correlation, event, tool, and agent filters', async () => {
  const captured: Array<Parameters<typeof eventsService.listEvents>[0]> = [];
  const sampleEvents: AgentSecurityEvent[] = [
    {
      id: 'evt-1',
      correlation_id: 'corr-123',
      event_type: 'ToolCallProposed',
      ts: '2026-03-31T00:00:00.000Z',
      payload: {
        intent: {
          agent_id: 'agent-7',
          tool_name: 'web_search',
        },
      },
    },
  ];

  mutableEventsService.listEvents = async (options) => {
    captured.push(options);
    return sampleEvents;
  };

  const app = await buildServer({ logger: false });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/events?correlation_id=corr-123&event_type=ToolCallProposed&tool_name=web_search&agent_id=agent-7&limit=25',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual({ ...captured[0] }, {
      correlation_id: 'corr-123',
      event_type: 'ToolCallProposed',
      tool_name: 'web_search',
      agent_id: 'agent-7',
      limit: 25,
    });
    assert.deepEqual(response.json(), { items: sampleEvents });
  } finally {
    await app.close();
  }
});
