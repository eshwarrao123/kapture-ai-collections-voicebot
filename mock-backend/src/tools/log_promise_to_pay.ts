import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { getAccountById } from '../data/accountsStore';
import { updateSession } from '../session/store';

export const logPromiseToPaySchema = z.object({
  call_id: z.string({ required_error: 'call_id is required' }).min(1, 'call_id cannot be empty'),
  ptp_date: z
    .string({ required_error: 'ptp_date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'ptp_date must be in YYYY-MM-DD format'),
  ptp_amount: z
    .number({ required_error: 'ptp_amount is required' })
    .positive('ptp_amount must be greater than 0'),
  payment_method: z.enum(['upi', 'netbanking', 'card', 'cash', 'other']).optional(),
  notes: z.string().max(500, 'notes must not exceed 500 characters').optional(),
});

export function logPromiseToPayTool(req: AuthenticatedRequest, res: Response): void {
  const parseResult = logPromiseToPaySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: parseResult.error.errors,
    });
    return;
  }

  const { call_id, ptp_date, ptp_amount, payment_method, notes } = parseResult.data;
  const session = req.session!;

  // Validate date range (today <= ptp_date <= today + 30 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(`${ptp_date}T00:00:00.000Z`);
  if (isNaN(targetDate.getTime())) {
    res.status(400).json({
      error: 'invalid_date',
      message: 'Invalid date provided',
    });
    return;
  }

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);

  if (targetDate < today || targetDate > maxDate) {
    res.status(400).json({
      error: 'invalid_date',
      message: 'PTP date must be within 30 days from today',
    });
    return;
  }

  // Validate amount against total outstanding if account is found;
  const account = session.accountId ? getAccountById(session.accountId) : undefined;
  if (account && ptp_amount > account.total_outstanding) {
    res.status(400).json({
      error: 'invalid_amount',
      message: `PTP amount ₹${ptp_amount} cannot exceed total outstanding amount ₹${account.total_outstanding}`,
    });
    return;
  }

  const ptpId = `ptp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const recordedAt = new Date().toISOString();

  updateSession(call_id, {
    currentState: 'ACTION',
    ptpData: {
      ptpId,
      ptpDate: ptp_date,
      ptpAmount: ptp_amount,
      paymentMethod: payment_method,
      notes,
      recordedAt,
    },
  });

  const formattedAmount = new Intl.NumberFormat('en-IN').format(ptp_amount);

  res.status(200).json({
    ptp_id: ptpId,
    status: 'recorded',
    confirmation_message: `Your promise to pay ₹${formattedAmount} by ${ptp_date} has been recorded. You will receive a confirmation SMS.`,
  });
}
