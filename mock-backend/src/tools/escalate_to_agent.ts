import { Request, Response } from 'express';
import { z } from 'zod';
import { getOrCreateSession, updateSession } from '../session/store';

export const escalateToAgentSchema = z.object({
  call_id: z.string({ required_error: 'call_id is required' }).min(1, 'call_id cannot be empty'),
  reason: z.enum(['dispute', 'hardship', 'hostile', 'auth_failed_max', 'customer_request', 'complex_case'], {
    required_error: 'reason is required',
  }),
  summary: z
    .string({ required_error: 'summary is required' })
    .min(10, 'summary must be at least 10 characters')
    .max(1000, 'summary must not exceed 1000 characters'),
  priority: z.enum(['normal', 'high', 'urgent']).optional().default('normal'),
});

export function escalateToAgentTool(req: Request, res: Response): void {
  const parseResult = escalateToAgentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: parseResult.error.errors,
    });
    return;
  }

  const { call_id, reason, summary, priority } = parseResult.data;
  const session = getOrCreateSession(call_id);

  const escalationId = `esc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const escalatedAt = new Date().toISOString();

  updateSession(call_id, {
    currentState: 'ESCALATED',
    escalationData: {
      escalationId,
      reason,
      summary,
      priority: priority ?? 'normal',
      escalatedAt,
    },
  });

  res.status(200).json({
    escalation_id: escalationId,
    agent_assigned: 'agent_smith',
    estimated_wait_time: 45,
  });
}
