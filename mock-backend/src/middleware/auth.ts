import { Request, Response, NextFunction } from 'express';
import { getSession, CallSession } from '../session/store';

export interface AuthenticatedRequest extends Request {
  session?: CallSession;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const callId = req.body?.call_id;

  if (!callId || typeof callId !== 'string') {
    res.status(400).json({
      error: 'validation_error',
      message: 'call_id is required',
    });
    return;
  }

  const session = getSession(callId);

  if (!session || session.authStatus !== 'verified') {
    res.status(403).json({
      error: 'not_authenticated',
      message: 'Customer not verified. Call verify_customer first.',
    });
    return;
  }

  req.session = session;
  next();
}
