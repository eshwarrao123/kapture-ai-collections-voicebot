import { Request, Response } from 'express';
import { z } from 'zod';
import { getOrCreateSession, updateSession } from '../session/store';
import { findAccountByVerification } from '../data/accountsStore';

export const verifyCustomerSchema = z.object({
  call_id: z.string({ required_error: 'call_id is required' }).min(1, 'call_id cannot be empty'),
  verification_method: z.enum(['dob', 'otp', 'last4_phone', 'last4_loan'], {
    required_error: 'verification_method is required',
  }),
  verification_value: z
    .string({ required_error: 'verification_value is required' })
    .min(1, 'verification_value cannot be empty'),
});

export function verifyCustomerTool(req: Request, res: Response): void {
  const parseResult = verifyCustomerSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: parseResult.error.errors,
    });
    return;
  }

  const { call_id, verification_method, verification_value } = parseResult.data;
  const session = getOrCreateSession(call_id);

  // If maximum attempts reached already
  if (session.verificationAttempts >= 3) {
    res.status(200).json({
      verified: false,
      reason: 'max_attempts',
      attempts_remaining: 0,
    });
    return;
  }

  // Attempt verification against mock accounts store
  const account = findAccountByVerification(verification_method, verification_value, session.accountId);

  if (account) {
    // Successful verification
    updateSession(call_id, {
      authStatus: 'verified',
      verifiedAt: new Date().toISOString(),
      accountId: account.account_id,
      customerId: account.customer_id,
      currentState: 'AUTHENTICATED',
    });

    // SECURITY: Return ONLY minimal account info, strictly NO debt/balance information
    res.status(200).json({
      verified: true,
      customer_id: account.customer_id,
      account_id: account.account_id,
      account_status: account.account_status,
    });
    return;
  }

  // Failed verification
  const newAttempts = session.verificationAttempts + 1;
  const attemptsRemaining = Math.max(0, 3 - newAttempts);

  let failureReason: 'invalid_dob' | 'invalid_otp' | 'invalid_last4' | 'not_found' | 'max_attempts';

  if (attemptsRemaining === 0) {
    failureReason = 'max_attempts';
  } else {
    switch (verification_method) {
      case 'dob':
        failureReason = 'invalid_dob';
        break;
      case 'otp':
        failureReason = 'invalid_otp';
        break;
      case 'last4_phone':
      case 'last4_loan':
        failureReason = 'invalid_last4';
        break;
      default:
        failureReason = 'not_found';
    }
  }

  updateSession(call_id, {
    verificationAttempts: newAttempts,
    authStatus: attemptsRemaining === 0 ? 'failed' : 'pending',
  });

  // SECURITY: Response strictly MUST NOT contain debt/financial information
  res.status(200).json({
    verified: false,
    reason: failureReason,
    attempts_remaining: attemptsRemaining,
  });
}
