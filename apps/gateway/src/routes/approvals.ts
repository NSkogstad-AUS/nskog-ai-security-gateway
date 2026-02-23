import type { FastifyPluginAsync } from 'fastify';
import type { ApprovalStatus } from '@ai-security-gateway/shared';
import {
  createApprovalRequest,
  listApprovals,
  transitionApproval,
} from '../services/approvals';

interface ApprovalDecisionBody {
  decided_by?: string;
  note?: string;
}

export const approvalsRoute: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      correlation_id: string;
      agent_id: string;
      tool_name: string;
      tool_args: Record<string, unknown>;
      risk_tier: 'read' | 'write' | 'admin';
      requested_by?: string;
      reason?: string;
    };
  }>(
    '/approvals',
    {
      schema: {
        body: {
          type: 'object',
          required: ['correlation_id', 'agent_id', 'tool_name', 'tool_args', 'risk_tier'],
          properties: {
            correlation_id: { type: 'string' },
            agent_id: { type: 'string' },
            tool_name: { type: 'string' },
            tool_args: { type: 'object' },
            risk_tier: { type: 'string', enum: ['read', 'write', 'admin'] },
            requested_by: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
      handler: async (request, reply) => {
        const approval = await createApprovalRequest(request.body);
        return reply.status(201).send(approval);
      },
    },
  );

  app.get<{ Querystring: { status?: ApprovalStatus } }>(
    '/approvals',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'approved', 'denied'] },
          },
        },
      },
      handler: async (request, reply) => {
        const approvals = await listApprovals(request.query.status);
        return reply.send({ items: approvals });
      },
    },
  );

  app.post<{ Params: { id: string }; Body: ApprovalDecisionBody }>(
    '/approvals/:id/approve',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            decided_by: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      handler: async (request, reply) => {
        const result = await transitionApproval({
          approval_id: request.params.id,
          action: 'approve',
          decided_by: request.body?.decided_by,
          note: request.body?.note,
        });

        if (!result) {
          return reply.status(404).send({ error: 'approval not found' });
        }
        if (!result.transitioned) {
          return reply.status(409).send({
            error: 'approval is not pending',
            approval: result.approval,
          });
        }
        return reply.send(result.approval);
      },
    },
  );

  app.post<{ Params: { id: string }; Body: ApprovalDecisionBody }>(
    '/approvals/:id/deny',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            decided_by: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      handler: async (request, reply) => {
        const result = await transitionApproval({
          approval_id: request.params.id,
          action: 'deny',
          decided_by: request.body?.decided_by,
          note: request.body?.note,
        });

        if (!result) {
          return reply.status(404).send({ error: 'approval not found' });
        }
        if (!result.transitioned) {
          return reply.status(409).send({
            error: 'approval is not pending',
            approval: result.approval,
          });
        }
        return reply.send(result.approval);
      },
    },
  );
};
