import { Request, Response } from 'express';
import { z } from 'zod';
import { getOrCreateSession, updateSession } from '../session/store';

export const markDispositionSchema = z.object({
  call_id: z.string({ required_error: 'call_id is required' }).min(1, 'call_id cannot be empty'),
  disposition: z.enum(
    [
      'promise_to_pay',
      'already_paid',
      'disputed',
      'hardship',
      'wrong_person',
      'do_not_call',
      'callback_scheduled',
      'auth_failed_max_retries',
      'hostile',
      'no_response',
      'voicemail',
      'escalated',
      'other',
    ],
    { required_error: 'disposition is required' }
  ),
  details: z.string().max(1000, 'details must not exceed 1000 characters').optional(),
  ptp_id: z.string().optional(),
  escalation_id: z.string().optional(),
});

export function markDispositionTool(req: Request, res: Response): void {
  const parseResult = markDispositionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: parseResult.error.errors,
    });
    return;
  }

  const { call_id, disposition, details } = parseResult.data;
  const session = getOrCreateSession(call_id);

  const dispositionId = `disp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const loggedAt = new Date().toISOString();

  updateSession(call_id, {
    disposition,
    dispositionDetails: details,
    currentState: 'CALL_ENDED',
  });

  res.status(200).json({
    disposition_id: dispositionId,
    logged_at: loggedAt,
  });
}
