import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { getAccountById } from '../data/accountsStore';
import { updateSession } from '../session/store';

export const sendPaymentLinkSchema = z.object({
  call_id: z.string({ required_error: 'call_id is required' }).min(1, 'call_id cannot be empty'),
  channel: z.enum(['sms', 'whatsapp'], {
    required_error: 'channel is required and must be sms or whatsapp',
  }),
  amount: z.number().positive('amount must be greater than 0').optional(),
});

function maskPhoneNumber(phone?: string): string {
  if (!phone) return '+91 9XXXX XXXX';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length >= 10) {
    const last4 = clean.slice(-4);
    return `+91 9XXXX ${last4}`;
  }
  return '+91 9XXXX XXXX';
}

export function sendPaymentLinkTool(req: AuthenticatedRequest, res: Response): void {
  const parseResult = sendPaymentLinkSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: parseResult.error.errors,
    });
    return;
  }

  const { call_id, channel, amount } = parseResult.data;
  const session = req.session!;

  const account = session.accountId ? getAccountById(session.accountId) : undefined;
  
  if (amount && account && amount > account.total_outstanding) {
    res.status(400).json({
      error: 'invalid_amount',
      message: `Payment link amount ₹${amount} cannot exceed total outstanding amount ₹${account.total_outstanding}`,
    });
    return;
  }

  const linkAmount = amount ?? account?.total_outstanding ?? 0;
  const sentToPhone = maskPhoneNumber(account?.phone_number);

  const linkId = `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  updateSession(call_id, {
    currentState: 'ACTION',
    paymentLinkData: {
      linkId,
      channel,
      amount: linkAmount,
      sentTo: sentToPhone,
      expiresAt,
    },
  });

  res.status(200).json({
    link_id: linkId,
    channel,
    sent_to: sentToPhone,
    expires_at: expiresAt,
  });
}
