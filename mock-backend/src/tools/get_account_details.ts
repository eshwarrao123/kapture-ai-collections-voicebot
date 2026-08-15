import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { getAccountById } from '../data/accountsStore';
import { updateSession } from '../session/store';

export const getAccountDetailsSchema = z.object({
  call_id: z.string({ required_error: 'call_id is required' }).min(1, 'call_id cannot be empty'),
});

export function getAccountDetailsTool(req: AuthenticatedRequest, res: Response): void {
  const parseResult = getAccountDetailsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: parseResult.error.errors,
    });
    return;
  }

  const session = req.session!;
  const accountId = session.accountId;

  if (!accountId) {
    res.status(404).json({
      error: 'account_not_found',
      message: 'No account associated with verified session',
    });
    return;
  }

  const account = getAccountById(accountId);
  if (!account) {
    res.status(404).json({
      error: 'account_not_found',
      message: 'Account not found for this session',
    });
    return;
  }

  // Advance state to NEGOTIATION if currently AUTHENTICATED
  if (session.currentState === 'AUTHENTICATED') {
    updateSession(session.callId, { currentState: 'NEGOTIATION' });
  }

  res.status(200).json({
    account_id: account.account_id,
    customer_name: account.customer_name,
    loan_type: account.loan_type,
    total_outstanding: account.total_outstanding,
    emi_amount: account.emi_amount,
    due_date: account.due_date,
    days_past_due: account.days_past_due,
    last_payment_date: account.last_payment_date,
    last_payment_amount: account.last_payment_amount,
  });
}
