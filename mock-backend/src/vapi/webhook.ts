import { Request, Response, NextFunction } from 'express';
import { verifyCustomerTool } from '../tools/verify_customer';
import { getAccountDetailsTool } from '../tools/get_account_details';
import { logPromiseToPayTool } from '../tools/log_promise_to_pay';
import { sendPaymentLinkTool } from '../tools/send_payment_link';
import { escalateToAgentTool } from '../tools/escalate_to_agent';
import { markDispositionTool } from '../tools/mark_disposition';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const toolMap: Record<string, (req: Request, res: Response) => void> = {
  verify_customer: verifyCustomerTool,
  get_account_details: getAccountDetailsTool as any, // Cast because it expects AuthenticatedRequest
  log_promise_to_pay: logPromiseToPayTool as any,
  send_payment_link: sendPaymentLinkTool as any,
  escalate_to_agent: escalateToAgentTool,
  mark_disposition: markDispositionTool,
};

const protectedTools = ['get_account_details', 'log_promise_to_pay', 'send_payment_link'];

export async function vapiWebhookHandler(req: Request, res: Response): Promise<void> {
  // 1. Webhook Authentication
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret && req.headers['x-vapi-secret'] !== expectedSecret) {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid webhook secret' });
    return;
  }

  // 2. Validate Vapi Payload
  const message = req.body?.message;
  if (!message || message.type !== 'tool-calls' || !message.toolCalls || !message.call) {
    res.status(400).json({ error: 'invalid_payload', message: 'Expected Vapi tool-calls payload' });
    return;
  }

  const callId = message.call.id;
  if (!callId) {
    res.status(400).json({ error: 'invalid_payload', message: 'Missing call.id in payload' });
    return;
  }

  const toolCall = message.toolCalls[0];
  if (!toolCall || toolCall.type !== 'function' || !toolCall.function) {
    res.status(400).json({ error: 'invalid_tool_call', message: 'No valid function call found' });
    return;
  }

  const toolName = toolCall.function.name;
  const toolCallId = toolCall.id;
  const args = toolCall.function.arguments || {};

  if (!toolMap[toolName]) {
    res.status(200).json({
      results: [
        {
          toolCallId,
          result: { error: 'unknown_tool', message: `Tool ${toolName} not supported` }
        }
      ]
    });
    return;
  }

  // 3. Adapter / Mock Request-Response Layer
  const mockReq: Partial<AuthenticatedRequest> = {
    body: {
      ...args,
      call_id: callId
    }
  };

  let responseBody: any = null;
  const mockRes: Partial<Response> = {
    status: function (code: number) {
      return this as Response;
    },
    json: function (data: any) {
      responseBody = data;
      return this as Response;
    },
    send: function (data: any) {
      responseBody = data;
      return this as Response;
    }
  };

  // 4. Enforce Auth
  if (protectedTools.includes(toolName)) {
    let authPassed = false;
    const mockNext = () => { authPassed = true; };
    
    authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);
    
    if (!authPassed) {
      res.status(200).json({
        results: [
          {
            toolCallId,
            result: responseBody
          }
        ]
      });
      return;
    }
  }

  // 5. Invoke Internal Tool Logic
  const handler = toolMap[toolName];
  try {
    await Promise.resolve(handler(mockReq as Request, mockRes as Response));
  } catch (err: any) {
    responseBody = { error: 'internal_error', message: err.message };
  }

  // 6. Return Exact Vapi Response Format
  res.status(200).json({
    results: [
      {
        toolCallId,
        result: responseBody
      }
    ]
  });
}
