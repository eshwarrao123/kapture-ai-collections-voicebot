import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import { verifyCustomerTool } from './tools/verify_customer';
import { getAccountDetailsTool } from './tools/get_account_details';
import { logPromiseToPayTool } from './tools/log_promise_to_pay';
import { sendPaymentLinkTool } from './tools/send_payment_link';
import { escalateToAgentTool } from './tools/escalate_to_agent';
import { markDispositionTool } from './tools/mark_disposition';
import { getSession } from './session/store';
import { vapiWebhookHandler } from './vapi/webhook';

export const app = express();

app.use(cors());
app.use(express.json());

// PII-Safe Logging Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path = req.path;
  const callId = req.body?.call_id || 'N/A';

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Log tool name, call ID, status code, latency (NO PII, NO DOB, NO OTP, NO DEBT INFO)
    console.log(`[${new Date().toISOString()}] ${req.method} ${path} - call_id=${callId} status=${res.statusCode} (${duration}ms)`);
  });

  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session status endpoint for testing/debugging
app.get('/session/:call_id', (req: Request, res: Response) => {
  const callId = req.params.call_id;
  const session = getSession(callId);
  if (!session) {
    res.status(404).json({ error: 'session_not_found', message: `No session found for call_id: ${callId}` });
    return;
  }
  // Return non-sensitive session details
  res.status(200).json({
    callId: session.callId,
    authStatus: session.authStatus,
    verificationAttempts: session.verificationAttempts,
    currentState: session.currentState,
    disposition: session.disposition,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
});

// Canonical Tool Routes
app.post('/tools/verify_customer', verifyCustomerTool);
app.post('/tools/get_account_details', authMiddleware, getAccountDetailsTool);
app.post('/tools/log_promise_to_pay', authMiddleware, logPromiseToPayTool);
app.post('/tools/send_payment_link', authMiddleware, sendPaymentLinkTool);
app.post('/tools/escalate_to_agent', escalateToAgentTool);
app.post('/tools/mark_disposition', markDispositionTool);

// Vapi Webhook Adapter Route
app.post('/vapi/webhook', vapiWebhookHandler);

// 404 Route Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

// Global Error Handler Middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SERVER ERROR]', err.message);
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected server error occurred',
  });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Maya Mock Backend running on port ${PORT}`);
  });
}
